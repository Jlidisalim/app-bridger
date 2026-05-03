/**
 * Centralised Axios instance for all API calls.
 * - Attaches JWT Bearer token to every request, sourced from either the
 *   standalone `accessToken` key OR the persisted Zustand store
 *   (`bridger-admin-auth`). This avoids 401s when one storage location has
 *   drifted from the other.
 * - On 401: attempts a single token refresh; updates BOTH storage locations
 *   on success. On failure clears all auth state and redirects to /login.
 */
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const PERSIST_KEY = 'bridger-admin-auth'

// Read tokens from whichever location has them — keeps api.js working even if
// localStorage and the Zustand persist blob have fallen out of sync.
function readTokens() {
  let accessToken  = localStorage.getItem('accessToken')  || null
  let refreshToken = localStorage.getItem('refreshToken') || null

  if (!accessToken || !refreshToken) {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const s = parsed?.state || {}
        accessToken  = accessToken  || s.accessToken  || null
        refreshToken = refreshToken || s.refreshToken || null
      }
    } catch { /* corrupt persist blob — ignore */ }
  }

  return { accessToken, refreshToken }
}

// Write fresh tokens to both locations so subsequent reads stay consistent
// regardless of which key the consumer reaches for.
function writeTokens({ accessToken, refreshToken }) {
  if (accessToken)  localStorage.setItem('accessToken',  accessToken)
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken)

  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      parsed.state = {
        ...(parsed.state || {}),
        accessToken:  accessToken  || parsed.state?.accessToken  || null,
        refreshToken: refreshToken || parsed.state?.refreshToken || null,
      }
      localStorage.setItem(PERSIST_KEY, JSON.stringify(parsed))
    }
  } catch { /* ignore */ }
}

function clearAuth() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem(PERSIST_KEY)
}

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — attach access token ─────────────────────────────
api.interceptors.request.use((config) => {
  const { accessToken } = readTokens()
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// ── Response interceptor — handle 401, attempt token refresh ─────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      const { refreshToken } = readTokens()

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
          writeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original) // retry original request with new token
        } catch (_) {
          // refresh failed — fall through to clear + redirect
        }
      }

      clearAuth()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }
)

// Resolve a relative /uploads/... path to a full backend URL.
// Cloudinary / absolute URLs are returned unchanged.
export function resolveMediaUrl(url) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/uploads/')) return `${BASE_URL}${url}`
  return url
}

export default api
