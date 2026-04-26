// Bridger Deep Linking Service
// Handles deep links for shared deals, referral links, and notification navigation

import * as Linking from 'expo-linking';

// Configuration
const CONFIG = {
  scheme: 'bridger',
  universalLinks: ['https://bridger.app', 'https://www.bridger.app'],
  fallbackUrls: {
    web: 'https://bridger.app',
    appStore: 'https://apps.apple.com/app/bridger/id123456789',
    playStore: 'https://play.google.com/store/apps/details?id=com.welcom.appbridger',
  },
};

const URL_PATTERNS = {
  DEAL: /\/deals\/([a-zA-Z0-9-]+)/,
  USER: /\/users\/([a-zA-Z0-9-]+)/,
  TRIP: /\/trips\/([a-zA-Z0-9-]+)/,
  REFERRAL: /\/ref\/([a-zA-Z0-9-]+)/,
};

export interface ParsedDeepLink {
  type: 'deal' | 'user' | 'trip' | 'referral' | 'invite' | 'unknown';
  id?: string;
  action?: string;
  params?: Record<string, string>;
}

// Helper functions
function parsePath(path: string): ParsedDeepLink {
  const cleanPath = path.replace(/^\/+|\/+$/g, '');
  const [pathPart, queryPart] = cleanPath.split('?');
  const params: Record<string, string> = {};
  
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }

  const dealMatch = cleanPath.match(URL_PATTERNS.DEAL);
  if (dealMatch) return { type: 'deal', id: dealMatch[1], params };

  const userMatch = cleanPath.match(URL_PATTERNS.USER);
  if (userMatch) return { type: 'user', id: userMatch[1], params };

  const tripMatch = cleanPath.match(URL_PATTERNS.TRIP);
  if (tripMatch) return { type: 'trip', id: tripMatch[1], params };

  const refMatch = cleanPath.match(URL_PATTERNS.REFERRAL);
  if (refMatch) return { type: 'referral', id: refMatch[1], params };

  return { type: 'unknown', params };
}

export const deepLinkService = {
  createUrl: (path: string, params?: Record<string, string>): string => {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return `${CONFIG.scheme}://${path}${queryString}`;
  },

  createUniversalLink: (path: string, params?: Record<string, string>): string => {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return `${CONFIG.universalLinks[0]}${path}${queryString}`;
  },

  createDealLink: (dealId: string): string => {
    return deepLinkService.createUrl(`deals/${dealId}`);
  },

  createUserLink: (userId: string): string => {
    return deepLinkService.createUrl(`users/${userId}`);
  },

  createTripLink: (tripId: string): string => {
    return deepLinkService.createUrl(`trips/${tripId}`);
  },

  createReferralLink: (referralCode: string): string => {
    return deepLinkService.createUrl(`ref/${referralCode}`);
  },

  parseUrl: (url: string): ParsedDeepLink => {
    try {
      if (url.startsWith(CONFIG.scheme + '://')) {
        return parsePath(url.replace(CONFIG.scheme + '://', ''));
      }

      for (const link of CONFIG.universalLinks) {
        if (url.startsWith(link)) {
          return parsePath(url.replace(link, ''));
        }
      }

      return parsePath(url);
    } catch (error) {
      console.error('Failed to parse URL:', error);
      return { type: 'unknown' };
    }
  },

  getInitialURL: async (): Promise<ParsedDeepLink | null> => {
    try {
      const initialURL = await Linking.getInitialURL();
      if (initialURL) return deepLinkService.parseUrl(initialURL);
      return null;
    } catch (error) {
      console.error('Failed to get initial URL:', error);
      return null;
    }
  },

  addURLListener: (callback: (url: string) => void) => {
    return Linking.addEventListener('url', (event) => {
      callback(event.url);
    });
  },

  openBrowser: async (url: string): Promise<boolean> => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to open browser:', error);
      return false;
    }
  },

  openAppStore: async (): Promise<void> => {
    await deepLinkService.openBrowser(CONFIG.fallbackUrls.appStore);
  },

  openPlayStore: async (): Promise<void> => {
    await deepLinkService.openBrowser(CONFIG.fallbackUrls.playStore);
  },

  openWeb: async (path?: string): Promise<void> => {
    const url = path 
      ? `${CONFIG.fallbackUrls.web}/${path}`
      : CONFIG.fallbackUrls.web;
    await deepLinkService.openBrowser(url);
  },

  shareDeal: async (dealId: string, title: string): Promise<boolean> => {
    try {
      const url = deepLinkService.createUniversalLink(`deals/${dealId}`);
      const message = `Check out this delivery deal on Bridger: ${title}\n\n${url}`;
      
      const { Share } = require('react-native');
      await Share.share({ message, url, title: 'Share Deal' });
      return true;
    } catch (error) {
      console.error('Failed to share deal:', error);
      return false;
    }
  },

  shareReferral: async (code: string): Promise<boolean> => {
    try {
      const url = deepLinkService.createUniversalLink(`ref/${code}`);
      const message = `Join me on Bridger! Use my referral code: ${code}\n\n${url}`;
      
      const { Share } = require('react-native');
      await Share.share({ message, url, title: 'Join Bridger' });
      return true;
    } catch (error) {
      console.error('Failed to share referral:', error);
      return false;
    }
  },

  getNavigationTarget: (parsed: ParsedDeepLink): {
    screen: string;
    params?: Record<string, unknown>;
  } => {
    switch (parsed.type) {
      case 'deal':
        return { screen: 'DealDetails', params: { dealId: parsed.id } };
      case 'user':
        return { screen: 'Profile', params: { userId: parsed.id } };
      case 'trip':
        return { screen: 'TravelerRoute', params: { tripId: parsed.id } };
      case 'referral':
        return { screen: 'Onboarding', params: { referralCode: parsed.id } };
      case 'invite':
        return { screen: 'Onboarding', params: { inviteCode: parsed.id } };
      default:
        return { screen: 'Home', params: {} };
    }
  },
};

export default deepLinkService;
