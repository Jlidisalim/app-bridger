// Bridger API Client - Real REST API Integration
// This service handles all communication with the backend

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// API URL resolution order:
//  1. app.config.js extra.apiUrl  (auto-detects machine IP at expo start time)
//  2. EXPO_PUBLIC_API_URL env var  (manual override)
//  3. Constants.expoGoConfig debuggerHost  (Expo Go runtime fallback)
//  4. Platform default (emulator/simulator last resort)
const devServerHost =
  Constants.expoGoConfig?.debuggerHost?.split(':')[0] ||
  Constants.manifest2?.extra?.expoGo?.debuggerHost?.split(':')[0];

const LOCAL_API_URL = Platform.select({
  android: `http://${devServerHost || '10.0.2.2'}:4000`,
  default:  `http://${devServerHost || 'localhost'}:4000`,
});

const configApiUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;

const API_BASE_URL: string =
  (configApiUrl && configApiUrl.startsWith('http') ? configApiUrl : undefined) ||
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? LOCAL_API_URL : 'https://bridger-api.azurewebsites.net');

if (__DEV__) {
  console.log('[API] Base URL:', API_BASE_URL);
}

// API Configuration
const API_CONFIG = {
  baseUrl: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
};

// Token storage keys
const TOKEN_KEYS = {
  access: 'bridger_access_token',
  refresh: 'bridger_refresh_token',
};

// Type guard: only accept real string tokens
function isValidToken(t: string | null): t is string {
  return typeof t === 'string' && t.length > 0;
}

// Mutex for token refresh to prevent race conditions.
// Queue resolves with string (new token) or null (refresh failed) — never an error object.
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

function processQueue(token: string | null) {
  refreshQueue.forEach((resolve) => resolve(token));
  refreshQueue = [];
}

// Callback registered by the app to force logout when refresh fails
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// Auth Token Management
export const authTokens = {
  async getAccessToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEYS.access);
    } catch {
      return null;
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEYS.refresh);
    } catch {
      return null;
    }
  },

  async setTokens(access: string, refresh: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEYS.access, access);
    await SecureStore.setItemAsync(TOKEN_KEYS.refresh, refresh);
  },

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEYS.access);
    await SecureStore.deleteItemAsync(TOKEN_KEYS.refresh);
  },

  async getAuthHeader(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

// HTTP Methods
async function request<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    requiresAuth?: boolean;
    _retry?: boolean;
  } = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers = {}, requiresAuth = true, _retry = false } = options;

  try {
    // Build headers
    const requestHeaders: Record<string, string> = {
      ...API_CONFIG.headers,
      ...headers,
    };

    // Add auth token if required
    if (requiresAuth) {
      const authHeader = await authTokens.getAuthHeader();
      Object.assign(requestHeaders, authHeader);
    }

    // Build request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

    const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle token refresh on 401
    if (response.status === 401 && requiresAuth && !_retry) {
      if (isRefreshing) {
        // Wait for the ongoing refresh to complete, then retry with the new token
        return new Promise<ApiResponse<T>>((resolve) => {
          refreshQueue.push(async (token: string | null) => {
            if (!isValidToken(token)) {
              // Refresh failed — reject this queued request
              resolve({ success: false, error: 'Session expired. Please login again.' });
              return;
            }
            const newOptions = {
              ...options,
              requiresAuth: true,
              headers: { ...options.headers, Authorization: `Bearer ${token}` },
            };
            const result = await request<T>(endpoint, newOptions);
            resolve(result);
          });
        });
      }

      isRefreshing = true;

      try {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const newToken = await authTokens.getAccessToken();
          // Resolve queue with the new token (string | null — never an object)
          processQueue(newToken);
          return request<T>(endpoint, { ...options, requiresAuth: true, _retry: true });
        }
        // Refresh failed — resolve queue with null so queued requests reject cleanly
        processQueue(null);
        await authTokens.clearTokens();
        onSessionExpired?.();
        return { success: false, error: 'Session expired. Please login again.' };
      } catch (refreshError) {
        processQueue(null);
        await authTokens.clearTokens();
        onSessionExpired?.();
        return { success: false, error: 'Session expired. Please login again.' };
      } finally {
        isRefreshing = false;
      }
    }

    // Use type-safe response handler
    return handleResponse<T>(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Unknown error' };
  }
}

// Token Refresh
async function refreshAccessToken(): Promise<boolean> {
  try {
    const refreshToken = await authTokens.getRefreshToken();
    if (!refreshToken) return false;

    const response = await fetch(`${API_CONFIG.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      await authTokens.setTokens(data.accessToken, data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Type-safe response handler
async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get('content-type');
  
  if (!response.ok) {
    if (contentType?.includes('application/json')) {
      const data = await response.json();
      return { success: false, error: data.error || data.message || 'Request failed' };
    }
    return { success: false, error: `HTTP ${response.status}` };
  }
  
  if (contentType?.includes('application/json')) {
    const data = await response.json();
    return { success: true, data: data as T };
  }
  
  return { success: false, error: 'Invalid response' };
}

// Multipart FormData upload (no Content-Type header — fetch sets it with boundary)
async function uploadFormData<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
  try {
    const authHeader = await authTokens.getAuthHeader();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 s for uploads

    const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: authHeader,
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return handleResponse<T>(response);
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.name === 'AbortError' ? 'Upload timeout' : error.message };
    }
    return { success: false, error: 'Unknown error' };
  }
}

// API Client Export
export const apiClient = {
  get: <T>(endpoint: string, requiresAuth = true) =>
    request<T>(endpoint, { requiresAuth }),

  post: <T>(endpoint: string, body: Record<string, unknown>, requiresAuth = true) =>
    request<T>(endpoint, { method: 'POST', body, requiresAuth }),

  put: <T>(endpoint: string, body: Record<string, unknown>, requiresAuth = true) =>
    request<T>(endpoint, { method: 'PUT', body, requiresAuth }),

  patch: <T>(endpoint: string, body: Record<string, unknown>, requiresAuth = true) =>
    request<T>(endpoint, { method: 'PATCH', body, requiresAuth }),

  delete: <T>(endpoint: string, body?: Record<string, unknown>, requiresAuth = true) =>
    request<T>(endpoint, { method: 'DELETE', body, requiresAuth }),

  upload: <T>(endpoint: string, formData: FormData) =>
    uploadFormData<T>(endpoint, formData),
};

export default apiClient;
