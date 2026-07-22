/**
 * SSO entry point for the app.
 *
 * <AuthProvider> wraps the whole app. Its behaviour is entirely governed by
 * `ssoConfigured` (VITE_SSO_ENABLED + client/tenant ids):
 *
 *   • not configured → renders children directly. No MSAL, no login gate, no
 *     network calls. The app is byte-for-byte the pre-SSO experience.
 *   • configured     → initialises MSAL, requires a Shell login, and registers
 *     a token getter so api.ts attaches the bearer to every request.
 *
 * Keeping the gate here (not in App.tsx) means routing and pages never need to
 * know whether SSO is on.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-browser'
import {
  MsalProvider,
  useMsal,
  useIsAuthenticated,
} from '@azure/msal-react'
import { setAuthTokenGetter } from '@/lib/api'
import { msalConfig, loginRequest, ssoConfigured } from './msalConfig'

// One MSAL instance for the app's lifetime — only created when SSO is configured.
const msalInstance = ssoConfigured ? new PublicClientApplication(msalConfig) : null

// ── Token bridge ──────────────────────────────────────────────────────────────
// Registers a getter that silently acquires a fresh ID token for API calls,
// falling back to an interactive popup only when the session truly needs it.
function useRegisterTokenGetter(account: AccountInfo | null) {
  const { instance } = useMsal()

  useEffect(() => {
    if (!account) {
      setAuthTokenGetter(null)
      return
    }
    setAuthTokenGetter(async () => {
      try {
        const result = await instance.acquireTokenSilent({ ...loginRequest, account })
        // The backend validates the ID token (audience = client id).
        return result.idToken ?? null
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          const result = await instance.acquireTokenPopup({ ...loginRequest, account })
          return result.idToken ?? null
        }
        throw err
      }
    })
    return () => setAuthTokenGetter(null)
  }, [instance, account])
}

// ── Login gate ────────────────────────────────────────────────────────────────
function LoginGate({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const account = accounts[0] ?? null

  useRegisterTokenGetter(account)

  if (isAuthenticated) return <>{children}</>

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#f8fafc',
      }}
    >
      <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#0f172a' }}>VendorPulse</div>
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
  )
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!msalInstance)

  useEffect(() => {
    if (!msalInstance) return
    // MSAL v3+ requires an explicit async initialise before any use, and we must
    // process any redirect response that landed us back on the page.
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

  // SSO off → passthrough, app unchanged.
  if (!msalInstance) return <>{children}</>

  if (!ready) return null // brief blank while MSAL boots / resolves a redirect

  return (
    <MsalProvider instance={msalInstance}>
      <LoginGate>{children}</LoginGate>
    </MsalProvider>
  )
}
