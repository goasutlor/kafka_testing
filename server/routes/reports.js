const express = require('express');
const router = express.Router();
const produceRoutes = require('./produce');
const consumeRoutes = require('./consume');

// Get combined report
router.get('/summary', async (req, res) => {
  try {
    // This would need access to the internal state
    // For now, we'll create a simple endpoint that clients can call
    res.json({ 
      message: 'Use /api/produce/stats and /api/consume/stats for detailed reports' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;

