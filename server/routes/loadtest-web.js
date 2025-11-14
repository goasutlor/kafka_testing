const express = require('express');
const router = express.Router();
const { getKafkaClient, getKafkaConfig } = require('./kafka');
const { createJob, updateJob, generateJobName, getJobById } = require('./jobHistory');
const { registerActiveJob, unregisterActiveJob, updateActiveJobStats } = require('./jobManager');

// Support multiple concurrent load test jobs
const activeLoadTestJobs = new Map(); // jobId -> { type, producer/consumer, stats, config, interval, startTime, endTime }

// Helper to stop a specific load test job
async function stopLoadTestJobById(jobId) {
  const jobData = activeLoadTestJobs.get(jobId);
  if (!jobData) return;

  if (jobData.interval) {
    clearInterval(jobData.interval);
  }
  if (jobData.producer) {
    await jobData.producer.disconnect();
  }
  if (jobData.consumer) {
    await jobData.consumer.disconnect();
  }

  jobData.stats.running = false;
  jobData.stats.endTime = new Date();
  
  // Calculate final metrics
  const duration = (jobData.stats.endTime - jobData.stats.startTime) / 1000;
  if (duration > 0) {
    jobData.stats.recordsPerSec = jobData.stats.successRecords / duration;
    if (jobData.config.recordSize) {
      jobData.stats.mbPerSec = (jobData.stats.successRecords * jobData.config.recordSize) / (duration * 1024 * 1024);
    }
  }
  
  // Calculate final error rate
  const totalRecords = jobData.stats.totalRecords || 1;
  jobData.stats.errorRate = (jobData.stats.failedRecords / totalRecords) * 100;

  updateJob(jobId, {
    ...jobData.stats,
    percentiles: jobData.stats.latencies ? calculatePercentiles(jobData.stats.latencies) : null,
    ackPercentiles: jobData.stats.ackLatencies ? calculatePercentiles(jobData.stats.ackLatencies) : null,
  }, 'completed');

  unregisterActiveJob(jobId);
  activeLoadTestJobs.delete(jobId);

  global.broadcast({
    type: 'loadtest-complete',
    data: {
      jobId,
      type: jobData.type,
      stats: jobData.stats,
    },
  });
}

