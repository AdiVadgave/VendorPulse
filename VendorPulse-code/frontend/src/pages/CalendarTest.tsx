/**
 * TEMPORARY test page — proves delegated Calendars.ReadWrite + getSchedule works.
 *
 * It reuses the signed-in SSO session (must be logged in, SSO on), acquires a
 * Graph token for the Calendars.ReadWrite scope, and calls
 *   POST /me/calendar/getSchedule
 * for the attendee emails you enter, printing each person's free/busy.
 *
 * HOW TO USE (Shell laptop, SSO on, logged in):
 *   1. Add a temporary route in App.tsx (inside the <AppLayout> block):
 *        import CalendarTest from './pages/CalendarTest'
 *        <Route path="/calendar-test" element={<CalendarTest />} />
 *   2. Run the app, sign in, then visit  http://localhost:5173/calendar-test
 *   3. Enter a few Shell attendee emails → "Check availability".
 *
 * Delete this file (and the route) once you've confirmed it works.
 */
import { useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { InteractionRequiredAuthError } from '@azure/msal-browser'

const SCOPES = ['Calendars.ReadWrite']

// availabilityView returns a digit per interval: 0 free, 1 tentative, 2 busy,
// 3 out-of-office, 4 working-elsewhere.
const CODE: Record<string, string> = {
  '0': 'free',
  '1': 'tentative',
  '2': 'busy',
  '3': 'out-of-office',
  '4': 'working-elsewhere',
}

interface ScheduleItem {
  status?: string
  start?: { dateTime: string }
  end?: { dateTime: string }
}
interface ScheduleEntry {
  scheduleId: string
  availabilityView?: string
  scheduleItems?: ScheduleItem[]
  error?: { message: string }
}

export default function CalendarTest() {
  const { instance, accounts } = useMsal()
  const account = accounts[0] ?? null

  const [emailsText, setEmailsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScheduleEntry[] | null>(null)

  async function getToken(): Promise<string | null> {
    if (!account) return null
    try {
      const r = await instance.acquireTokenSilent({ scopes: SCOPES, account })
      return r.accessToken
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        const r = await instance.acquireTokenPopup({ scopes: SCOPES, account })
        return r.accessToken
      }
      throw e
    }
  }

  async function check() {
    setError(null)
    setResult(null)
    const emails = emailsText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (emails.length === 0) {
      setError('Enter at least one email.')
      return
    }
    setLoading(true)
    try {
      const token = await getToken()
      if (!token) {
        setError('No token — are you signed in via SSO?')
        return
      }

      // Window: next 7 days from now (UTC).
      const start = new Date()
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)

      const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedules: emails,
          startTime: { dateTime: start.toISOString(), timeZone: 'UTC' },
          endTime: { dateTime: end.toISOString(), timeZone: 'UTC' },
          availabilityViewInterval: 60, // one slot per hour
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        setError(`Graph ${res.status}: ${body.slice(0, 300)}`)
        return
      }
      const data = (await res.json()) as { value?: ScheduleEntry[] }
      setResult(data.value ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '2rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>getSchedule test (delegated Calendars.ReadWrite)</h1>
      <p style={{ color: '#475569', fontSize: '0.9rem' }}>
        Signed in as: <strong>{account?.username ?? '(not signed in — SSO must be on)'}</strong>
      </p>

      <textarea
        value={emailsText}
        onChange={(e) => setEmailsText(e.target.value)}
        placeholder="Enter Shell attendee emails, one per line or comma-separated&#10;e.g. arathi.vasudevan@shell.com"
        rows={4}
        style={{ width: '100%', padding: 10, fontFamily: 'monospace', fontSize: 13, marginTop: 12 }}
      />
      <button
        onClick={check}
        disabled={loading}
        style={{ marginTop: 10, padding: '0.5rem 1.2rem', fontWeight: 600, background: '#dd1d21', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
      >
        {loading ? 'Checking…' : 'Check availability'}
      </button>

      {error && (
        <pre style={{ marginTop: 16, padding: 12, background: '#fef2f2', color: '#991b1b', whiteSpace: 'pre-wrap', borderRadius: 6 }}>
          {error}
        </pre>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, color: '#475569' }}>
            availabilityView legend: 0=free · 1=tentative · 2=busy · 3=OOF · 4=elsewhere (one digit per hour, next 7 days)
          </p>
          {result.map((r) => (
            <div key={r.scheduleId} style={{ marginTop: 12, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <strong>{r.scheduleId}</strong>
              {r.error ? (
                <p style={{ color: '#991b1b' }}>error: {r.error.message}</p>
              ) : (
                <>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 6 }}>{r.availabilityView}</pre>
                  <p style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                    {r.scheduleItems?.length
                      ? `${r.scheduleItems.length} busy block(s): ` +
                        r.scheduleItems
                          .map((it) => `${CODE[it.status ?? ''] ?? it.status} ${it.start?.dateTime ?? ''}→${it.end?.dateTime ?? ''}`)
                          .join('; ')
                      : 'no busy blocks in window (or free/busy not shared)'}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
