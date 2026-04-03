const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { read, write } = require('../utils/fileDb');

const router = express.Router();

// GET /api/users — list all users (no availability for brevity)
router.get('/', (req, res) => {
  const users = read('users.json');
  res.json({ users });
});

// GET /api/users/:userId — get single user by ID
router.get('/:userId', (req, res) => {
  const users = read('users.json');
  const user = users.find(u => u.userId === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// POST /api/users — create a new user
router.post('/', (req, res) => {
  const { name, email, role } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }

  const users = read('users.json');

  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const newUser = {
    userId: `u${uuidv4().replace(/-/g, '').slice(0, 8)}`,
    name,
    email,
    role: role || 'Member',
    avatar: initials,
    availability: [],
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  write('users.json', users);

  res.status(201).json({ user: newUser, message: 'User created successfully' });
});

// GET /api/users/:userId/availability — get availability slots
router.get('/:userId/availability', (req, res) => {
  const users = read('users.json');
  const user = users.find(u => u.userId === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    userId: user.userId,
    name: user.name,
    availability: user.availability
  });
});

// PUT /api/users/:userId/availability — set/update slots for a specific date
router.put('/:userId/availability', (req, res) => {
  const { date, slots } = req.body;

  if (!date || !Array.isArray(slots)) {
    return res.status(400).json({ error: 'date (string YYYY-MM-DD) and slots (string[]) are required' });
  }

  const users = read('users.json');
  const idx = users.findIndex(u => u.userId === req.params.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const existingIdx = users[idx].availability.findIndex(a => a.date === date);
  if (existingIdx >= 0) {
    users[idx].availability[existingIdx].slots = slots;
  } else {
    users[idx].availability.push({ date, slots });
  }

  write('users.json', users);
  res.json({
    userId: users[idx].userId,
    availability: users[idx].availability
  });
});

// GET /api/users/:userId/meetings — get all meetings involving this user
router.get('/:userId/meetings', (req, res) => {
  const meetings = read('meetings.json');
  const userMeetings = meetings.filter(
    m =>
      m.organizerId === req.params.userId ||
      m.participants.some(p => p.userId === req.params.userId)
  );
  res.json({ meetings: userMeetings });
});

module.exports = router;
