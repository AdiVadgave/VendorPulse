/**
 * MSAL (Entra ID) configuration for VendorPulse SSO.
 *
 * Everything is driven by Vite env vars so nothing is hard-coded and the whole
 * feature stays dormant until switched on:
 *
 *   VITE_SSO_ENABLED=true
 *   VITE_SSO_CLIENT_ID=<Application (client) ID from the app registration>
 *   VITE_SSO_TENANT_ID=db1e96a8-a3da-442a-930b-235cac24cd5c
 *   VITE_SSO_REDIRECT_URI=http://localhost:5173   (optional; defaults to current origin)
 *
 * While VITE_SSO_ENABLED is not "true", ssoEnabled is false and AuthProvider
 * renders the app with no login gate — identical to pre-SSO behaviour.
 */
import type { Configuration, PopupRequest } from '@azure/msal-browser'

export const ssoEnabled = import.meta.env.VITE_SSO_ENABLED === 'true'

const clientId = (import.meta.env.VITE_SSO_CLIENT_ID as string | undefined) ?? ''
const tenantId = (import.meta.env.VITE_SSO_TENANT_ID as string | undefined) ?? ''
const redirectUri =
  (import.meta.env.VITE_SSO_REDIRECT_URI as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')

export const msalConfig: Configuration = {
  auth: {
    clientId,
    // Single-tenant: only Shell accounts. Matches the app registration.
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    // sessionStorage keeps the token to the browser tab/session (safer than
    // localStorage). Switch to "localStorage" if you want login to persist
    // across tabs/restarts.
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

/**
 * Scopes requested at login. openid/profile/email yield an ID token that
 * identifies the user; User.Read lets us read the basic profile from Graph.
 * The backend validates the ID token (audience = clientId), so no custom API
 * scope is needed for the login-only flow.
 */
export const loginRequest: PopupRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}

/** True only when SSO is enabled AND the required ids are present. */
export const ssoConfigured = ssoEnabled && Boolean(clientId) && Boolean(tenantId)
