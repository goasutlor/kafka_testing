# Setup Instructions

## Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Kafka cluster (local or remote)

## Installation Steps

1. **Install all dependencies:**
   ```bash
   npm run install-all
   ```
   This will install dependencies for both the server and client.

2. **Start the application:**
   ```bash
   npm run dev
   ```
   This starts both the backend server (port 5000) and frontend React app (port 3000).

   Or start them separately:
   ```bash
   # Terminal 1 - Backend
   npm run server

   # Terminal 2 - Frontend
   npm run client
   ```

3. **Access the application:**
   - Open your browser and navigate to `http://localhost:3000`
   - The app will automatically connect to the backend on port 5000

## Configuration

### Kafka Connection
1. Navigate to "KAFKA CONNECTION" in the sidebar
2. Enter your Kafka broker addresses (comma-separated)
3. Configure authentication if needed:
   - SASL: Enable and enter username/password
   - API Key: Enable and enter key/secret
4. Click "Connect" to test the connection

### Produce Messages
1. Navigate to "PRODUCE APP"
2. Enter topic name
3. Configure message (optional if using accumulation)
4. Enable accumulation if you want sequential messages (TEST01, TEST02, etc.)
5. Set start/end range and interval
6. Click "Start Job"

### Consume Messages
1. Navigate to "CONSUME APP"
2. Enter topic name
3. Optionally set consumer group ID
4. Click "Start Job"
5. After stopping, click "Check Missing Sequences" to see gaps

### View Reports
1. Navigate to "REPORTS"
2. View comprehensive statistics and charts
3. Compare produce vs consume metrics

## Troubleshooting

### WebSocket Connection Issues
- Ensure the backend server is running on port 5000
- Check browser console for WebSocket errors
- The app will automatically attempt to reconnect

### Kafka Connection Issues
- Verify broker addresses are correct
- Check network connectivity
- Verify authentication credentials
- Ensure Kafka cluster is accessible

### Port Conflicts
- Backend default port: 5000 (change in `server/index.js`)
- Frontend default port: 3000 (React default)
- Modify ports if needed in respective configuration files

