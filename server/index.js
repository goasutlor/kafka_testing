const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const kafkaRoutes = require('./routes/kafka');
const produceRoutes = require('./routes/produce');
const consumeRoutes = require('./routes/consume');
const reportRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth');
const loadTestRoutes = require('./routes/loadtest');
const loadTestProfilesRoutes = require('./routes/loadtest-profiles');
const jobHistoryRoutes = require('./routes/jobHistory');
const jobManagerRoutes = require('./routes/jobManager');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// WebSocket server - must be created before routes to avoid redirect issues
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrade requests before Express routes
server.on('upgrade', (request, socket, head) => {
  // Check if this is a WebSocket upgrade request
  if (request.headers.upgrade === 'websocket') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket connection handler
const clients = new Set();
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');
  clients.add(ws);
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  // Send welcome message
  ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));
});

// Broadcast function for real-time updates
global.broadcast = (data) => {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/kafka', kafkaRoutes);
app.use('/api/produce', produceRoutes);
app.use('/api/consume', consumeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/loadtest', loadTestRoutes);
app.use('/api/loadtest/profiles', loadTestProfilesRoutes);
app.use('/api/jobs', jobHistoryRoutes);
app.use('/api/jobs', jobManagerRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

