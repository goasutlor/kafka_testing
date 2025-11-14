const express = require('express');
const router = express.Router();
const { Kafka } = require('kafkajs');

let kafkaClient = null;
let kafkaConfig = null;
let adminClient = null; // Keep admin client connected

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

    // Disconnect previous admin client if exists
    if (adminClient) {
      try {
        await adminClient.disconnect();
      } catch (error) {
        console.error('Error disconnecting previous admin client:', error);
      }
    }

    const kafka = new Kafka(config);
    const admin = kafka.admin();
    
    await admin.connect();
    const topics = await admin.listTopics();
    // Keep admin client connected - don't disconnect
    // await admin.disconnect();

    kafkaClient = kafka;
    kafkaConfig = config;
    adminClient = admin; // Store admin client to reuse

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
  if (kafkaClient && adminClient) {
    try {
      // Reuse existing admin client if still connected
      const topics = await adminClient.listTopics();
      
      res.json({ 
        connected: true, 
        config: kafkaConfig,
        topics: topics || []
      });
    } catch (error) {
      // If admin client is disconnected, try to reconnect
      try {
        const admin = kafkaClient.admin();
        await admin.connect();
        const topics = await admin.listTopics();
        adminClient = admin; // Update stored admin client
        
        res.json({ 
          connected: true, 
          config: kafkaConfig,
          topics: topics || []
        });
      } catch (reconnectError) {
        console.error('Error reconnecting admin client:', reconnectError);
        res.json({ 
          connected: false,
          config: kafkaConfig,
          topics: [],
          message: 'Connection lost, please reconnect'
        });
      }
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

// Describe topic - get detailed information
router.get('/topic/:topicName/describe', async (req, res) => {
  if (!kafkaClient) {
    return res.status(400).json({
      success: false,
      message: 'Kafka not connected'
    });
  }

  try {
    const { topicName } = req.params;
    let admin = adminClient;
    
    // Use existing admin client or create new one
    if (!admin) {
      admin = kafkaClient.admin();
      await admin.connect();
      adminClient = admin;
    }

    // Get topic metadata
    const metadata = await admin.fetchTopicMetadata({ topics: [topicName] });
    
    // Get topic configs
    const configs = await admin.describeConfigs({
      resources: [{
        type: 2, // Topic resource type
        name: topicName,
      }],
    });

    // Don't disconnect - keep connection alive
    // await admin.disconnect();

    const topicMetadata = metadata.topics.find(t => t.name === topicName);
    
    if (!topicMetadata) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }

    // Extract configs
    const topicConfigs = {};
    if (configs.resources && configs.resources[0] && configs.resources[0].configEntries) {
      configs.resources[0].configEntries.forEach(entry => {
        topicConfigs[entry.name] = entry.value;
      });
    }

    const topicInfo = {
      name: topicMetadata.name,
      partitions: topicMetadata.partitions.length,
      replicationFactor: topicMetadata.partitions[0]?.replicas?.length || 0,
      partitionDetails: topicMetadata.partitions.map(p => ({
        partitionId: p.partitionId,
        leader: p.leader,
        replicas: p.replicas || [],
        isr: p.isr || [],
      })),
      configs: topicConfigs,
    };

    res.json({
      success: true,
      topic: topicInfo
    });
  } catch (error) {
    console.error('Error describing topic:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to describe topic'
    });
  }
});

// Disconnect Kafka connection (explicit disconnect)
router.post('/disconnect', async (req, res) => {
  try {
    if (adminClient) {
      await adminClient.disconnect();
      adminClient = null;
    }
    kafkaClient = null;
    kafkaConfig = null;
    
    res.json({ 
      success: true, 
      message: 'Disconnected successfully' 
    });
  } catch (error) {
    console.error('Error disconnecting:', error);
    // Clear anyway
    adminClient = null;
    kafkaClient = null;
    kafkaConfig = null;
    res.json({ 
      success: true, 
      message: 'Disconnected (with errors)' 
    });
  }
});

// Get client for other modules
const getKafkaClient = () => kafkaClient;
const getKafkaConfig = () => kafkaConfig;

module.exports = router;
module.exports.getKafkaClient = getKafkaClient;
module.exports.getKafkaConfig = getKafkaConfig;

