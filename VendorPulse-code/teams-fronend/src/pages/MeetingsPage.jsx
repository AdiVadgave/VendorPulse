import { useState, useEffect, useCallback } from 'react';
import { teamsApi } from '../api/teamsApi';
import CreateMeetingModal from '../components/CreateMeetingModal';

const BellIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const PALETTE = ['#7B83EB', '#40B4E5', '#E8A838', '#13A10E', '#C239B3'];
const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'upcoming',  label: 'Upcoming' },
  { id: 'pending',   label: 'Pending' },
  { id: 'organized', label: 'Organized by me' },
  { id: 'past',      label: 'Past' },
];

function groupByDate(meetings) {
  const map = {};
  meetings.forEach(m => {
    const key = m.timeSlot.date;
    if (!map[key]) map[key] = [];
    map[key].push(m);
  });
  return Object.entries(map).sort(([a], [b]) => new Date(b) - new Date(a));
}

function formatGroupDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d - today) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function MeetingsPage({ activeUser, users }) {
  const [meetings, setMeetings] = useState([]);
  const [nudgedMeetingIds, setNudgedMeetingIds] = useState(new Set());
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('upcoming');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(() => {
    teamsApi.getUserMeetings(activeUser.userId).then(async d => {
      const loaded = d.meetings || [];
      setMeetings(loaded);
      // Check for nudges on all meetings
      const nudged = new Set();
      await Promise.all(
        loaded.map(async m => {
          try {
            const r = await teamsApi.getMeetingNudges(m.meetingId);
            if ((r.nudges || []).some(n => n.userId === activeUser.userId)) nudged.add(m.meetingId);
          } catch { /* ignore */ }
        })
      );
      setNudgedMeetingIds(nudged);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeUser.userId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Poll every 8 seconds for live RSVP updates from VendorPulse
  useEffect(() => {
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  const handleRespond = async (meetingId, status) => {
    await teamsApi.respondToMeeting(meetingId, activeUser.userId, status);
    load();
  };

  const today = new Date().toDateString();

  const filtered = meetings.filter(m => {
    const past      = new Date(m.timeSlot.date) < new Date(today);
    const myStatus  = m.participants.find(p => p.userId === activeUser.userId)?.status;
    const isOrg     = m.organizerId === activeUser.userId;
    switch (tab) {
      case 'upcoming':  return !past;
      case 'pending':   return myStatus === 'pending' && !isOrg;
      case 'organized': return isOrg;
      case 'past':      return past;
      default:          return true;
    }
  });

  const pendingCount = meetings.filter(
    m => m.organizerId !== activeUser.userId &&
         m.participants.find(p => p.userId === activeUser.userId)?.status === 'pending'
  ).length;

  const grouped = groupByDate(filtered);

  return (
    <div className="h-full overflow-y-auto bg-[#f5f5f5]">
      <div className="max-w-3xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-[#242424]">Meetings</h1>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-[#6264A7] hover:bg-[#5558A7] text-white text-sm font-medium px-3 py-2 rounded-sm transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New meeting
          </button>
        </div>

        {/* Tabs — Teams pill style */}
        <div className="flex gap-0.5 mb-5 bg-white border border-[#e8e8e8] rounded-sm p-0.5 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.id ? 'bg-[#6264A7] text-white' : 'text-[#616161] hover:text-[#242424] hover:bg-[#f5f5f5]'
              }`}
            >
              {t.label}
              {t.id === 'pending' && pendingCount > 0 && (
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${tab === 'pending' ? 'bg-white text-[#6264A7]' : 'bg-[#E8A838] text-white'}`}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#6264A7] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-lg border border-[#e8e8e8] p-12 text-center">
            <p className="text-[#a0a0a0] text-sm">No meetings in this view</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([dateStr, dayMeetings], gIdx) => (
              <div key={dateStr}>
                <p className="text-xs font-semibold text-[#616161] uppercase tracking-wider mb-2 px-1">
                  {formatGroupDate(dateStr)}
                </p>
                <div className="bg-white rounded-lg border border-[#e8e8e8] shadow-sm overflow-hidden">
                  {dayMeetings.map((m, mIdx) => {
                    const color    = PALETTE[(gIdx + mIdx) % PALETTE.length];
                    const isOrg    = m.organizerId === activeUser.userId;
                    const myStatus = m.participants.find(p => p.userId === activeUser.userId)?.status;
                    const org      = users.find(u => u.userId === m.organizerId);
                    const accepted = m.participants.filter(p => p.status === 'accepted').length;
                    const isPending = !isOrg && myStatus === 'pending';

                    const hasNudge = nudgedMeetingIds.has(m.meetingId);

                    return (
                      <div key={m.meetingId} className={`flex gap-4 px-4 py-3 border-b border-[#f5f5f5] last:border-b-0 hover:bg-[#F8F8FF] transition-colors ${isPending ? 'bg-[#FFFDF5]' : ''}`}>
                        {/* Color bar */}
                        <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: color }} />

                        {/* Time */}
                        <div className="w-20 shrink-0 pt-0.5">
                          <p className="text-xs font-semibold text-[#424242]">{m.timeSlot.startTime}</p>
                          <p className="text-xs text-[#a0a0a0]">{m.timeSlot.endTime}</p>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-[#242424] truncate">{m.title}</p>
                            {hasNudge && myStatus === 'pending' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#FFF4CE] text-[#D08300] text-[10px] font-semibold rounded-full border border-[#E8A838]/40 shrink-0">
                                <BellIcon /> Reminder
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#616161] mt-0.5">
                            {isOrg ? 'You organized' : `${org?.name}`} · {accepted}/{m.participants.length} accepted
                          </p>
                          {m.description && (
                            <p className="text-xs text-[#a0a0a0] mt-0.5 truncate">{m.description}</p>
                          )}

                          {/* Avatars */}
                          <div className="flex items-center gap-1 mt-2">
                            {m.participants.map(p => {
                              const u = users.find(x => x.userId === p.userId);
                              if (!u) return null;
                              const ring = p.status === 'accepted' ? 'ring-[#13A10E]' : p.status === 'declined' ? 'ring-red-400' : 'ring-[#E8A838]';
                              return (
                                <div key={p.userId} title={`${u.name} — ${p.status}`}
                                  className={`w-5 h-5 bg-[#6264A7] rounded-full flex items-center justify-center text-white text-[9px] font-bold ring-1 ${ring}`}
                                >
                                  {u.avatar}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Status + actions */}
                        <div className="flex flex-col items-end gap-2 shrink-0 pt-0.5">
                          {isOrg ? (
                            <span className="text-xs bg-[#E8EDFF] text-[#6264A7] px-2 py-0.5 rounded-full font-medium">Organizer</span>
                          ) : myStatus === 'accepted' ? (
                            <span className="text-xs text-[#13A10E] font-medium">✓ Accepted</span>
                          ) : myStatus === 'declined' ? (
                            <span className="text-xs text-red-500 font-medium">✗ Declined</span>
                          ) : myStatus === 'pending' ? (
                            <span className="text-xs bg-[#FFF4CE] text-[#D08300] px-2 py-0.5 rounded-full font-medium">Pending</span>
                          ) : null}

                          {isPending && (
                            <div className="flex gap-1">
                              <button onClick={() => handleRespond(m.meetingId, 'accepted')}
                                className="px-2 py-0.5 bg-[#6264A7] hover:bg-[#5558A7] text-white text-xs rounded-sm transition-colors">Accept</button>
                              <button onClick={() => handleRespond(m.meetingId, 'declined')}
                                className="px-2 py-0.5 border border-[#d1d1d1] text-[#424242] text-xs rounded-sm hover:bg-[#f5f5f5] transition-colors">Decline</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CreateMeetingModal
          currentUser={activeUser}
          users={users}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
