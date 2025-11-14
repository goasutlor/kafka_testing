const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { getKafkaClient, getKafkaConfig } = require('./kafka');

const execAsync = promisify(exec);

// Store load test results
let loadTestResults = [];

// Check if Kafka perf test tools are available
async function checkKafkaTools() {
  try {
    // Try to find kafka-producer-perf-test.sh
    const { stdout } = await execAsync('which kafka-producer-perf-test.sh');
    return { available: true, path: stdout.trim() };
  } catch (error) {
    // Try common Kafka installation paths
    const commonPaths = [
      '/usr/local/kafka/bin/kafka-producer-perf-test.sh',
      '/opt/kafka/bin/kafka-producer-perf-test.sh',
      process.env.KAFKA_HOME ? `${process.env.KAFKA_HOME}/bin/kafka-producer-perf-test.sh` : null,
    ].filter(Boolean);

    for (const toolPath of commonPaths) {
      try {
        await fs.access(toolPath);
        return { available: true, path: toolPath };
      } catch (e) {
        continue;
      }
    }

    return { available: false, path: null };
  }
}

// Generate producer perf test command
function generateProducerCommand(config) {
  const kafkaConfig = getKafkaConfig();
  if (!kafkaConfig) {
    throw new Error('Kafka not connected');
  }

  const brokers = kafkaConfig.brokers.join(',');
  const topic = config.topic;
  const numRecords = config.numRecords || -1; // -1 = unlimited
  const recordSize = config.recordSize || 1024; // bytes
  const throughput = config.throughput || -1; // -1 = unlimited
  const compression = config.compression || 'none';
  const batchSize = config.batchSize || 16384; // bytes
  const acks = config.acks || 'all';
  const threads = config.threads || 1;

  // Build command
  let command = `kafka-producer-perf-test.sh`;
  command += ` --topic ${topic}`;
  command += ` --num-records ${numRecords}`;
  command += ` --record-size ${recordSize}`;
  command += ` --throughput ${throughput}`;
  command += ` --producer-props bootstrap.servers=${brokers}`;
  command += ` compression.type=${compression}`;
  command += ` batch.size=${batchSize}`;
  command += ` acks=${acks}`;
  command += ` --threads ${threads}`;

  // Add SASL if configured
  if (kafkaConfig.sasl) {
    command += ` sasl.mechanism=${kafkaConfig.sasl.mechanism || 'PLAIN'}`;
    command += ` security.protocol=SASL_PLAINTEXT`;
    command += ` sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="${kafkaConfig.sasl.username}" password="${kafkaConfig.sasl.password}";`;
  }

  return command;
}

// Generate consumer perf test command
function generateConsumerCommand(config) {
  const kafkaConfig = getKafkaConfig();
  if (!kafkaConfig) {
    throw new Error('Kafka not connected');
  }

  const brokers = kafkaConfig.brokers.join(',');
  const topic = config.topic;
  const numMessages = config.numMessages || 1000000;
  const threads = config.threads || 1;
  const groupId = config.groupId || `perf-test-group-${Date.now()}`;
  const fromBeginning = config.fromBeginning || false;

  let command = `kafka-consumer-perf-test.sh`;
  command += ` --topic ${topic}`;
  command += ` --messages ${numMessages}`;
  command += ` --threads ${threads}`;
  command += ` --group ${groupId}`;
  command += ` --bootstrap-server ${brokers}`;

  if (fromBeginning) {
    command += ` --from-latest=false`;
  }

  // Add SASL if configured
  if (kafkaConfig.sasl) {
    command += ` --consumer-props security.protocol=SASL_PLAINTEXT`;
    command += ` sasl.mechanism=${kafkaConfig.sasl.mechanism || 'PLAIN'}`;
    command += ` sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="${kafkaConfig.sasl.username}" password="${kafkaConfig.sasl.password}";`;
  }

  return command;
}

// Parse producer perf test output
function parseProducerOutput(output) {
  const lines = output.split('\n');
  const result = {
    recordsPerSec: 0,
    mbPerSec: 0,
    avgLatency: 0,
    maxLatency: 0,
    p50Latency: 0,
    p95Latency: 0,
    p99Latency: 0,
    p999Latency: 0,
  };

  for (const line of lines) {
    // Parse: X records/sec (Y MB/sec)
    const recordsMatch = line.match(/(\d+(?:\.\d+)?)\s+records\/sec\s+\((\d+(?:\.\d+)?)\s+MB\/sec\)/);
    if (recordsMatch) {
      result.recordsPerSec = parseFloat(recordsMatch[1]);
      result.mbPerSec = parseFloat(recordsMatch[2]);
    }

    // Parse: avg latency: X ms
    const avgLatencyMatch = line.match(/avg latency:\s+(\d+(?:\.\d+)?)\s+ms/);
    if (avgLatencyMatch) {
      result.avgLatency = parseFloat(avgLatencyMatch[1]);
    }

    // Parse: max latency: X ms
    const maxLatencyMatch = line.match(/max latency:\s+(\d+(?:\.\d+)?)\s+ms/);
    if (maxLatencyMatch) {
      result.maxLatency = parseFloat(maxLatencyMatch[1]);
    }

    // Parse percentile latencies
    const p50Match = line.match(/50th\s+percentile:\s+(\d+(?:\.\d+)?)\s+ms/);
    if (p50Match) result.p50Latency = parseFloat(p50Match[1]);

    const p95Match = line.match(/95th\s+percentile:\s+(\d+(?:\.\d+)?)\s+ms/);
    if (p95Match) result.p95Latency = parseFloat(p95Match[1]);

    const p99Match = line.match(/99th\s+percentile:\s+(\d+(?:\.\d+)?)\s+ms/);
    if (p99Match) result.p99Latency = parseFloat(p99Match[1]);

    const p999Match = line.match(/99\.9th\s+percentile:\s+(\d+(?:\.\d+)?)\s+ms/);
    if (p999Match) result.p999Latency = parseFloat(p999Match[1]);
  }

  return result;
}

