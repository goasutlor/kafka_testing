const db = require('./db');

// Create a new job
function createJob(type, jobName, config, stats = null) {
  const jobId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO jobs (id, type, name, config, stats, start_time, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)
  `);
  
  stmt.run(
    jobId,
    type,
    jobName || generateJobName(type),
    JSON.stringify(config),
    JSON.stringify(stats || {}),
    now,
    now,
    now
  );
  
  return {
    id: jobId,
    type,
    name: jobName || generateJobName(type),
    config,
    stats: stats || {},
    startTime: now,
    endTime: null,
    status: 'running',
    createdAt: now,
    updatedAt: now,
  };
}

// Update job
function updateJob(jobId, stats, status = 'completed') {
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE jobs 
    SET stats = ?, status = ?, end_time = ?, updated_at = ?
    WHERE id = ?
  `);
  
  const result = stmt.run(
    JSON.stringify(stats),
    status,
    status === 'completed' ? now : null,
    now,
    jobId
  );
  
  if (result.changes === 0) {
    return null;
  }
  
  return getJobById(jobId);
}

// Get job by ID
function getJobById(jobId) {
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
  const row = stmt.get(jobId);
  
  if (!row) return null;
  
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    config: JSON.parse(row.config),
    stats: JSON.parse(row.stats),
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Get all jobs with filters
function getAllJobs(filters = {}) {
  let query = 'SELECT * FROM jobs WHERE 1=1';
  const params = [];
  
  if (filters.type) {
    query += ' AND type = ?';
    params.push(filters.type);
  }
  
  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  
  if (filters.startDate) {
    query += ' AND created_at >= ?';
    params.push(filters.startDate);
  }
  
  if (filters.endDate) {
    query += ' AND created_at <= ?';
    params.push(filters.endDate);
  }
  
  query += ' ORDER BY created_at DESC';
  
  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(parseInt(filters.limit));
  }
  
  const stmt = db.prepare(query);
  const rows = stmt.all(...params);
  
  return rows.map(row => ({
    id: row.id,
    type: row.type,
    name: row.name,
    config: JSON.parse(row.config),
    stats: JSON.parse(row.stats),
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// Generate job name
function generateJobName(type) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `${type}-${dateStr}-${timeStr}`;
}

// Delete job
function deleteJob(jobId) {
  const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
  const result = stmt.run(jobId);
  return result.changes > 0;
}

module.exports = {
  createJob,
  updateJob,
  getJobById,
  getAllJobs,
  generateJobName,
  deleteJob,
};

