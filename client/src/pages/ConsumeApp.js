import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Trash2, Download, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './ConsumeApp.css';

const ConsumeApp = () => {
  const [searchParams] = useSearchParams();
  const topicFromUrl = searchParams.get('topic') || '';

  const [config, setConfig] = useState({
    topic: topicFromUrl,
    groupId: '',
  });

  const [availableTopics, setAvailableTopics] = useState([]);

  const [jobStatus, setJobStatus] = useState({
    running: false,
    stats: null,
  });

  const [logs, setLogs] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [missingSequences, setMissingSequences] = useState(null);
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
        if (data.type === 'consume') {
          setLogs((prev) => [data.data, ...prev].slice(0, 1000));
          updateChartData(data.data);
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
      const newData = [...prev, { time, count: 1 }];
      return newData.slice(-50);
    });
  };

  const loadLogs = async () => {
    try {
      const res = await axios.get('/api/consume/logs?limit=100');
      setLogs(res.data.logs.reverse());
      setJobStatus({ ...jobStatus, stats: res.data.stats });
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  };

  const loadStats = async () => {
    try {
      const res = await axios.get('/api/consume/stats');
      setJobStatus({ ...jobStatus, stats: res.data.stats });
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
    const { name, value } = e.target;
    setConfig({
      ...config,
      [name]: value,
    });
  };

  const handleStart = async () => {
    try {
      await axios.post('/api/consume/start', config);
      setJobStatus({ running: true, stats: null });
      setLogs([]);
      setChartData([]);
      setMissingSequences(null);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to start consume job');
    }
  };

  const handleStop = async () => {
    try {
      const res = await axios.post('/api/consume/stop');
      setJobStatus({ running: false, stats: res.data.stats });
      loadLogs();
      checkMissingSequences();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to stop consume job');
    }
  };

  const checkMissingSequences = async () => {
    // This would need the start/end from produce config
    // For now, we'll calculate from the sequences we have
    const sequences = (jobStatus.stats?.sequences || []).map(Number).sort((a, b) => a - b);
    if (sequences.length === 0) return;

    const start = sequences[0];
    const end = sequences[sequences.length - 1];

    try {
      const res = await axios.get(`/api/consume/missing-sequences?start=${start}&end=${end}`);
      setMissingSequences(res.data);
    } catch (error) {
      console.error('Error checking missing sequences:', error);
    }
  };

  const handleClearLogs = async () => {
    try {
      await axios.delete('/api/consume/logs');
      setLogs([]);
      setChartData([]);
      setJobStatus({ ...jobStatus, stats: null });
      setMissingSequences(null);
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
    link.download = `consume-logs-${Date.now()}.json`;
    link.click();
  };

  return (
    <div className="consume-app">
      <div className="page-header">
        <h1>Consume App</h1>
        <p>Configure and run Kafka consume jobs</p>
      </div>

      <div className="consume-grid">
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
              <label>Consumer Group ID</label>
              <input
                type="text"
                name="groupId"
                value={config.groupId}
                onChange={handleInputChange}
                placeholder="kafka-test-group"
              />
              <small>Leave empty to auto-generate</small>
            </div>

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
            {!jobStatus.running && jobStatus.stats && jobStatus.stats.sequences?.length > 0 && (
              <div className="form-actions" style={{ marginTop: '12px' }}>
                <button
                  onClick={checkMissingSequences}
                  className="btn-secondary"
                  style={{ width: '100%' }}
                >
                  <AlertTriangle size={16} />
                  Check Missing Sequences
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="stats-panel">
          <div className="panel-header">
            <h2>Statistics</h2>
          </div>
          <div className="panel-content">
            {jobStatus.stats ? (
              <>
                <div className="stat-item">
                  <div className="stat-label">Total Received</div>
                  <div className="stat-value">{jobStatus.stats.total}</div>
                </div>
                <div className="stat-item">
                  <div className="stat-label">Unique Sequences</div>
                  <div className="stat-value">
                    {jobStatus.stats.sequences?.length || 0}
                  </div>
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

      {missingSequences && missingSequences.totalMissing > 0 && (
        <div className="missing-sequences-panel">
          <div className="panel-header">
            <h2>
              <AlertTriangle size={20} />
              Missing Sequences
            </h2>
          </div>
          <div className="panel-content">
            <div className="missing-summary">
              <div className="missing-stat">
                <span className="label">Total Missing:</span>
                <span className="value error">{missingSequences.totalMissing}</span>
              </div>
              <div className="missing-stat">
                <span className="label">Total Expected:</span>
                <span className="value">{missingSequences.totalExpected}</span>
              </div>
              <div className="missing-stat">
                <span className="label">Total Received:</span>
                <span className="value success">{missingSequences.totalReceived}</span>
              </div>
            </div>
            {missingSequences.ranges.length > 0 && (
              <div className="missing-ranges">
                <h3>Missing Ranges:</h3>
                {missingSequences.ranges.map((range, idx) => (
                  <div key={idx} className="range-item">
                    {range.length === 1
                      ? `TEST${range[0].toString().padStart(2, '0')}`
                      : `TEST${range[0].toString().padStart(2, '0')} - TEST${range[1].toString().padStart(2, '0')}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
              <Line type="monotone" dataKey="count" stroke="#667eea" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="logs-panel">
        <div className="panel-header">
          <h2>Consumed Events</h2>
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
          </div>
          <div className="logs-list">
            {logs.length === 0 ? (
              <p className="no-data">No logs available</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="log-entry">
                  <div className="log-time">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                  <div className="log-event">{log.event}</div>
                  {log.sequence && (
                    <div className="log-sequence">Seq: {log.sequence}</div>
                  )}
                  <div className="log-meta">
                    <span>Partition: {log.partition}</span>
                    <span>Offset: {log.offset}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsumeApp;

