// Network Status Hook - Detects offline mode
import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

interface UseNetworkStatusReturn {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  networkType: string | null;
}

export function useNetworkStatus(): UseNetworkStatusReturn {
  const [state, setState] = useState<UseNetworkStatusReturn>({
    isConnected: true,
    isInternetReachable: null,
    networkType: null,
  });

  useEffect(() => {
    // Fetch initial state
    Network.getNetworkStateAsync().then(networkState => {
      setState({
        isConnected: networkState.isConnected ?? true,
        isInternetReachable: networkState.isInternetReachable ?? null,
        networkType: networkState.type ?? null,
      });
    });

    // Listen for changes
    const subscription = Network.addNetworkStateListener(networkState => {
      setState({
        isConnected: networkState.isConnected ?? true,
        isInternetReachable: networkState.isInternetReachable ?? null,
        networkType: networkState.type ?? null,
      });
    });

    return () => subscription.remove();
  }, []);

  return state;
}
