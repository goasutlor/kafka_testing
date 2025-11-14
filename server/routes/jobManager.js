const express = require('express');
const router = express.Router();
const { getJobById, getAllJobs, updateJob } = require('./jobHistory');

// Store active job instances - support multiple concurrent jobs
const activeJobs = new Map(); // jobId -> { type, instance, stats, logs, config }

// Register active job
function registerActiveJob(jobId, type, instance, config = {}, stats = null, logs = null) {
  activeJobs.set(jobId, {
    type,
    instance,
    config,
    stats: stats || {},
    logs: logs || [],
    lastUpdate: new Date(),
  });
}

// Unregister active job
function unregisterActiveJob(jobId) {
  activeJobs.delete(jobId);
}

// Get active job
function getActiveJob(jobId) {
  return activeJobs.get(jobId);
}

// Get all active jobs
function getAllActiveJobs() {
  return Array.from(activeJobs.entries()).map(([jobId, data]) => {
    let jobRecord = null;
    try {
      jobRecord = getJobById(jobId);
    } catch (err) {
      console.error(`Error getting job record for ${jobId}:`, err);
    }
    
    return {
      jobId,
      ...data,
      job: jobRecord,
    };
  });
}

// Update active job stats
function updateActiveJobStats(jobId, stats) {
  const activeJob = activeJobs.get(jobId);
  if (activeJob) {
    activeJob.stats = { ...activeJob.stats, ...stats };
    activeJob.lastUpdate = new Date();
    
    // Also update job history
    updateJob(jobId, stats, 'running');
  }
}

// Get running jobs
router.get('/running', (req, res) => {
  try {
    const runningJobs = getAllActiveJobs();
    res.json({
      success: true,
      jobs: runningJobs,
      count: runningJobs.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get specific running job
router.get('/running/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const activeJob = getActiveJob(jobId);
    if (activeJob) {
      let jobRecord = null;
      try {
        jobRecord = getJobById(jobId);
      } catch (err) {
        console.error(`Error getting job record for ${jobId}:`, err);
      }
      
      res.json({
        success: true,
        job: {
          jobId,
          ...activeJob,
          job: jobRecord,
        },
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Job not found or not running',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
module.exports.registerActiveJob = registerActiveJob;
module.exports.unregisterActiveJob = unregisterActiveJob;
module.exports.getActiveJob = getActiveJob;
module.exports.updateActiveJobStats = updateActiveJobStats;
