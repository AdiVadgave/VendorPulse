import { useState } from 'react';

/* ── Inline SVG icons (Teams-like stroke style) ── */
const Bell = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const Chat = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const CalendarSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const ClockSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);
const PhoneSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.49 13 19.79 19.79 0 0 1 1.42 4.37 2 2 0 0 1 3.4 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.36a16 16 0 0 0 6.29 6.29l.84-.84a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const GearSvg = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const MAIN_NAV = [
  { id: 'dashboard',    label: 'Activity',   Icon: Bell        },
  { id: 'meetings',     label: 'Meetings',   Icon: Chat        },
  { id: 'calendar',     label: 'Calendar',   Icon: CalendarSvg },
  { id: 'availability', label: 'Scheduling', Icon: ClockSvg    },
];

const BOTTOM_NAV = [
  { id: 'calls',    label: 'Calls',    Icon: PhoneSvg },
  { id: 'settings', label: 'Settings', Icon: GearSvg  },
];

function RailButton({ item, isActive, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="relative w-full flex justify-center my-0.5">
      {/* Active indicator */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-8 bg-white rounded-r-full" />
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`relative w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all duration-100 ${
          isActive
            ? 'text-white bg-white/20'
            : 'text-[#a6a6a6] hover:text-white hover:bg-white/10'
        }`}
        title={item.label}
      >
        <item.Icon />
      </button>
      {/* Tooltip */}
      {hover && (
        <div className="absolute left-13 z-50 bg-[#252525] text-white text-xs px-2.5 py-1 rounded-md shadow-xl whitespace-nowrap pointer-events-none border border-[#3a3a3a]">
          {item.label}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#252525]" />
        </div>
      )}
    </div>
  );
}

export default function TeamsRail({ currentPage, setCurrentPage, activeUser }) {
  return (
    <div className="w-13 bg-[#292929] flex flex-col items-center h-full shrink-0 shadow-lg z-10 relative">
      {/* App logo */}
      <div className="w-full flex justify-center pt-3 pb-4">
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
          <rect width="32" height="32" rx="6" fill="#6264A7"/>
          <path d="M9 10h14M9 16h10M9 22h7M19 22V14l5 8V14" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Main navigation */}
      <nav className="flex flex-col items-center flex-1 w-full px-1">
        {MAIN_NAV.map(item => (
          <RailButton
            key={item.id}
            item={item}
            isActive={currentPage === item.id}
            onClick={() => setCurrentPage(item.id)}
          />
        ))}
      </nav>

      {/* Bottom static items */}
      <div className="flex flex-col items-center w-full px-1 pb-2 gap-0.5">
        {BOTTOM_NAV.map(item => (
          <div key={item.id} className="w-full flex justify-center">
            <button
              disabled
              className="w-10 h-10 flex items-center justify-center rounded-lg text-[#555555] cursor-default"
              title={item.label}
            >
              <item.Icon />
            </button>
          </div>
        ))}
        {/* Profile avatar */}
        <div className="w-full flex justify-center mt-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-[#6264A7] ring-offset-[#292929] ring-offset-2"
            style={{ background: '#6264A7' }}
            title={activeUser?.name}
          >
            {activeUser?.avatar || '?'}
          </div>
        </div>
      </div>
    </div>
  );
}
