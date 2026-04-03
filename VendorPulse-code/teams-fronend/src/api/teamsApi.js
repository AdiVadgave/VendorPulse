const BASE_URL = 'http://localhost:3001/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const teamsApi = {
  // --- Users ---
  getUsers: () =>
    request('/users'),

  getUser: (userId) =>
    request(`/users/${userId}`),

  createUser: (userData) =>
    request('/users', { method: 'POST', body: userData }),

  getUserAvailability: (userId) =>
    request(`/users/${userId}/availability`),

  updateUserAvailability: (userId, date, slots) =>
    request(`/users/${userId}/availability`, { method: 'PUT', body: { date, slots } }),

  getUserMeetings: (userId) =>
    request(`/users/${userId}/meetings`),

  // --- Meetings ---
  getMeetings: () =>
    request('/meetings'),

  getMeeting: (meetingId) =>
    request(`/meetings/${meetingId}`),

  createMeeting: (meetingData) =>
    request('/meetings', { method: 'POST', body: meetingData }),

  respondToMeeting: (meetingId, userId, status) =>
    request(`/meetings/${meetingId}/respond`, { method: 'PUT', body: { userId, status } }),

  cancelMeeting: (meetingId, organizerId) =>
    request(`/meetings/${meetingId}`, { method: 'DELETE', body: { organizerId } }),

  nudgeMeeting: (meetingId, userId, message) =>
    request(`/meetings/${meetingId}/nudge`, { method: 'POST', body: { userId, message } }),

  getMeetingNudges: (meetingId) =>
    request(`/meetings/${meetingId}/nudges`),
};