// Parse consumer perf test output
function parseConsumerOutput(output) {
  const lines = output.split('\n');
  const result = {
    recordsPerSec: 0,
    mbPerSec: 0,
    rebalanceTime: 0,
  };

  for (const line of lines) {
    // Parse: X records/sec (Y MB/sec)
    const recordsMatch = line.match(/(\d+(?:\.\d+)?)\s+records\/sec\s+\((\d+(?:\.\d+)?)\s+MB\/sec\)/);
    if (recordsMatch) {
      result.recordsPerSec = parseFloat(recordsMatch[1]);
      result.mbPerSec = parseFloat(recordsMatch[2]);
    }

    // Parse rebalance time
    const rebalanceMatch = line.match(/rebalance\s+time:\s+(\d+(?:\.\d+)?)\s+ms/);
    if (rebalanceMatch) {
      result.rebalanceTime = parseFloat(rebalanceMatch[1]);
    }
  }

  return result;
}

// Check Kafka tools availability
router.get('/tools/check', async (req, res) => {
  try {
    const tools = await checkKafkaTools();
    res.json({
      success: true,
      tools: {
        producer: tools,
        consumer: tools, // Same path for consumer tool
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Run producer load test
router.post('/producer/run', async (req, res) => {
  try {
    const config = req.body;

    if (!config.topic) {
      return res.status(400).json({
        success: false,
        message: 'Topic is required',
      });
    }

    const kafkaConfig = getKafkaConfig();
    if (!kafkaConfig) {
      return res.status(400).json({
        success: false,
        message: 'Kafka not connected',
      });
    }

    // Check if tools are available
    const tools = await checkKafkaTools();
    if (!tools.available) {
      return res.status(400).json({
        success: false,
        message: 'Kafka performance test tools not found. Please install Kafka or set KAFKA_HOME environment variable.',
        suggestion: 'Install Kafka or use Web App Load Test mode instead',
      });
    }

    // Generate command
    const command = generateProducerCommand(config);

    // Execute command
    const startTime = new Date();
    const { stdout, stderr } = await execAsync(command, {
      timeout: config.timeout || 300000, // 5 minutes default
    });

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // seconds

    // Parse results
    const results = parseProducerOutput(stdout);
    const testResult = {
      id: Date.now(),
      type: 'producer',
      config,
      results,
      duration,
      startTime,
      endTime,
      rawOutput: stdout,
      error: stderr || null,
    };

    // Store result
    loadTestResults.push(testResult);
    if (loadTestResults.length > 100) {
      loadTestResults = loadTestResults.slice(-100); // Keep last 100
    }

    // Broadcast result
    global.broadcast({
      type: 'loadtest',
      data: testResult,
    });

    res.json({
      success: true,
      result: testResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stderr || error.message,
    });
  }
});

// Run consumer load test
router.post('/consumer/run', async (req, res) => {
  try {
    const config = req.body;

    if (!config.topic) {
      return res.status(400).json({
        success: false,
        message: 'Topic is required',
      });
    }

    const kafkaConfig = getKafkaConfig();
    if (!kafkaConfig) {
      return res.status(400).json({
        success: false,
        message: 'Kafka not connected',
      });
    }

    // Check if tools are available
    const tools = await checkKafkaTools();
    if (!tools.available) {
      return res.status(400).json({
        success: false,
        message: 'Kafka performance test tools not found. Please install Kafka or set KAFKA_HOME environment variable.',
        suggestion: 'Install Kafka or use Web App Load Test mode instead',
      });
    }

    // Generate command
    const command = generateConsumerCommand(config);

    // Execute command
    const startTime = new Date();
    const { stdout, stderr } = await execAsync(command, {
      timeout: config.timeout || 300000, // 5 minutes default
    });

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // seconds

    // Parse results
    const results = parseConsumerOutput(stdout);
    const testResult = {
      id: Date.now(),
      type: 'consumer',
      config,
      results,
      duration,
      startTime,
      endTime,
      rawOutput: stdout,
      error: stderr || null,
    };

    // Store result
    loadTestResults.push(testResult);
    if (loadTestResults.length > 100) {
      loadTestResults = loadTestResults.slice(-100); // Keep last 100
    }

    // Broadcast result
    global.broadcast({
      type: 'loadtest',
      data: testResult,
    });

    res.json({
      success: true,
      result: testResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.stderr || error.message,
    });
  }
});

// Get load test results
router.get('/results', (req, res) => {
  const { limit = 50, type } = req.query;
  let results = loadTestResults;

  if (type) {
    results = results.filter((r) => r.type === type);
  }

  results = results.slice(-parseInt(limit));

  res.json({
    success: true,
    results: results.reverse(), // Latest first
    total: loadTestResults.length,
  });
});

// Get specific test result
router.get('/results/:id', (req, res) => {
  const result = loadTestResults.find((r) => r.id === parseInt(req.params.id));
  if (!result) {
    return res.status(404).json({
      success: false,
      message: 'Test result not found',
    });
  }

  res.json({
    success: true,
    result,
  });
});

// Delete test result
router.delete('/results/:id', (req, res) => {
  const index = loadTestResults.findIndex((r) => r.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: 'Test result not found',
    });
  }

  loadTestResults.splice(index, 1);
  res.json({
    success: true,
    message: 'Test result deleted',
  });
});

// Import web-based load testing routes
const webLoadTestRoutes = require('./loadtest-web');
router.use('/web', webLoadTestRoutes);

module.exports = router;

