const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const dbPath = path.join(dataDir, 'kafka_test.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
function initializeDatabase() {
  // Jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      stats TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_start_time ON jobs(start_time);
  `);

  console.log('Database initialized successfully');
}

// Initialize on module load
initializeDatabase();

module.exports = db;

