import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Download, BarChart3, Database, Zap, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/kafka');
    }
  }, [isAuthenticated, navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/login', formData);
      if (response.data.success) {
        login(response.data.token, response.data.user);
        navigate('/kafka');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: Send,
      title: 'Produce Messages',
      description: 'Test and send messages to Kafka topics with accumulation support',
    },
    {
      icon: Download,
      title: 'Consume Events',
      description: 'Subscribe and monitor events from Kafka topics in real-time',
    },
    {
      icon: BarChart3,
      title: 'Analytics & Reports',
      description: 'Comprehensive reports with gap detection and sequence tracking',
    },
    {
      icon: Database,
      title: 'Kafka Integration',
      description: 'Connect to Kafka clusters with SASL and API Key authentication',
    },
  ];

  return (
    <div className="login-page">
      <div className="login-grid">
        <div className="login-intro">
          <div className="kafka-logo-container">
            <div className="kafka-logo">
              <div className="kafka-icon">
                <Zap size={32} />
                <div className="kafka-particles">
                  <div className="particle particle-1"></div>
                  <div className="particle particle-2"></div>
                  <div className="particle particle-3"></div>
                </div>
              </div>
              <div className="kafka-text">
                <h1>Kafka Test</h1>
                <p>Testing & Monitoring</p>
              </div>
            </div>
            <div className="kafka-visual">
              <div className="kafka-stream">
                <div className="stream-line"></div>
                <div className="stream-line"></div>
                <div className="stream-line"></div>
              </div>
            </div>
          </div>
          
          <div className="login-badge">Kafka Testing Platform</div>
          
          <h2>Stream Testing Made Simple</h2>
          <p>
            Comprehensive testing platform for Kafka produce and consume operations.
            Monitor, analyze, and validate your Kafka streams with real-time insights.
          </p>

          <div className="login-feature-list">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div key={idx} className="login-feature-item">
                  <div className="feature-icon">
                    <Icon size={20} />
                  </div>
                  <div className="feature-copy">
                    <span className="feature-title">{feature.title}</span>
                    <span className="feature-desc">{feature.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="login-panel">
          <div className="panel-header">
            <div className="panel-icon">
              <Shield size={24} />
            </div>
            <div>
              <h2>Sign in to continue</h2>
              <p>Use your local account credentials</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleInputChange}
                placeholder="Enter your username"
                required
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn-login"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="spinner-small"></div>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="panel-footer">
            <p>Default credentials: admin / admin</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

