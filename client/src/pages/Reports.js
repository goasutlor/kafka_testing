import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart
} from 'recharts';
import { 
  Download, FileText, TrendingUp, TrendingDown, AlertCircle, 
  CheckCircle, Clock, Activity, Zap, BarChart3, RefreshCw,
  AlertTriangle, Info, XCircle, X
} from 'lucide-react';
import axios from 'axios';
import './Reports.css';

const Reports = () => {
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [produceStats, setProduceStats] = useState(null);
  const [consumeStats, setConsumeStats] = useState(null);
  const [jobHistory, setJobHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, performance, analytics, sequences, jobs, loadtest
  const [selectedJobDetail, setSelectedJobDetail] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  // Listen for job detail events
  useEffect(() => {
    const handleShowJobDetail = (event) => {
      setSelectedJobDetail(event.detail);
    };
    window.addEventListener('showJobDetail', handleShowJobDetail);
    return () => window.removeEventListener('showJobDetail', handleShowJobDetail);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryRes, analyticsRes, produceRes, consumeRes, jobsRes] = await Promise.all([
        axios.get('/api/reports/summary').catch(() => ({ data: { summary: null } })),
        axios.get('/api/reports/analytics').catch(() => ({ data: { analytics: null } })),
        axios.get('/api/produce/stats').catch(() => ({ data: { stats: null } })),
        axios.get('/api/consume/stats').catch(() => ({ data: { stats: null } })),
        axios.get('/api/reports/jobs?limit=100').catch(() => ({ data: { jobs: [] } })),
      ]);

      setSummary(summaryRes.data.summary);
      setAnalytics(analyticsRes.data.analytics);
      setProduceStats(produceRes.data.stats);
      setConsumeStats(consumeRes.data.stats);
      setJobHistory(jobsRes.data.jobs || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = (format, loadTestData = null) => {
    const data = {
      summary,
      analytics,
      produceStats,
      consumeStats,
      jobHistory,
      loadTestData,
      timestamp: new Date().toISOString(),
    };

    if (format === 'json') {
      const dataStr = JSON.stringify(data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kafka-report-${Date.now()}.json`;
      link.click();
    } else if (format === 'csv') {
      // Simple CSV export
      const csv = generateCSV(data);
      const dataBlob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kafka-report-${Date.now()}.csv`;
      link.click();
    } else if (format === 'pdf') {
      exportToPDF(loadTestData || data);
    }
  };

  const exportToPDF = (data) => {
    // Use browser's print functionality for PDF
    const printWindow = window.open('', '_blank');
    const htmlContent = generatePDFHTML(data || {
      summary,
      jobHistory,
    });
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  // Helper function to generate SVG chart
  const generateChartSVG = (type, data, width = 600, height = 300) => {
    if (!data || data.length === 0) return '';
    
    const padding = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    if (type === 'bar') {
      // Bar chart for throughput comparison
      const maxValue = Math.max(...data.map(d => Math.max(d.throughput || 0, d.mbps || 0))) * 1.1;
      const barWidth = chartWidth / (data.length * 3);
      
      let bars = '';
      data.forEach((item, idx) => {
        const x = padding.left + (idx * chartWidth / data.length) + (chartWidth / data.length / 3);
        const throughputHeight = ((item.throughput || 0) / maxValue) * chartHeight;
        const mbpsHeight = ((item.mbps || 0) / maxValue) * chartHeight;
        
        bars += `
          <rect x="${x}" y="${padding.top + chartHeight - throughputHeight}" width="${barWidth}" height="${throughputHeight}" fill="#2563eb" opacity="0.8"/>
          <rect x="${x + barWidth}" y="${padding.top + chartHeight - mbpsHeight}" width="${barWidth}" height="${mbpsHeight}" fill="#10b981" opacity="0.8"/>
          <text x="${x + barWidth}" y="${padding.top + chartHeight + 15}" font-size="10" text-anchor="middle" fill="#666">${item.name}</text>
        `;
      });
      
      // Y-axis
      const yAxisSteps = 5;
      let yAxis = '';
      for (let i = 0; i <= yAxisSteps; i++) {
        const value = (maxValue / yAxisSteps) * (yAxisSteps - i);
        const y = padding.top + (i * chartHeight / yAxisSteps);
        yAxis += `
          <line x1="${padding.left}" y1="${y}" x2="${padding.left - 5}" y2="${y}" stroke="#666" stroke-width="1"/>
          <text x="${padding.left - 10}" y="${y + 4}" font-size="10" text-anchor="end" fill="#666">${value.toFixed(0)}</text>
        `;
      }
      
      return `
        <svg width="${width}" height="${height}" style="background: white; border-radius: 8px;">
          <defs>
            <linearGradient id="barGradient1" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
            </linearGradient>
            <linearGradient id="barGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
          ${yAxis}
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="#666" stroke-width="2"/>
          <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${padding.left + chartWidth}" y2="${padding.top + chartHeight}" stroke="#666" stroke-width="2"/>
          ${bars.replace(/#2563eb/g, 'url(#barGradient1)').replace(/#10b981/g, 'url(#barGradient2)')}
          <text x="${width/2}" y="${height - 10}" font-size="12" text-anchor="middle" fill="#666" font-weight="600">Jobs</text>
          <text x="20" y="${height/2}" font-size="12" text-anchor="middle" fill="#666" font-weight="600" transform="rotate(-90, 20, ${height/2})">Throughput</text>
        </svg>
      `;
    } else if (type === 'line') {
      // Line chart for latency percentiles
      const maxValue = Math.max(...data.map(d => Math.max(d.p50 || 0, d.p95 || 0, d.p99 || 0))) * 1.2;
      
      const getY = (value) => padding.top + chartHeight - ((value / maxValue) * chartHeight);
      const getX = (idx) => padding.left + (idx * chartWidth / (data.length - 1 || 1));
      
      // P50 line
      let p50Path = '';
      data.forEach((item, idx) => {
        const x = getX(idx);
        const y = getY(item.p50 || 0);
        p50Path += (idx === 0 ? 'M' : 'L') + ` ${x} ${y}`;
      });
      
      // P95 line
      let p95Path = '';
      data.forEach((item, idx) => {
        const x = getX(idx);
        const y = getY(item.p95 || 0);
        p95Path += (idx === 0 ? 'M' : 'L') + ` ${x} ${y}`;
      });
      
      // P99 line
      let p99Path = '';
      data.forEach((item, idx) => {
        const x = getX(idx);
        const y = getY(item.p99 || 0);
        p99Path += (idx === 0 ? 'M' : 'L') + ` ${x} ${y}`;
      });
      
      // Y-axis
      const yAxisSteps = 5;
      let yAxis = '';
      for (let i = 0; i <= yAxisSteps; i++) {
        const value = (maxValue / yAxisSteps) * (yAxisSteps - i);
        const y = padding.top + (i * chartHeight / yAxisSteps);
        yAxis += `
          <line x1="${padding.left}" y1="${y}" x2="${padding.left - 5}" y2="${y}" stroke="#666" stroke-width="1"/>
          <text x="${padding.left - 10}" y="${y + 4}" font-size="10" text-anchor="end" fill="#666">${value.toFixed(0)}</text>
        `;
      }
      
      return `
        <svg width="${width}" height="${height}" style="background: white; border-radius: 8px;">
          <defs>
            <linearGradient id="lineGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#2563eb;stop-opacity:1" />
            </linearGradient>
            <linearGradient id="lineGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
            </linearGradient>
            <linearGradient id="lineGradient3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#f59e0b;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#d97706;stop-opacity:1" />
            </linearGradient>
          </defs>
          <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
          ${yAxis}
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="#666" stroke-width="2"/>
          <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${padding.left + chartWidth}" y2="${padding.top + chartHeight}" stroke="#666" stroke-width="2"/>
          <path d="${p50Path}" fill="none" stroke="url(#lineGradient1)" stroke-width="3" stroke-linecap="round"/>
          <path d="${p95Path}" fill="none" stroke="url(#lineGradient2)" stroke-width="3" stroke-linecap="round"/>
          <path d="${p99Path}" fill="none" stroke="url(#lineGradient3)" stroke-width="3" stroke-linecap="round"/>
          ${data.map((item, idx) => {
            const x = getX(idx);
            return `
              <circle cx="${x}" cy="${getY(item.p50 || 0)}" r="4" fill="#3b82f6"/>
              <circle cx="${x}" cy="${getY(item.p95 || 0)}" r="4" fill="#10b981"/>
              <circle cx="${x}" cy="${getY(item.p99 || 0)}" r="4" fill="#f59e0b"/>
              <text x="${x}" y="${padding.top + chartHeight + 15}" font-size="10" text-anchor="middle" fill="#666">${item.name}</text>
            `;
          }).join('')}
          <text x="${width/2}" y="${height - 10}" font-size="12" text-anchor="middle" fill="#666" font-weight="600">Jobs</text>
          <text x="20" y="${height/2}" font-size="12" text-anchor="middle" fill="#666" font-weight="600" transform="rotate(-90, 20, ${height/2})">Latency (ms)</text>
          <g transform="translate(${width - 120}, ${padding.top + 20})">
            <rect x="0" y="0" width="12" height="12" fill="#3b82f6"/>
            <text x="18" y="10" font-size="11" fill="#666">P50</text>
            <rect x="0" y="18" width="12" height="12" fill="#10b981"/>
            <text x="18" y="28" font-size="11" fill="#666">P95</text>
            <rect x="0" y="36" width="12" height="12" fill="#f59e0b"/>
            <text x="18" y="46" font-size="11" fill="#666">P99</text>
          </g>
        </svg>
      `;
    } else if (type === 'area') {
      // Area chart for throughput over time
      if (data.length === 0) return '';
      const maxValue = Math.max(...data.map(d => d.throughput || 0)) * 1.2;
      const getY = (value) => padding.top + chartHeight - ((value / maxValue) * chartHeight);
      const getX = (idx) => padding.left + (idx * chartWidth / (data.length - 1 || 1));
      
      // Y-axis labels
      const yAxisSteps = 5;
      let yAxis = '';
      for (let i = 0; i <= yAxisSteps; i++) {
        const value = (maxValue / yAxisSteps) * (yAxisSteps - i);
        const y = padding.top + (i * chartHeight / yAxisSteps);
        yAxis += `
          <line x1="${padding.left}" y1="${y}" x2="${padding.left - 5}" y2="${y}" stroke="#666" stroke-width="1"/>
          <text x="${padding.left - 10}" y="${y + 4}" font-size="10" text-anchor="end" fill="#666">${value.toFixed(0)}</text>
        `;
      }
      
      // Grid lines
      let gridLines = '';
      for (let i = 0; i <= yAxisSteps; i++) {
        const y = padding.top + (i * chartHeight / yAxisSteps);
        gridLines += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartWidth}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`;
      }
      
      let areaPath = `M ${getX(0)} ${padding.top + chartHeight}`;
      data.forEach((item, idx) => {
        areaPath += ` L ${getX(idx)} ${getY(item.throughput || 0)}`;
      });
      areaPath += ` L ${getX(data.length - 1)} ${padding.top + chartHeight} Z`;
      
      let linePath = '';
      data.forEach((item, idx) => {
        linePath += (idx === 0 ? 'M' : 'L') + ` ${getX(idx)} ${getY(item.throughput || 0)}`;
      });
      
      // Only show labels for points that have time value (not empty)
      const labels = data.map((item, idx) => {
        if (!item.time) return '';
        const x = getX(idx);
        const y = getY(item.throughput || 0);
        return `
          <circle cx="${x}" cy="${y}" r="4" fill="#2563eb" stroke="white" stroke-width="2"/>
          <text x="${x}" y="${padding.top + chartHeight + 18}" font-size="10" text-anchor="middle" fill="#666" font-weight="500">${item.time}</text>
        `;
      }).filter(l => l).join('');
      
      return `
        <svg width="${width}" height="${height}" style="background: white; border-radius: 8px;">
          <defs>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#2563eb;stop-opacity:0.3" />
              <stop offset="100%" style="stop-color:#2563eb;stop-opacity:0.05" />
            </linearGradient>
          </defs>
          <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
          ${gridLines}
          <path d="${areaPath}" fill="url(#areaGradient)"/>
          <path d="${linePath}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          ${labels}
          ${yAxis}
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight}" stroke="#666" stroke-width="2"/>
          <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${padding.left + chartWidth}" y2="${padding.top + chartHeight}" stroke="#666" stroke-width="2"/>
          <text x="${width/2}" y="${height - 5}" font-size="12" text-anchor="middle" fill="#666" font-weight="600">Time</text>
          <text x="25" y="${height/2}" font-size="12" text-anchor="middle" fill="#666" font-weight="600" transform="rotate(-90, 25, ${height/2})">Throughput (msg/s)</text>
        </svg>
      `;
    }
    return '';
  };

  const generatePDFHTML = (data, topicInfo = null) => {
    const loadTestJobs = data.jobHistory?.filter(j => j.type.startsWith('loadtest')) || [];
    const isSingleJob = loadTestJobs.length === 1;
    const job = isSingleJob ? loadTestJobs[0] : null;
    
    // Prepare chart data for single job
    const throughputHistory = job?.stats?.throughputHistory || [];
    const latencyData = job?.stats?.percentiles ? [{
      name: 'Latency',
      p50: job.stats.percentiles.p50 || 0,
      p95: job.stats.percentiles.p95 || 0,
      p99: job.stats.percentiles.p99 || 0,
    }] : [];
    
    // Prepare chart data for comparison
    const throughputChartData = loadTestJobs.map(job => ({
      name: job.name.substring(0, 12),
      throughput: job.stats?.recordsPerSec || 0,
      mbps: job.stats?.mbPerSec || 0,
    }));
    
    const latencyChartData = loadTestJobs.map(job => ({
      name: job.name.substring(0, 12),
      p50: job.stats?.percentiles?.p50 || 0,
      p95: job.stats?.percentiles?.p95 || 0,
      p99: job.stats?.percentiles?.p99 || 0,
    }));
    
    // Format time data properly - show only every Nth point to avoid crowding
    const throughputTimeData = throughputHistory.map((h, idx) => {
      const timestamp = typeof h.timestamp === 'number' ? h.timestamp : new Date(h.timestamp).getTime();
      const date = new Date(timestamp);
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();
      // Show label only for every 5th point or at start/end
      const showLabel = idx === 0 || idx === throughputHistory.length - 1 || idx % Math.max(1, Math.floor(throughputHistory.length / 8)) === 0;
      return {
        time: showLabel ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : '',
        throughput: h.recordsPerSec || 0,
        index: idx,
      };
    });
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Kafka Load Test Report</title>
  <style>
    @page { 
      margin: 1.2cm;
      size: A4 landscape;
    }
    * { box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', 'Helvetica Neue', Arial, sans-serif; 
      color: #1a1a1a; 
      line-height: 1.6;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      margin: 0;
      padding: 20px;
    }
    .report-container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 50px;
      margin-bottom: 0;
      border-bottom: 4px solid #5a67d8;
      position: relative;
      overflow: hidden;
    }
    .header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 300px;
      height: 300px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
    }
    .header h1 { 
      color: white; 
      margin: 0 0 12px 0; 
      font-size: 32px; 
      font-weight: 700;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      position: relative;
      z-index: 1;
    }
    .header-subtitle { 
      color: rgba(255, 255, 255, 0.95); 
      margin: 8px 0; 
      font-size: 15px;
      position: relative;
      z-index: 1;
    }
    .header-badge {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 8px;
      backdrop-filter: blur(10px);
      position: relative;
      z-index: 1;
    }
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
      padding: 30px;
      background: #f8f9fa;
    }
    .section { 
      margin: 0;
      page-break-inside: avoid;
      background: white;
      border-radius: 12px;
      padding: 28px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(102, 126, 234, 0.1);
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 3px solid #667eea;
    }
    .section-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 18px;
    }
    .section h2 { 
      color: #2d3748; 
      margin: 0;
      font-size: 20px; 
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .section h3 { 
      color: #4a5568; 
      margin: 24px 0 16px 0; 
      font-size: 16px; 
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 13px;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 20px 0; 
      font-size: 11px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      border-radius: 8px;
      overflow: hidden;
    }
    th { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; 
      padding: 14px 16px; 
      text-align: left; 
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
    }
    td { 
      padding: 12px 16px; 
      border-bottom: 1px solid #e2e8f0;
      color: #2d3748;
    }
    tr:nth-child(even) { 
      background: #f7fafc; 
    }
    tr:hover {
      background: #edf2f7;
    }
    .profile-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
      gap: 16px; 
      margin: 20px 0; 
    }
    .profile-item { 
      background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
      padding: 16px;
      border-radius: 10px;
      border-left: 4px solid #667eea;
      display: flex; 
      flex-direction: column; 
      gap: 6px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    .profile-label { 
      font-size: 10px; 
      color: #718096; 
      text-transform: uppercase; 
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .profile-value { 
      font-size: 14px; 
      color: #2d3748; 
      font-family: 'Courier New', monospace; 
      font-weight: 600;
    }
    .stats-grid { 
      display: grid; 
      grid-template-columns: repeat(3, 1fr); 
      gap: 20px; 
      margin: 24px 0; 
    }
    .stat-card { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px; 
      padding: 24px;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
      color: white;
      position: relative;
      overflow: hidden;
    }
    .stat-card::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 150px;
      height: 150px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
    }
    .stat-card:nth-child(2) {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      box-shadow: 0 8px 24px rgba(245, 87, 108, 0.3);
    }
    .stat-card:nth-child(3) {
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
      box-shadow: 0 8px 24px rgba(79, 172, 254, 0.3);
    }
    .stat-card:nth-child(4) {
      background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
      box-shadow: 0 8px 24px rgba(67, 233, 123, 0.3);
    }
    .stat-card:nth-child(5) {
      background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
      box-shadow: 0 8px 24px rgba(250, 112, 154, 0.3);
    }
    .stat-card:nth-child(6) {
      background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);
      box-shadow: 0 8px 24px rgba(48, 207, 208, 0.3);
    }
    .stat-label { 
      font-size: 11px; 
      color: rgba(255, 255, 255, 0.9); 
      text-transform: uppercase; 
      font-weight: 700;
      margin-bottom: 10px;
      letter-spacing: 1px;
      position: relative;
      z-index: 1;
    }
    .stat-value { 
      font-size: 28px; 
      font-weight: 800; 
      color: white;
      margin-bottom: 6px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      position: relative;
      z-index: 1;
    }
    .stat-detail { 
      font-size: 12px; 
      color: rgba(255, 255, 255, 0.85);
      position: relative;
      z-index: 1;
    }
    .chart-container {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(102, 126, 234, 0.1);
    }
    .chart-title {
      font-size: 16px;
      font-weight: 700;
      color: #2d3748;
      margin-bottom: 20px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-card { 
      background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
      border-left: 5px solid #667eea; 
      padding: 20px; 
      margin: 20px 0; 
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
    .metric-label { 
      font-size: 11px; 
      color: #718096; 
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .metric-value { 
      font-size: 32px; 
      font-weight: 800; 
      color: #667eea;
      margin: 8px 0;
    }
    .footer { 
      margin-top: 50px; 
      padding: 30px 50px;
      background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
      color: rgba(255, 255, 255, 0.8);
      text-align: center; 
      font-size: 12px;
    }
    .footer-logo {
      font-size: 18px;
      font-weight: 700;
      color: white;
      margin-bottom: 8px;
    }
    @media print {
      body { background: white; padding: 0; }
      .section { page-break-inside: avoid; margin-bottom: 30px; }
      .chart-container { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <h1>${job ? job.name : 'Kafka Load Test Performance Report'}</h1>
      <p class="header-subtitle">
        ${job ? `${job.type?.replace('loadtest-', '').toUpperCase()} • Topic: ${job.config?.topic || 'N/A'}` : 'Enterprise Grade Performance Analysis'}
      </p>
      <p class="header-subtitle">Generated: ${new Date().toLocaleString()}</p>
      <span class="header-badge">Kafka Testing Platform</span>
    </div>

  ${isSingleJob && topicInfo ? `
  <div class="section">
    <h2>Topic Information</h2>
    <div class="profile-grid">
      <div class="profile-item">
        <span class="profile-label">Topic Name</span>
        <span class="profile-value">${topicInfo.name}</span>
      </div>
      <div class="profile-item">
        <span class="profile-label">Partitions</span>
        <span class="profile-value">${topicInfo.partitions}</span>
      </div>
      <div class="profile-item">
        <span class="profile-label">Replication Factor</span>
        <span class="profile-value">${topicInfo.replicationFactor}</span>
      </div>
      ${topicInfo.configs ? Object.entries(topicInfo.configs).map(([key, value]) => {
        if (!value || key.includes('password') || key.includes('secret')) return '';
        const displayKey = key.replace(/\./g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        return `
      <div class="profile-item">
        <span class="profile-label">${displayKey}</span>
        <span class="profile-value">${String(value)}</span>
      </div>`;
      }).join('') : ''}
    </div>
  </div>
  ` : ''}

  ${isSingleJob ? `
  <div class="section">
    <h2>Test Profile</h2>
    <div class="profile-grid">
      ${Object.entries(job.config || {}).map(([key, value]) => {
        if (value === null || value === undefined) return '';
        const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `
      <div class="profile-item">
        <span class="profile-label">${displayKey}</span>
        <span class="profile-value">${displayValue}</span>
      </div>`;
      }).join('')}
    </div>
  </div>

  <div class="section">
    <h2>Performance Metrics</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Throughput</div>
        <div class="stat-value">${job.stats?.recordsPerSec?.toFixed(2) || '0.00'} msg/s</div>
        <div class="stat-detail">${job.stats?.mbPerSec?.toFixed(2) || '0.00'} MB/s</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Records</div>
        <div class="stat-value">${job.stats?.totalRecords || job.stats?.successRecords || 0}</div>
        <div class="stat-detail">${job.stats?.failedRecords ? `${job.stats.failedRecords} failed` : '100% success'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">P50 Latency</div>
        <div class="stat-value">${job.stats?.percentiles?.p50?.toFixed(2) || 'N/A'} ms</div>
        <div class="stat-detail">Median</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">P95 Latency</div>
        <div class="stat-value">${job.stats?.percentiles?.p95?.toFixed(2) || 'N/A'} ms</div>
        <div class="stat-detail">95th percentile</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">P99 Latency</div>
        <div class="stat-value">${job.stats?.percentiles?.p99?.toFixed(2) || 'N/A'} ms</div>
        <div class="stat-detail">99th percentile</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Duration</div>
        <div class="stat-value">${job.endTime && job.startTime
          ? Math.round((new Date(job.endTime) - new Date(job.startTime).getTime()) / 1000)
          : 'Running'}s</div>
        <div class="stat-detail">Total time</div>
      </div>
    </div>
  </div>

  ${throughputHistory.length > 0 ? `
  <div class="section">
    <h2>Throughput Over Time</h2>
    <div class="chart-container">
      ${generateChartSVG('area', throughputTimeData)}
      <div style="margin-top: 12px; font-size: 12px; color: #666;">
        <p><strong>Summary:</strong> Peak: ${Math.max(...throughputHistory.map(h => h.recordsPerSec || 0)).toFixed(2)} msg/s | Average: ${(throughputHistory.reduce((sum, h) => sum + (h.recordsPerSec || 0), 0) / throughputHistory.length).toFixed(2)} msg/s</p>
      </div>
    </div>
  </div>
  ` : ''}

  ${latencyData.length > 0 ? `
  <div class="section">
    <h2>Latency Percentiles</h2>
    <div class="chart-container">
      ${generateChartSVG('line', latencyData)}
      <div style="margin-top: 12px; font-size: 12px; color: #666;">
        <p><strong>Values:</strong> P50: ${latencyData[0].p50.toFixed(2)} ms | P95: ${latencyData[0].p95.toFixed(2)} ms | P99: ${latencyData[0].p99.toFixed(2)} ms</p>
      </div>
    </div>
  </div>
  ` : ''}
  ` : ''}
  
  ${!isSingleJob && data.summary?.loadTest ? `
  <div class="section">
    <h2>Executive Summary</h2>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      ${data.summary.loadTest.producer ? `
      <div class="metric-card">
        <div class="metric-label">Producer Load Tests</div>
        <div class="metric-value">${data.summary.loadTest.producer.totalJobs}</div>
        <div style="margin-top: 10px;">
          <div>Avg Throughput: ${data.summary.loadTest.producer.avgThroughput?.toFixed(2) || 0} msg/s</div>
          <div>Avg Latency: ${data.summary.loadTest.producer.avgLatency?.toFixed(2) || 0} ms</div>
        </div>
      </div>
      ` : ''}
      ${data.summary.loadTest.consumer ? `
      <div class="metric-card">
        <div class="metric-label">Consumer Load Tests</div>
        <div class="metric-value">${data.summary.loadTest.consumer.totalJobs}</div>
        <div style="margin-top: 10px;">
          <div>Avg Throughput: ${data.summary.loadTest.consumer.avgThroughput?.toFixed(2) || 0} msg/s</div>
        </div>
      </div>
      ` : ''}
    </div>
  </div>
  ` : ''}

  ${!isSingleJob ? `
  ${throughputChartData.length > 0 ? `
  <div class="section">
    <h2>Throughput Comparison</h2>
    <div class="chart-container">
      ${generateChartSVG('bar', throughputChartData)}
    </div>
  </div>
  ` : ''}

  ${latencyChartData.length > 0 ? `
  <div class="section">
    <h2>Latency Percentiles Comparison</h2>
    <div class="chart-container">
      ${generateChartSVG('line', latencyChartData)}
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h2>Performance Metrics Table</h2>
    <table>
      <thead>
        <tr>
          <th>Job Name</th>
          <th>Type</th>
          <th>Throughput (msg/s)</th>
          <th>MB/s</th>
          <th>P50 Latency (ms)</th>
          <th>P95 Latency (ms)</th>
          <th>P99 Latency (ms)</th>
          <th>Total Records</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${loadTestJobs.map(job => {
          const duration = job.endTime && job.startTime 
            ? Math.round((new Date(job.endTime) - new Date(job.startTime)) / 1000)
            : 'Running';
          return `
          <tr>
            <td>${job.name}</td>
            <td>${job.type.replace('loadtest-', '')}</td>
            <td>${job.stats?.recordsPerSec?.toFixed(2) || 'N/A'}</td>
            <td>${job.stats?.mbPerSec?.toFixed(2) || 'N/A'}</td>
            <td>${job.stats?.percentiles?.p50?.toFixed(2) || 'N/A'}</td>
            <td>${job.stats?.percentiles?.p95?.toFixed(2) || 'N/A'}</td>
            <td>${job.stats?.percentiles?.p99?.toFixed(2) || 'N/A'}</td>
            <td>${job.stats?.totalRecords || 'N/A'}</td>
            <td>${duration}${typeof duration === 'number' ? 's' : ''}</td>
          </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>This report was generated by Kafka Testing Platform</p>
    <p>For internal use only</p>
  </div>
</body>
</html>
    `;
  };

  const generateCSV = (data) => {
    let csv = 'Metric,Value\n';
    if (data.summary) {
      csv += `Total Produced,${data.summary.produce.total}\n`;
      csv += `Total Consumed,${data.summary.consume.total}\n`;
      csv += `Success Rate,${data.summary.produce.successRate}%\n`;
      csv += `Error Rate,${data.summary.analysis.errorRate}%\n`;
      csv += `Message Loss,${data.summary.analysis.messageLoss}%\n`;
      csv += `Total Jobs,${data.summary.jobHistory?.total || 0}\n`;
      csv += `Produce Jobs,${data.summary.jobHistory?.produce || 0}\n`;
      csv += `Consume Jobs,${data.summary.jobHistory?.consume || 0}\n`;
      csv += `Load Test Jobs,${data.summary.jobHistory?.loadTest || 0}\n`;
    }
    if (data.jobHistory && data.jobHistory.length > 0) {
      csv += '\nJob History\n';
      csv += 'Job Name,Type,Status,Total,Success,Failed,Start Time,End Time\n';
      data.jobHistory.forEach(job => {
        csv += `"${job.name}",${job.type},${job.status},${job.stats?.total || 0},${job.stats?.success || 0},${job.stats?.failed || 0},"${job.startTime}","${job.endTime || ''}"\n`;
      });
    }
    return csv;
  };

  const getRecommendationIcon = (type) => {
    switch (type) {
      case 'error': return <XCircle size={20} />;
      case 'warning': return <AlertTriangle size={20} />;
      case 'info': return <Info size={20} />;
      case 'success': return <CheckCircle size={20} />;
      default: return <Info size={20} />;
    }
  };

  const getRecommendationColor = (type) => {
    switch (type) {
      case 'error': return 'var(--error)';
      case 'warning': return '#f59e0b';
      case 'info': return 'var(--primary)';
      case 'success': return 'var(--success)';
      default: return 'var(--text-secondary)';
    }
  };

  if (loading) {
    return (
      <div className="reports">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading comprehensive reports...</p>
        </div>
      </div>
    );
  }

  const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="reports">
      {/* Header */}
      <div className="reports-header">
        <div className="header-content">
          <div>
            <h1>Kafka Test Reports & Analytics</h1>
            <p>Comprehensive performance analysis and insights</p>
          </div>
          <div className="header-actions">
            <button onClick={loadData} className="btn-icon" title="Refresh">
              <RefreshCw size={18} />
            </button>
            <div className="export-dropdown">
              <button className="btn-primary">
                <Download size={18} />
                Export Report
              </button>
              <div className="dropdown-menu">
              <button onClick={() => exportReport('json')}>
                <FileText size={16} />
                Export as JSON
              </button>
              <button onClick={() => exportReport('csv')}>
                <FileText size={16} />
                Export as CSV
              </button>
              {activeTab === 'loadtest' && (
                <button onClick={() => exportReport('pdf', { summary, jobHistory })}>
                  <FileText size={16} />
                  Export as PDF
                </button>
              )}
              </div>
            </div>
          </div>
        </div>
        {summary && (
          <div className="report-meta">
            <span>Generated: {new Date(summary.timestamp).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Executive Summary */}
      {summary && (
        <div className="executive-summary">
          <h2 className="section-title">
            <BarChart3 size={24} />
            Executive Summary
          </h2>
          <div className="summary-grid">
            <MetricCard
              title="Total Messages"
              value={summary.produce.total}
              subtitle="Produced"
              icon={<Zap size={24} />}
              color="var(--primary)"
              trend={summary.produce.total > 0 ? 'up' : null}
            />
            <MetricCard
              title="Success Rate"
              value={`${summary.produce.successRate}%`}
              subtitle={`${summary.produce.success} / ${summary.produce.total}`}
              icon={<CheckCircle size={24} />}
              color="var(--success)"
              trend={parseFloat(summary.produce.successRate) > 95 ? 'up' : 'down'}
            />
            <MetricCard
              title="Error Rate"
              value={`${summary.analysis.errorRate}%`}
              subtitle={`${summary.produce.failed} failed`}
              icon={<AlertCircle size={24} />}
              color="var(--error)"
              trend={parseFloat(summary.analysis.errorRate) < 5 ? 'up' : 'down'}
            />
            <MetricCard
              title="Message Loss"
              value={`${summary.analysis.messageLoss}%`}
              subtitle="Not consumed"
              icon={<TrendingDown size={24} />}
              color={parseFloat(summary.analysis.messageLoss) > 1 ? 'var(--error)' : 'var(--success)'}
              trend={parseFloat(summary.analysis.messageLoss) < 1 ? 'up' : 'down'}
            />
            <MetricCard
              title="Avg Latency"
              value={`${(summary.analysis.averageLatency / 1000).toFixed(2)}s`}
              subtitle="Produce to Consume"
              icon={<Clock size={24} />}
              color="var(--primary)"
            />
            <MetricCard
              title="Peak Throughput"
              value={`${summary.analysis.peakThroughput.produce} msg/s`}
              subtitle="Produce peak"
              icon={<Activity size={24} />}
              color="var(--primary)"
            />
          </div>
        </div>
      )}

      {/* Recommendations */}
      {summary && summary.recommendations && summary.recommendations.length > 0 && (
        <div className="recommendations-section">
          <h2 className="section-title">
            <AlertCircle size={24} />
            Recommendations & Insights
          </h2>
          <div className="recommendations-grid">
            {summary.recommendations.map((rec, idx) => (
              <div 
                key={idx} 
                className={`recommendation-card ${rec.type}`}
                style={{ borderLeftColor: getRecommendationColor(rec.type) }}
              >
                <div className="recommendation-icon" style={{ color: getRecommendationColor(rec.type) }}>
                  {getRecommendationIcon(rec.type)}
                </div>
                <div className="recommendation-content">
                  <h3>{rec.title}</h3>
                  <p>{rec.message}</p>
                  <span className="priority-badge priority-{rec.priority}">{rec.priority} priority</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="reports-tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          Performance Metrics
        </button>
        <button 
          className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics & Trends
        </button>
        <button 
          className={`tab ${activeTab === 'sequences' ? 'active' : ''}`}
          onClick={() => setActiveTab('sequences')}
        >
          Sequence Analysis
        </button>
        <button 
          className={`tab ${activeTab === 'jobs' ? 'active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          Job History
        </button>
        <button 
          className={`tab ${activeTab === 'loadtest' ? 'active' : ''}`}
          onClick={() => setActiveTab('loadtest')}
        >
          Load Test Reports
        </button>
        <button 
          className={`tab ${activeTab === 'performance-table' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance-table')}
        >
          Performance Report
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <OverviewTab summary={summary} analytics={analytics} COLORS={COLORS} />
        )}
        {activeTab === 'performance' && (
          <PerformanceTab summary={summary} analytics={analytics} COLORS={COLORS} />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab analytics={analytics} COLORS={COLORS} />
        )}
        {activeTab === 'sequences' && (
          <SequencesTab analytics={analytics} />
        )}
        {activeTab === 'jobs' && (
          <JobsTab jobHistory={jobHistory} exportReport={exportReport} />
        )}
        {activeTab === 'loadtest' && (
          <LoadTestTab summary={summary} jobHistory={jobHistory} COLORS={COLORS} exportReport={exportReport} />
        )}
        {activeTab === 'performance-table' && (
          <PerformanceTableTab summary={summary} jobHistory={jobHistory} exportReport={exportReport} />
        )}
      </div>

      {/* Global Job Detail Modal */}
      {selectedJobDetail && (
        <JobDetailModal 
          job={selectedJobDetail} 
          onClose={() => setSelectedJobDetail(null)} 
          exportReport={exportReport} 
        />
      )}
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ title, value, subtitle, icon, color, trend }) => {
  return (
    <div className="metric-card" style={{ borderTopColor: color }}>
      <div className="metric-header">
        <div className="metric-icon" style={{ color }}>
          {icon}
        </div>
        {trend && (
          <div className={`trend-indicator trend-${trend}`}>
            {trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </div>
        )}
      </div>
      <div className="metric-body">
        <h3>{title}</h3>
        <div className="metric-value" style={{ color }}>
          {value}
        </div>
        {subtitle && <p className="metric-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
};

// Overview Tab
const OverviewTab = ({ summary, analytics, COLORS }) => {
  if (!summary) return <div className="no-data">No data available</div>;

  return (
    <div className="overview-tab">
      <div className="charts-grid">
        <ChartPanel title="Produce vs Consume Comparison">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={[
              { name: 'Produce', produced: summary.produce.total, consumed: summary.consume.total },
            ]}>
              <defs>
                <linearGradient id="barGradient1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[0]} stopOpacity={1} />
                  <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="barGradient2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[1]} stopOpacity={1} />
                  <stop offset="100%" stopColor={COLORS[1]} stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(102, 126, 234, 0.1)" vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="var(--text-secondary)"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                stroke="var(--text-secondary)"
                fontSize={12}
                tickLine={false}
              />
              <Tooltip />
              <Legend />
              <Bar 
                dataKey="produced" 
                fill="url(#barGradient1)" 
                name="Produced"
                radius={[8, 8, 0, 0]}
              />
              <Bar 
                dataKey="consumed" 
                fill="url(#barGradient2)" 
                name="Consumed"
                radius={[8, 8, 0, 0]}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Success vs Failed Distribution">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Success', value: summary.produce.success },
                  { name: 'Failed', value: summary.produce.failed },
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {[COLORS[1], COLORS[3]].map((color, index) => (
                  <Cell key={`cell-${index}`} fill={color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        {analytics && analytics.timeSeries && (
          <ChartPanel title="Message Flow Over Time" span={2}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={analytics.timeSeries}>
                <defs>
                  <linearGradient id="colorProduce" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorConsume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[1]} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS[1]} stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(102, 126, 234, 0.1)" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis 
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                />
                <Tooltip />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="produce" 
                  stroke={COLORS[0]} 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorProduce)" 
                  name="Produce"
                  dot={{ fill: COLORS[0], r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="consume" 
                  stroke={COLORS[1]} 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorConsume)" 
                  name="Consume"
                  dot={{ fill: COLORS[1], r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}
      </div>

      <div className="stats-details">
        <div className="detail-card">
          <h3>Produce Statistics</h3>
          <div className="detail-list">
            <DetailItem label="Total Messages" value={summary.produce.total} />
            <DetailItem label="Successful" value={summary.produce.success} color="var(--success)" />
            <DetailItem label="Failed" value={summary.produce.failed} color="var(--error)" />
            <DetailItem label="Success Rate" value={`${summary.produce.successRate}%`} />
            <DetailItem label="Throughput" value={`${summary.produce.throughput} msg/s`} />
            {summary.produce.duration && (
              <DetailItem label="Duration" value={`${summary.produce.duration}s`} />
            )}
          </div>
        </div>

        <div className="detail-card">
          <h3>Consume Statistics</h3>
          <div className="detail-list">
            <DetailItem label="Total Received" value={summary.consume.total} />
            <DetailItem label="Unique Sequences" value={summary.consume.uniqueSequences} />
            <DetailItem label="Throughput" value={`${summary.consume.throughput} msg/s`} />
            {summary.consume.duration && (
              <DetailItem label="Duration" value={`${summary.consume.duration}s`} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Performance Tab
const PerformanceTab = ({ summary, analytics, COLORS }) => {
  if (!summary) return <div className="no-data">No data available</div>;

  return (
    <div className="performance-tab">
      <div className="performance-metrics">
        <div className="metric-panel">
          <h3>Throughput Metrics</h3>
          <div className="metric-grid">
            <div className="metric-item">
              <span className="metric-label">Average Produce Throughput</span>
              <span className="metric-value-large">{summary.produce.throughput} msg/s</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Average Consume Throughput</span>
              <span className="metric-value-large">{summary.consume.throughput} msg/s</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Peak Produce Throughput</span>
              <span className="metric-value-large">{summary.analysis.peakThroughput.produce} msg/s</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Peak Consume Throughput</span>
              <span className="metric-value-large">{summary.analysis.peakThroughput.consume} msg/s</span>
            </div>
          </div>
        </div>

        <div className="metric-panel">
          <h3>Latency Metrics</h3>
          <div className="metric-grid">
            <div className="metric-item">
              <span className="metric-label">Average Latency</span>
              <span className="metric-value-large">{(summary.analysis.averageLatency / 1000).toFixed(3)}s</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Latency (ms)</span>
              <span className="metric-value-large">{summary.analysis.averageLatency}ms</span>
            </div>
          </div>
        </div>

        {analytics && analytics.timeSeries && (
          <ChartPanel title="Throughput Over Time">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.timeSeries}>
                <defs>
                  <linearGradient id="lineGradient1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={COLORS[0]} stopOpacity={1} />
                    <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="lineGradient2" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={COLORS[1]} stopOpacity={1} />
                    <stop offset="100%" stopColor={COLORS[1]} stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(102, 126, 234, 0.1)" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis 
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="produce" 
                  stroke="url(#lineGradient1)" 
                  strokeWidth={3} 
                  name="Produce Throughput"
                  dot={{ fill: COLORS[0], r: 4 }}
                  activeDot={{ r: 6, stroke: COLORS[0], strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="consume" 
                  stroke="url(#lineGradient2)" 
                  strokeWidth={3} 
                  name="Consume Throughput"
                  dot={{ fill: COLORS[1], r: 4 }}
                  activeDot={{ r: 6, stroke: COLORS[1], strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}
      </div>
    </div>
  );
};

// Analytics Tab
const AnalyticsTab = ({ analytics, COLORS }) => {
  if (!analytics) return <div className="no-data">No analytics data available</div>;

  return (
    <div className="analytics-tab">
      <div className="charts-grid">
        {analytics.timeSeries && (
          <ChartPanel title="Message Flow Timeline" span={2}>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={analytics.timeSeries}>
                <defs>
                  <linearGradient id="barGradientProduce" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS[0]} stopOpacity={1} />
                    <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="barGradientConsume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS[1]} stopOpacity={1} />
                    <stop offset="100%" stopColor={COLORS[1]} stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="lineGradientTrend" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={COLORS[2]} stopOpacity={1} />
                    <stop offset="100%" stopColor={COLORS[2]} stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(102, 126, 234, 0.1)" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis 
                  yAxisId="left" 
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  stroke="var(--text-secondary)"
                  fontSize={12}
                  tickLine={false}
                />
                <Tooltip />
                <Legend />
                <Bar 
                  yAxisId="left" 
                  dataKey="produce" 
                  fill="url(#barGradientProduce)" 
                  name="Produce"
                  radius={[8, 8, 0, 0]}
                />
                <Bar 
                  yAxisId="left" 
                  dataKey="consume" 
                  fill="url(#barGradientConsume)" 
                  name="Consume"
                  radius={[8, 8, 0, 0]}
                />
                <Line 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="produce" 
                  stroke="url(#lineGradientTrend)" 
                  strokeWidth={3} 
                  name="Produce Trend"
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}

        {analytics.distributions && (
          <>
            <ChartPanel title="Produce Status Distribution">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={Object.entries(analytics.distributions.produce).map(([key, value]) => ({
                      name: key.charAt(0).toUpperCase() + key.slice(1),
                      value,
                    }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {Object.entries(analytics.distributions.produce).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Consume Status Distribution">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={Object.entries(analytics.distributions.consume).map(([key, value]) => ({
                      name: key.charAt(0).toUpperCase() + key.slice(1),
                      value,
                    }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {Object.entries(analytics.distributions.consume).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>
          </>
        )}
      </div>
    </div>
  );
};

// Sequences Tab
const SequencesTab = ({ analytics }) => {
  if (!analytics || !analytics.sequenceAnalysis) {
    return <div className="no-data">No sequence analysis available</div>;
  }

  const { sequenceAnalysis } = analytics;

  return (
    <div className="sequences-tab">
      <div className="sequence-summary">
        <div className="summary-card">
          <h3>Sequence Statistics</h3>
          <div className="sequence-metrics">
            <div className="sequence-metric">
              <span className="label">Total Produced</span>
              <span className="value">{sequenceAnalysis.totalProduced}</span>
            </div>
            <div className="sequence-metric">
              <span className="label">Total Consumed</span>
              <span className="value">{sequenceAnalysis.totalConsumed}</span>
            </div>
            <div className="sequence-metric">
              <span className="label">Missing</span>
              <span className="value error">{sequenceAnalysis.missing}</span>
            </div>
            <div className="sequence-metric">
              <span className="label">Loss Rate</span>
              <span className="value error">
                {sequenceAnalysis.totalProduced > 0
                  ? ((sequenceAnalysis.missing / sequenceAnalysis.totalProduced) * 100).toFixed(2)
                  : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {sequenceAnalysis.missing > 0 && (
        <div className="missing-sequences">
          <h3>Missing Sequence Ranges</h3>
          {sequenceAnalysis.ranges && sequenceAnalysis.ranges.length > 0 ? (
            <div className="ranges-list">
              {sequenceAnalysis.ranges.map((range, idx) => (
                <span key={idx} className="range-badge">{range}</span>
              ))}
            </div>
          ) : (
            <p className="no-missing">No missing sequences detected</p>
          )}
        </div>
      )}
    </div>
  );
};

// Chart Panel Component
const ChartPanel = ({ title, children, span = 1 }) => {
  return (
    <div className="chart-panel" style={{ gridColumn: `span ${span}` }}>
      <div className="panel-header">
        <h3>{title}</h3>
      </div>
      <div className="panel-content">
        {children}
      </div>
    </div>
  );
};

// Detail Item Component
const DetailItem = ({ label, value, color }) => {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value" style={color ? { color } : {}}>{value}</span>
    </div>
  );
};

// Jobs Tab
const JobsTab = ({ jobHistory, exportReport }) => {
  if (!jobHistory || jobHistory.length === 0) {
    return (
      <div className="no-data">
        <BarChart3 size={48} />
        <p>No job history available</p>
        <p>Run some jobs to see them here</p>
      </div>
    );
  }

  const getJobTypeIcon = (type) => {
    switch (type) {
      case 'produce': return <Zap size={18} />;
      case 'consume': return <Download size={18} />;
      case 'loadtest-producer': return <Activity size={18} />;
      case 'loadtest-consumer': return <Activity size={18} />;
      default: return <BarChart3 size={18} />;
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

  return (
    <div className="jobs-tab">
      <div className="jobs-header">
        <h3>Job History ({jobHistory.length} jobs)</h3>
      </div>
      <div className="jobs-list">
        {jobHistory.map((job) => (
          <div key={job.id} className="job-card">
            <div className="job-header">
              <div className="job-type-icon" style={{ color: getJobTypeColor(job.type) }}>
                {getJobTypeIcon(job.type)}
              </div>
              <div className="job-info">
                <h4>{job.name}</h4>
                <p className="job-type">{job.type}</p>
              </div>
              <div className="job-status">
                <span className={`status-badge status-${job.status}`}>{job.status}</span>
              </div>
            </div>
            <div className="job-details">
              <div className="job-detail-item">
                <span className="label">Started:</span>
                <span className="value">{new Date(job.startTime).toLocaleString()}</span>
              </div>
              {job.endTime && (
                <div className="job-detail-item">
                  <span className="label">Ended:</span>
                  <span className="value">{new Date(job.endTime).toLocaleString()}</span>
                </div>
              )}
              {job.stats && (
                <>
                  {job.stats.total !== undefined && (
                    <div className="job-detail-item">
                      <span className="label">Total:</span>
                      <span className="value">{job.stats.total}</span>
                    </div>
                  )}
                  {job.stats.success !== undefined && (
                    <div className="job-detail-item">
                      <span className="label">Success:</span>
                      <span className="value success">{job.stats.success}</span>
                    </div>
                  )}
                  {job.stats.failed !== undefined && (
                    <div className="job-detail-item">
                      <span className="label">Failed:</span>
                      <span className="value error">{job.stats.failed}</span>
                    </div>
                  )}
                  {job.stats.recordsPerSec !== undefined && (
                    <div className="job-detail-item">
                      <span className="label">Throughput:</span>
                      <span className="value">{job.stats.recordsPerSec?.toFixed(2) || 0} msg/s</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="job-actions-row">
              <button
                onClick={() => {
                  // Show job detail modal
                  const event = new CustomEvent('showJobDetail', { detail: job });
                  window.dispatchEvent(event);
                }}
                className="btn-view-details"
                title="View Details"
              >
                <Info size={14} />
                View Details
              </button>
              {(job.type.startsWith('loadtest') || job.stats) && (
                <button
                  onClick={() => exportReport('pdf', { summary: null, jobHistory: [job] })}
                  className="btn-download-small"
                  title="Download Report"
                >
                  <Download size={14} />
                  Download
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Performance Table Tab
const PerformanceTableTab = ({ summary, jobHistory, exportReport }) => {
  const [selectedJob, setSelectedJob] = useState(null);
  const loadTestJobs = jobHistory.filter(j => j.type.startsWith('loadtest'));

  if (loadTestJobs.length === 0) {
    return (
      <div className="no-data">
        <BarChart3 size={48} />
        <p>No performance data available</p>
        <p>Run load tests to see performance metrics</p>
      </div>
    );
  }

  // Prepare chart data for all jobs
  const throughputChartData = loadTestJobs.map(job => ({
    name: job.name.substring(0, 15),
    throughput: job.stats?.recordsPerSec || 0,
    mbps: job.stats?.mbPerSec || 0,
  }));

  const latencyChartData = loadTestJobs.map(job => ({
    name: job.name.substring(0, 15),
    p50: job.stats?.percentiles?.p50 || 0,
    p95: job.stats?.percentiles?.p95 || 0,
    p99: job.stats?.percentiles?.p99 || 0,
  }));

  return (
    <div className="performance-table-tab">
      <div className="table-header">
        <div>
          <h3>Performance Report</h3>
          <p>Comprehensive performance metrics for all load test jobs</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="performance-charts-section">
        <div className="chart-card">
          <h4>Throughput Comparison</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={throughputChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(37, 99, 235, 0.1)" />
              <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="throughput" fill="#2563eb" name="Throughput (msg/s)" />
              <Bar dataKey="mbps" fill="#10b981" name="MB/s" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h4>Latency Percentiles</h4>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={latencyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(37, 99, 235, 0.1)" />
              <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} />
              <YAxis stroke="var(--text-secondary)" fontSize={12} label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="p50" stroke="#3b82f6" strokeWidth={2} name="P50" />
              <Line type="monotone" dataKey="p95" stroke="#10b981" strokeWidth={2} name="P95" />
              <Line type="monotone" dataKey="p99" stroke="#f59e0b" strokeWidth={2} name="P99" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="table-container">
        <table className="performance-table">
          <thead>
            <tr>
              <th>Job Name</th>
              <th>Type</th>
              <th>Throughput (msg/s)</th>
              <th>MB/s</th>
              <th>P50 Latency</th>
              <th>P95 Latency</th>
              <th>P99 Latency</th>
              <th>Total Records</th>
              <th>Success Rate</th>
              <th>Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadTestJobs.map((job) => {
              const duration = job.endTime && job.startTime 
                ? Math.round((new Date(job.endTime) - new Date(job.startTime)) / 1000)
                : 'Running';
              const successRate = job.stats?.totalRecords && job.stats?.successRecords
                ? ((job.stats.successRecords / job.stats.totalRecords) * 100).toFixed(2)
                : job.stats?.totalRecords
                ? '100.00'
                : 'N/A';
              
              return (
                <tr 
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="job-row-clickable"
                  title="Click to view details"
                >
                  <td className="job-name-cell">{job.name}</td>
                  <td>
                    <span className={`type-badge type-${job.type.replace('loadtest-', '')}`}>
                      {job.type.replace('loadtest-', '').toUpperCase()}
                    </span>
                  </td>
                  <td className="metric-cell">{job.stats?.recordsPerSec?.toFixed(2) || 'N/A'}</td>
                  <td className="metric-cell">{job.stats?.mbPerSec?.toFixed(2) || 'N/A'}</td>
                  <td className="metric-cell">{job.stats?.percentiles?.p50?.toFixed(2) || 'N/A'} ms</td>
                  <td className="metric-cell">{job.stats?.percentiles?.p95?.toFixed(2) || 'N/A'} ms</td>
                  <td className="metric-cell">{job.stats?.percentiles?.p99?.toFixed(2) || 'N/A'} ms</td>
                  <td className="metric-cell">{job.stats?.totalRecords || 'N/A'}</td>
                  <td className="metric-cell">{successRate}{successRate !== 'N/A' ? '%' : ''}</td>
                  <td>{duration}{typeof duration === 'number' ? 's' : ''}</td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportReport('pdf', { summary, jobHistory: [job] });
                      }}
                      className="btn-download-small"
                      title="Download PDF Report"
                    >
                      <Download size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} exportReport={exportReport} />
      )}
    </div>
  );
};

// Job Detail Modal Component
const JobDetailModal = ({ job, onClose, exportReport }) => {
  const [topicInfo, setTopicInfo] = useState(null);
  const [loadingTopic, setLoadingTopic] = useState(false);

  useEffect(() => {
    if (job?.config?.topic) {
      loadTopicInfo(job.config.topic);
    }
  }, [job?.config?.topic]);

  const loadTopicInfo = async (topicName) => {
    try {
      setLoadingTopic(true);
      const res = await axios.get(`/api/kafka/topic/${topicName}/describe`);
      if (res.data.success) {
        setTopicInfo(res.data.topic);
      }
    } catch (error) {
      console.error('Error loading topic info:', error);
    } finally {
      setLoadingTopic(false);
    }
  };

  if (!job) return null;

  // Prepare chart data from job stats
  const throughputHistory = job.stats?.throughputHistory || [];
  const latencyData = job.stats?.percentiles ? [{
    name: 'Latency',
    p50: job.stats.percentiles.p50 || 0,
    p95: job.stats.percentiles.p95 || 0,
    p99: job.stats.percentiles.p99 || 0,
  }] : [];

  return (
    <div className="job-detail-modal-overlay" onClick={onClose}>
      <div className="job-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{job.name}</h2>
            <p className="modal-subtitle">
              {job.type?.replace('loadtest-', '').toUpperCase()} • 
              {job.config?.topic ? ` Topic: ${job.config.topic}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => exportReport('pdf', { summary: null, jobHistory: [job] })}
              className="btn-primary"
            >
              <Download size={16} />
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="modal-close-btn"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-content">
          {/* Topic Information Section */}
          {topicInfo && (
            <div className="profile-section">
              <h3>Topic Information</h3>
              <div className="profile-grid">
                <div className="profile-item">
                  <span className="profile-label">Topic Name:</span>
                  <span className="profile-value">{topicInfo.name}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Partitions:</span>
                  <span className="profile-value">{topicInfo.partitions}</span>
                </div>
                <div className="profile-item">
                  <span className="profile-label">Replication Factor:</span>
                  <span className="profile-value">{topicInfo.replicationFactor}</span>
                </div>
                {topicInfo.configs && Object.entries(topicInfo.configs).map(([key, value]) => {
                  if (!value || key.includes('password') || key.includes('secret')) return null;
                  const displayKey = key.replace(/\./g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                  return (
                    <div key={key} className="profile-item">
                      <span className="profile-label">{displayKey}:</span>
                      <span className="profile-value">{String(value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Test Profile Section */}
          <div className="profile-section">
            <h3>Test Profile</h3>
            <div className="profile-grid">
              {Object.entries(job.config || {}).map(([key, value]) => {
                if (value === null || value === undefined) return null;
                const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return (
                  <div key={key} className="profile-item">
                    <span className="profile-label">{displayKey}:</span>
                    <span className="profile-value">{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Throughput</div>
              <div className="stat-value">
                {job.stats?.recordsPerSec?.toFixed(2) || '0.00'} msg/s
              </div>
              <div className="stat-detail">
                {job.stats?.mbPerSec?.toFixed(2) || '0.00'} MB/s
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Records</div>
              <div className="stat-value">
                {job.stats?.totalRecords || job.stats?.successRecords || 0}
              </div>
              <div className="stat-detail">
                {job.stats?.failedRecords ? `${job.stats.failedRecords} failed` : '100% success'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">P50 Latency</div>
              <div className="stat-value">
                {job.stats?.percentiles?.p50?.toFixed(2) || 'N/A'} ms
              </div>
              <div className="stat-detail">Median</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">P95 Latency</div>
              <div className="stat-value">
                {job.stats?.percentiles?.p95?.toFixed(2) || 'N/A'} ms
              </div>
              <div className="stat-detail">95th percentile</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">P99 Latency</div>
              <div className="stat-value">
                {job.stats?.percentiles?.p99?.toFixed(2) || 'N/A'} ms
              </div>
              <div className="stat-detail">99th percentile</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Duration</div>
              <div className="stat-value">
                {job.endTime && job.startTime
                  ? Math.round((new Date(job.endTime) - new Date(job.startTime).getTime()) / 1000)
                  : 'Running'}s
              </div>
              <div className="stat-detail">Total time</div>
            </div>
          </div>

          {/* Throughput History Chart */}
          {throughputHistory.length > 0 && (
            <div className="chart-section">
              <h3>Throughput Over Time</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={throughputHistory.map(h => ({
                  time: new Date(h.timestamp).toLocaleTimeString(),
                  throughput: h.recordsPerSec || 0,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(37, 99, 235, 0.1)" />
                  <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={12} />
                  <YAxis stroke="var(--text-secondary)" fontSize={12} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'var(--surface-elevated)',
                      border: '1px solid rgba(37, 99, 235, 0.2)',
                      borderRadius: '8px',
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="throughput" 
                    stroke="#2563eb" 
                    fill="#2563eb" 
                    fillOpacity={0.3}
                    name="Throughput (msg/s)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Latency Percentiles Chart */}
          {latencyData.length > 0 && (
            <div className="chart-section">
              <h3>Latency Percentiles</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={latencyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(37, 99, 235, 0.1)" />
                  <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} />
                  <YAxis stroke="var(--text-secondary)" fontSize={12} label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'var(--surface-elevated)',
                      border: '1px solid rgba(37, 99, 235, 0.2)',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="p50" fill="#3b82f6" name="P50" />
                  <Bar dataKey="p95" fill="#10b981" name="P95" />
                  <Bar dataKey="p99" fill="#f59e0b" name="P99" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Load Test Tab
const LoadTestTab = ({ summary, jobHistory, COLORS, exportReport }) => {
  const loadTestJobs = jobHistory.filter(j => j.type.startsWith('loadtest'));

  if (!summary?.loadTest && loadTestJobs.length === 0) {
    return (
      <div className="no-data">
        <Activity size={48} />
        <p>No load test reports available</p>
        <p>Run load tests to see reports here</p>
      </div>
    );
  }

  return (
    <div className="loadtest-tab">
      {summary?.loadTest && (
        <div className="loadtest-summary">
          <h3>Load Test Summary</h3>
          <div className="loadtest-summary-grid">
            {summary.loadTest.producer && (
              <div className="loadtest-summary-card">
                <h4>Producer Load Tests</h4>
                <div className="summary-metrics">
                  <div className="metric-item">
                    <span className="label">Total Jobs:</span>
                    <span className="value">{summary.loadTest.producer.totalJobs}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Avg Throughput:</span>
                    <span className="value">{summary.loadTest.producer.avgThroughput?.toFixed(2) || 0} msg/s</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Avg Latency:</span>
                    <span className="value">{summary.loadTest.producer.avgLatency?.toFixed(2) || 0} ms</span>
                  </div>
                </div>
              </div>
            )}
            {summary.loadTest.consumer && (
              <div className="loadtest-summary-card">
                <h4>Consumer Load Tests</h4>
                <div className="summary-metrics">
                  <div className="metric-item">
                    <span className="label">Total Jobs:</span>
                    <span className="value">{summary.loadTest.consumer.totalJobs}</span>
                  </div>
                  <div className="metric-item">
                    <span className="label">Avg Throughput:</span>
                    <span className="value">{summary.loadTest.consumer.avgThroughput?.toFixed(2) || 0} msg/s</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {loadTestJobs.length > 0 && (
        <div className="loadtest-jobs">
          <h3>Load Test Job Details</h3>
          <div className="loadtest-jobs-list">
            {loadTestJobs.map((job) => (
              <div key={job.id} className="loadtest-job-card">
                <div className="loadtest-job-header">
                  <h4>{job.name}</h4>
                  <span className="job-type-badge">{job.type}</span>
                </div>
                <div className="loadtest-job-metrics">
                  {job.stats?.recordsPerSec && (
                    <div className="metric-box">
                      <span className="metric-label">Throughput</span>
                      <span className="metric-value">{job.stats.recordsPerSec.toFixed(2)} msg/s</span>
                    </div>
                  )}
                  {job.stats?.mbPerSec && (
                    <div className="metric-box">
                      <span className="metric-label">MB/s</span>
                      <span className="metric-value">{job.stats.mbPerSec.toFixed(2)}</span>
                    </div>
                  )}
                  {job.stats?.percentiles && (
                    <>
                      <div className="metric-box">
                        <span className="metric-label">P50 Latency</span>
                        <span className="metric-value">{job.stats.percentiles.p50?.toFixed(2) || 0} ms</span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-label">P95 Latency</span>
                        <span className="metric-value">{job.stats.percentiles.p95?.toFixed(2) || 0} ms</span>
                      </div>
                      <div className="metric-box">
                        <span className="metric-label">P99 Latency</span>
                        <span className="metric-value">{job.stats.percentiles.p99?.toFixed(2) || 0} ms</span>
                      </div>
                    </>
                  )}
                  {job.stats?.totalRecords && (
                    <div className="metric-box">
                      <span className="metric-label">Total Records</span>
                      <span className="metric-value">{job.stats.totalRecords}</span>
                    </div>
                  )}
                </div>
                <div className="loadtest-job-time">
                  <span>{new Date(job.startTime).toLocaleString()}</span>
                  {job.endTime && (
                    <>
                      <span> → </span>
                      <span>{new Date(job.endTime).toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
