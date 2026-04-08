import { CalendarPlus, Users, Clock } from 'lucide-react'

export default function ScheduleAlignmentMeeting() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <CalendarPlus size={15} className="text-violet-500" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Schedule Internal Alignment Meeting
        </h3>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Schedule a meeting for stakeholders to discuss score differences and alignment points before the vendor call.
        </p>

        {/* Placeholder meeting details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Users size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Attendees
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">All internal stakeholders</p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Clock size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Duration
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">30 minutes (recommended)</p>
          </div>
        </div>

        {/* Agenda preview */}
        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-2">Suggested Agenda</p>
          <ul className="space-y-1 text-xs text-violet-800 dark:text-violet-300">
            <li>1. Review score comparison — Stakeholder vs Vendor gaps</li>
            <li>2. Discuss flagged categories and agree on final internal position</li>
            <li>3. Align on face-off model roles before vendor meeting</li>
            <li>4. Capture action items and assign owners</li>
          </ul>
        </div>

        <button
          onClick={() => {/* placeholder — will be wired up later */}}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <CalendarPlus size={14} />
          Schedule Meeting
        </button>
      </div>
    </div>
  )
}
