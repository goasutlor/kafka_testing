import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader, RefreshCw, Send, Download } from 'lucide-react';
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

  useEffect(() => {
    checkStatus();
  }, []);

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

  const handleUseTopic = (topic, action) => {
    if (action === 'produce') {
      navigate(`/produce?topic=${encodeURIComponent(topic)}`);
    } else if (action === 'consume') {
      navigate(`/consume?topic=${encodeURIComponent(topic)}`);
    }
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
                <div key={idx} className="topic-card">
                  <div className="topic-name">{topic}</div>
                  <div className="topic-actions">
                    <button
                      onClick={() => handleUseTopic(topic, 'produce')}
                      className="topic-btn produce-btn"
                      title="Use for Produce"
                    >
                      <Send size={14} />
                      Produce
                    </button>
                    <button
                      onClick={() => handleUseTopic(topic, 'consume')}
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
    </div>
  );
};

export default KafkaConnection;