// Calculate percentiles
function calculatePercentiles(latencies) {
  if (latencies.length === 0) {
    return {
      p50: 0,
      p95: 0,
      p99: 0,
      p999: 0,
      min: 0,
      max: 0,
      avg: 0,
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const len = sorted.length;

  const getPercentile = (p) => {
    const index = Math.ceil(p / 100 * len) - 1;
    return sorted[index] || sorted[len - 1];
  };

  return {
    p50: getPercentile(50),
    p95: getPercentile(95),
    p99: getPercentile(99),
    p999: getPercentile(99.9),
    min: sorted[0],
    max: sorted[len - 1],
    avg: sorted.reduce((a, b) => a + b, 0) / len,
  };
}

// Start producer load test (Web App mode)
router.post('/producer/start', async (req, res) => {
  try {
    const {
      topic,
      targetThroughput, // records/sec
      duration, // seconds
      recordSize, // bytes
      batchSize, // number of records per batch
      compression,
      acks,
      jobName,
    } = req.body;

    if (!topic) {
      return res.status(400).json({
        success: false,
        message: 'Topic is required',
      });
    }

    const kafka = getKafkaClient();
    if (!kafka) {
      return res.status(400).json({
        success: false,
        message: 'Kafka not connected',
      });
    }

    const kafkaConfig = getKafkaConfig();
    if (!kafkaConfig) {
      return res.status(400).json({
        success: false,
        message: 'Kafka configuration not available',
      });
    }

    // Create job record first
    const job = createJob('loadtest-producer', jobName || generateJobName('loadtest-producer'), {
      topic,
      targetThroughput,
      duration,
      recordSize,
      batchSize,
      compression,
      acks,
    });
    const jobId = job.id;

    const producer = kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      compression: compression || 0,
      acks: acks || -1,
      // Use unique clientId to avoid conflicts with main connection
      clientId: `${kafkaConfig.clientId || 'kafka-test-client'}-producer-${jobId}`,
    });

    await producer.connect();

    const targetThroughputValue = targetThroughput || -1;
    const durationMs = (duration || 60) * 1000;
    const recordSizeBytes = recordSize || 1024;
    const batchSizeValue = batchSize || 1;

    const jobStats = {
      running: true,
      startTime: new Date(),
      endTime: null,
      totalRecords: 0,
      successRecords: 0,
      failedRecords: 0,
      recordsPerSec: 0,
      mbPerSec: 0,
      latencies: [], // Total send latency (includes network + ACK)
      ackLatencies: [], // ACK latency specifically (time from send to broker ACK)
      errorRate: 0, // Percentage of failed records
      timeoutErrors: 0, // Count of timeout errors
      networkErrors: 0, // Count of network errors
      brokerErrors: 0, // Count of broker errors
      otherErrors: 0, // Count of other errors
      errorRateHistory: [], // Error rate over time
      throughputHistory: [],
    };

    // Store in activeLoadTestJobs
    activeLoadTestJobs.set(jobId, {
      type: 'loadtest-producer',
      producer,
      consumer: null,
      stats: jobStats,
      config: {
        topic,
        jobName: jobName || job.name,
        targetThroughput: targetThroughputValue,
        duration,
        recordSize: recordSizeBytes,
        batchSize: batchSizeValue,
        compression,
        acks,
      },
      interval: null,
      startTime: Date.now(),
      endTime: Date.now() + durationMs,
    });

    // Register active job
    registerActiveJob(jobId, 'loadtest-producer', producer, {
      topic,
      targetThroughput: targetThroughputValue,
      duration,
      recordSize: recordSizeBytes,
      batchSize: batchSizeValue,
      compression,
      acks,
    }, jobStats);

    let lastThroughputCheck = Date.now();
    let recordsSinceLastCheck = 0;
    const throughputCheckInterval = 1000;
    const messagePayload = 'x'.repeat(recordSizeBytes);
    let sendInterval = targetThroughputValue > 0 ? 1000 / targetThroughputValue : 0;
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    let recordCounter = 0;

    const sendBatch = async () => {
      const jobData = activeLoadTestJobs.get(jobId);
      if (!jobData || Date.now() >= endTime || !jobData.stats.running) {
        if (jobData) {
          await stopLoadTestJobById(jobId);
        }
        return;
      }

      try {
        const batch = [];
        for (let i = 0; i < batchSizeValue; i++) {
          batch.push({
            key: `key-${recordCounter}`,
            value: JSON.stringify({
              message: messagePayload,
              timestamp: new Date().toISOString(),
              sequence: recordCounter,
            }),
          });
          recordCounter++;
        }

        const sendStartTime = Date.now();
        await jobData.producer.send({
          topic,
          messages: batch,
        });
        const sendEndTime = Date.now();
        const totalLatency = sendEndTime - sendStartTime;
        // ACK latency is the same as total latency when acks is set (broker ACK received)
        const ackLatency = totalLatency;

        jobData.stats.successRecords += batch.length;
        jobData.stats.totalRecords += batch.length;
        jobData.stats.latencies.push(totalLatency);
        jobData.stats.ackLatencies.push(ackLatency);

        recordsSinceLastCheck += batch.length;
        const now = Date.now();
        if (now - lastThroughputCheck >= throughputCheckInterval) {
          const elapsed = (now - lastThroughputCheck) / 1000;
          const currentThroughput = recordsSinceLastCheck / elapsed;
          
          // Calculate error rate
          const totalRecords = jobData.stats.totalRecords || 1;
          const errorRate = (jobData.stats.failedRecords / totalRecords) * 100;
          jobData.stats.errorRate = errorRate;
          
          jobData.stats.throughputHistory.push({
            timestamp: now,
            recordsPerSec: currentThroughput,
            mbPerSec: (currentThroughput * recordSizeBytes) / (1024 * 1024),
          });
          
          jobData.stats.errorRateHistory.push({
            timestamp: now,
            errorRate: errorRate,
            timeoutErrors: jobData.stats.timeoutErrors,
            networkErrors: jobData.stats.networkErrors,
            brokerErrors: jobData.stats.brokerErrors,
            otherErrors: jobData.stats.otherErrors,
          });

          recordsSinceLastCheck = 0;
          lastThroughputCheck = now;

          const testDuration = (now - startTime) / 1000;
          jobData.stats.recordsPerSec = jobData.stats.successRecords / testDuration;
          jobData.stats.mbPerSec = (jobData.stats.successRecords * recordSizeBytes) / (testDuration * 1024 * 1024);

          updateActiveJobStats(jobId, {
            ...jobData.stats,
            percentiles: calculatePercentiles(jobData.stats.latencies),
            ackPercentiles: calculatePercentiles(jobData.stats.ackLatencies),
          });

          global.broadcast({
            type: 'loadtest-stats',
            data: {
              jobId,
              type: 'loadtest-producer',
              stats: {
                ...jobData.stats,
                percentiles: calculatePercentiles(jobData.stats.latencies),
                ackPercentiles: calculatePercentiles(jobData.stats.ackLatencies),
              },
            },
          });
        }
      } catch (error) {
        const jobData = activeLoadTestJobs.get(jobId);
        if (jobData) {
          jobData.stats.failedRecords += batchSizeValue;
          jobData.stats.totalRecords += batchSizeValue;
          
          // Categorize errors
          const errorMessage = error.message || error.toString();
          const errorCode = error.code || '';
          
          if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT') || errorCode === 'ETIMEDOUT') {
            jobData.stats.timeoutErrors += batchSizeValue;
          } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') || errorCode.startsWith('E')) {
            jobData.stats.networkErrors += batchSizeValue;
          } else if (errorMessage.includes('broker') || errorMessage.includes('NOT_LEADER') || errorMessage.includes('LEADER_NOT_AVAILABLE') || errorCode.includes('KAFKA')) {
            jobData.stats.brokerErrors += batchSizeValue;
          } else {
            jobData.stats.otherErrors += batchSizeValue;
          }
          
          // Update error rate
          const totalRecords = jobData.stats.totalRecords || 1;
          jobData.stats.errorRate = (jobData.stats.failedRecords / totalRecords) * 100;
        }
        console.error('Load test send error:', error);
      }

      if (sendInterval > 0) {
        setTimeout(sendBatch, sendInterval * batchSizeValue);
      } else {
        setImmediate(sendBatch);
      }
    };

    // Start sending
    activeLoadTestJobs.get(jobId).interval = setInterval(() => {}, 0); // Placeholder
    sendBatch();

    res.json({
      success: true,
      message: 'Producer load test started',
      jobId: jobId,
      jobName: job.name,
      config: {
        topic,
        targetThroughput: targetThroughputValue,
        duration,
        recordSize: recordSizeBytes,
        batchSize: batchSizeValue,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Stop producer load test by ID
router.post('/producer/stop/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    await stopLoadTestJobById(jobId);
    res.json({
      success: true,
      message: 'Producer load test stopped',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Stop all producer load tests (backward compatibility)
router.post('/producer/stop', async (req, res) => {
  try {
    const jobIds = Array.from(activeLoadTestJobs.entries())
      .filter(([id, data]) => data.type === 'loadtest-producer')
      .map(([id]) => id);
    await Promise.all(jobIds.map(jobId => stopLoadTestJobById(jobId)));
    res.json({
      success: true,
      message: 'All producer load tests stopped',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get producer load test stats for a specific job
router.get('/producer/stats/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const jobData = activeLoadTestJobs.get(jobId);
    if (!jobData || jobData.type !== 'loadtest-producer') {
      return res.status(404).json({
        success: false,
        stats: null,
        message: 'Job not found or not running',
      });
    }

    const percentiles = calculatePercentiles(jobData.stats.latencies);
    const ackPercentiles = jobData.stats.ackLatencies ? calculatePercentiles(jobData.stats.ackLatencies) : null;
    res.json({
      success: true,
      stats: {
        ...jobData.stats,
        percentiles,
        ackPercentiles,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get all running load test jobs
router.get('/running', (req, res) => {
  try {
    const runningJobs = Array.from(activeLoadTestJobs.entries()).map(([jobId, data]) => {
      try {
        // Safely get percentiles
        let percentiles = null;
        let ackPercentiles = null;
        if (data && data.stats && data.stats.latencies && Array.isArray(data.stats.latencies) && data.stats.latencies.length > 0) {
          try {
            percentiles = calculatePercentiles(data.stats.latencies);
          } catch (err) {
            console.error(`Error calculating percentiles for job ${jobId}:`, err);
            percentiles = null;
          }
        }
        if (data && data.stats && data.stats.ackLatencies && Array.isArray(data.stats.ackLatencies) && data.stats.ackLatencies.length > 0) {
          try {
            ackPercentiles = calculatePercentiles(data.stats.ackLatencies);
          } catch (err) {
            console.error(`Error calculating ACK percentiles for job ${jobId}:`, err);
            ackPercentiles = null;
          }
        }

        // Safely get job record
        let jobRecord = null;
        try {
          jobRecord = getJobById(jobId);
        } catch (err) {
          console.error(`Error getting job record for ${jobId}:`, err);
        }

        // Convert startTime from timestamp to ISO string if needed
        const startTimeISO = data && data.startTime
          ? (typeof data.startTime === 'number' 
              ? new Date(data.startTime).toISOString() 
              : (data.startTime || new Date().toISOString()))
          : new Date().toISOString();

        // Safely get config
        const config = data.config || {};
        const stats = data.stats || {};

        return {
          jobId,
          job: jobRecord || {
            id: jobId,
            name: config.jobName || `loadtest-${(data.type || 'unknown').replace('loadtest-', '')}-${new Date().toISOString().slice(0, 10)}`,
            type: data.type || 'unknown',
            startTime: startTimeISO,
            endTime: data.endTime ? (typeof data.endTime === 'number' ? new Date(data.endTime).toISOString() : data.endTime) : null,
            status: 'running',
          },
          type: data.type || 'unknown',
          config: config,
          stats: {
            ...stats,
            percentiles,
            ackPercentiles,
          },
          startTime: startTimeISO,
          endTime: data.endTime ? (typeof data.endTime === 'number' ? new Date(data.endTime).toISOString() : data.endTime) : null,
        };
      } catch (itemError) {
        console.error(`Error processing job ${jobId}:`, itemError);
        // Return a minimal job object to prevent breaking the entire response
        return {
          jobId,
          job: {
            id: jobId,
            name: `loadtest-unknown-${new Date().toISOString().slice(0, 10)}`,
            type: 'unknown',
            startTime: new Date().toISOString(),
            endTime: null,
            status: 'running',
          },
          type: 'unknown',
          config: {},
          stats: {
            percentiles: null,
          },
          startTime: new Date().toISOString(),
          endTime: null,
        };
      }
    });

    res.json({
      success: true,
      jobs: runningJobs,
      count: runningJobs.length,
    });
  } catch (error) {
    console.error('Error in /running endpoint:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get running jobs',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Consumer load test (simplified - similar pattern)
router.post('/consumer/start', async (req, res) => {
  try {
    const {
      topic,
      groupId,
      fromBeginning,
      duration,
      messageSize,
      jobName,
    } = req.body;

    if (!topic || !groupId) {
      return res.status(400).json({
        success: false,
        message: 'Topic and Group ID are required',
      });
    }

    const kafka = getKafkaClient();
    if (!kafka) {
      return res.status(400).json({
        success: false,
        message: 'Kafka not connected',
      });
    }

    const kafkaConfig = getKafkaConfig();
    if (!kafkaConfig) {
      return res.status(400).json({
        success: false,
        message: 'Kafka configuration not available',
      });
    }

    const job = createJob('loadtest-consumer', jobName || generateJobName('loadtest-consumer'), {
      topic,
      groupId,
      fromBeginning,
      duration,
      messageSize,
    });
    const jobId = job.id;

    const consumer = kafka.consumer({ 
      groupId,
      // Use unique clientId to avoid conflicts with main connection
      clientId: `${kafkaConfig.clientId || 'kafka-test-client'}-consumer-${jobId}`,
    });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: fromBeginning || false });

    const jobStats = {
      running: true,
      startTime: new Date(),
      endTime: null,
      totalRecords: 0,
      recordsPerSec: 0,
      mbPerSec: 0,
      lag: 0,
      throughputHistory: [],
    };

    const durationMs = (duration || 60) * 1000;
    const startTime = Date.now();
    const endTime = startTime + durationMs;

    activeLoadTestJobs.set(jobId, {
      type: 'loadtest-consumer',
      producer: null,
      consumer,
      stats: jobStats,
      config: {
        topic,
        jobName: jobName || job.name,
        groupId,
        fromBeginning,
        duration,
        messageSize: messageSize || 1024,
      },
      interval: null,
      startTime,
      endTime,
    });

    registerActiveJob(jobId, 'loadtest-consumer', consumer, {
      topic,
      groupId,
      fromBeginning,
      duration,
      messageSize,
    }, jobStats);

    let lastThroughputCheck = Date.now();
    let recordsSinceLastCheck = 0;

    const runConsumer = async () => {
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const jobData = activeLoadTestJobs.get(jobId);
          if (!jobData || Date.now() >= endTime || !jobData.stats.running) {
            if (jobData) {
              await stopLoadTestJobById(jobId);
            }
            return;
          }

          jobData.stats.totalRecords++;
          recordsSinceLastCheck++;

          const now = Date.now();
          if (now - lastThroughputCheck >= 1000) {
            const elapsed = (now - lastThroughputCheck) / 1000;
            const currentThroughput = recordsSinceLastCheck / elapsed;
            jobData.stats.throughputHistory.push({
              timestamp: now,
              recordsPerSec: currentThroughput,
              mbPerSec: (currentThroughput * (messageSize || 1024)) / (1024 * 1024),
            });

            recordsSinceLastCheck = 0;
            lastThroughputCheck = now;

            const testDuration = (now - startTime) / 1000;
            jobData.stats.recordsPerSec = jobData.stats.totalRecords / testDuration;
            jobData.stats.mbPerSec = (jobData.stats.totalRecords * (messageSize || 1024)) / (testDuration * 1024 * 1024);

            updateActiveJobStats(jobId, jobData.stats);

            global.broadcast({
              type: 'loadtest-stats',
              data: {
                jobId,
                type: 'loadtest-consumer',
                stats: jobData.stats,
              },
            });
          }
        },
      });
    };

    runConsumer();

    // Auto-stop after duration
    setTimeout(async () => {
      const jobData = activeLoadTestJobs.get(jobId);
      if (jobData && jobData.stats.running) {
        await stopLoadTestJobById(jobId);
      }
    }, durationMs);

    res.json({
      success: true,
      message: 'Consumer load test started',
      jobId: jobId,
      jobName: job.name,
      config: {
        topic,
        groupId,
        fromBeginning,
        duration,
        messageSize,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Stop consumer load test by ID
router.post('/consumer/stop/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    await stopLoadTestJobById(jobId);
    res.json({
      success: true,
      message: 'Consumer load test stopped',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Stop all consumer load tests
router.post('/consumer/stop', async (req, res) => {
  try {
    const jobIds = Array.from(activeLoadTestJobs.entries())
      .filter(([id, data]) => data.type === 'loadtest-consumer')
      .map(([id]) => id);
    await Promise.all(jobIds.map(jobId => stopLoadTestJobById(jobId)));
    res.json({
      success: true,
      message: 'All consumer load tests stopped',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get consumer load test stats for a specific job
router.get('/consumer/stats/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const jobData = activeLoadTestJobs.get(jobId);
    if (!jobData || jobData.type !== 'loadtest-consumer') {
      return res.status(404).json({
        success: false,
        stats: null,
        message: 'Job not found or not running',
      });
    }

    res.json({
      success: true,
      stats: jobData.stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
