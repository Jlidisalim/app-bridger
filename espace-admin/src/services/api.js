/**
 * Centralised Axios instance for all API calls.
 * - Attaches JWT Bearer token to every request from localStorage.
 * - On 401 response: attempts a single token refresh; on failure clears
 *   auth state and redirects to /login.
 */
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — attach access token ─────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor — handle 401, attempt token refresh ─────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = localStorage.getItem('refreshToken')

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
          localStorage.setItem('accessToken', data.accessToken)
          localStorage.setItem('refreshToken', data.refreshToken)
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original) // retry original request with new token
        } catch (_) {
          // refresh failed — fall through to clear + redirect
        }
      }

      // Clear stored auth and send to login
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('bridger-admin-auth') // zustand persist key
      window.location.href = '/login'
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
