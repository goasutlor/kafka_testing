import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, BarChart3, Zap, TrendingUp, Clock, Activity, Download, Save, Trash2, Edit2, Plus, X } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import axios from 'axios';
import './LoadTestPage.css';

const LoadTestPage = () => {
  const [testType, setTestType] = useState('producer'); // 'producer' or 'consumer'
  const [availableTopics, setAvailableTopics] = useState([]);
  const [runningJobs, setRunningJobs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDetailStats, setJobDetailStats] = useState(null);
  const [throughputChartData, setThroughputChartData] = useState([]);
  const [percentileChartData, setPercentileChartData] = useState([]);
  const [profileForm, setProfileForm] = useState({
    name: '',
    type: 'producer',
    config: {
      topic: '',
      jobName: '',
      targetThroughput: 1000,
      duration: 60,
      recordSize: 1024,
      batchSize: 1,
      compression: 0,
      acks: -1,
      groupId: '',
      fromBeginning: false,
    },
  });
  const wsRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    loadTopics();
    loadRunningJobs();
    loadProfiles();
    const interval = setInterval(() => {
      loadRunningJobs();
    }, 2000);
    return () => {
      clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Update detail charts when selected job stats change
  useEffect(() => {
    if (selectedJob && jobDetailStats) {
      const now = new Date().toLocaleTimeString();
      
      // Update throughput chart
      setThroughputChartData(prev => {
        const newData = [...prev, {
          time: now,
          throughput: jobDetailStats.recordsPerSec || 0,
          mbps: jobDetailStats.mbPerSec || 0,
        }];
        return newData.slice(-50);
      });
      
      // Update percentile chart
      if (jobDetailStats.percentiles) {
        setPercentileChartData(prev => {
          const newData = [...prev, {
            time: now,
            p50: jobDetailStats.percentiles.p50 || 0,
            p95: jobDetailStats.percentiles.p95 || 0,
            p99: jobDetailStats.percentiles.p99 || 0,
          }];
          return newData.slice(-50);
        });
      }
    }
  }, [jobDetailStats, selectedJob]);

  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = '5001';
      const ws = new WebSocket(`${protocol}//${host}:${port}`);

      ws.onopen = () => {
        console.log('WebSocket connected for load testing');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'loadtest-stats') {
          // Update running jobs stats
          setRunningJobs(prev => prev.map(job => {
            if (job.jobId === data.data.jobId) {
              return {
                ...job,
                stats: data.data.stats,
              };
            }
            return job;
          }));
          
          // Update detail modal if open
          if (selectedJob && data.data.jobId === selectedJob.jobId) {
            setJobDetailStats(data.data.stats);
            updateDetailCharts(data.data.stats);
          }
        } else if (data.type === 'loadtest-complete') {
          loadRunningJobs();
          if (selectedJob && data.data.jobId === selectedJob.jobId) {
            setSelectedJob(null);
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const loadTopics = async () => {
    try {
      const res = await axios.get('/api/kafka/status');
      if (res.data.connected && res.data.topics) {
        setAvailableTopics(res.data.topics);
      }
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  const loadRunningJobs = async () => {
    try {
      const res = await axios.get('/api/loadtest/web/running');
      if (res.data.success) {
        const jobs = res.data.jobs || [];
        setRunningJobs(jobs);
        console.log('Loaded running jobs:', jobs.length, jobs);
      } else {
        console.warn('Failed to load running jobs:', res.data);
        setRunningJobs([]);
      }
    } catch (error) {
      console.error('Error loading running jobs:', error);
      setRunningJobs([]);
    }
  };

  const loadProfiles = async () => {
    try {
      const res = await axios.get(`/api/loadtest/profiles?type=${testType}`);
      if (res.data.success) {
        setProfiles(res.data.profiles || []);
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const handleProfileSelect = (profile) => {
    setSelectedProfile(profile);
    setProfileForm({
      name: profile.name,
      type: profile.type,
      config: { ...profile.config },
    });
  };

  const handleProfileSave = async () => {
    try {
      if (selectedProfile) {
        await axios.put(`/api/loadtest/profiles/${selectedProfile.id}`, profileForm);
      } else {
        await axios.post('/api/loadtest/profiles', profileForm);
      }
      setShowProfileForm(false);
      setSelectedProfile(null);
      loadProfiles();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save profile');
    }
  };

  const handleProfileDelete = async (profileId) => {
    if (!window.confirm('Are you sure you want to delete this profile?')) return;
    try {
      await axios.delete(`/api/loadtest/profiles/${profileId}`);
      loadProfiles();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete profile');
    }
  };

  const handleRunJob = async () => {
    try {
      const config = selectedProfile ? selectedProfile.config : profileForm.config;
      const endpoint = testType === 'producer'
        ? '/api/loadtest/web/producer/start'
        : '/api/loadtest/web/consumer/start';
      
      const res = await axios.post(endpoint, config);
      if (res.data.success) {
        // Wait a bit for the job to be registered
        setTimeout(() => {
          loadRunningJobs();
        }, 500);
        
        // Reset form if not using profile
        if (!selectedProfile) {
          setProfileForm({
            name: '',
            type: testType,
            config: {
              topic: '',
              jobName: '',
              targetThroughput: 1000,
              duration: 60,
              recordSize: 1024,
              batchSize: 1,
              compression: 0,
              acks: -1,
              groupId: '',
              fromBeginning: false,
            },
          });
        }
      }
    } catch (error) {
      console.error('Error starting load test:', error);
      alert(error.response?.data?.message || 'Failed to start load test');
    }
  };

  const handleStopJob = async (jobId) => {
    try {
      const job = runningJobs.find(j => j.jobId === jobId);
      if (!job) return;

      const endpoint = job.type === 'loadtest-producer'
        ? `/api/loadtest/web/producer/stop/${jobId}`
        : `/api/loadtest/web/consumer/stop/${jobId}`;
      
      await axios.post(endpoint);
      loadRunningJobs();
      
      // Close detail modal if this job was selected
      if (selectedJob && selectedJob.jobId === jobId) {
        setSelectedJob(null);
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to stop job');
    }
  };

  const handleJobDoubleClick = (jobData) => {
    const job = jobData.job || {
      id: jobData.jobId,
      name: jobData.config?.jobName || `loadtest-${jobData.type}-${new Date().toISOString().slice(0, 10)}`,
      type: jobData.type,
      startTime: jobData.startTime,
    };
    
    setSelectedJob({
      ...jobData,
      job,
    });
    setJobDetailStats(jobData.stats);
    
    // Initialize chart data
    setThroughputChartData([]);
    setPercentileChartData([]);
    updateDetailCharts(jobData.stats);
  };

  const updateDetailCharts = (stats) => {
    if (!stats) return;
    
    const now = new Date().toLocaleTimeString();
    
    // Update throughput chart
    setThroughputChartData(prev => {
      const newData = [...prev, {
        time: now,
        throughput: stats.recordsPerSec || 0,
        mbps: stats.mbPerSec || 0,
      }];
      return newData.slice(-50); // Keep last 50 data points
    });
    
    // Update percentile chart
    if (stats.percentiles) {
      setPercentileChartData(prev => {
        const newData = [...prev, {
          time: now,
          p50: stats.percentiles.p50 || 0,
          p95: stats.percentiles.p95 || 0,
          p99: stats.percentiles.p99 || 0,
        }];
        return newData.slice(-50);
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name.startsWith('config.')) {
      const configKey = name.replace('config.', '');
      setProfileForm({
        ...profileForm,
        config: {
          ...profileForm.config,
          [configKey]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value) || 0 : value),
        },
      });
    } else {
      setProfileForm({
        ...profileForm,
        [name]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value) || 0 : value),
      });
    }
  };

  useEffect(() => {
    loadProfiles();
  }, [testType]);

  return (
    <div className="loadtest-page">
      <div className="page-header">
        <h1>Load Testing</h1>
        <p>Configure profiles and run parallel load tests</p>
      </div>

      {/* Test Type Selection */}
      <div className="test-type-selector">
        <button
          className={`test-type-btn ${testType === 'producer' ? 'active' : ''}`}
          onClick={() => setTestType('producer')}
        >
          <TrendingUp size={18} />
          Producer Load Test
        </button>
        <button
          className={`test-type-btn ${testType === 'consumer' ? 'active' : ''}`}
          onClick={() => setTestType('consumer')}
        >
          <Download size={18} />
          Consumer Load Test
        </button>
      </div>

      <div className="loadtest-grid">
        {/* Profile Configuration Panel */}
        <div className="config-panel">
          <div className="panel-header">
            <h2>Configuration Profile</h2>
            <div className="panel-actions">
              <button
                onClick={() => {
                  setShowProfileForm(!showProfileForm);
                  if (!showProfileForm) {
                    setSelectedProfile(null);
                    setProfileForm({
                      name: '',
                      type: testType,
                      config: {
                        topic: '',
                        jobName: '',
                        targetThroughput: 1000,
                        duration: 60,
                        recordSize: 1024,
                        batchSize: 1,
                        compression: 0,
                        acks: -1,
                        groupId: '',
                        fromBeginning: false,
                      },
                    });
                  }
                }}
                className="btn-icon"
                title="New Profile"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="panel-content">
            {/* Profile List */}
            {profiles.length > 0 && (
              <div className="profile-list">
                <label>Saved Profiles</label>
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={`profile-item ${selectedProfile?.id === profile.id ? 'active' : ''}`}
                    onClick={() => handleProfileSelect(profile)}
                  >
                    <div className="profile-info">
                      <span className="profile-name">{profile.name}</span>
                      <span className="profile-meta">{profile.config.topic || 'No topic'}</span>
                    </div>
                    <div className="profile-actions">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProfile(profile);
                          setProfileForm({
                            name: profile.name,
                            type: profile.type,
                            config: { ...profile.config },
                          });
                          setShowProfileForm(true);
                        }}
                        className="btn-icon-small"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProfileDelete(profile.id);
                        }}
                        className="btn-icon-small"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Configuration Form */}
            {(showProfileForm || profiles.length === 0) && (
              <div className="config-form">
                <div className="form-group">
                  <label>Profile Name</label>
                  <input
                    type="text"
                    name="name"
                    value={profileForm.name}
                    onChange={handleInputChange}
                    placeholder="Enter profile name"
                  />
                </div>

                <div className="form-group">
                  <label>Job Name (Optional)</label>
                  <input
                    type="text"
                    name="config.jobName"
                    value={profileForm.config.jobName}
                    onChange={handleInputChange}
                    placeholder="Auto-generated if empty"
                  />
                  <small>Leave empty to auto-generate: loadtest-{testType}-YYYYMMDD-HHMMSS</small>
                </div>

                <div className="form-group">
                  <label>Topic *</label>
                  {availableTopics.length > 0 ? (
                    <select
                      name="config.topic"
                      value={profileForm.config.topic}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select a topic...</option>
                      {availableTopics.map((topic, idx) => (
                        <option key={idx} value={topic}>{topic}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      name="config.topic"
                      value={profileForm.config.topic}
                      onChange={handleInputChange}
                      placeholder="test-topic"
                      required
                    />
                  )}
                </div>

                {testType === 'producer' ? (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Target Throughput (rec/s)</label>
                        <input
                          type="number"
                          name="config.targetThroughput"
                          value={profileForm.config.targetThroughput}
                          onChange={handleInputChange}
                          min="1"
                        />
                      </div>
                      <div className="form-group">
                        <label>Duration (seconds)</label>
                        <input
                          type="number"
                          name="config.duration"
                          value={profileForm.config.duration}
                          onChange={handleInputChange}
                          min="1"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Record Size (bytes)</label>
                      <input
                        type="number"
                        name="config.recordSize"
                        value={profileForm.config.recordSize}
                        onChange={handleInputChange}
                        min="1"
                      />
                    </div>
                    <div className="form-group">
                      <label>Batch Size</label>
                      <input
                        type="number"
                        name="config.batchSize"
                        value={profileForm.config.batchSize}
                        onChange={handleInputChange}
                        min="1"
                      />
                    </div>
                    <div className="form-group">
                      <label>Compression</label>
                      <select
                        name="config.compression"
                        value={profileForm.config.compression}
                        onChange={handleInputChange}
                      >
                        <option value={0}>None</option>
                        <option value={1}>Gzip</option>
                        <option value={2}>Snappy</option>
                        <option value={3}>LZ4</option>
                        <option value={4}>Zstd</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Acks</label>
                      <select
                        name="config.acks"
                        value={profileForm.config.acks}
                        onChange={handleInputChange}
                      >
                        <option value={-1}>All (All replicas)</option>
                        <option value={1}>1 (Leader only)</option>
                        <option value={0}>0 (No acknowledgment)</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Group ID *</label>
                        <input
                          type="text"
                          name="config.groupId"
                          value={profileForm.config.groupId}
                          onChange={handleInputChange}
                          placeholder="kafka-test-group"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Duration (seconds)</label>
                        <input
                          type="number"
                          name="config.duration"
                          value={profileForm.config.duration}
                          onChange={handleInputChange}
                          min="1"
                        />
                      </div>
                    </div>
                    <div className="form-group checkbox-group">
                      <label>
                        <input
                          type="checkbox"
                          name="config.fromBeginning"
                          checked={profileForm.config.fromBeginning}
                          onChange={handleInputChange}
                        />
                        Consume from beginning
                      </label>
                    </div>
                  </>
                )}

                <div className="form-actions">
                  {showProfileForm && (
                    <button
                      onClick={handleProfileSave}
                      className="btn-secondary"
                    >
                      <Save size={16} />
                      {selectedProfile ? 'Update Profile' : 'Save Profile'}
                    </button>
                  )}
                  <button
                    onClick={handleRunJob}
                    disabled={!profileForm.config.topic}
                    className="btn-primary"
                  >
                    <Play size={16} />
                    Run Load Test
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Real-time Monitor Table */}
        <div className="monitor-panel">
          <div className="panel-header">
            <h2>Real-time Monitor</h2>
            <span className="job-count">{runningJobs.length} running</span>
          </div>
          <div className="panel-content">
            {runningJobs.length === 0 ? (
              <div className="no-data">
                <Activity size={48} />
                <p>No running load tests</p>
                <p>Configure and run a load test to see metrics here</p>
              </div>
            ) : (
              <div className="monitor-table-container">
                <table className="monitor-table">
                  <thead>
                    <tr>
                      <th>Job Name</th>
                      <th>Type</th>
                      <th>Throughput</th>
                      <th>MB/s</th>
                      <th>P50</th>
                      <th>P95</th>
                      <th>ACK P50</th>
                      <th>Error Rate</th>
                      <th>Total Records</th>
                      <th>Duration</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runningJobs.map((jobData) => {
                      const job = jobData.job || {
                        id: jobData.jobId,
                        name: jobData.config?.jobName || `loadtest-${jobData.type}-${new Date().toISOString().slice(0, 10)}`,
                        type: jobData.type,
                        startTime: jobData.startTime,
                      };

                      const duration = job.startTime
                        ? Math.round((Date.now() - new Date(job.startTime).getTime()) / 1000)
                        : 0;

                      const stats = jobData.stats || {};
                      const percentiles = stats.percentiles || {};
                      const ackPercentiles = stats.ackPercentiles || {};
                      const errorRate = stats.errorRate || 0;

                      return (
                        <tr 
                          key={job.id || jobData.jobId}
                          onDoubleClick={() => handleJobDoubleClick(jobData)}
                          className="job-row-clickable"
                          title="Double click to view detailed metrics"
                        >
                          <td className="job-name-cell">{job.name}</td>
                          <td>
                            <span className={`type-badge type-${job.type?.replace('loadtest-', '') || jobData.type?.replace('loadtest-', '')}`}>
                              {(job.type || jobData.type)?.replace('loadtest-', '').toUpperCase()}
                            </span>
                          </td>
                          <td className="metric-cell">{stats.recordsPerSec?.toFixed(2) || '0.00'} msg/s</td>
                          <td className="metric-cell">{stats.mbPerSec?.toFixed(2) || '0.00'}</td>
                          <td className="metric-cell">{percentiles.p50?.toFixed(2) || 'N/A'} ms</td>
                          <td className="metric-cell">{percentiles.p95?.toFixed(2) || 'N/A'} ms</td>
                          <td className="metric-cell">{ackPercentiles.p50?.toFixed(2) || 'N/A'} ms</td>
                          <td className={`metric-cell ${errorRate > 0 ? 'error-rate-warning' : ''}`}>
                            {errorRate.toFixed(2)}%
                          </td>
                          <td className="metric-cell">{stats.totalRecords || stats.successRecords || 0}</td>
                          <td>{duration}s</td>
                          <td>
                            <button
                              onClick={() => handleStopJob(job.id || jobData.jobId)}
                              className="btn-icon-danger"
                              title="Stop Job"
                            >
                              <Square size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="job-detail-modal-overlay" onClick={() => setSelectedJob(null)}>
          <div className="job-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{selectedJob.job?.name || 'Load Test Job'}</h2>
                <p className="modal-subtitle">
                  {selectedJob.type?.replace('loadtest-', '').toUpperCase()} • 
                  Topic: {selectedJob.config?.topic || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-content">
              {/* Stats Cards */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Throughput</div>
                  <div className="stat-value">
                    {jobDetailStats?.recordsPerSec?.toFixed(2) || '0.00'} msg/s
                  </div>
                  <div className="stat-detail">
                    {jobDetailStats?.mbPerSec?.toFixed(2) || '0.00'} MB/s
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total Records</div>
                  <div className="stat-value">
                    {jobDetailStats?.totalRecords || jobDetailStats?.successRecords || 0}
                  </div>
                  <div className="stat-detail">
                    {jobDetailStats?.successRecords || 0} success, {jobDetailStats?.failedRecords || 0} failed
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Error Rate</div>
                  <div className={`stat-value ${(jobDetailStats?.errorRate || 0) > 0 ? 'error-value' : ''}`}>
                    {(jobDetailStats?.errorRate || 0).toFixed(2)}%
                  </div>
                  <div className="stat-detail">
                    {jobDetailStats?.timeoutErrors || 0} timeout, {jobDetailStats?.networkErrors || 0} network, {jobDetailStats?.brokerErrors || 0} broker
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">P50 Latency</div>
                  <div className="stat-value">
                    {jobDetailStats?.percentiles?.p50?.toFixed(2) || 'N/A'} ms
                  </div>
                  <div className="stat-detail">Median</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">P95 Latency</div>
                  <div className="stat-value">
                    {jobDetailStats?.percentiles?.p95?.toFixed(2) || 'N/A'} ms
                  </div>
                  <div className="stat-detail">95th percentile</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">ACK P50 Latency</div>
                  <div className="stat-value">
                    {jobDetailStats?.ackPercentiles?.p50?.toFixed(2) || 'N/A'} ms
                  </div>
                  <div className="stat-detail">ACK median</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">ACK P95 Latency</div>
                  <div className="stat-value">
                    {jobDetailStats?.ackPercentiles?.p95?.toFixed(2) || 'N/A'} ms
                  </div>
                  <div className="stat-detail">ACK 95th percentile</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Duration</div>
                  <div className="stat-value">
                    {selectedJob.job?.startTime
                      ? Math.round((Date.now() - new Date(selectedJob.job.startTime).getTime()) / 1000)
                      : 0}s
                  </div>
                  <div className="stat-detail">Running time</div>
                </div>
              </div>

              {/* Throughput Chart */}
              <div className="chart-section">
                <h3>Real-time Throughput</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={throughputChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(37, 99, 235, 0.1)" />
                    <XAxis 
                      dataKey="time" 
                      stroke="var(--text-secondary)"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="var(--text-secondary)"
                      fontSize={12}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'var(--surface-elevated)',
                        border: '1px solid rgba(37, 99, 235, 0.2)',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="throughput" 
                      stroke="#2563eb" 
                      fill="#2563eb" 
                      fillOpacity={0.3}
                      name="Throughput (msg/s)"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="mbps" 
                      stroke="#10b981" 
                      fill="#10b981" 
                      fillOpacity={0.3}
                      name="MB/s"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Percentile Chart */}
              <div className="chart-section">
                <h3>Latency Percentiles</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={percentileChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(37, 99, 235, 0.1)" />
                    <XAxis 
                      dataKey="time" 
                      stroke="var(--text-secondary)"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="var(--text-secondary)"
                      fontSize={12}
                      label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'var(--surface-elevated)',
                        border: '1px solid rgba(37, 99, 235, 0.2)',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="p50" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={false}
                      name="P50"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="p95" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={false}
                      name="P95"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="p99" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      dot={false}
                      name="P99"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Additional Metrics */}
              <div className="metrics-section">
                <h3>Additional Metrics</h3>
                <div className="metrics-grid">
                  {jobDetailStats?.percentiles && (
                    <>
                      <div className="metric-item">
                        <span className="metric-label">Min Latency:</span>
                        <span className="metric-value">{jobDetailStats.percentiles.min?.toFixed(2) || 'N/A'} ms</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">Max Latency:</span>
                        <span className="metric-value">{jobDetailStats.percentiles.max?.toFixed(2) || 'N/A'} ms</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">Avg Latency:</span>
                        <span className="metric-value">{jobDetailStats.percentiles.avg?.toFixed(2) || 'N/A'} ms</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">P999 Latency:</span>
                        <span className="metric-value">{jobDetailStats.percentiles.p999?.toFixed(2) || 'N/A'} ms</span>
                      </div>
                    </>
                  )}
                  {jobDetailStats?.ackPercentiles && (
                    <>
                      <div className="metric-item">
                        <span className="metric-label">ACK Min Latency:</span>
                        <span className="metric-value">{jobDetailStats.ackPercentiles.min?.toFixed(2) || 'N/A'} ms</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">ACK Max Latency:</span>
                        <span className="metric-value">{jobDetailStats.ackPercentiles.max?.toFixed(2) || 'N/A'} ms</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">ACK Avg Latency:</span>
                        <span className="metric-value">{jobDetailStats.ackPercentiles.avg?.toFixed(2) || 'N/A'} ms</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">ACK P99 Latency:</span>
                        <span className="metric-value">{jobDetailStats.ackPercentiles.p99?.toFixed(2) || 'N/A'} ms</span>
                      </div>
                    </>
                  )}
                  {(jobDetailStats?.timeoutErrors || jobDetailStats?.networkErrors || jobDetailStats?.brokerErrors || jobDetailStats?.otherErrors) && (
                    <>
                      <div className="metric-item">
                        <span className="metric-label">Timeout Errors:</span>
                        <span className="metric-value error-text">{jobDetailStats.timeoutErrors || 0}</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">Network Errors:</span>
                        <span className="metric-value error-text">{jobDetailStats.networkErrors || 0}</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">Broker Errors:</span>
                        <span className="metric-value error-text">{jobDetailStats.brokerErrors || 0}</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">Other Errors:</span>
                        <span className="metric-value error-text">{jobDetailStats.otherErrors || 0}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="modal-actions">
                <button
                  onClick={() => handleStopJob(selectedJob.jobId)}
                  className="btn-danger"
                >
                  <Square size={16} />
                  Stop Job
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadTestPage;
