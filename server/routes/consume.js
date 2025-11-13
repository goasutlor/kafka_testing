const express = require('express');
const router = express.Router();
const { getKafkaClient } = require('./kafka');

let consumer = null;
let consumeJob = null;
let consumeLogs = [];
let consumeStats = {
  total: 0,
  startTime: null,
  endTime: null,
  sequences: [],
};

// Start consume job
router.post('/start', async (req, res) => {
  try {
    const { topic, groupId } = req.body;
    
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

    if (consumeJob) {
      return res.status(400).json({ 
        success: false, 
        message: 'Consume job already running' 
      });
    }

    consumer = kafka.consumer({ 
      groupId: groupId || `kafka-test-group-${Date.now()}` 
    });
    
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    consumeLogs = [];
    consumeStats = {
      total: 0,
      startTime: new Date(),
      endTime: null,
      sequences: new Set(),
    };

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = JSON.parse(message.value.toString());
          const timestamp = new Date();
          
          consumeStats.total++;
          if (value.sequence && !consumeStats.sequences.includes(value.sequence)) {
            consumeStats.sequences.push(value.sequence);
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

          consumeLogs.push(logEntry);
          global.broadcast({ type: 'consume', data: logEntry });
        } catch (error) {
          const logEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            event: message.value.toString(),
            status: 'error',
            error: error.message,
          };
          consumeLogs.push(logEntry);
          global.broadcast({ type: 'consume', data: logEntry });
        }
      },
    });

    consumeJob = { running: true };

    res.json({ 
      success: true, 
      message: 'Consume job started' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Stop consume job
router.post('/stop', async (req, res) => {
  try {
    stopConsumeJob();
    res.json({ 
      success: true, 
      message: 'Consume job stopped',
      stats: consumeStats,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

async function stopConsumeJob() {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
  }
  consumeJob = null;
  consumeStats.endTime = new Date();
}

// Get consume logs
router.get('/logs', (req, res) => {
  const { limit = 1000, offset = 0 } = req.query;
  const logs = consumeLogs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  res.json({ 
    logs,
    total: consumeLogs.length,
    stats: consumeStats,
  });
});

// Get consume stats
router.get('/stats', (req, res) => {
  res.json({ stats: consumeStats });
});

// Get missing sequences
router.get('/missing-sequences', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ 
      success: false, 
      message: 'Start and end are required' 
    });
  }

  const sequences = consumeStats.sequences.map(Number).sort((a, b) => a - b);
  const missing = [];
  
  for (let i = parseInt(start); i <= parseInt(end); i++) {
    if (!sequences.includes(i)) {
      missing.push(i);
    }
  }

  // Group consecutive missing sequences
  const ranges = [];
  let rangeStart = null;
  
  for (let i = 0; i < missing.length; i++) {
    if (rangeStart === null) {
      rangeStart = missing[i];
    }
    
    if (i === missing.length - 1 || missing[i + 1] !== missing[i] + 1) {
      if (rangeStart === missing[i]) {
        ranges.push([rangeStart]);
      } else {
        ranges.push([rangeStart, missing[i]]);
      }
      rangeStart = null;
    }
  }

  res.json({ 
    missing,
    ranges,
    totalMissing: missing.length,
    totalExpected: parseInt(end) - parseInt(start) + 1,
    totalReceived: sequences.length,
  });
});

// Clear logs
router.delete('/logs', (req, res) => {
  consumeLogs = [];
  consumeStats = {
    total: 0,
    startTime: null,
    endTime: null,
    sequences: [],
  };
  res.json({ success: true });
});

module.exports = router;

