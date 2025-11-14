import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader, RefreshCw, Send, Download, Clock, Trash2, History, Info, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './KafkaConnection.css';

const KafkaConnection = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    brokers: '',
    clientId: 'kafka-test-client',
    sasl: {
      enabled: false,
      mechanism: 'plain',
      username: '',
      password: '',
    },
    apiKey: {
      enabled: false,
      key: '',
      secret: '',
    },
  });

  const [status, setStatus] = useState({
    connected: false,
    loading: false,
    message: '',
    topics: [],
    retrievingTopics: false,
  });

  const [connectionHistory, setConnectionHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [topicInfo, setTopicInfo] = useState(null);
  const [loadingTopicInfo, setLoadingTopicInfo] = useState(false);

  // Load connection history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('kafkaConnectionHistory');
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        setConnectionHistory(history);
      } catch (error) {
        console.error('Error loading connection history:', error);
      }
    }
    checkStatus();
  }, []);

  // Save connection history to localStorage
  const saveConnectionHistory = (history) => {
    try {
      localStorage.setItem('kafkaConnectionHistory', JSON.stringify(history));
      setConnectionHistory(history);
    } catch (error) {
      console.error('Error saving connection history:', error);
    }
  };

  // Add connection to history
  const addToHistory = (connectionData) => {
    const historyItem = {
      id: Date.now().toString(),
      name: connectionData.brokers.split(',')[0] || 'Kafka Connection',
      brokers: connectionData.brokers,
      clientId: connectionData.clientId,
      sasl: connectionData.sasl,
      apiKey: connectionData.apiKey,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };

    const existingHistory = [...connectionHistory];
    
    // Remove duplicate (same brokers)
    const filteredHistory = existingHistory.filter(
      item => item.brokers !== historyItem.brokers
    );
    
    // Add to beginning
    const newHistory = [historyItem, ...filteredHistory].slice(0, 20); // Keep last 20
    
    saveConnectionHistory(newHistory);
  };

  // Load connection from history
  const loadFromHistory = (historyItem) => {
    setFormData({
      brokers: historyItem.brokers,
      clientId: historyItem.clientId || 'kafka-test-client',
      sasl: historyItem.sasl || {
        enabled: false,
        mechanism: 'plain',
        username: '',
        password: '',
      },
      apiKey: historyItem.apiKey || {
        enabled: false,
        key: '',
        secret: '',
      },
    });

    // Update last used time
    const updatedHistory = connectionHistory.map(item => {
      if (item.id === historyItem.id) {
        return { ...item, lastUsed: new Date().toISOString() };
      }
      return item;
    });
    saveConnectionHistory(updatedHistory);
    setShowHistory(false);
  };

  // Delete connection from history
  const deleteFromHistory = (id, e) => {
    e.stopPropagation();
    const updatedHistory = connectionHistory.filter(item => item.id !== id);
    saveConnectionHistory(updatedHistory);
  };

  const checkStatus = async () => {
    try {
      const res = await axios.get('/api/kafka/status');
      setStatus({
        connected: res.data.connected,
        loading: false,
        message: res.data.connected ? 'Connected' : 'Not connected',
        topics: res.data.topics || [],
      });
    } catch (error) {
      setStatus({
        connected: false,
        loading: false,
        message: 'Error checking status',
        topics: [],
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('sasl.')) {
      const key = name.split('.')[1];
      setFormData({
        ...formData,
        sasl: {
          ...formData.sasl,
          [key]: type === 'checkbox' ? checked : value,
        },
      });
    } else if (name.startsWith('apiKey.')) {
      const key = name.split('.')[1];
      setFormData({
        ...formData,
        apiKey: {
          ...formData.apiKey,
          [key]: type === 'checkbox' ? checked : value,
        },
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setStatus({ ...status, loading: true });

    try {
      const res = await axios.post('/api/kafka/connect', formData);
      setStatus({
        connected: true,
        loading: false,
        message: res.data.message,
        topics: res.data.topics || [],
      });
      
      // Save to history on successful connection
      addToHistory(formData);
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Connection failed';
      console.error('Kafka connection error:', error.response?.data || error);
      setStatus({
        connected: false,
        loading: false,
        message: errorMessage,
        topics: [],
      });
    }
  };

  const handleTest = async () => {
    setStatus({ ...status, loading: true });
    await checkStatus();
  };

  const handleRetrieveTopics = async () => {
    if (!status.connected) {
      alert('Please connect to Kafka first');
      return;
    }

    setStatus({ ...status, retrievingTopics: true });
    try {
      const res = await axios.get('/api/kafka/status');
      setStatus({
        ...status,
        topics: res.data.topics || [],
        retrievingTopics: false,
      });
    } catch (error) {
      setStatus({
        ...status,
        retrievingTopics: false,
        message: 'Failed to retrieve topics',
      });
    }
  };

  const handleUseTopic = (topic, action, e) => {
    if (e) {
      e.stopPropagation();
    }
    if (action === 'produce') {
      navigate(`/produce?topic=${encodeURIComponent(topic)}`);
    } else if (action === 'consume') {
      navigate(`/consume?topic=${encodeURIComponent(topic)}`);
    }
  };

  const handleTopicClick = async (topic) => {
    setSelectedTopic(topic);
    setLoadingTopicInfo(true);
    try {
      const res = await axios.get(`/api/kafka/topic/${topic}/describe`);
      if (res.data.success) {
        setTopicInfo(res.data.topic);
      } else {
        setTopicInfo(null);
      }
    } catch (error) {
      console.error('Error loading topic info:', error);
      setTopicInfo(null);
    } finally {
      setLoadingTopicInfo(false);
    }
  };

  const handleCloseTopicInfo = () => {
    setSelectedTopic(null);
    setTopicInfo(null);
  };

  return (
    <div className="kafka-connection">
      <div className="page-header">
        <h1>Kafka Connection</h1>
        <p>Configure and test your Kafka cluster connection</p>
      </div>

      <div className="connection-status">
        <div className={`status-card ${status.connected ? 'connected' : 'disconnected'}`}>
          {status.loading ? (
            <Loader className="status-icon" size={24} />
          ) : status.connected ? (
            <CheckCircle className="status-icon" size={24} />
          ) : (
            <XCircle className="status-icon" size={24} />
          )}
          <div>
            <h3>{status.connected ? 'Connected' : 'Disconnected'}</h3>
            <p>{status.message}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button onClick={handleTest} className="test-btn">
              Test Connection
            </button>
            {status.connected && (
              <button 
                onClick={handleRetrieveTopics} 
                className="retrieve-btn"
                disabled={status.retrievingTopics}
              >
                {status.retrievingTopics ? (
                  <>
                    <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Retrieving...
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    Retrieve Topics
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="connection-form-container">
        {/* Connection History Panel */}
        {connectionHistory.length > 0 && (
          <div className="history-panel">
            <div className="history-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={18} />
                <h3>Connection History</h3>
                <span className="history-count">({connectionHistory.length})</span>
              </div>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="toggle-history-btn"
              >
                {showHistory ? 'Hide' : 'Show'}
              </button>
            </div>
            {showHistory && (
              <div className="history-list">
                {connectionHistory.map((item) => (
                  <div
                    key={item.id}
                    className="history-item"
                    onClick={() => loadFromHistory(item)}
                  >
                    <div className="history-item-info">
                      <div className="history-item-name">{item.name}</div>
                      <div className="history-item-details">
                        <span>{item.brokers}</span>
                        {item.sasl?.enabled && (
                          <span className="auth-badge">SASL</span>
                        )}
                        {item.apiKey?.enabled && (
                          <span className="auth-badge">API Key</span>
                        )}
                      </div>
                      <div className="history-item-time">
                        <Clock size={12} />
                        Last used: {new Date(item.lastUsed).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteFromHistory(item.id, e)}
                      className="delete-history-btn"
                      title="Delete from history"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleConnect} className="connection-form">
          <div className="form-section">
            <h2>Basic Configuration</h2>
            
            <div className="form-group">
              <label>Brokers *</label>
              <input
                type="text"
                name="brokers"
                value={formData.brokers}
                onChange={handleInputChange}
                placeholder="localhost:9092,localhost:9093"
                required
              />
              <small>Comma-separated list of broker addresses</small>
            </div>

            <div className="form-group">
              <label>Client ID</label>
              <input
                type="text"
                name="clientId"
                value={formData.clientId}
                onChange={handleInputChange}
                placeholder="kafka-test-client"
              />
            </div>
          </div>

          <div className="form-section">
            <h2>SASL Authentication</h2>
            
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="sasl.enabled"
                  checked={formData.sasl.enabled}
                  onChange={handleInputChange}
                />
                Enable SASL
              </label>
            </div>

            {formData.sasl.enabled && (
              <>
                <div className="form-group">
                  <label>Mechanism</label>
                  <select
                    name="sasl.mechanism"
                    value={formData.sasl.mechanism}
                    onChange={handleInputChange}
                  >
                    <option value="plain">PLAIN</option>
                    <option value="scram-sha-256">SCRAM-SHA-256</option>
                    <option value="scram-sha-512">SCRAM-SHA-512</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    name="sasl.username"
                    value={formData.sasl.username}
                    onChange={handleInputChange}
                    placeholder="username"
                  />
                </div>

                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    name="sasl.password"
                    value={formData.sasl.password}
                    onChange={handleInputChange}
                    placeholder="password"
                  />
                </div>
              </>
            )}
          </div>

          <div className="form-section">
            <h2>API Key Authentication</h2>
            
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="apiKey.enabled"
                  checked={formData.apiKey.enabled}
                  onChange={handleInputChange}
                />
                Enable API Key
              </label>
            </div>

            {formData.apiKey.enabled && (
              <>
                <div className="form-group">
                  <label>API Key</label>
                  <input
                    type="text"
                    name="apiKey.key"
                    value={formData.apiKey.key}
                    onChange={handleInputChange}
                    placeholder="API key"
                  />
                </div>

                <div className="form-group">
                  <label>API Secret</label>
                  <input
                    type="password"
                    name="apiKey.secret"
                    value={formData.apiKey.secret}
                    onChange={handleInputChange}
                    placeholder="API secret"
                  />
                </div>
              </>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={status.loading}>
              {status.loading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </form>

        {status.topics && status.topics.length > 0 && (
          <div className="topics-list">
            <div className="topics-header">
              <h3>Available Topics ({status.topics.length})</h3>
              <p>Click on a topic to use it for Produce or Consume</p>
            </div>
            <div className="topics-grid">
              {status.topics.map((topic, idx) => (
                <div 
                  key={idx} 
                  className="topic-card"
                  onClick={() => handleTopicClick(topic)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="topic-header">
                    <div className="topic-name">{topic}</div>
                    <Info size={16} className="topic-info-icon" title="Click to view details" />
                  </div>
                  <div className="topic-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleUseTopic(topic, 'produce', e)}
                      className="topic-btn produce-btn"
                      title="Use for Produce"
                    >
                      <Send size={14} />
                      Produce
                    </button>
                    <button
                      onClick={(e) => handleUseTopic(topic, 'consume', e)}
                      className="topic-btn consume-btn"
                      title="Use for Consume"
                    >
                      <Download size={14} />
                      Consume
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Topic Info Modal */}
      {selectedTopic && (
        <div className="topic-info-modal-overlay" onClick={handleCloseTopicInfo}>
          <div className="topic-info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Topic: {selectedTopic}</h2>
                <p className="modal-subtitle">Topic Details & Configuration</p>
              </div>
              <button
                onClick={handleCloseTopicInfo}
                className="modal-close-btn"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-content">
              {loadingTopicInfo ? (
                <div className="loading-container">
                  <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
                  <p>Loading topic information...</p>
                </div>
              ) : topicInfo ? (
                <>
                  <div className="topic-info-section">
                    <h3>Basic Information</h3>
                    <div className="info-grid">
                      <div className="info-item">
                        <span className="info-label">Topic Name</span>
                        <span className="info-value">{topicInfo.name}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Partitions</span>
                        <span className="info-value">{topicInfo.partitions}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Replication Factor</span>
                        <span className="info-value">{topicInfo.replicationFactor}</span>
                      </div>
                    </div>
                  </div>

                  {topicInfo.partitionDetails && topicInfo.partitionDetails.length > 0 && (
                    <div className="topic-info-section">
                      <h3>Partition Details</h3>
                      <div className="partition-table-container">
                        <table className="partition-table">
                          <thead>
                            <tr>
                              <th>Partition ID</th>
                              <th>Leader</th>
                              <th>Replicas</th>
                              <th>ISR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topicInfo.partitionDetails.map((partition, idx) => (
                              <tr key={idx}>
                                <td>{partition.partitionId}</td>
                                <td>{partition.leader}</td>
                                <td>{partition.replicas?.join(', ') || 'N/A'}</td>
                                <td>{partition.isr?.join(', ') || 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {topicInfo.configs && Object.keys(topicInfo.configs).length > 0 && (
                    <div className="topic-info-section">
                      <h3>Topic Configuration</h3>
                      <div className="config-grid">
                        {Object.entries(topicInfo.configs).map(([key, value]) => {
                          if (!value || key.includes('password') || key.includes('secret')) return null;
                          const displayKey = key.replace(/\./g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                          return (
                            <div key={key} className="config-item">
                              <span className="config-label">{displayKey}</span>
                              <span className="config-value">{String(value)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="error-container">
                  <XCircle size={48} />
                  <p>Failed to load topic information</p>
                  <p className="error-detail">The topic may not exist or you may not have permission to view it.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KafkaConnection;

