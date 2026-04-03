import { useState, useEffect, useCallback } from 'react';
import { teamsApi } from '../api/teamsApi';

const ALL_SLOTS = [
  '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00',
  '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00',
  '16:00-17:00', '17:00-18:00',
];

function getNextDays(n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

function labelOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day:     d.getDate(),
    full:    d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

const DAYS = getNextDays(7);
const TODAY = new Date().toISOString().split('T')[0];

export default function AvailabilityPage({ activeUser }) {
  const [availability, setAvailability] = useState([]);
  const [selectedDate, setSelectedDate] = useState(DAYS[0]);
  const [saving, setSaving] = useState(null);

  const load = useCallback(() => {
    teamsApi.getUserAvailability(activeUser.userId).then(d => setAvailability(d.availability || []));
  }, [activeUser.userId]);

  useEffect(() => { load(); }, [load]);

  const slotsFor = date => availability.find(a => a.date === date)?.slots || [];

  const toggle = async slot => {
    const cur = slotsFor(selectedDate);
    const next = cur.includes(slot) ? cur.filter(s => s !== slot) : [...cur, slot].sort();
    setSaving(slot);
    try {
      await teamsApi.updateUserAvailability(activeUser.userId, selectedDate, next);
    } finally {
      setSaving(null);
      load();
    }
  };

  const selectedSlots = slotsFor(selectedDate);
  const label = labelOf(selectedDate);

  return (
    <div className="h-full overflow-y-auto bg-[#f5f5f5]">
      <div className="max-w-3xl mx-auto p-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-[#242424]">Scheduling</h1>
          <p className="text-sm text-[#616161] mt-0.5">
            {activeUser.name} — click slots to set your availability
          </p>
        </div>

        {/* ── Date selector (Teams-like date strip) ── */}
        <div className="bg-white rounded-lg border border-[#e8e8e8] shadow-sm overflow-hidden">
          <div className="flex border-b border-[#e8e8e8]">
            {DAYS.map(date => {
              const lbl = labelOf(date);
              const isSelected = date === selectedDate;
              const isToday    = date === TODAY;
              const cnt        = slotsFor(date).length;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`flex-1 py-3 flex flex-col items-center transition-colors border-r border-[#e8e8e8] last:border-r-0 ${
                    isSelected ? 'bg-[#6264A7]' : 'hover:bg-[#F5F5FF]'
                  }`}
                >
                  <p className={`text-[10px] font-semibold tracking-wider ${isSelected ? 'text-indigo-200' : isToday ? 'text-[#6264A7]' : 'text-[#616161]'}`}>
                    {lbl.weekday}
                  </p>
                  <div className={`w-7 h-7 flex items-center justify-center rounded-full mt-0.5 text-sm font-semibold ${
                    isSelected && isToday ? 'bg-white text-[#6264A7]'
                    : isSelected ? 'text-white'
                    : isToday ? 'bg-[#6264A7] text-white'
                    : 'text-[#242424]'
                  }`}>
                    {lbl.day}
                  </div>
                  {cnt > 0 && (
                    <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-indigo-300' : 'bg-[#6264A7]'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Slot grid */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-[#242424]">{label.full}</p>
              <p className="text-xs text-[#616161]">{selectedSlots.length} slot{selectedSlots.length !== 1 ? 's' : ''} available</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {ALL_SLOTS.map(slot => {
                const isOn     = selectedSlots.includes(slot);
                const isSaving = saving === slot;
                return (
                  <button
                    key={slot}
                    onClick={() => !isSaving && toggle(slot)}
                    disabled={isSaving}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-sm border text-sm font-medium transition-all ${
                      isOn
                        ? 'border-[#6264A7] bg-[#E8EDFF] text-[#6264A7]'
                        : 'border-[#e8e8e8] bg-white text-[#424242] hover:border-[#6264A7] hover:bg-[#F5F5FF]'
                    } ${isSaving ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    <span>{slot}</span>
                    <span>{isSaving ? '⌛' : isOn ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Weekly overview — Teams scheduling-assistant style ── */}
        <div className="bg-white rounded-lg border border-[#e8e8e8] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e8e8e8]">
            <h2 className="text-sm font-semibold text-[#242424]">Weekly overview</h2>
          </div>

          {/* Grid header */}
          <div className="flex border-b border-[#e8e8e8] bg-[#fafafa]">
            <div className="w-32 px-4 py-2 shrink-0">
              <p className="text-xs text-[#616161] font-medium">Time</p>
            </div>
            {DAYS.map(date => {
              const lbl = labelOf(date);
              const isToday = date === TODAY;
              return (
                <div key={date} className="flex-1 text-center py-2 border-l border-[#e8e8e8] first:border-l-0">
                  <p className={`text-[10px] font-semibold tracking-wide ${isToday ? 'text-[#6264A7]' : 'text-[#616161]'}`}>
                    {lbl.weekday}
                  </p>
                  <p className={`text-xs font-semibold ${isToday ? 'text-[#6264A7]' : 'text-[#242424]'}`}>{lbl.day}</p>
                </div>
              );
            })}
          </div>

          {/* Slot rows */}
          <div className="divide-y divide-[#f5f5f5]">
            {ALL_SLOTS.map(slot => (
              <div key={slot} className="flex items-center">
                <div className="w-32 px-4 py-2 shrink-0">
                  <p className="text-xs text-[#a0a0a0]">{slot}</p>
                </div>
                {DAYS.map(date => {
                  const isOn = slotsFor(date).includes(slot);
                  const isSelected = date === selectedDate;
                  return (
                    <button
                      key={date}
                      onClick={() => { setSelectedDate(date); toggle(slot); }}
                      title={`${labelOf(date).full} · ${slot}`}
                      className={`flex-1 h-8 border-l border-[#f0f0f0] first:border-l-0 transition-colors ${
                        isOn
                          ? 'bg-[#6264A7]'
                          : isSelected
                          ? 'bg-[#F0F0FF] hover:bg-[#E8EDFF]'
                          : 'hover:bg-[#F5F5FF]'
                      }`}
                    >
                      {isOn && (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-white text-[10px]">✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-[#e8e8e8] flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 bg-[#6264A7] rounded-sm" />
              <span className="text-xs text-[#616161]">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 bg-white border border-[#e8e8e8] rounded-sm" />
              <span className="text-xs text-[#616161]">Not set</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
