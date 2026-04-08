import { useState } from 'react'
import { format } from 'date-fns'
import {
  CalendarSearch,
  Send,
  Clock,
  CheckCircle2,
  ArrowRight,
  Key,
  AlertTriangle,
  Info,
  Calendar,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { CycleAttendee } from '@/types/scheduling.types'
import { ROLE_LABELS } from '@/types/cycle.types'

interface AvailabilityFormPanelProps {
  attendees: CycleAttendee[]
  onAvailabilityCollected: () => void
}

// Mock time slots sent out in the form
const PROPOSED_SLOTS = [
  { id: 's1', label: 'Thu 9 Apr · 10:00–12:00 GMT' },
  { id: 's2', label: 'Thu 9 Apr · 14:00–16:00 GMT' },
  { id: 's3', label: 'Fri 10 Apr · 11:00–13:00 GMT' },
  { id: 's4', label: 'Mon 13 Apr · 09:00–11:00 GMT' },
]

// Simulated availability responses per attendee per slot
// true = available, false = conflict (hard), 'moveable' = has a meeting that can flex
type SlotAvailability = true | false | 'moveable'

const AVAILABILITY_DATA: Record<string, Record<string, SlotAvailability>> = {
  a1:  { s1: true,      s2: true,      s3: true,      s4: true      }, // Alex Thompson (Organiser)
  a2:  { s1: true,      s2: true,      s3: true,      s4: false     }, // Sarah Chen (Exec Sponsor)
  a3:  { s1: true,      s2: false,     s3: true,      s4: true      }, // Priya Sharma
  a4b: { s1: true,      s2: true,      s3: 'moveable', s4: true     }, // Tom Baker (replacement)
  a5:  { s1: true,      s2: true,      s3: true,      s4: true      }, // James O'Brien
  a6:  { s1: true,      s2: true,      s3: 'moveable', s4: false    }, // Emma Davies
  a7:  { s1: true,      s2: true,      s3: true,      s4: true      }, // Raj Patel
  a8:  { s1: true,      s2: true,      s3: true,      s4: true      }, // Lisa Wang
  a9:  { s1: 'moveable', s2: false,    s3: false,     s4: true      }, // David Kim
}

const SLOT_LABELS: Record<string, SlotAvailability> = {}

function getSlotSummary(slotId: string, attendees: CycleAttendee[]) {
  let available = 0
  let conflicts = 0
  let moveable = 0
  const conflictNames: string[] = []
  const moveableNames: string[] = []
  let organiserAvail = false
  let execAvail = false

  for (const a of attendees) {
    const avail = AVAILABILITY_DATA[a.attendee_id]?.[slotId]
    if (avail === true) {
      available++
      if (a.role === 'VMO_COORDINATOR') organiserAvail = true
      if (a.role === 'EGB_CHAIR') execAvail = true
    } else if (avail === 'moveable') {
      moveable++
      moveableNames.push(a.name)
      if (a.role === 'VMO_COORDINATOR') organiserAvail = true
      if (a.role === 'EGB_CHAIR') execAvail = true
    } else {
      conflicts++
      conflictNames.push(a.name)
    }
  }

  return { available, conflicts, moveable, conflictNames, moveableNames, organiserAvail, execAvail }
}

export default function AvailabilityFormPanel({
  attendees,
  onAvailabilityCollected,
}: AvailabilityFormPanelProps) {
  const [dispatched, setDispatched] = useState(false)
  const [responsesIn, setResponsesIn] = useState(false)
  const [simulating, setSimulating] = useState(false)

  function handleDispatch() {
    setDispatched(true)
  }

  function handleSimulate() {
    setSimulating(true)
    setTimeout(() => {
      setSimulating(false)
      setResponsesIn(true)
    }, 1200)
  }

  const keyAttendees = attendees.filter((a) => a.is_key)

  return (
    <div className="space-y-4 fade-in">

      {/* ── Header ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center shrink-0">
            <CalendarSearch size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
              Availability Check
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Send Shell stakeholders a form with proposed time slots. Based on organiser
              and executive sponsor availability as hard constraints, then maximise the
              largest group attendance. Conflicts that can easily be moved are flagged.
            </p>
          </div>
        </div>

        {/* Ranking rules */}
        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Slot ranking logic</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="flex items-start gap-2">
              <Key size={12} className="text-amber-500 mt-0.5 shrink-0" />
              <span className="text-slate-600 dark:text-slate-400">
                <strong>Hard constraint:</strong> Organiser &amp; Exec Sponsor must be available
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />
              <span className="text-slate-600 dark:text-slate-400">
                <strong>Soft score:</strong> Maximise total group attendance
              </span>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangle size={12} className="text-blue-500 mt-0.5 shrink-0" />
              <span className="text-slate-600 dark:text-slate-400">
                <strong>Moveable conflicts:</strong> Internal meetings that can flex are noted
              </span>
            </div>
          </div>
        </div>

        {/* Key attendees notice */}
        {keyAttendees.length > 0 && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
            <Key size={13} className="shrink-0 mt-0.5" />
            <span>
              Key attendees whose availability determines valid slots:{' '}
              <strong>{keyAttendees.map((a) => a.name).join(', ')}</strong>
            </span>
          </div>
        )}

        {/* Status banners */}
        {!dispatched && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
            <Send size={13} className="shrink-0 mt-0.5" />
            <span>
              A form with <strong>{PROPOSED_SLOTS.length} time options</strong> will be
              sent to all <strong>{attendees.length} Shell stakeholders</strong>. Each
              person marks their availability. The agent also notes which existing
              meetings in those slots can be rescheduled.
            </span>
          </div>
        )}
        {dispatched && !responsesIn && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <Clock size={13} className="shrink-0 mt-0.5" />
            <span>
              Availability form sent to {attendees.length} stakeholders. Awaiting
              responses — the grid below will populate as replies arrive.
            </span>
          </div>
        )}
        {responsesIn && (
          <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
            <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
            <span>
              All availability collected. Optimal slots have been ranked — proceed
              to slot ranking to review and select.
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!dispatched && (
            <button
              onClick={handleDispatch}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Send size={14} />
              Send Availability Form
            </button>
          )}
          {dispatched && !responsesIn && (
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className={cn(
                'flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors',
                simulating && 'opacity-60 cursor-not-allowed'
              )}
            >
              <Clock size={14} />
              {simulating ? 'Collecting responses…' : 'Simulate Responses'}
            </button>
          )}
          {responsesIn && (
            <button
              onClick={onAvailabilityCollected}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Proceed to Slot Ranking
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Availability grid (shown after responses) ── */}
      {responsesIn && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Availability Grid
            </span>
            <div className="ml-auto flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-200 dark:bg-emerald-800 inline-block" /> Available
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800 inline-block" /> Moveable conflict
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-200 dark:bg-red-800 inline-block" /> Conflict
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                  <th className="text-left px-5 py-2.5 font-medium w-44">Attendee</th>
                  {PROPOSED_SLOTS.map((slot) => (
                    <th key={slot.id} className="px-3 py-2.5 font-medium text-center whitespace-nowrap">
                      {slot.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {attendees.map((a) => (
                  <tr key={a.attendee_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {a.is_key && <Key size={11} className="text-amber-500 shrink-0" />}
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-32">
                          {a.name}
                        </span>
                      </div>
                      <p className="text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-32">
                        {ROLE_LABELS[a.role]}
                      </p>
                    </td>
                    {PROPOSED_SLOTS.map((slot) => {
                      const avail = AVAILABILITY_DATA[a.attendee_id]?.[slot.id]
                      return (
                        <td key={slot.id} className="px-3 py-2.5 text-center">
                          {avail === true && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                              <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                            </span>
                          )}
                          {avail === 'moveable' && (
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 cursor-help"
                              title="Has a meeting that can be rescheduled"
                            >
                              <AlertTriangle size={12} className="text-blue-600 dark:text-blue-400" />
                            </span>
                          )}
                          {avail === false && (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30">
                              <span className="text-red-500 dark:text-red-400 font-bold leading-none">✕</span>
                            </span>
                          )}
                          {avail === undefined && (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Slot summaries */}
          <div className="border-t border-slate-200 dark:border-slate-800">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-3">
                Slot Summary
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {PROPOSED_SLOTS.map((slot) => {
                  const s = getSlotSummary(slot.id, attendees)
                  const isViable = s.organiserAvail && s.execAvail
                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        'rounded-lg p-3 border text-xs',
                        isViable
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                          : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50'
                      )}
                    >
                      <p className="font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {slot.label}
                      </p>
                      <div className="space-y-1 text-slate-600 dark:text-slate-400">
                        <p className="flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-emerald-500" />
                          {s.available + s.moveable} available
                          {s.moveable > 0 && (
                            <span className="text-blue-600 dark:text-blue-400">
                              ({s.moveable} moveable)
                            </span>
                          )}
                        </p>
                        {s.conflictNames.length > 0 && (
                          <p className="text-red-600 dark:text-red-400">
                            ✕ {s.conflictNames.join(', ')}
                          </p>
                        )}
                        {s.moveableNames.length > 0 && (
                          <p className="text-blue-600 dark:text-blue-400 flex items-start gap-1">
                            <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                            {s.moveableNames.join(', ')} — meeting can be moved
                          </p>
                        )}
                        <p className={cn(
                          'font-medium flex items-center gap-1',
                          isViable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        )}>
                          {isViable
                            ? <><CheckCircle2 size={11} /> Viable slot</>
                            : <><Info size={11} /> Key attendee unavailable</>
                          }
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
