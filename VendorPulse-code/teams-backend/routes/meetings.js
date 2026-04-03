const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { read, write } = require('../utils/fileDb');

const router = express.Router();

// GET /api/meetings — list all meetings
router.get('/', (req, res) => {
  const meetings = read('meetings.json');
  res.json({ meetings });
});

// GET /api/meetings/:meetingId — get single meeting
router.get('/:meetingId', (req, res) => {
  const meetings = read('meetings.json');
  const meeting = meetings.find(m => m.meetingId === req.params.meetingId);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  res.json({ meeting });
});

// POST /api/meetings — create a meeting / send invites
router.post('/', (req, res) => {
  const { title, description, agenda, organizerId, participantIds, timeSlot } = req.body;

  if (!title || !organizerId || !Array.isArray(participantIds) || !timeSlot) {
    return res.status(400).json({
      error: 'title, organizerId, participantIds (array), and timeSlot are required'
    });
  }

  if (!timeSlot.date || !timeSlot.startTime || !timeSlot.endTime) {
    return res.status(400).json({
      error: 'timeSlot must include date (YYYY-MM-DD), startTime (HH:MM), and endTime (HH:MM)'
    });
  }

  const users = read('users.json');
  if (!users.find(u => u.userId === organizerId)) {
    return res.status(404).json({ error: 'Organizer not found' });
  }

  const invalidParticipants = participantIds.filter(id => !users.find(u => u.userId === id));
  if (invalidParticipants.length > 0) {
    return res.status(404).json({ error: `Participants not found: ${invalidParticipants.join(', ')}` });
  }

  const newMeeting = {
    meetingId: `m${uuidv4().replace(/-/g, '').slice(0, 8)}`,
    title,
    description: description || '',
    agenda: agenda || '',
    organizerId,
    participants: participantIds.map(uid => ({ userId: uid, status: 'pending' })),
    timeSlot,
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };

  const meetings = read('meetings.json');
  meetings.push(newMeeting);
  write('meetings.json', meetings);

  res.status(201).json({ meeting: newMeeting, message: 'Meeting invite sent successfully' });
});

// PUT /api/meetings/:meetingId/respond — accept or decline an invite
router.put('/:meetingId/respond', (req, res) => {
  const { userId, status } = req.body;

  if (!userId || !['accepted', 'declined'].includes(status)) {
    return res.status(400).json({
      error: 'userId and status ("accepted" or "declined") are required'
    });
  }

  const meetings = read('meetings.json');
  const idx = meetings.findIndex(m => m.meetingId === req.params.meetingId);
  if (idx === -1) return res.status(404).json({ error: 'Meeting not found' });

  const participantIdx = meetings[idx].participants.findIndex(p => p.userId === userId);
  if (participantIdx === -1) {
    return res.status(403).json({ error: 'User is not a participant in this meeting' });
  }

  meetings[idx].participants[participantIdx].status = status;
  meetings[idx].participants[participantIdx].respondedAt = new Date().toISOString();

  write('meetings.json', meetings);
  res.json({ meeting: meetings[idx], message: `Meeting ${status} successfully` });
});

// POST /api/meetings/:meetingId/nudge — send a reminder nudge to a participant
router.post('/:meetingId/nudge', (req, res) => {
  const { userId, message } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const meetings = read('meetings.json');
  const idx = meetings.findIndex(m => m.meetingId === req.params.meetingId);
  if (idx === -1) return res.status(404).json({ error: 'Meeting not found' });

  if (!meetings[idx].nudges) meetings[idx].nudges = [];
  meetings[idx].nudges.push({
    userId,
    message: message || 'Please respond to your meeting invitation.',
    sentAt: new Date().toISOString(),
  });

  write('meetings.json', meetings);
  res.json({ message: 'Nudge sent successfully', meeting: meetings[idx] });
});

// GET /api/meetings/:meetingId/nudges — get all nudges for a meeting
router.get('/:meetingId/nudges', (req, res) => {
  const meetings = read('meetings.json');
  const meeting = meetings.find(m => m.meetingId === req.params.meetingId);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  res.json({ nudges: meeting.nudges || [] });
});

// DELETE /api/meetings/:meetingId — cancel a meeting (organizer only)
router.delete('/:meetingId', (req, res) => {
  const { organizerId } = req.body;

  const meetings = read('meetings.json');
  const idx = meetings.findIndex(m => m.meetingId === req.params.meetingId);
  if (idx === -1) return res.status(404).json({ error: 'Meeting not found' });

  if (meetings[idx].organizerId !== organizerId) {
    return res.status(403).json({ error: 'Only the organizer can cancel this meeting' });
  }

  meetings[idx].status = 'cancelled';
  write('meetings.json', meetings);

  res.json({ message: 'Meeting cancelled successfully', meeting: meetings[idx] });
});

module.exports = router;
