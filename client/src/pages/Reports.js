import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import './Reports.css';

const Reports = () => {
  const [produceStats, setProduceStats] = useState(null);
  const [consumeStats, setConsumeStats] = useState(null);
  const [produceLogs, setProduceLogs] = useState([]);
  const [consumeLogs, setConsumeLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [produceRes, consumeRes, produceLogsRes, consumeLogsRes] = await Promise.all([
        axios.get('/api/produce/stats'),
        axios.get('/api/consume/stats'),
        axios.get('/api/produce/logs?limit=1000'),
        axios.get('/api/consume/logs?limit=1000'),
      ]);

      setProduceStats(produceRes.data.stats);
      setConsumeStats(consumeRes.data.stats);
      setProduceLogs(produceLogsRes.data.logs);
      setConsumeLogs(consumeLogsRes.data.logs);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeSeriesData = (logs) => {
    const timeMap = new Map();
    
    logs.forEach((log) => {
      const date = new Date(log.timestamp);
      const hour = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      
      if (!timeMap.has(hour)) {
        timeMap.set(hour, { time: hour, count: 0 });
      }
      timeMap.get(hour).count++;
    });

    return Array.from(timeMap.values()).sort((a, b) => a.time.localeCompare(b.time));
  };

  const getStatusDistribution = (logs) => {
    const statusCount = { success: 0, failed: 0 };
    logs.forEach((log) => {
      if (log.status === 'success') statusCount.success++;
      else if (log.status === 'failed') statusCount.failed++;
    });
    return [
      { name: 'Success', value: statusCount.success },
      { name: 'Failed', value: statusCount.failed },
    ];
  };

  const produceTimeData = getTimeSeriesData(produceLogs);
  const consumeTimeData = getTimeSeriesData(consumeLogs);
  const produceStatusData = getStatusDistribution(produceLogs);

  const COLORS = ['#10b981', '#ef4444', '#667eea', '#f59e0b'];

  if (loading) {
    return (
      <div className="reports">
        <div className="loading">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="reports">
      <div className="page-header">
        <h1>Reports & Analytics</h1>
        <p>Comprehensive analysis of produce and consume operations</p>
      </div>

      <div className="reports-grid">
        <div className="summary-cards">
          <div className="summary-card produce">
            <h3>Produce Statistics</h3>
            {produceStats ? (
              <>
                <div className="summary-item">
                  <span className="label">Total</span>
                  <span className="value">{produceStats.total || 0}</span>
                </div>
                <div className="summary-item success">
                  <span className="label">Success</span>
                  <span className="value">{produceStats.success || 0}</span>
                </div>
                <div className="summary-item error">
                  <span className="label">Failed</span>
                  <span className="value">{produceStats.failed || 0}</span>
                </div>
                {produceStats.startTime && (
                  <div className="summary-item">
                    <span className="label">Duration</span>
                    <span className="value">
                      {produceStats.endTime
                        ? `${Math.round((new Date(produceStats.endTime) - new Date(produceStats.startTime)) / 1000)}s`
                        : 'Running...'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="no-data">No data available</p>
            )}
          </div>

          <div className="summary-card consume">
            <h3>Consume Statistics</h3>
            {consumeStats ? (
              <>
                <div className="summary-item">
                  <span className="label">Total Received</span>
                  <span className="value">{consumeStats.total || 0}</span>
                </div>
                <div className="summary-item">
                  <span className="label">Unique Sequences</span>
                  <span className="value">{consumeStats.sequences?.length || 0}</span>
                </div>
                {consumeStats.startTime && (
                  <div className="summary-item">
                    <span className="label">Duration</span>
                    <span className="value">
                      {consumeStats.endTime
                        ? `${Math.round((new Date(consumeStats.endTime) - new Date(consumeStats.startTime)) / 1000)}s`
                        : 'Running...'}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="no-data">No data available</p>
            )}
          </div>
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <h2>Produce Time Series</h2>
          </div>
          <div className="panel-content">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={produceTimeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#667eea" strokeWidth={2} name="Messages" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <h2>Consume Time Series</h2>
          </div>
          <div className="panel-content">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={consumeTimeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} name="Messages" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <h2>Produce Status Distribution</h2>
          </div>
          <div className="panel-content">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={produceStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {produceStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <h2>Produce vs Consume Comparison</h2>
          </div>
          <div className="panel-content">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[
                { name: 'Produce', value: produceStats?.total || 0 },
                { name: 'Consume', value: consumeStats?.total || 0 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#667eea" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;

