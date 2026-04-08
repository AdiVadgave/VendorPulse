import { useState, useEffect } from 'react';
import { teamsApi } from '../api/teamsApi';

const ChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
);
const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
);
const SearchSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);
const BellSvg = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const DotsH = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
  </svg>
);

function formatRelDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((d - today) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 0 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TeamsTopBar({ activeUser, users, setActiveUser }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [pendingMeetings, setPendingMeetings] = useState([]);

  // Poll for pending invites every 10 seconds
  useEffect(() => {
    if (!activeUser) return;
    let cancelled = false;
    const load = () => {
      teamsApi.getUserMeetings(activeUser.userId)
        .then(d => {
          if (cancelled) return;
          const pending = (d.meetings || []).filter(
            m => m.organizerId !== activeUser.userId &&
                 m.participants.find(p => p.userId === activeUser.userId)?.status === 'pending'
          );
          setPendingMeetings(pending);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeUser]);

  const pendingCount = pendingMeetings.length;

  const handleRespond = async (meetingId, status) => {
    await teamsApi.respondToMeeting(meetingId, activeUser.userId, status);
    // Refresh pending list
    const d = await teamsApi.getUserMeetings(activeUser.userId);
    const pending = (d.meetings || []).filter(
      m => m.organizerId !== activeUser.userId &&
           m.participants.find(p => p.userId === activeUser.userId)?.status === 'pending'
    );
    setPendingMeetings(pending);
  };

  return (
    <div className="h-12 bg-[#6264A7] flex items-center gap-2 px-3 shrink-0 relative z-20">
      {/* Navigation arrows */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors">
          <ChevronLeft />
        </button>
        <button className="w-7 h-7 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors">
          <ChevronRight />
        </button>
      </div>

      {/* Search — centered */}
      <div className="flex-1 max-w-md mx-auto">
        <label className="flex items-center bg-white/20 hover:bg-white/25 focus-within:bg-white rounded px-2.5 py-1.5 gap-2 transition-colors group cursor-text">
          <span className="text-white/60 group-focus-within:text-[#616161] shrink-0">
            <SearchSvg />
          </span>
          <input
            type="text"
            placeholder="Search"
            className="bg-transparent flex-1 text-sm text-white placeholder-white/60 outline-none min-w-0 focus:text-[#242424] focus:placeholder-[#a0a0a0]"
          />
        </label>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => { setShowNotif(v => !v); setShowMenu(false); }}
            className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors relative"
          >
            <BellSvg />
            {pendingCount > 0 && (
              <span className="absolute top-1 right-1 min-w-3.5 h-3.5 bg-red-400 rounded-full border border-[#6264A7] flex items-center justify-center text-[9px] text-white font-bold px-0.5">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          {/* Notification dropdown */}
          {showNotif && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotif(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl z-50 overflow-hidden border border-gray-100">
                <div className="bg-[#6264A7] px-4 py-3 flex items-center justify-between">
                  <p className="text-white font-semibold text-sm">Notifications</p>
                  {pendingCount > 0 && (
                    <span className="bg-red-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {pendingCount} pending
                    </span>
                  )}
                </div>

                {pendingCount === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[#a0a0a0]">
                    No pending invites
                  </div>
                ) : (
                  <div className="divide-y divide-[#f5f5f5] max-h-96 overflow-y-auto">
                    {pendingMeetings.map(m => {
                      const org = users.find(u => u.userId === m.organizerId);
                      return (
                        <div key={m.meetingId} className="px-4 py-3 hover:bg-[#F5F5FF] transition-colors">
                          <div className="flex items-start gap-3 mb-2">
                            <div className="w-8 h-8 bg-[#6264A7] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {org?.avatar || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[#242424] leading-tight">
                                <span className="font-medium">{org?.name}</span>
                                {' '}invited you to{' '}
                                <span className="font-medium">{m.title}</span>
                              </p>
                              <p className="text-xs text-[#616161] mt-0.5">
                                {formatRelDate(m.timeSlot.date)} · {m.timeSlot.startTime}–{m.timeSlot.endTime}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 pl-11">
                            <button
                              onClick={() => handleRespond(m.meetingId, 'accepted')}
                              className="flex-1 py-1.5 bg-[#6264A7] hover:bg-[#5558A7] text-white text-xs font-medium rounded transition-colors"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleRespond(m.meetingId, 'declined')}
                              className="flex-1 py-1.5 border border-[#d1d1d1] text-[#424242] text-xs font-medium rounded hover:bg-[#f5f5f5] transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Ellipsis */}
        <button className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors">
          <DotsH />
        </button>

        {/* Profile / user switcher */}
        <div className="relative ml-1">
          <button
            onClick={() => { setShowMenu(v => !v); setShowNotif(false); }}
            className="w-8 h-8 bg-white/25 hover:bg-white/35 rounded-full flex items-center justify-center text-white text-xs font-bold transition-colors ring-2 ring-white/40 hover:ring-white/60"
            title={`${activeUser?.name} — click to switch user`}
          >
            {activeUser?.avatar}
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl z-50 border border-gray-100 overflow-hidden flex flex-col">
                {/* Current user hero */}
                <div className="bg-[#6264A7] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {activeUser?.avatar}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{activeUser?.name}</p>
                      <p className="text-indigo-200 text-xs">{activeUser?.email}</p>
                      <p className="text-indigo-300 text-xs mt-0.5">{activeUser?.role}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                    <span className="text-indigo-200 text-xs">Available</span>
                  </div>
                </div>

                {/* Switch to */}
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 shrink-0">
                  <p className="text-xs font-semibold text-[#616161] uppercase tracking-wider">Switch Account</p>
                </div>
                <div className="overflow-y-auto max-h-64">
                  {users.filter(u => u.userId !== activeUser?.userId).map(user => (
                    <button
                      key={user.userId}
                      onClick={() => { setActiveUser(user); setShowMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F5F5FF] transition-colors text-left"
                    >
                      <div className="w-8 h-8 bg-[#6264A7] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {user.avatar}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#242424]">{user.name}</p>
                        <p className="text-xs text-[#616161]">{user.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
