/**
 * MSAL (Entra ID) configuration for VendorPulse SSO.
 *
 * Driven entirely by Vite env vars:
 *   VITE_SSO_ENABLED=true
 *   VITE_SSO_CLIENT_ID=<Application (client) ID>
 *   VITE_SSO_TENANT_ID=db1e96a8-a3da-442a-930b-235cac24cd5c
 *   VITE_SSO_REDIRECT_URI=http://localhost:5173   (optional; defaults to origin)
 *
 * While VITE_SSO_ENABLED is not "true", ssoEnabled is false and AuthProvider
 * renders the app with no login gate — identical to pre-SSO behaviour.
 */
import type { Configuration, RedirectRequest } from '@azure/msal-browser'

export const ssoEnabled = import.meta.env.VITE_SSO_ENABLED === 'true'

const clientId = (import.meta.env.VITE_SSO_CLIENT_ID as string | undefined) ?? ''
const tenantId = (import.meta.env.VITE_SSO_TENANT_ID as string | undefined) ?? ''
const redirectUri =
  (import.meta.env.VITE_SSO_REDIRECT_URI as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

/**
 * Login scopes — only the three admin-consented on the app registration
 * (openid, profile, email). These yield an ID token with the user's name and
 * preferred_username (email); the backend validates that token. No User.Read
 * or other Graph data scope is requested.
 */
export const loginRequest: RedirectRequest = {
  scopes: ['openid', 'profile', 'email'],
}

/** True only when SSO is enabled AND the required ids are present. */
export const ssoConfigured = ssoEnabled && Boolean(clientId) && Boolean(tenantId)
