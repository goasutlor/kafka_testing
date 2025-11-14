import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Trash2, Download } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import './ProduceApp.css';

const ProduceApp = () => {
  const [searchParams] = useSearchParams();
  const topicFromUrl = searchParams.get('topic') || '';

  const [config, setConfig] = useState({
    topic: topicFromUrl,
    message: '',
    jobName: '', // Auto-generate if empty
    count: 1, // Number of messages to produce (when accumulation is disabled)
    accumulation: {
      enabled: false,
      prefix: 'TEST',
      start: 1,
      end: '',
      interval: 1000,
    },
  });

  const [availableTopics, setAvailableTopics] = useState([]);

  const [jobStatus, setJobStatus] = useState({
    running: false,
    stats: null,
    isOneTime: false, // Track if current stats are from one-time produce
    completedAt: null, // Timestamp when one-time produce completed
    progress: null, // { current: number, total: number } for count-based produce
  });

  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    loadLogs();
    loadStats();
    loadTopics();

    // Update topic if from URL
    if (topicFromUrl) {
      setConfig(prev => ({ ...prev, topic: topicFromUrl }));
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [topicFromUrl]);

  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = '5001';
      const ws = new WebSocket(`${protocol}//${host}:${port}`);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'produce') {
          setLogs((prev) => [data.data, ...prev].slice(0, 1000));
          updateChartData(data.data);
          // Update progress if available (for count-based produce)
          if (data.progress) {
            setJobStatus(prev => ({
              ...prev,
              progress: data.progress,
            }));
          }
          // Update stats in realtime for continuous produce
          setJobStatus(prev => {
            if (prev.running) {
              // Trigger stats reload for running jobs
              setTimeout(() => loadStats(), 100);
            }
            return prev;
          });
        } else if (data.type === 'produce-complete') {
          // Update stats when count-based produce completes
          // Keep the stats visible - don't clear them
          const messageCount = parseInt(config.count) || 1;
          setJobStatus({ 
            running: false, 
            stats: data.data.stats,
            isOneTime: messageCount === 1,
            completedAt: new Date(),
            progress: messageCount > 1 ? { current: messageCount, total: messageCount } : null,
          });
          loadLogs();
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Don't show error if it's just a connection issue - will reconnect
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  };

  const updateChartData = (logEntry) => {
    const time = new Date(logEntry.timestamp).toLocaleTimeString();
    setChartData((prev) => {
      const newData = [...prev, { time, success: logEntry.status === 'success' ? 1 : 0, failed: logEntry.status === 'failed' ? 1 : 0 }];
      return newData.slice(-50);
    });
  };

  const loadLogs = async () => {
    try {
      const res = await axios.get('/api/produce/logs?limit=100');
      setLogs(res.data.logs.reverse());
      setJobStatus({ ...jobStatus, stats: res.data.stats });
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  };

  const loadStats = async () => {
    try {
      const res = await axios.get('/api/produce/stats');
      // Only update stats if there's a running job or if stats exist
      // Don't overwrite one-time produce stats if no running job
      if (res.data.stats && (jobStatus.running || res.data.stats.total > 0)) {
        setJobStatus(prev => ({ 
          ...prev, 
          stats: res.data.stats,
          // Clear one-time flag if we have running stats
          isOneTime: prev.running ? false : prev.isOneTime,
        }));
      }
    } catch (error) {
      console.error('Error loading stats:', error);
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

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('accumulation.')) {
      const key = name.split('.')[1];
      setConfig({
        ...config,
        accumulation: {
          ...config.accumulation,
          [key]: type === 'checkbox' ? checked : (key === 'start' || key === 'end' || key === 'interval' ? parseInt(value) || value : value),
        },
      });
    } else {
      setConfig({
        ...config,
        [name]: type === 'number' ? parseInt(value) || (name === 'count' ? 1 : 0) : value,
      });
    }
  };

  const handleStart = async () => {
    try {
      const res = await axios.post('/api/produce/start', config);
      
      // If count-based produce (accumulation disabled)
      if (!config.accumulation.enabled) {
        const messageCount = parseInt(config.count) || 1;
        // Initialize progress for count-based produce
        if (messageCount > 1) {
          setJobStatus({ 
            running: true, // Show as running while producing
            stats: null,
            isOneTime: false,
            completedAt: null,
            progress: { current: 0, total: messageCount },
          });
        } else {
          // One-time produce - stats returned immediately
          if (res.data.stats) {
            setJobStatus({ 
              running: false, 
              stats: res.data.stats,
              isOneTime: true,
              completedAt: new Date(),
              progress: null,
            });
            loadLogs();
          }
        }
        // Don't clear logs/chart for count-based - keep showing previous results
      } else {
        // For continuous produce, clear previous data and start fresh
        setLogs([]);
        setChartData([]);
        // Start with running state, but keep previous stats visible until new stats arrive
        setJobStatus(prev => ({ 
          running: true, 
          stats: prev.stats, // Keep previous stats visible temporarily
          isOneTime: false, 
          completedAt: null 
        }));
        // For continuous produce, load stats after a short delay to show realtime
        setTimeout(() => {
          loadStats();
        }, 500);
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to start produce job');
    }
  };

  const handleStop = async () => {
    try {
      const res = await axios.post('/api/produce/stop');
      // Keep stats visible after stopping
      setJobStatus({ 
        running: false, 
        stats: res.data.stats,
        isOneTime: false,
        completedAt: new Date(),
      });
      loadLogs();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to stop produce job');
    }
  };

  const handleClearLogs = async () => {
    try {
      await axios.delete('/api/produce/logs');
      setLogs([]);
      setChartData([]);
      setJobStatus({ ...jobStatus, stats: null, isOneTime: false, completedAt: null });
    } catch (error) {
      console.error('Error clearing logs:', error);
    }
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `produce-logs-${Date.now()}.json`;
    link.click();
  };

  const successCount = logs.filter(l => l.status === 'success').length;
  const failedCount = logs.filter(l => l.status === 'failed').length;

  return (
    <div className="produce-app">
      <div className="page-header">
        <h1>Produce App</h1>
        <p>Configure and run Kafka produce jobs</p>
      </div>

      <div className="produce-grid">
        <div className="config-panel">
          <div className="panel-header">
            <h2>Configuration</h2>
          </div>
          <div className="panel-content">
            <div className="form-group">
              <label>Topic *</label>
              {availableTopics.length > 0 ? (
                <select
                  name="topic"
                  value={config.topic}
                  onChange={handleInputChange}
                  required
                  className="topic-select"
                >
                  <option value="">Select a topic...</option>
                  {availableTopics.map((topic, idx) => (
                    <option key={idx} value={topic}>{topic}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  name="topic"
                  value={config.topic}
                  onChange={handleInputChange}
                  placeholder="test-topic"
                  required
                />
              )}
              {availableTopics.length === 0 && (
                <small style={{ marginTop: '4px', display: 'block' }}>
                  <a href="/kafka" style={{ color: '#667eea' }}>Connect to Kafka</a> to see available topics
                </small>
              )}
            </div>

            <div className="form-group">
              <label>Job Name (Optional)</label>
              <input
                type="text"
                name="jobName"
                value={config.jobName}
                onChange={handleInputChange}
                placeholder="Auto-generated if empty"
              />
              <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>
                Leave empty to auto-generate: produce-YYYYMMDD-HHMMSS
              </small>
            </div>

            <div className="form-group">
              <label>Message</label>
              <textarea
                name="message"
                value={config.message}
                onChange={handleInputChange}
                placeholder="Enter message content"
                rows="3"
              />
            </div>

            {!config.accumulation.enabled && (
              <div className="form-group">
                <label>Number of Messages</label>
                <input
                  type="number"
                  name="count"
                  value={config.count}
                  onChange={handleInputChange}
                  min="1"
                  placeholder="1"
                />
                <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>
                  {config.count === 1 
                    ? 'จะส่ง message เพียงครั้งเดียว (One-time)' 
                    : `จะส่ง message ทั้งหมด ${config.count} ครั้ง`}
                </small>
              </div>
            )}

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="accumulation.enabled"
                  checked={config.accumulation.enabled}
                  onChange={handleInputChange}
                />
                Enable Accumulation (ส่งหลาย messages แบบต่อเนื่อง)
              </label>
              <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-secondary)' }}>
                {config.accumulation.enabled 
                  ? 'จะส่ง messages หลายครั้งตามที่กำหนด (Start, End, Interval)' 
                  : 'ปิดการใช้งาน - จะส่งตามจำนวนที่กำหนดด้านบน'}
              </small>
            </div>

            {config.accumulation.enabled && (
              <>
                <div className="form-group">
                  <label>Prefix</label>
                  <input
                    type="text"
                    name="accumulation.prefix"
                    value={config.accumulation.prefix}
                    onChange={handleInputChange}
                    placeholder="TEST"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Start</label>
                    <input
                      type="number"
                      name="accumulation.start"
                      value={config.accumulation.start}
                      onChange={handleInputChange}
                      min="1"
                    />
                  </div>

                  <div className="form-group">
                    <label>End (empty = infinite)</label>
                    <input
                      type="number"
                      name="accumulation.end"
                      value={config.accumulation.end}
                      onChange={handleInputChange}
                      min="1"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Interval (ms)</label>
                  <input
                    type="number"
                    name="accumulation.interval"
                    value={config.accumulation.interval}
                    onChange={handleInputChange}
                    min="100"
                    step="100"
                  />
                </div>
              </>
            )}

            <div className="form-actions">
              <button
                onClick={handleStart}
                disabled={jobStatus.running || !config.topic}
                className="btn-primary"
              >
                <Play size={16} />
                Start Job
              </button>
              <button
                onClick={handleStop}
                disabled={!jobStatus.running}
                className="btn-danger"
              >
                <Square size={16} />
                Stop Job
              </button>
            </div>
          </div>
        </div>

        <div className="stats-panel">
          <div className="panel-header">
            <h2>Statistics</h2>
            {jobStatus.isOneTime && jobStatus.completedAt && (
              <span className="one-time-badge" title="One-time produce result">
                One-time • {new Date(jobStatus.completedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="panel-content">
            {jobStatus.stats ? (
              <>
                {jobStatus.progress && jobStatus.progress.total > 1 && (
                  <div className="stat-item progress-item">
                    <div className="stat-label">Progress</div>
                    <div className="progress-bar-container">
                      <div 
                        className="progress-bar" 
                        style={{ 
                          width: `${(jobStatus.progress.current / jobStatus.progress.total) * 100}%` 
                        }}
                      />
                      <div className="progress-text">
                        {jobStatus.progress.current} / {jobStatus.progress.total}
                      </div>
                    </div>
                  </div>
                )}
                <div className="stat-item">
                  <div className="stat-label">Total</div>
                  <div className="stat-value">{jobStatus.stats.total}</div>
                </div>
                <div className="stat-item success">
                  <div className="stat-label">Success</div>
                  <div className="stat-value">{jobStatus.stats.success}</div>
                </div>
                <div className="stat-item error">
                  <div className="stat-label">Failed</div>
                  <div className="stat-value">{jobStatus.stats.failed}</div>
                </div>
                {jobStatus.stats.startTime && (
                  <div className="stat-item">
                    <div className="stat-label">Start Time</div>
                    <div className="stat-value-small">
                      {new Date(jobStatus.stats.startTime).toLocaleString()}
                    </div>
                  </div>
                )}
                {jobStatus.stats.endTime && (
                  <div className="stat-item">
                    <div className="stat-label">End Time</div>
                    <div className="stat-value-small">
                      {new Date(jobStatus.stats.endTime).toLocaleString()}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="no-data">No statistics available</p>
            )}
          </div>
        </div>
      </div>

      <div className="chart-panel">
        <div className="panel-header">
          <h2>Real-time Chart</h2>
        </div>
        <div className="panel-content">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="success" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="logs-panel">
        <div className="panel-header">
          <h2>Logs</h2>
          <div className="panel-actions">
            <button onClick={handleClearLogs} className="btn-icon" title="Clear logs">
              <Trash2 size={16} />
            </button>
            <button onClick={exportLogs} className="btn-icon" title="Export logs">
              <Download size={16} />
            </button>
          </div>
        </div>
        <div className="panel-content">
          <div className="logs-summary">
            <span>Total: {logs.length}</span>
            <span className="success">Success: {successCount}</span>
            <span className="error">Failed: {failedCount}</span>
          </div>
          <div className="logs-list">
            {logs.length === 0 ? (
              <p className="no-data">No logs available</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`log-entry ${log.status}`}>
                  <div className="log-time">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                  <div className="log-event">{log.event}</div>
                  <div className={`log-status ${log.status}`}>
                    {log.status}
                  </div>
                  {log.sequence && (
                    <div className="log-sequence">Seq: {log.sequence}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProduceApp;

