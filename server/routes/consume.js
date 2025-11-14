const express = require('express');
const router = express.Router();
const { getKafkaClient } = require('./kafka');
const { createJob, updateJob, generateJobName } = require('./jobHistory');
const { registerActiveJob, unregisterActiveJob, updateActiveJobStats } = require('./jobManager');

// Support multiple concurrent jobs
const activeConsumers = new Map(); // jobId -> { consumer, stats, logs }

// Helper to stop a specific job
async function stopConsumeJobById(jobId) {
  const jobData = activeConsumers.get(jobId);
  if (!jobData) return;

  if (jobData.consumer) {
    await jobData.consumer.disconnect();
  }

  jobData.stats.endTime = new Date();
  updateJob(jobId, {
    ...jobData.stats,
    sequences: Array.from(jobData.stats.sequences || []),
    logsCount: jobData.logs.length,
  }, 'completed');

  unregisterActiveJob(jobId);
  activeConsumers.delete(jobId);
}

// Start consume job
router.post('/start', async (req, res) => {
  try {
    const { topic, groupId, jobName } = req.body;
    
    if (!topic) {
      return res.status(400).json({ 
        success: false, 
        message: 'Topic is required' 
      });
    }

    const kafka = getKafkaClient();
    if (!kafka) {
      return res.status(400).json({ 
        success: false, 
        message: 'Kafka not connected' 
      });
    }

    // Create job record first
    const finalGroupId = groupId || `kafka-test-group-${Date.now()}`;
    const job = createJob('consume', jobName || generateJobName('consume'), {
      topic,
      groupId: finalGroupId,
    });
    const jobId = job.id;

    const consumer = kafka.consumer({ 
      groupId: finalGroupId
    });
    
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    const jobLogs = [];
    const jobStats = {
      total: 0,
      startTime: new Date(),
      endTime: null,
      sequences: new Set(),
    };

    // Store in activeConsumers
    activeConsumers.set(jobId, {
      consumer,
      stats: jobStats,
      logs: jobLogs,
    });

    // Register active job
    registerActiveJob(jobId, 'consume', consumer, {
      topic,
      groupId: finalGroupId,
    }, jobStats, jobLogs);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const jobData = activeConsumers.get(jobId);
        if (!jobData) return;

        try {
          const value = JSON.parse(message.value.toString());
          const timestamp = new Date();
          
          jobData.stats.total++;
          if (value.sequence && !jobData.stats.sequences.has(value.sequence)) {
            jobData.stats.sequences.add(value.sequence);
          }

          const logEntry = {
            id: Date.now() + Math.random(),
            timestamp: timestamp.toISOString(),
            receivedAt: timestamp.toISOString(),
            event: value.message || message.value.toString(),
            sequence: value.sequence,
            partition,
            offset: message.offset,
            topic,
          };

          jobData.logs.push(logEntry);
          updateActiveJobStats(jobId, {
            total: jobData.stats.total,
            sequences: Array.from(jobData.stats.sequences),
          });
          global.broadcast({ type: 'consume', data: { ...logEntry, jobId } });
        } catch (error) {
          const logEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            event: message.value.toString(),
            status: 'error',
            error: error.message,
          };
          
          jobData.logs.push(logEntry);
          global.broadcast({ type: 'consume', data: { ...logEntry, jobId } });
        }
      },
    });

    res.json({ 
      success: true, 
      message: 'Consume job started',
      jobId: jobId,
      jobName: job.name,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Stop consume job by ID
router.post('/stop/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    await stopConsumeJobById(jobId);
    res.json({ 
      success: true, 
      message: 'Consume job stopped',
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Stop all consume jobs (backward compatibility)
router.post('/stop', async (req, res) => {
  try {
    const jobIds = Array.from(activeConsumers.keys());
    await Promise.all(jobIds.map(jobId => stopConsumeJobById(jobId)));
    res.json({ 
      success: true, 
      message: 'All consume jobs stopped',
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get consume logs for a specific job
router.get('/logs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const { limit = 1000, offset = 0 } = req.query;
    
    const jobData = activeConsumers.get(jobId);
    if (!jobData) {
      return res.status(404).json({ 
        success: false,
        message: 'Job not found' 
      });
    }

    const logs = jobData.logs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    res.json({ 
      logs,
      total: jobData.logs.length,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get consume logs (backward compatibility)
router.get('/logs', (req, res) => {
  const { limit = 1000, offset = 0 } = req.query;
  
  let allLogs = [];
  activeConsumers.forEach((jobData) => {
    allLogs = [...allLogs, ...jobData.logs];
  });
  
  const logs = allLogs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  res.json({ 
    logs,
    total: allLogs.length,
  });
});

// Get consume stats for a specific job
router.get('/stats/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const jobData = activeConsumers.get(jobId);
    if (!jobData) {
      return res.status(404).json({ 
        success: false,
        stats: null,
        message: 'Job not found or not running' 
      });
    }
    res.json({ 
      stats: {
        ...jobData.stats,
        sequences: Array.from(jobData.stats.sequences || []),
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get consume stats (backward compatibility)
router.get('/stats', (req, res) => {
  const aggregatedStats = {
    total: 0,
    startTime: null,
    endTime: null,
    sequences: new Set(),
  };

  activeConsumers.forEach((jobData) => {
    aggregatedStats.total += jobData.stats.total || 0;
    if (jobData.stats.sequences) {
      jobData.stats.sequences.forEach(seq => aggregatedStats.sequences.add(seq));
    }
  });

  res.json({ 
    stats: {
      ...aggregatedStats,
      sequences: Array.from(aggregatedStats.sequences),
    }
  });
});

// Get missing sequences for a specific job
router.get('/missing-sequences/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { start, end } = req.query;
    
    const jobData = activeConsumers.get(jobId);
    if (!jobData) {
      return res.status(404).json({ 
        success: false,
        message: 'Job not found' 
      });
    }

    const sequences = Array.from(jobData.stats.sequences || []).map(Number).sort((a, b) => a - b);
    if (sequences.length === 0) {
      return res.json({ missing: [], ranges: [] });
    }

    const startNum = parseInt(start) || sequences[0];
    const endNum = parseInt(end) || sequences[sequences.length - 1];
    const sequenceSet = new Set(sequences);
    const missing = [];

    for (let i = startNum; i <= endNum; i++) {
      if (!sequenceSet.has(i)) {
        missing.push(i);
      }
    }

    // Group missing sequences into ranges
    const ranges = [];
    if (missing.length > 0) {
      let rangeStart = missing[0];
      let rangeEnd = missing[0];

      for (let i = 1; i < missing.length; i++) {
        if (missing[i] === rangeEnd + 1) {
          rangeEnd = missing[i];
        } else {
          ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
          rangeStart = missing[i];
          rangeEnd = missing[i];
        }
      }
      ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
    }

    res.json({ missing, ranges });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get missing sequences (backward compatibility)
router.get('/missing-sequences', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    // Get from most recent job
    const jobIds = Array.from(activeConsumers.keys());
    if (jobIds.length === 0) {
      return res.json({ missing: [], ranges: [] });
    }

    const mostRecentJobId = jobIds[jobIds.length - 1];
    const jobData = activeConsumers.get(mostRecentJobId);
    if (!jobData) {
      return res.json({ missing: [], ranges: [] });
    }

    const sequences = Array.from(jobData.stats.sequences || []).map(Number).sort((a, b) => a - b);
    if (sequences.length === 0) {
      return res.json({ missing: [], ranges: [] });
    }

    const startNum = parseInt(start) || sequences[0];
    const endNum = parseInt(end) || sequences[sequences.length - 1];
    const sequenceSet = new Set(sequences);
    const missing = [];

    for (let i = startNum; i <= endNum; i++) {
      if (!sequenceSet.has(i)) {
        missing.push(i);
      }
    }

    const ranges = [];
    if (missing.length > 0) {
      let rangeStart = missing[0];
      let rangeEnd = missing[0];

      for (let i = 1; i < missing.length; i++) {
        if (missing[i] === rangeEnd + 1) {
          rangeEnd = missing[i];
        } else {
          ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
          rangeStart = missing[i];
          rangeEnd = missing[i];
        }
      }
      ranges.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
    }

    res.json({ missing, ranges });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

module.exports = router;
