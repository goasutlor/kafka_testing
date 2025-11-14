const express = require('express');
const router = express.Router();
const { getAllJobs } = require('./jobHistory');

// Import produce and consume routes to access their internal state
// Note: In a real application, you'd want to use a shared state manager
// For now, we'll create endpoints that aggregate data

// Get comprehensive summary report
router.get('/summary', async (req, res) => {
  try {
    // Get all completed jobs from history
    const allJobs = getAllJobs({ status: 'completed' });
    const produceJobs = allJobs.filter(j => j.type === 'produce');
    const consumeJobs = allJobs.filter(j => j.type === 'consume');
    const loadTestJobs = allJobs.filter(j => j.type.startsWith('loadtest'));

    // Aggregate stats from job history
    const produceStats = aggregateStats(produceJobs, 'produce');
    const consumeStats = aggregateStats(consumeJobs, 'consume');
    const loadTestStats = aggregateLoadTestStats(loadTestJobs);

    // For logs, we'll use the most recent job's data
    const axios = require('axios');
    const baseUrl = req.protocol + '://' + req.get('host');
    
    const [produceLogsRes, consumeLogsRes] = await Promise.all([
      axios.get(`${baseUrl}/api/produce/logs?limit=10000`).catch(() => ({ data: { logs: [] } })),
      axios.get(`${baseUrl}/api/consume/logs?limit=10000`).catch(() => ({ data: { logs: [] } })),
    ]);

    const produceLogs = produceLogsRes.data.logs || [];
    const consumeLogs = consumeLogsRes.data.logs || [];

    // Calculate comprehensive metrics
    const summary = {
      timestamp: new Date().toISOString(),
      produce: {
        total: produceStats?.total || 0,
        success: produceStats?.success || 0,
        failed: produceStats?.failed || 0,
        successRate: produceStats?.total > 0 
          ? ((produceStats.success / produceStats.total) * 100).toFixed(2) 
          : 0,
        duration: produceStats?.startTime && produceStats?.endTime
          ? Math.round((new Date(produceStats.endTime) - new Date(produceStats.startTime)) / 1000)
          : null,
        throughput: produceStats?.startTime && produceStats?.endTime && produceStats?.total
          ? (produceStats.total / Math.max(1, Math.round((new Date(produceStats.endTime) - new Date(produceStats.startTime)) / 1000))).toFixed(2)
          : 0,
        startTime: produceStats?.startTime,
        endTime: produceStats?.endTime,
      },
      consume: {
        total: consumeStats?.total || 0,
        uniqueSequences: consumeStats?.sequences?.length || 0,
        duration: consumeStats?.startTime && consumeStats?.endTime
          ? Math.round((new Date(consumeStats.endTime) - new Date(consumeStats.startTime)) / 1000)
          : null,
        throughput: consumeStats?.startTime && consumeStats?.endTime && consumeStats?.total
          ? (consumeStats.total / Math.max(1, Math.round((new Date(consumeStats.endTime) - new Date(consumeStats.startTime)) / 1000))).toFixed(2)
          : 0,
        startTime: consumeStats?.startTime,
        endTime: consumeStats?.endTime,
      },
      analysis: {
        messageLoss: calculateMessageLoss(produceLogs, consumeLogs),
        averageLatency: calculateAverageLatency(produceLogs, consumeLogs),
        peakThroughput: calculatePeakThroughput(produceLogs, consumeLogs),
        errorRate: produceStats?.total > 0 
          ? ((produceStats.failed / produceStats.total) * 100).toFixed(2)
          : 0,
      },
      recommendations: generateRecommendations(produceStats, consumeStats, produceLogs, consumeLogs),
      loadTest: loadTestStats,
      jobHistory: {
        produce: produceJobs.length,
        consume: consumeJobs.length,
        loadTest: loadTestJobs.length,
        total: allJobs.length,
      },
    };

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Calculate message loss percentage
function calculateMessageLoss(produceLogs, consumeLogs) {
  if (produceLogs.length === 0) return 0;
  
  const producedSequences = new Set(
    produceLogs
      .filter(log => log.sequence !== undefined)
      .map(log => log.sequence)
  );
  
  const consumedSequences = new Set(
    consumeLogs
      .filter(log => log.sequence !== undefined)
      .map(log => log.sequence)
  );
  
  const missing = producedSequences.size - consumedSequences.size;
  return producedSequences.size > 0 
    ? ((missing / producedSequences.size) * 100).toFixed(2)
    : 0;
}

// Calculate average latency (time between produce and consume)
function calculateAverageLatency(produceLogs, consumeLogs) {
  if (produceLogs.length === 0 || consumeLogs.length === 0) return 0;
  
  const latencyMap = new Map();
  
  // Create map of produce timestamps by sequence
  produceLogs.forEach(log => {
    if (log.sequence !== undefined) {
      latencyMap.set(log.sequence, {
        produceTime: new Date(log.timestamp).getTime(),
        consumeTime: null,
      });
    }
  });
  
  // Match with consume timestamps
  consumeLogs.forEach(log => {
    if (log.sequence !== undefined && latencyMap.has(log.sequence)) {
      const entry = latencyMap.get(log.sequence);
      if (!entry.consumeTime) {
        entry.consumeTime = new Date(log.timestamp).getTime();
      }
    }
  });
  
  // Calculate average latency
  const latencies = Array.from(latencyMap.values())
    .filter(entry => entry.consumeTime !== null)
    .map(entry => entry.consumeTime - entry.produceTime);
  
  if (latencies.length === 0) return 0;
  
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  return Math.round(avgLatency); // Return in milliseconds
}

// Calculate peak throughput
function calculatePeakThroughput(produceLogs, consumeLogs) {
  if (produceLogs.length === 0) return { produce: 0, consume: 0 };
  
  // Group by minute
  const produceByMinute = new Map();
  const consumeByMinute = new Map();
  
  produceLogs.forEach(log => {
    const date = new Date(log.timestamp);
    const minute = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    produceByMinute.set(minute, (produceByMinute.get(minute) || 0) + 1);
  });
  
  consumeLogs.forEach(log => {
    const date = new Date(log.timestamp);
    const minute = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    consumeByMinute.set(minute, (consumeByMinute.get(minute) || 0) + 1);
  });
  
  const producePeak = Math.max(...Array.from(produceByMinute.values()), 0);
  const consumePeak = Math.max(...Array.from(consumeByMinute.values()), 0);
  
  return {
    produce: producePeak,
    consume: consumePeak,
  };
}

// Generate intelligent recommendations
function generateRecommendations(produceStats, consumeStats, produceLogs, consumeLogs) {
  const recommendations = [];
  
  if (produceStats) {
    const errorRate = produceStats.total > 0 
      ? (produceStats.failed / produceStats.total) * 100 
      : 0;
    
    if (errorRate > 5) {
      recommendations.push({
        type: 'warning',
        title: 'High Error Rate',
        message: `Error rate is ${errorRate.toFixed(2)}%. Consider checking Kafka broker health and network connectivity.`,
        priority: 'high',
      });
    }
    
    if (produceStats.success > 0 && produceStats.total > 100) {
      const successRate = (produceStats.success / produceStats.total) * 100;
      if (successRate < 95) {
        recommendations.push({
          type: 'warning',
          title: 'Low Success Rate',
          message: `Success rate is ${successRate.toFixed(2)}%. Review error logs for common failure patterns.`,
          priority: 'medium',
        });
      }
    }
  }
  
  // Check for message loss
  const messageLoss = calculateMessageLoss(produceLogs, consumeLogs);
  if (messageLoss > 1) {
    recommendations.push({
      type: 'error',
      title: 'Message Loss Detected',
      message: `${messageLoss}% of messages were not consumed. Check consumer group configuration and lag.`,
      priority: 'high',
    });
  }
  
  // Performance recommendations
  if (produceStats && produceStats.startTime && produceStats.endTime) {
    const duration = (new Date(produceStats.endTime) - new Date(produceStats.startTime)) / 1000;
    const throughput = produceStats.total / duration;
    
    if (throughput < 10) {
      recommendations.push({
        type: 'info',
        title: 'Low Throughput',
        message: `Throughput is ${throughput.toFixed(2)} messages/sec. Consider optimizing batch size and compression.`,
        priority: 'low',
      });
    }
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'success',
      title: 'System Health Good',
      message: 'All metrics are within acceptable ranges. System is operating normally.',
      priority: 'low',
    });
  }
  
  return recommendations;
}

// Get detailed analytics
router.get('/analytics', async (req, res) => {
  try {
    const axios = require('axios');
    const baseUrl = req.protocol + '://' + req.get('host');
    
    const [produceLogsRes, consumeLogsRes] = await Promise.all([
      axios.get(`${baseUrl}/api/produce/logs?limit=10000`).catch(() => ({ data: { logs: [] } })),
      axios.get(`${baseUrl}/api/consume/logs?limit=10000`).catch(() => ({ data: { logs: [] } })),
    ]);

    const produceLogs = produceLogsRes.data.logs || [];
    const consumeLogs = consumeLogsRes.data.logs || [];

    // Time series data
    const timeSeries = generateTimeSeries(produceLogs, consumeLogs);
    
    // Distribution data
    const distributions = {
      produce: generateStatusDistribution(produceLogs),
      consume: generateStatusDistribution(consumeLogs),
    };
    
    // Sequence analysis
    const sequenceAnalysis = analyzeSequences(produceLogs, consumeLogs);

    res.json({
      success: true,
      analytics: {
        timeSeries,
        distributions,
        sequenceAnalysis,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Generate time series data
function generateTimeSeries(produceLogs, consumeLogs) {
  const timeMap = new Map();
  
  [...produceLogs, ...consumeLogs].forEach(log => {
    const date = new Date(log.timestamp);
    const timeKey = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    if (!timeMap.has(timeKey)) {
      timeMap.set(timeKey, { time: timeKey, produce: 0, consume: 0 });
    }
    
    const entry = timeMap.get(timeKey);
    if (produceLogs.some(pl => pl.id === log.id)) {
      entry.produce++;
    } else {
      entry.consume++;
    }
  });
  
  return Array.from(timeMap.values())
    .sort((a, b) => a.time.localeCompare(b.time));
}

// Generate status distribution
function generateStatusDistribution(logs) {
  const distribution = {
    success: 0,
    failed: 0,
    error: 0,
  };
  
  logs.forEach(log => {
    if (log.status === 'success') distribution.success++;
    else if (log.status === 'failed') distribution.failed++;
    else if (log.status === 'error') distribution.error++;
  });
  
  return distribution;
}

// Analyze sequences for missing messages
function analyzeSequences(produceLogs, consumeLogs) {
  const producedSequences = produceLogs
    .filter(log => log.sequence !== undefined)
    .map(log => log.sequence)
    .sort((a, b) => a - b);
  
  const consumedSequences = consumeLogs
    .filter(log => log.sequence !== undefined)
    .map(log => log.sequence)
    .sort((a, b) => a - b);
  
  const missing = [];
  if (producedSequences.length > 0) {
    const min = producedSequences[0];
    const max = producedSequences[producedSequences.length - 1];
    const consumedSet = new Set(consumedSequences);
    
    for (let i = min; i <= max; i++) {
      if (!consumedSet.has(i)) {
        missing.push(i);
      }
    }
  }
  
  return {
    totalProduced: producedSequences.length,
    totalConsumed: consumedSequences.length,
    missing: missing.length,
    missingSequences: missing.slice(0, 100), // Limit to first 100
    ranges: groupMissingSequences(missing),
  };
}

// Group missing sequences into ranges
function groupMissingSequences(missing) {
  if (missing.length === 0) return [];
  
  const ranges = [];
  let start = missing[0];
  let end = missing[0];
  
  for (let i = 1; i < missing.length; i++) {
    if (missing[i] === end + 1) {
      end = missing[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = missing[i];
      end = missing[i];
    }
  }
  
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges;
}

// Aggregate stats from multiple jobs
function aggregateStats(jobs, type) {
  if (jobs.length === 0) return null;

  const total = jobs.reduce((sum, job) => sum + (job.stats?.total || 0), 0);
  const success = jobs.reduce((sum, job) => sum + (job.stats?.success || 0), 0);
  const failed = jobs.reduce((sum, job) => sum + (job.stats?.failed || 0), 0);
  
  const startTimes = jobs.map(j => new Date(j.startTime)).filter(Boolean);
  const endTimes = jobs.map(j => new Date(j.endTime)).filter(Boolean);
  
  const earliestStart = startTimes.length > 0 ? new Date(Math.min(...startTimes)) : null;
  const latestEnd = endTimes.length > 0 ? new Date(Math.max(...endTimes)) : null;

  return {
    total,
    success,
    failed,
    startTime: earliestStart,
    endTime: latestEnd,
    successRate: total > 0 ? ((success / total) * 100).toFixed(2) : 0,
    jobCount: jobs.length,
  };
}

// Aggregate load test stats
function aggregateLoadTestStats(jobs) {
  if (jobs.length === 0) return null;

  const producerJobs = jobs.filter(j => j.type === 'loadtest-producer');
  const consumerJobs = jobs.filter(j => j.type === 'loadtest-consumer');

  return {
    producer: producerJobs.length > 0 ? {
      totalJobs: producerJobs.length,
      avgThroughput: producerJobs.reduce((sum, j) => sum + (j.stats?.recordsPerSec || 0), 0) / producerJobs.length,
      avgLatency: producerJobs.reduce((sum, j) => sum + (j.stats?.percentiles?.avg || 0), 0) / producerJobs.length,
      jobs: producerJobs,
    } : null,
    consumer: consumerJobs.length > 0 ? {
      totalJobs: consumerJobs.length,
      avgThroughput: consumerJobs.reduce((sum, j) => sum + (j.stats?.recordsPerSec || 0), 0) / consumerJobs.length,
      jobs: consumerJobs,
    } : null,
  };
}

// Get job history for reports
router.get('/jobs', (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    const jobs = getAllJobs({ type, status: 'completed' });
    res.json({
      success: true,
      jobs: jobs.slice(0, parseInt(limit)),
      total: jobs.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
