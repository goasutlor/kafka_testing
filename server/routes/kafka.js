const express = require('express');
const router = express.Router();
const { Kafka } = require('kafkajs');

let kafkaClient = null;
let kafkaConfig = null;

// Test Kafka connection
router.post('/connect', async (req, res) => {
  try {
    const { brokers, clientId, sasl, apiKey } = req.body;
    
    // Validate brokers
    if (!brokers || !brokers.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Brokers are required'
      });
    }
    
    const config = {
      clientId: clientId || 'kafka-test-client',
      brokers: brokers.split(',').map(b => b.trim()).filter(b => b.length > 0),
    };
    
    if (config.brokers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one broker is required'
      });
    }

    if (sasl && sasl.enabled) {
      config.sasl = {
        mechanism: sasl.mechanism || 'plain',
        username: sasl.username,
        password: sasl.password,
      };
    }

    if (apiKey && apiKey.enabled) {
      config.sasl = {
        mechanism: 'plain',
        username: apiKey.key,
        password: apiKey.secret,
      };
    }

    const kafka = new Kafka(config);
    const admin = kafka.admin();
    
    await admin.connect();
    const topics = await admin.listTopics();
    await admin.disconnect();

    kafkaClient = kafka;
    kafkaConfig = config;

    res.json({ 
      success: true, 
      message: 'Connected successfully',
      topics: topics,
      config: {
        brokers: config.brokers,
        clientId: config.clientId,
      }
    });
  } catch (error) {
    console.error('Kafka connection error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to connect to Kafka',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get connection status
router.get('/status', async (req, res) => {
  if (kafkaClient) {
    try {
      const admin = kafkaClient.admin();
      await admin.connect();
      const topics = await admin.listTopics();
      await admin.disconnect();
      
      res.json({ 
        connected: true, 
        config: kafkaConfig,
        topics: topics || []
      });
    } catch (error) {
      res.json({ 
        connected: true, 
        config: kafkaConfig,
        topics: []
      });
    }
  } else {
    res.json({ 
      connected: false,
      topics: []
    });
  }
});

// Get Kafka client instance
router.get('/client', (req, res) => {
  if (kafkaClient) {
    res.json({ available: true });
  } else {
    res.status(400).json({ 
      available: false, 
      message: 'Kafka not connected' 
    });
  }
});

// Get client for other modules
const getKafkaClient = () => kafkaClient;
const getKafkaConfig = () => kafkaConfig;

module.exports = router;
module.exports.getKafkaClient = getKafkaClient;
module.exports.getKafkaConfig = getKafkaConfig;

