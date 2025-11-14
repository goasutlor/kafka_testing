const express = require('express');
const router = express.Router();
const { getKafkaClient } = require('./kafka');
const { createJob, updateJob, generateJobName } = require('./jobHistory');
const { registerActiveJob, unregisterActiveJob, updateActiveJobStats } = require('./jobManager');

// Support multiple concurrent jobs
const activeProducers = new Map(); // jobId -> { producer, interval, stats, logs }

// Helper to stop a specific job
async function stopProduceJobById(jobId) {
  const jobData = activeProducers.get(jobId);
  if (!jobData) return;

  if (jobData.interval) {
    clearInterval(jobData.interval);
  }
  if (jobData.producer) {
    await jobData.producer.disconnect();
  }

  jobData.stats.endTime = new Date();
  updateJob(jobId, {
    ...jobData.stats,
    logsCount: jobData.logs.length,
  }, 'completed');

  unregisterActiveJob(jobId);
  activeProducers.delete(jobId);
}

// Start produce job
router.post('/start', async (req, res) => {
  try {
    const { topic, message, accumulation, jobName, count } = req.body;
    
    if (!topic || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Topic and message are required' 
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
    const job = createJob('produce', jobName || generateJobName('produce'), {
      topic,
      message,
      accumulation,
      count: count || 1,
    });
    const jobId = job.id;

    const producer = kafka.producer();
    await producer.connect();

    const jobLogs = [];
    const jobStats = {
      total: 0,
      success: 0,
      failed: 0,
      startTime: new Date(),
      endTime: null,
    };

    // Store in activeProducers
    activeProducers.set(jobId, {
      producer,
      interval: null,
      stats: jobStats,
      logs: jobLogs,
    });

    // Register active job
    registerActiveJob(jobId, 'produce', producer, {
      topic,
      message,
      accumulation,
      count: count || 1,
    }, jobStats, jobLogs);

    // If accumulation is not enabled, produce based on count
    if (!accumulation?.enabled) {
      const messageCount = parseInt(count) || 1;
      
      // Produce messages based on count
      try {
        let successCount = 0;
        let failedCount = 0;
        
        for (let i = 0; i < messageCount; i++) {
          try {
            const timestamp = new Date();
            await producer.send({
              topic,
              messages: [{
                key: `key-${Date.now()}-${i}`,
                value: JSON.stringify({
                  message: message,
                  timestamp: timestamp.toISOString(),
                  sequence: i + 1,
                  total: messageCount,
                }),
              }],
            });

            jobStats.total++;
            jobStats.success++;
            successCount++;
            
            const logEntry = {
              id: Date.now() + Math.random(),
              timestamp: timestamp.toISOString(),
              event: message,
              status: 'success',
              sequence: i + 1,
              total: messageCount,
            };
            
            jobLogs.push(logEntry);
            global.broadcast({ 
              type: 'produce', 
              data: { ...logEntry, jobId },
              progress: { current: i + 1, total: messageCount }
            });
            
            // Small delay between messages to avoid overwhelming
            if (i < messageCount - 1) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          } catch (error) {
            jobStats.total++;
            jobStats.failed++;
            failedCount++;
            
            const logEntry = {
              id: Date.now() + Math.random(),
              timestamp: new Date().toISOString(),
              event: message,
              status: 'failed',
              error: error.message,
              sequence: i + 1,
              total: messageCount,
            };
            
            jobLogs.push(logEntry);
            global.broadcast({ 
              type: 'produce', 
              data: { ...logEntry, jobId },
              progress: { current: i + 1, total: messageCount }
            });
          }
        }
        
        // Disconnect and stop
        await producer.disconnect();
        jobStats.endTime = new Date();
        
        updateJob(jobId, {
          ...jobStats,
          logsCount: jobLogs.length,
        }, 'completed');
        
        // Broadcast final stats before removing
        global.broadcast({ 
          type: 'produce-complete', 
          data: { 
            jobId, 
            stats: jobStats,
            jobName: job.name,
          } 
        });
        
        unregisterActiveJob(jobId);
        activeProducers.delete(jobId);
        
        // Return stats in response
        return res.json({ 
          success: true, 
          message: messageCount === 1 
            ? 'Message produced successfully (one-time)'
            : `${messageCount} messages produced successfully`,
          jobId: jobId,
          jobName: job.name,
          stats: jobStats,
        });
      } catch (error) {
        jobStats.total++;
        jobStats.failed++;
        
        const logEntry = {
          id: Date.now() + Math.random(),
          timestamp: new Date().toISOString(),
          event: message,
          status: 'failed',
          error: error.message,
        };
        
        jobLogs.push(logEntry);
        global.broadcast({ type: 'produce', data: { ...logEntry, jobId } });
        
        if (producer) {
          await producer.disconnect();
        }
        jobStats.endTime = new Date();
        
        updateJob(jobId, {
          ...jobStats,
          logsCount: jobLogs.length,
        }, 'failed');
        
        // Broadcast final stats before removing
        global.broadcast({ 
          type: 'produce-complete', 
          data: { 
            jobId, 
            stats: jobStats,
            jobName: job.name,
          } 
        });
        
        unregisterActiveJob(jobId);
        activeProducers.delete(jobId);
        
        return res.status(500).json({ 
          success: false, 
          message: error.message,
          jobId: jobId,
          stats: jobStats,
        });
      }
    } else {
      // Accumulation mode - produce multiple messages
      let counter = accumulation.start || 1;
      const end = accumulation.end;
      const prefix = accumulation.prefix || 'TEST';
      const interval = accumulation.interval || 1000; // ms

      const intervalId = setInterval(async () => {
        const jobData = activeProducers.get(jobId);
        if (!jobData) {
          clearInterval(intervalId);
          return;
        }

        try {
          const numStr = counter.toString().padStart(2, '0');
          const messageText = `${prefix}${numStr}`;

          const timestamp = new Date();
          await jobData.producer.send({
            topic,
            messages: [{
              key: `key-${counter}`,
              value: JSON.stringify({
                message: messageText,
                timestamp: timestamp.toISOString(),
                sequence: counter,
              }),
            }],
          });

          jobData.stats.total++;
          jobData.stats.success++;
          
          const logEntry = {
            id: Date.now() + Math.random(),
            timestamp: timestamp.toISOString(),
            event: messageText,
            status: 'success',
            sequence: counter,
          };
          
          jobData.logs.push(logEntry);
          updateActiveJobStats(jobId, jobData.stats);
          global.broadcast({ type: 'produce', data: { ...logEntry, jobId } });

          counter++;
          
          // Stop if reached end
          if (end && counter > end) {
            await stopProduceJobById(jobId);
          }
        } catch (error) {
          jobData.stats.total++;
          jobData.stats.failed++;
          
          const logEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            event: message,
            status: 'failed',
            error: error.message,
          };
          
          jobData.logs.push(logEntry);
          updateActiveJobStats(jobId, jobData.stats);
          global.broadcast({ type: 'produce', data: { ...logEntry, jobId } });
        }
      }, interval);

      // Store interval ID
      activeProducers.get(jobId).interval = intervalId;
    }

    res.json({ 
      success: true, 
      message: 'Produce job started',
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

// Stop produce job by ID
router.post('/stop/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    await stopProduceJobById(jobId);
    res.json({ 
      success: true, 
      message: 'Produce job stopped',
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Stop all produce jobs (backward compatibility)
router.post('/stop', async (req, res) => {
  try {
    // Stop all running jobs
    const jobIds = Array.from(activeProducers.keys());
    await Promise.all(jobIds.map(jobId => stopProduceJobById(jobId)));
    res.json({ 
      success: true, 
      message: 'All produce jobs stopped',
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get produce logs for a specific job
router.get('/logs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const { limit = 1000, offset = 0 } = req.query;
    
    const jobData = activeProducers.get(jobId);
    if (!jobData) {
      // Try to get from job history
      const { getJob } = require('./jobHistory');
      const job = getJob(jobId);
      if (job && job.stats.logsCount) {
        return res.json({ 
          logs: [],
          total: 0,
          message: 'Job completed, logs not available',
        });
      }
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

// Get produce logs (backward compatibility - returns most recent job)
router.get('/logs', (req, res) => {
  const { limit = 1000, offset = 0 } = req.query;
  
  // Get logs from most recent active job or all jobs combined
  let allLogs = [];
  activeProducers.forEach((jobData) => {
    allLogs = [...allLogs, ...jobData.logs];
  });
  
  const logs = allLogs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  res.json({ 
    logs,
    total: allLogs.length,
  });
});

// Get produce stats for a specific job
router.get('/stats/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const jobData = activeProducers.get(jobId);
    if (!jobData) {
      return res.status(404).json({ 
        success: false,
        stats: null,
        message: 'Job not found or not running' 
      });
    }
    res.json({ stats: jobData.stats });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Get produce stats (backward compatibility - returns aggregated stats)
router.get('/stats', (req, res) => {
  // Aggregate stats from all active jobs
  const aggregatedStats = {
    total: 0,
    success: 0,
    failed: 0,
    startTime: null,
    endTime: null,
  };

  activeProducers.forEach((jobData) => {
    aggregatedStats.total += jobData.stats.total || 0;
    aggregatedStats.success += jobData.stats.success || 0;
    aggregatedStats.failed += jobData.stats.failed || 0;
    
    if (!aggregatedStats.startTime || 
        (jobData.stats.startTime && new Date(jobData.stats.startTime) < new Date(aggregatedStats.startTime))) {
      aggregatedStats.startTime = jobData.stats.startTime;
    }
  });

  res.json({ stats: aggregatedStats });
});

// Clear logs for a specific job
router.delete('/logs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const jobData = activeProducers.get(jobId);
    if (jobData) {
      jobData.logs = [];
      res.json({ success: true, message: 'Logs cleared' });
    } else {
      res.status(404).json({ 
        success: false,
        message: 'Job not found' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Clear logs (backward compatibility)
router.delete('/logs', (req, res) => {
  activeProducers.forEach((jobData) => {
    jobData.logs = [];
  });
  res.json({ success: true, message: 'All logs cleared' });
});

module.exports = router;
