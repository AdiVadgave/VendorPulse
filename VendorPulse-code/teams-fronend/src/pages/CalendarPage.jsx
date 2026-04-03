import { useState, useEffect, useCallback, useRef } from 'react';
import { teamsApi } from '../api/teamsApi';
import CreateMeetingModal from '../components/CreateMeetingModal';

/* ── Constants ── */
const HOUR_HEIGHT = 60;   // px per hour
const START_HOUR  = 7;
const END_HOUR    = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const PALETTE = [
  { bg: 'rgba(123,131,235,0.18)', border: '#7B83EB', text: '#3D3D3D' },
  { bg: 'rgba(64,180,229,0.18)',  border: '#40B4E5', text: '#3D3D3D' },
  { bg: 'rgba(232,168,56,0.18)',  border: '#E8A838', text: '#3D3D3D' },
  { bg: 'rgba(19,161,14,0.18)',   border: '#13A10E', text: '#3D3D3D' },
  { bg: 'rgba(194,57,179,0.18)',  border: '#C239B3', text: '#3D3D3D' },
];

/* ── Helpers ── */
function toMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatHour(h) {
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function getWeekDays(offset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function nowTop() {
  const n = new Date();
  return ((n.getHours() * 60 + n.getMinutes() - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}

/* ── Component ── */
export default function CalendarPage({ activeUser, users }) {
  const [weekOffset, setWeekOffset]     = useState(0);
  const [meetings, setMeetings]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [showModal, setShowModal]       = useState(false);
  const [redLineTop, setRedLineTop]     = useState(nowTop);
  const scrollRef = useRef(null);

  const weekDays = getWeekDays(weekOffset);
  const todayStr = new Date().toISOString().split('T')[0];

  const load = useCallback(() => {
    teamsApi.getUserMeetings(activeUser.userId).then(d => setMeetings(d.meetings || []));
  }, [activeUser.userId]);

  useEffect(() => {
    load();
    const t = setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT;
    }, 80);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setRedLineTop(nowTop()), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleRespond = async (meetingId, status) => {
    await teamsApi.respondToMeeting(meetingId, activeUser.userId, status);
    load();
    setSelected(null);
  };

  // Group meetings by date string
  const byDate = {};
  weekDays.forEach(d => {
    const s = d.toISOString().split('T')[0];
    byDate[s] = meetings.filter(m => m.timeSlot.date === s);
  });

  const rangeLabel = `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8e8e8] shrink-0 bg-white">
        <button
          onClick={() => setWeekOffset(0)}
          className="px-3 py-1 text-sm font-medium text-[#424242] border border-[#d1d1d1] rounded-sm hover:bg-[#f5f5f5] transition-colors"
        >
          Today
        </button>
        <div className="flex">
          <button onClick={() => setWeekOffset(w => w - 1)} className="w-7 h-7 flex items-center justify-center text-[#616161] hover:bg-[#f5f5f5] rounded-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="w-7 h-7 flex items-center justify-center text-[#616161] hover:bg-[#f5f5f5] rounded-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <span className="text-sm font-semibold text-[#242424]">{rangeLabel}</span>
        <span className="ml-2 text-xs text-[#616161] border border-[#d1d1d1] rounded px-2 py-0.5">Week</span>

        <button
          onClick={() => setShowModal(true)}
          className="ml-auto flex items-center gap-1.5 bg-[#6264A7] hover:bg-[#5558A7] text-white text-sm font-medium px-3 py-1.5 rounded-sm transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New meeting
        </button>
      </div>

      {/* ── Calendar grid ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Day header row */}
        <div className="flex shrink-0 border-b border-[#e8e8e8] bg-white">
          <div className="w-13 shrink-0 border-r border-[#e8e8e8]" />
          {weekDays.map(day => {
            const ds = day.toISOString().split('T')[0];
            const isToday = ds === todayStr;
            return (
              <div key={ds} className="flex-1 text-center py-2 border-r border-[#e8e8e8] last:border-r-0">
                <p className={`text-xs font-semibold tracking-wide ${isToday ? 'text-[#6264A7]' : 'text-[#616161]'}`}>
                  {day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                </p>
                <div className={`w-8 h-8 flex items-center justify-center rounded-full mx-auto mt-0.5 text-sm font-semibold ${isToday ? 'bg-[#6264A7] text-white' : 'text-[#242424]'}`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable time + event grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="flex relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>

            {/* Time gutter */}
            <div className="w-13 shrink-0 border-r border-[#e8e8e8] relative bg-white">
              {HOURS.map(h => (
                <div key={h} className="absolute w-full flex justify-end pr-2" style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 8, height: HOUR_HEIGHT }}>
                  <span className="text-[10px] text-[#a0a0a0] select-none leading-none pt-1">{formatHour(h)}</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, colIdx) => {
              const ds = day.toISOString().split('T')[0];
              const dayMeetings = byDate[ds] || [];
              const isToday = ds === todayStr;

              return (
                <div
                  key={ds}
                  className={`flex-1 border-r border-[#e8e8e8] last:border-r-0 relative ${isToday ? 'bg-[#FAFAFF]' : 'bg-white'}`}
                  style={{ height: HOURS.length * HOUR_HEIGHT }}
                >
                  {/* Hour lines */}
                  {HOURS.map(h => (
                    <div key={h} className="absolute w-full border-t border-[#e8e8e8]" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
                  ))}
                  {/* 30-min lines */}
                  {HOURS.map(h => (
                    <div key={`${h}h`} className="absolute w-full border-t border-dashed border-[#f2f2f2]" style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  ))}

                  {/* Red "now" line */}
                  {isToday && redLineTop >= 0 && redLineTop < HOURS.length * HOUR_HEIGHT && (
                    <div className="absolute w-full flex items-center pointer-events-none" style={{ top: redLineTop, zIndex: 5 }}>
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full -ml-1.5 shrink-0" />
                      <div className="flex-1 h-px bg-red-500" />
                    </div>
                  )}

                  {/* Meeting blocks */}
                  {dayMeetings.map((mtg, mIdx) => {
                    const startMins = toMins(mtg.timeSlot.startTime);
                    const endMins   = toMins(mtg.timeSlot.endTime);
                    const top    = ((startMins - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const height = Math.max(((endMins - startMins) / 60) * HOUR_HEIGHT, 22);
                    const color  = PALETTE[mIdx % PALETTE.length];
                    const myStatus = mtg.participants.find(p => p.userId === activeUser.userId)?.status;
                    const faded  = myStatus === 'declined';

                    return (
                      <div
                        key={mtg.meetingId}
                        onClick={() => setSelected(mtg)}
                        className="absolute left-0.5 right-0.5 rounded px-2 py-0.5 cursor-pointer hover:brightness-95 transition-all overflow-hidden select-none"
                        style={{
                          top, height,
                          backgroundColor: faded ? '#f0f0f0' : color.bg,
                          borderLeft: `3px solid ${faded ? '#c0c0c0' : color.border}`,
                          zIndex: 2,
                        }}
                      >
                        <p className={`text-xs font-semibold leading-tight truncate ${faded ? 'text-[#b0b0b0] line-through' : 'text-[#242424]'}`}>
                          {mtg.title}
                        </p>
                        {height > 32 && (
                          <p className={`text-[10px] leading-tight truncate ${faded ? 'text-[#c8c8c8]' : 'text-[#616161]'}`}>
                            {mtg.timeSlot.startTime}–{mtg.timeSlot.endTime}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Meeting detail flyout ── */}
      {selected && (
        <div className="fixed inset-0 z-40" onClick={() => setSelected(null)}>
          <div
            className="absolute right-4 top-16 w-80 bg-white rounded-lg shadow-2xl border border-[#e0e0e0] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Purple header */}
            <div className="bg-[#6264A7] px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold text-sm leading-tight">{selected.title}</h3>
                  <p className="text-indigo-200 text-xs mt-1">
                    {new Date(selected.timeSlot.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  <p className="text-indigo-200 text-xs">{selected.timeSlot.startTime} – {selected.timeSlot.endTime}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-white/60 hover:text-white shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {selected.description && (
                <p className="text-sm text-[#424242] leading-relaxed">{selected.description}</p>
              )}

              {/* Organizer */}
              <div>
                <p className="text-xs font-semibold text-[#616161] uppercase tracking-wider mb-2">Organizer</p>
                {(() => {
                  const org = users.find(u => u.userId === selected.organizerId);
                  return org ? (
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-[#6264A7] rounded-full flex items-center justify-center text-white text-xs font-bold">{org.avatar}</div>
                      <span className="text-sm text-[#242424]">{org.name}</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Participants */}
              <div>
                <p className="text-xs font-semibold text-[#616161] uppercase tracking-wider mb-2">
                  Participants ({selected.participants.length})
                </p>
                <div className="space-y-1.5">
                  {selected.participants.map(p => {
                    const u = users.find(x => x.userId === p.userId);
                    if (!u) return null;
                    const c = p.status === 'accepted' ? 'text-[#13A10E]' : p.status === 'declined' ? 'text-red-500' : 'text-[#E8A838]';
                    return (
                      <div key={p.userId} className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-[#6264A7]/15 rounded-full flex items-center justify-center text-[#6264A7] text-[10px] font-bold">{u.avatar}</div>
                        <span className="text-sm text-[#242424] flex-1">{u.name}</span>
                        <span className={`text-xs capitalize font-medium ${c}`}>{p.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Accept/Decline */}
              {selected.organizerId !== activeUser.userId && (() => {
                const mine = selected.participants.find(p => p.userId === activeUser.userId)?.status;
                if (mine !== 'pending') return null;
                return (
                  <div className="flex gap-2 pt-2 border-t border-[#e8e8e8]">
                    <button onClick={() => handleRespond(selected.meetingId, 'accepted')} className="flex-1 bg-[#6264A7] hover:bg-[#5558A7] text-white py-2 rounded-sm text-sm font-medium transition-colors">Accept</button>
                    <button onClick={() => handleRespond(selected.meetingId, 'declined')} className="flex-1 border border-[#d1d1d1] text-[#424242] py-2 rounded-sm text-sm font-medium hover:bg-[#f5f5f5] transition-colors">Decline</button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

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
