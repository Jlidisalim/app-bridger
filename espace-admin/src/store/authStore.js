/**
 * Zustand auth store — persisted to localStorage.
 * Provides:
 *   sendOtp(phone)         → Step 1: request OTP via WhatsApp
 *   verifyOtp(phone, code) → Step 2: verify OTP, gate isAdmin, store tokens
 *   logout()               → clear tokens + session on server
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      /** POST /auth/admin/otp/send — admin-only endpoint; delivers via Twilio SMS */
      sendOtp: async (phone) => {
        const { data } = await axios.post(`${BASE_URL}/auth/admin/otp/send`, { phone })
        return data
      },

      /** POST /auth/admin/otp/verify — verifies code, stores tokens if isAdmin */
      verifyOtp: async (phone, code) => {
        const { data } = await axios.post(`${BASE_URL}/auth/admin/otp/verify`, { phone, code })

        if (!data.user?.isAdmin) {
          throw new Error('Access denied. This account does not have administrator privileges.')
        }

        // Sync tokens to localStorage so the api.js interceptor can read them
        localStorage.setItem('accessToken', data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)

        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        })

        return data
      },

      /** POST /auth/logout — deletes the session server-side */
      logout: async () => {
        const token = get().accessToken
        if (token) {
          try {
            await axios.post(
              `${BASE_URL}/auth/logout`,
              {},
              { headers: { Authorization: `Bearer ${token}` } }
            )
          } catch (_) { /* ignore network errors on logout */ }
        }

        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')

        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },
    }),
    {
      name: 'bridger-admin-auth',
      // Only persist the auth fields — not the action functions
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
