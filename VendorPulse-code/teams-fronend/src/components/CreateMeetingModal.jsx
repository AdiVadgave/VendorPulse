import { useState } from 'react';
import { teamsApi } from '../api/teamsApi';

export default function CreateMeetingModal({ currentUser, users, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', agenda: '',
    date: '', startTime: '10:00', endTime: '11:00',
    participantIds: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const others = users.filter(u => u.userId !== currentUser.userId);

  const toggleP = id => setForm(p => ({
    ...p,
    participantIds: p.participantIds.includes(id)
      ? p.participantIds.filter(x => x !== id)
      : [...p.participantIds, id]
  }));

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!form.title.trim())          return setError('Meeting title is required.');
    if (!form.date)                  return setError('Please select a date.');
    if (!form.participantIds.length) return setError('Select at least one participant.');

    setLoading(true);
    try {
      await teamsApi.createMeeting({
        title:          form.title.trim(),
        description:    form.description.trim(),
        agenda:         form.agenda.trim(),
        organizerId:    currentUser.userId,
        participantIds: form.participantIds,
        timeSlot: { date: form.date, startTime: form.startTime, endTime: form.endTime }
      });
      onCreated();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] flex flex-col rounded-lg shadow-2xl border border-[#e8e8e8]">

        {/* ── Header — Teams dialog style ── */}
        <div className="px-5 py-4 border-b border-[#e8e8e8] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[#242424]">New meeting</h2>
            <p className="text-xs text-[#616161] mt-0.5">Organizer: {currentUser.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[#616161] hover:text-[#242424] hover:bg-[#f5f5f5] rounded transition-colors text-lg">
            ×
          </button>
        </div>

        {/* ── Form body ── */}
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-[#424242] mb-1 uppercase tracking-wide">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Meeting title"
              className="w-full border border-[#d1d1d1] rounded-sm px-3 py-2 text-sm text-[#242424] placeholder-[#a0a0a0] focus:outline-none focus:border-[#6264A7] focus:ring-1 focus:ring-[#6264A7]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[#424242] mb-1 uppercase tracking-wide">Details</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Add a description"
              rows={2}
              className="w-full border border-[#d1d1d1] rounded-sm px-3 py-2 text-sm text-[#242424] placeholder-[#a0a0a0] focus:outline-none focus:border-[#6264A7] focus:ring-1 focus:ring-[#6264A7] resize-none"
            />
          </div>

          {/* Date & Time */}
          <div>
            <label className="block text-xs font-semibold text-[#424242] mb-1 uppercase tracking-wide">
              Date & time <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="col-span-1 border border-[#d1d1d1] rounded-sm px-3 py-2 text-sm text-[#242424] focus:outline-none focus:border-[#6264A7] focus:ring-1 focus:ring-[#6264A7]"
              />
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))}
                className="border border-[#d1d1d1] rounded-sm px-3 py-2 text-sm text-[#242424] focus:outline-none focus:border-[#6264A7] focus:ring-1 focus:ring-[#6264A7]"
              />
              <input
                type="time"
                value={form.endTime}
                onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))}
                className="border border-[#d1d1d1] rounded-sm px-3 py-2 text-sm text-[#242424] focus:outline-none focus:border-[#6264A7] focus:ring-1 focus:ring-[#6264A7]"
              />
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="block text-xs font-semibold text-[#424242] mb-1 uppercase tracking-wide">
              Invite people <span className="text-red-500">*</span>
              <span className="text-[#a0a0a0] font-normal normal-case ml-1">({form.participantIds.length} selected)</span>
            </label>
            <div className="border border-[#d1d1d1] rounded-sm overflow-hidden divide-y divide-[#f5f5f5]">
              {others.map(user => {
                const checked = form.participantIds.includes(user.userId);
                return (
                  <label
                    key={user.userId}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-[#E8EDFF]' : 'hover:bg-[#F5F5FF]'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleP(user.userId)}
                      className="rounded border-[#d1d1d1] text-[#6264A7] focus:ring-[#6264A7] w-4 h-4"
                    />
                    <div className="w-7 h-7 bg-[#6264A7] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {user.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#242424]">{user.name}</p>
                      <p className="text-xs text-[#616161] truncate">{user.role} · {user.email}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </form>

        {/* ── Footer — Teams dialog buttons ── */}
        <div className="px-5 py-4 border-t border-[#e8e8e8] flex gap-2 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[#d1d1d1] text-[#424242] text-sm font-medium rounded-sm hover:bg-[#f5f5f5] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="px-4 py-2 bg-[#6264A7] hover:bg-[#5558A7] disabled:opacity-50 text-white text-sm font-medium rounded-sm transition-colors"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
