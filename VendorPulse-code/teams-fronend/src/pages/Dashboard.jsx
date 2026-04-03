import { useState, useEffect, useCallback } from 'react';
import { teamsApi } from '../api/teamsApi';
import CreateMeetingModal from '../components/CreateMeetingModal';

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const BellIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

function formatRelativeDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d - today) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ActivityItem({ icon, iconBg, title, subtitle, time, action }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-[#F5F5FF] transition-colors rounded-lg group">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#242424] leading-tight">{title}</p>
        {subtitle && <p className="text-xs text-[#616161] mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {time && <span className="text-xs text-[#a0a0a0]">{time}</span>}
        {action}
      </div>
    </div>
  );
}

export default function Dashboard({ activeUser, users, setCurrentPage }) {
  const [meetings, setMeetings] = useState([]);
  const [nudgedMeetingIds, setNudgedMeetingIds] = useState(new Set());
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(() => {
    teamsApi.getUserMeetings(activeUser.userId).then(async d => {
      const loaded = d.meetings || [];
      setMeetings(loaded);

      // Detect nudges for this user on all their meetings
      const nudged = new Set();
      await Promise.all(
        loaded.map(async m => {
          try {
            const r = await teamsApi.getMeetingNudges(m.meetingId);
            const hasMyNudge = (r.nudges || []).some(n => n.userId === activeUser.userId);
            if (hasMyNudge) nudged.add(m.meetingId);
          } catch { /* ignore */ }
        })
      );
      setNudgedMeetingIds(nudged);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeUser.userId]);

  // Initial load + poll every 8 seconds for live RSVP / nudge updates
  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  const handleRespond = async (meetingId, status) => {
    await teamsApi.respondToMeeting(meetingId, activeUser.userId, status);
    load();
  };

  const today = new Date().toDateString();

  const pending = meetings.filter(
    m => m.organizerId !== activeUser.userId &&
         m.participants.find(p => p.userId === activeUser.userId)?.status === 'pending'
  );

  const upcoming = meetings
    .filter(m => new Date(m.timeSlot.date) >= new Date(today))
    .sort((a, b) => new Date(a.timeSlot.date) - new Date(b.timeSlot.date))
    .slice(0, 5);

  const totalMtgs    = meetings.length;
  const acceptedMtgs = meetings.filter(m => m.organizerId === activeUser.userId || m.participants.find(p => p.userId === activeUser.userId)?.status === 'accepted').length;
  const nudgeCount   = nudgedMeetingIds.size;

  return (
    <div className="h-full overflow-y-auto bg-[#f5f5f5]">
      <div className="max-w-3xl mx-auto p-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#242424]">Activity</h1>
            <p className="text-sm text-[#616161] mt-0.5">{activeUser.name} · {activeUser.role}</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-[#6264A7] hover:bg-[#5558A7] text-white text-sm font-medium px-3 py-2 rounded-sm transition-colors"
          >
            <PlusIcon /> New meeting
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total meetings',  value: totalMtgs,      accent: '#6264A7' },
            { label: 'Pending invites', value: pending.length,  accent: '#E8A838' },
            { label: 'Accepted',        value: acceptedMtgs,    accent: '#13A10E' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-lg border border-[#e8e8e8] px-4 py-3 shadow-sm">
              <p className="text-2xl font-bold" style={{ color: s.accent }}>{s.value}</p>
              <p className="text-xs text-[#616161] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Nudge notifications from VendorPulse ── */}
        {!loading && nudgeCount > 0 && (
          <div className="bg-[#FFF9E6] rounded-lg border border-[#E8A838]/50 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E8A838]/30 flex items-center gap-2">
              <BellIcon />
              <h2 className="text-sm font-semibold text-[#7A5C00]">Reminder from VendorPulse</h2>
              <span className="w-5 h-5 bg-[#E8A838] text-white text-xs rounded-full flex items-center justify-center font-bold ml-1">
                {nudgeCount}
              </span>
            </div>
            <div className="divide-y divide-[#f5f5f5]">
              {meetings
                .filter(m => nudgedMeetingIds.has(m.meetingId))
                .map(m => {
                  const myStatus = m.participants.find(p => p.userId === activeUser.userId)?.status;
                  return (
                    <div key={m.meetingId} className="flex items-start gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-[#E8A838] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        <BellIcon />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#242424] font-medium">{m.title}</p>
                        <p className="text-xs text-[#7A5C00] mt-0.5">
                          VendorPulse sent a reminder — {formatRelativeDate(m.timeSlot.date)} at {m.timeSlot.startTime}
                        </p>
                      </div>
                      {myStatus === 'pending' && (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRespond(m.meetingId, 'accepted')}
                            className="px-3 py-1 bg-[#6264A7] hover:bg-[#5558A7] text-white text-xs font-medium rounded-sm transition-colors"
                          >Accept</button>
                          <button
                            onClick={() => handleRespond(m.meetingId, 'declined')}
                            className="px-3 py-1 border border-[#d1d1d1] text-[#424242] text-xs font-medium rounded-sm hover:bg-[#f5f5f5] transition-colors"
                          >Decline</button>
                        </div>
                      )}
                      {myStatus === 'accepted' && (
                        <span className="text-xs text-[#13A10E] font-medium shrink-0">✓ Accepted</span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── Pending invites ── */}
        {!loading && pending.length > 0 && (
          <div className="bg-white rounded-lg border border-[#e8e8e8] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e8e8e8] flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#242424]">Pending invites</h2>
              <span className="w-5 h-5 bg-[#E8A838] text-white text-xs rounded-full flex items-center justify-center font-bold">{pending.length}</span>
            </div>
            <div className="divide-y divide-[#f5f5f5]">
              {pending.map(m => {
                const org = users.find(u => u.userId === m.organizerId);
                const hasNudge = nudgedMeetingIds.has(m.meetingId);
                return (
                  <ActivityItem
                    key={m.meetingId}
                    icon={org?.avatar || '?'}
                    iconBg="bg-[#6264A7]"
                    title={
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span><span className="font-medium">{org?.name}</span> invited you to <span className="font-medium">{m.title}</span></span>
                        {hasNudge && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#FFF4CE] text-[#D08300] text-[10px] font-semibold rounded-full border border-[#E8A838]/40">
                            <BellIcon /> Reminder sent
                          </span>
                        )}
                      </span>
                    }
                    subtitle={`${formatRelativeDate(m.timeSlot.date)} · ${m.timeSlot.startTime}–${m.timeSlot.endTime}`}
                    action={
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleRespond(m.meetingId, 'accepted')}
                          className="px-3 py-1 bg-[#6264A7] hover:bg-[#5558A7] text-white text-xs font-medium rounded-sm transition-colors"
                        >Accept</button>
                        <button
                          onClick={() => handleRespond(m.meetingId, 'declined')}
                          className="px-3 py-1 border border-[#d1d1d1] text-[#424242] text-xs font-medium rounded-sm hover:bg-[#f5f5f5] transition-colors"
                        >Decline</button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* ── Upcoming meetings ── */}
        <div className="bg-white rounded-lg border border-[#e8e8e8] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e8e8e8] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#242424]">Upcoming meetings</h2>
            <button onClick={() => setCurrentPage('meetings')} className="text-xs text-[#6264A7] hover:underline">View all</button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#6264A7] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : upcoming.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-[#a0a0a0]">No upcoming meetings</p>
              <button onClick={() => setShowModal(true)} className="mt-2 text-xs text-[#6264A7] hover:underline">Schedule one now</button>
            </div>
          ) : (
            <div className="divide-y divide-[#f5f5f5]">
              {upcoming.map((m, i) => {
                const colors = ['#7B83EB', '#40B4E5', '#E8A838', '#13A10E', '#C239B3'];
                const color  = colors[i % colors.length];
                const myStatus = m.participants.find(p => p.userId === activeUser.userId)?.status;
                const isOrg   = m.organizerId === activeUser.userId;
                const org     = users.find(u => u.userId === m.organizerId);
                const accepted = m.participants.filter(p => p.status === 'accepted').length;

                return (
                  <div key={m.meetingId} className="flex items-start gap-3 px-4 py-3 hover:bg-[#F5F5FF] transition-colors">
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#242424] truncate">{m.title}</p>
                      <p className="text-xs text-[#616161] mt-0.5">
                        {formatRelativeDate(m.timeSlot.date)} · {m.timeSlot.startTime}–{m.timeSlot.endTime}
                      </p>
                      <p className="text-xs text-[#a0a0a0] mt-0.5">
                        {isOrg ? 'You organized' : `Organized by ${org?.name}`} · {accepted}/{m.participants.length} accepted
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">
                      {isOrg ? (
                        <span className="text-xs bg-[#E8EDFF] text-[#6264A7] px-2 py-0.5 rounded-full font-medium">Organizer</span>
                      ) : myStatus === 'accepted' ? (
                        <span className="text-xs text-[#13A10E] font-medium">✓ Accepted</span>
                      ) : myStatus === 'declined' ? (
                        <span className="text-xs text-red-500 font-medium">✗ Declined</span>
                      ) : (
                        <span className="text-xs text-[#E8A838] font-medium">Pending</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
