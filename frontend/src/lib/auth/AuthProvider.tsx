/**
 * SSO entry point. <AuthProvider> wraps the whole app.
 *
 *   • not configured → renders children directly (no MSAL, no login gate).
 *   • configured     → initialises MSAL, requires a Shell login, and registers
 *     a token getter so api.ts attaches the bearer to every request.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-browser'
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react'
import { setAuthTokenGetter } from '@/lib/api'
import { setCurrentUser, setLogoutHandler } from './currentUser'
import { setGraphTokenGetter } from './graphPeople'
import { setCalendarTokenGetter } from '@/lib/graphScheduling'
import { msalConfig, loginRequest, ssoConfigured } from './msalConfig'

// Graph scope for the people-search (directory) feature. Admin-consented on the
// app registration, so acquireTokenSilent succeeds without a prompt.
const GRAPH_PEOPLE_SCOPES = ['User.ReadBasic.All']
// Graph scope for delegated meeting scheduling (find times + create Teams event).
const GRAPH_CALENDAR_SCOPES = ['Calendars.ReadWrite']

const msalInstance = ssoConfigured ? new PublicClientApplication(msalConfig) : null

function useRegisterTokenGetter(account: AccountInfo | null): boolean {
  const { instance } = useMsal()
  // True only once the bearer-token getter is registered. The app must not render
  // before this: its first API calls would fire without a token and the gated
  // backend would reject them with 401 "Missing bearer token".
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!account) {
      setAuthTokenGetter(null)
      setGraphTokenGetter(null)
      setCalendarTokenGetter(null)
      setCurrentUser(null)
      setLogoutHandler(null)
      setReady(false)
      return
    }
    // Identity comes straight from the ID token claims (name + UPN/email) —
    // no Graph call needed.
    setCurrentUser({ name: account.name, email: account.username })
    setLogoutHandler(() => instance.logoutRedirect({ account }))

    // Graph access token for people-search (directory lookups). Separate from the
    // ID token: it targets Graph and carries the User.ReadBasic.All scope.
    setGraphTokenGetter(async () => {
      try {
        const r = await instance.acquireTokenSilent({ scopes: GRAPH_PEOPLE_SCOPES, account })
        return r.accessToken ?? null
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          const r = await instance.acquireTokenPopup({ scopes: GRAPH_PEOPLE_SCOPES, account })
          return r.accessToken ?? null
        }
        return null
      }
    })

    // Calendar (scheduling) token — delegated Calendars.ReadWrite, as the coordinator.
    setCalendarTokenGetter(async () => {
      try {
        const r = await instance.acquireTokenSilent({ scopes: GRAPH_CALENDAR_SCOPES, account })
        return r.accessToken ?? null
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          const r = await instance.acquireTokenPopup({ scopes: GRAPH_CALENDAR_SCOPES, account })
          return r.accessToken ?? null
        }
        return null
      }
    })

    setAuthTokenGetter(async () => {
      try {
        const result = await instance.acquireTokenSilent({ ...loginRequest, account })
        return result.idToken ?? null
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          const result = await instance.acquireTokenPopup({ ...loginRequest, account })
          return result.idToken ?? null
        }
        throw err
      }
    })
    // Getters are live — safe to render the app now.
    setReady(true)
    return () => {
      setAuthTokenGetter(null)
      setGraphTokenGetter(null)
      setCalendarTokenGetter(null)
      setLogoutHandler(null)
      setReady(false)
    }
  }, [instance, account])

  return ready
}

function LoginGate({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const account = accounts[0] ?? null

  const tokenReady = useRegisterTokenGetter(account)

  if (isAuthenticated && tokenReady) return <>{children}</>

  // Signed in but the token getter is not registered yet — show a brief loader
  // instead of the app, so no request goes out before the bearer token exists.
  if (isAuthenticated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f8fafc',
          color: '#475569',
        }}
      >
        Signing you in…
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
        background: '#f8fafc',
      }}
    >
      {/* Top navigation bar with the tool name */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.85rem 1.5rem',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: 'inset 0 -2px 0 0 #fbce07',
        }}
      >
        <img src="/shell-logo.svg" alt="Shell" style={{ width: '28px', height: '28px' }} />
        <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
          Mobility Vendor Pulse
        </span>
      </nav>

      {/* Centered sign-in content fills the remaining space */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
        }}
      >
        <img src="/shell-logo.svg" alt="Shell" style={{ width: '56px', height: '56px' }} />
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#0f172a' }}>Mobility Vendor Pulse</div>
        <div style={{ color: '#475569' }}>Sign in with your Shell account to continue.</div>
        <button
          onClick={() => instance.loginRedirect(loginRequest)}
          style={{
            padding: '0.6rem 1.4rem',
            fontSize: '1rem',
            fontWeight: 600,
            color: '#fff',
            background: '#dd1d21',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
          }}
        >
          Sign in with Shell
        </button>
      </div>
    </div>
  )
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!msalInstance)

  useEffect(() => {
    if (!msalInstance) return
    msalInstance
      .initialize()
      .then(() => msalInstance.handleRedirectPromise())
      .then((result) => {
        if (result?.account) msalInstance.setActiveAccount(result.account)
        setReady(true)
      })
      .catch((err) => {
        console.error('MSAL initialisation failed', err)
        setReady(true)
      })
  }, [])

  if (!msalInstance) return <>{children}</>
  if (!ready) return null

  return (
    <MsalProvider instance={msalInstance}>
      <LoginGate>{children}</LoginGate>
    </MsalProvider>
  )
}
