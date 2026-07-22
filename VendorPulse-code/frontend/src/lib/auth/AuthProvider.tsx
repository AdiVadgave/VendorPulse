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
import { setCurrentUser } from './currentUser'
import { msalConfig, loginRequest, ssoConfigured } from './msalConfig'

const msalInstance = ssoConfigured ? new PublicClientApplication(msalConfig) : null

function useRegisterTokenGetter(account: AccountInfo | null) {
  const { instance } = useMsal()

  useEffect(() => {
    if (!account) {
      setAuthTokenGetter(null)
      setCurrentUser(null)
      return
    }
    // Identity comes straight from the ID token claims (name + UPN/email) —
    // no Graph call needed.
    setCurrentUser({ name: account.name, email: account.username })
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
    return () => setAuthTokenGetter(null)
  }, [instance, account])
}

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
