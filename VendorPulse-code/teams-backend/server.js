const express = require('express');
const cors = require('cors');
const usersRouter = require('./routes/users');
const meetingsRouter = require('./routes/meetings');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/users', usersRouter);
app.use('/api/meetings', meetingsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mock-teams-backend',
    version: '1.0.0',
    description: 'VendorPulse mock collaboration backend',
    timestamp: new Date().toISOString(),
    endpoints: {
      users: 'GET|POST /api/users',
      userById: 'GET /api/users/:userId',
      availability: 'GET|PUT /api/users/:userId/availability',
      userMeetings: 'GET /api/users/:userId/meetings',
      meetings: 'GET|POST /api/meetings',
      meetingById: 'GET /api/meetings/:meetingId',
      respond: 'PUT /api/meetings/:meetingId/respond',
      cancel: 'DELETE /api/meetings/:meetingId'
    }
  });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Mock Teams Backend running at http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  console.log(`👥 Users API:    http://localhost:${PORT}/api/users`);
  console.log(`📅 Meetings API: http://localhost:${PORT}/api/meetings\n`);
});
