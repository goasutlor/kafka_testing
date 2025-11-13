const express = require('express');
const router = express.Router();
const { getKafkaClient } = require('./kafka');

let producer = null;
let produceJob = null;
let produceLogs = [];
let produceStats = {
  total: 0,
  success: 0,
  failed: 0,
  startTime: null,
  endTime: null,
};

// Start produce job
router.post('/start', async (req, res) => {
  try {
    const { topic, message, accumulation } = req.body;
    
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

    if (produceJob) {
      return res.status(400).json({ 
        success: false, 
        message: 'Produce job already running' 
      });
    }

    producer = kafka.producer();
    await producer.connect();

    produceLogs = [];
    produceStats = {
      total: 0,
      success: 0,
      failed: 0,
      startTime: new Date(),
      endTime: null,
    };

    let counter = accumulation?.start || 1;
    const end = accumulation?.end;
    const prefix = accumulation?.prefix || 'TEST';
    const interval = accumulation?.interval || 1000; // ms

    produceJob = setInterval(async () => {
      try {
        let messageText = message;
        
        if (accumulation?.enabled) {
          const numStr = counter.toString().padStart(2, '0');
          messageText = `${prefix}${numStr}`;
        }

        const timestamp = new Date();
        await producer.send({
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

        produceStats.total++;
        produceStats.success++;
        
        const logEntry = {
          id: Date.now() + Math.random(),
          timestamp: timestamp.toISOString(),
          event: messageText,
          status: 'success',
          sequence: counter,
        };
        
        produceLogs.push(logEntry);
        global.broadcast({ type: 'produce', data: logEntry });

        counter++;
        
        if (end && counter > end) {
          stopProduceJob();
        }
      } catch (error) {
        produceStats.total++;
        produceStats.failed++;
        
        const logEntry = {
          id: Date.now() + Math.random(),
          timestamp: new Date().toISOString(),
          event: message,
          status: 'failed',
          error: error.message,
        };
        
        produceLogs.push(logEntry);
        global.broadcast({ type: 'produce', data: logEntry });
      }
    }, interval);

    res.json({ 
      success: true, 
      message: 'Produce job started' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Stop produce job
router.post('/stop', async (req, res) => {
  try {
    stopProduceJob();
    res.json({ 
      success: true, 
      message: 'Produce job stopped',
      stats: produceStats,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

function stopProduceJob() {
  if (produceJob) {
    clearInterval(produceJob);
    produceJob = null;
  }
  if (producer) {
    producer.disconnect();
    producer = null;
  }
  produceStats.endTime = new Date();
}

// Get produce logs
router.get('/logs', (req, res) => {
  const { limit = 1000, offset = 0 } = req.query;
  const logs = produceLogs.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
  res.json({ 
    logs,
    total: produceLogs.length,
    stats: produceStats,
  });
});

// Get produce stats
router.get('/stats', (req, res) => {
  res.json({ stats: produceStats });
});

// Clear logs
router.delete('/logs', (req, res) => {
  produceLogs = [];
  produceStats = {
    total: 0,
    success: 0,
    failed: 0,
    startTime: null,
    endTime: null,
  };
  res.json({ success: true });
});

module.exports = router;

