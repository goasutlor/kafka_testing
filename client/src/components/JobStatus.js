import React, { useState, useEffect } from 'react';
import { Activity, Square, Zap, Download, Clock, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';
import './JobStatus.css';

const JobStatus = () => {
  const [runningJobs, setRunningJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRunningJobs();
    const interval = setInterval(loadRunningJobs, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const loadRunningJobs = async () => {
    try {
      const res = await axios.get('/api/jobs/running');
      if (res.data.success) {
        setRunningJobs(res.data.jobs || []);
      }
    } catch (error) {
      console.error('Error loading running jobs:', error);
    }
  };

  const handleStopJob = async (jobId, type) => {
    try {
      setLoading(true);
      let endpoint = '';
      if (type === 'produce') {
        endpoint = `/api/produce/stop/${jobId}`;
      } else if (type === 'consume') {
        endpoint = `/api/consume/stop/${jobId}`;
      } else if (type.startsWith('loadtest')) {
        const subType = type.includes('producer') ? 'producer' : 'consumer';
        endpoint = `/api/loadtest/web/${subType}/stop`;
      }

      if (endpoint) {
        await axios.post(endpoint);
        await loadRunningJobs();
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to stop job');
    } finally {
      setLoading(false);
    }
  };

  const getJobTypeIcon = (type) => {
    switch (type) {
      case 'produce': return <Zap size={16} />;
      case 'consume': return <Download size={16} />;
      case 'loadtest-producer': return <Activity size={16} />;
      case 'loadtest-consumer': return <Activity size={16} />;
      default: return <Activity size={16} />;
    }
  };

  const getJobTypeColor = (type) => {
    switch (type) {
      case 'produce': return 'var(--primary)';
      case 'consume': return 'var(--success)';
      case 'loadtest-producer': return '#f59e0b';
      case 'loadtest-consumer': return '#8b5cf6';
      default: return 'var(--text-secondary)';
    }
  };

  if (runningJobs.length === 0) {
    return null; // Don't show if no running jobs
  }

  return (
    <div className="job-status-panel">
      <div className="job-status-header">
        <div className="header-left">
          <Activity size={18} />
          <span>Running Jobs ({runningJobs.length})</span>
        </div>
      </div>
      <div className="job-status-list">
        {runningJobs.map((jobData) => {
          const job = jobData.job;
          if (!job) return null;

          const duration = job.startTime
            ? Math.round((Date.now() - new Date(job.startTime).getTime()) / 1000)
            : 0;

          return (
            <div key={job.id} className="job-status-item">
              <div className="job-status-icon" style={{ color: getJobTypeColor(job.type) }}>
                {getJobTypeIcon(job.type)}
              </div>
              <div className="job-status-info">
                <div className="job-status-name">{job.name}</div>
                <div className="job-status-meta">
                  <span className="job-type-badge">{job.type}</span>
                  <span className="job-duration">
                    <Clock size={12} />
                    {duration}s
                  </span>
                </div>
              </div>
              <div className="job-status-actions">
                <button
                  onClick={() => handleStopJob(job.id, job.type)}
                  disabled={loading}
                  className="stop-job-btn"
                  title="Stop Job"
                >
                  <Square size={14} />
                  Stop
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JobStatus;

