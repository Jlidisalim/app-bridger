// OpenSky OAuth2 client-credentials token manager.
// Tokens last 30 min — we proactively refresh 60s before expiry.

import axios from 'axios';
import config from '../../config/env';
import logger from '../../utils/logger';

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

const REFRESH_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token: string;
  expires_in:   number;
  token_type:   string;
}

class OpenSkyTokenManager {
  private token: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<void> | null = null;

  isConfigured(): boolean {
    return Boolean(config.opensky.clientId && config.opensky.clientSecret);
  }

  async getToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OpenSky credentials missing. Set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET.');
    }
    if (this.token && Date.now() < this.expiresAt) return this.token;
    await this.refresh();
    if (!this.token) throw new Error('Failed to acquire OpenSky token');
    return this.token;
  }

  async getHeaders(): Promise<{ Authorization: string }> {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}` };
  }

  async forceRefresh(): Promise<string> {
    this.token = null;
    this.expiresAt = 0;
    return this.getToken();
  }

  private async refresh(): Promise<void> {
    // De-dupe concurrent refresh attempts.
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      try {
        const body = new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     config.opensky.clientId!,
          client_secret: config.opensky.clientSecret!,
        });

        const { data } = await axios.post<TokenResponse>(TOKEN_URL, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10_000,
        });

        this.token = data.access_token;
        this.expiresAt = Date.now() + data.expires_in * 1000 - REFRESH_MARGIN_MS;
        logger.info('OpenSky token refreshed', { expiresInSec: data.expires_in });
      } catch (err: any) {
        logger.error('OpenSky token refresh failed', {
          error: err?.response?.data ?? err.message,
        });
        throw err;
      } finally {
        this.refreshing = null;
      }
    })();

    return this.refreshing;
  }
}

export const openskyTokens = new OpenSkyTokenManager();
