const express = require('express');
const router = express.Router();
const jobRepo = require('../database/jobRepository');

// Use SQLite database for persistent storage

// Re-export functions from repository
const generateJobName = jobRepo.generateJobName;
const createJob = jobRepo.createJob;
const updateJob = jobRepo.updateJob;
const getJob = jobRepo.getJobById;
const getJobById = jobRepo.getJobById;
const getAllJobs = jobRepo.getAllJobs;

// Get job statistics
function getJobStatistics() {
  const allJobs = getAllJobs();
  const stats = {
    total: allJobs.length,
    byType: {},
    byStatus: {},
    recent: allJobs.slice(0, 10),
  };
  
  allJobs.forEach(job => {
    stats.byType[job.type] = (stats.byType[job.type] || 0) + 1;
    stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;
  });
  
  return stats;
}

// API Routes
router.post('/create', (req, res) => {
  try {
    const { type, name, config } = req.body;
    const job = createJob(type, name, config);
    res.json({ success: true, job });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const { stats, status } = req.body;
    const job = updateJob(jobId, stats, status);
    if (job) {
      res.json({ success: true, job });
    } else {
      res.status(404).json({ success: false, message: 'Job not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);
    if (job) {
      res.json({ success: true, job });
    } else {
      res.status(404).json({ success: false, message: 'Job not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', (req, res) => {
  try {
    const { type, status, startDate, endDate, limit = 100 } = req.query;
    const filters = { type, status, startDate, endDate, limit };
    const jobs = getAllJobs(filters);
    const total = getAllJobs().length; // Get total count without limit
    
    res.json({ success: true, jobs, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/stats/summary', (req, res) => {
  try {
    const stats = getJobStatistics();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const deleted = jobRepo.deleteJob(jobId);
    if (deleted) {
      res.json({ success: true, message: 'Job deleted' });
    } else {
      res.status(404).json({ success: false, message: 'Job not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export functions for use in other modules
module.exports = router;
module.exports.createJob = createJob;
module.exports.updateJob = updateJob;
module.exports.getJob = getJob;
module.exports.getJobById = getJobById;
module.exports.getAllJobs = getAllJobs;
module.exports.generateJobName = generateJobName;

