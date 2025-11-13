# Kafka Test Application

A lightweight web application for testing Kafka produce and consume operations with real-time monitoring, logging, and comprehensive reporting.

## Features

### 1. Kafka Connection Management
- Connect to Kafka clusters with SASL or API Key authentication
- Test connectivity and view available topics
- All configuration through intuitive UI

### 2. Produce App
- Configure messages and topics
- Support for message accumulation (e.g., TEST01, TEST02, ...)
- Configurable start/end ranges and intervals
- Real-time logging with success/failure tracking
- Start/Stop job control
- Export logs functionality

### 3. Consume App
- Subscribe to topics and consume messages
- Store and display consumed events
- Real-time event listing with timestamps
- Missing sequence detection and reporting
- Gap analysis showing missing event ranges
- Start/Stop job control

### 4. Reports & Analytics
- Comprehensive statistics dashboard
- Time series charts for produce/consume operations
- Status distribution charts
- Comparison between produce and consume metrics
- Beautiful visualizations

## Installation

1. Install dependencies:
```bash
npm run install-all
```

2. Start the application:
```bash
npm run dev
```

This will start:
- Backend server on `http://localhost:5000`
- Frontend React app on `http://localhost:3000`

## Usage

1. **Connect to Kafka**: Navigate to the Kafka Connection page and configure your cluster settings
2. **Produce Messages**: Go to Produce App, configure your topic and message settings, then start the job
3. **Consume Messages**: Go to Consume App, configure your topic, then start consuming
4. **View Reports**: Check the Reports page for comprehensive analytics

## Technology Stack

- **Backend**: Node.js, Express, KafkaJS
- **Frontend**: React, React Router
- **Charts**: Recharts
- **Real-time**: WebSockets
- **Icons**: Lucide React

## Project Structure

```
kafka_test/
├── server/
│   ├── index.js          # Main server file
│   └── routes/
│       ├── kafka.js      # Kafka connection routes
│       ├── produce.js    # Produce job routes
│       ├── consume.js    # Consume job routes
│       └── reports.js    # Report routes
├── client/
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   └── pages/        # Page components
│   └── public/
└── package.json
```

## License

MIT

