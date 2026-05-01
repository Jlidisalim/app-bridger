// Socket.io Hook for Real-time Chat
// The underlying socket is a singleton for the full app session.
// Individual screens use useSocketRoom() to join/leave rooms and register
// per-screen listeners — unmounting a screen does NOT kill the connection.
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// WebSocket URL mirrors the REST API URL (same server handles both).
const devServerHost = Constants.expoGoConfig?.debuggerHost?.split(':')[0]
  || Constants.manifest2?.extra?.expoGo?.debuggerHost?.split(':')[0];

const LOCAL_WS_URL = Platform.select({
  android: `http://${devServerHost || '10.0.2.2'}:4000`,
  default: `http://${devServerHost || 'localhost'}:4000`,
});

const WS_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL
  ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined)?.replace('/v1', '')
  ?? (__DEV__ ? LOCAL_WS_URL : 'https://api.bridger.app');

// ── Singleton socket ──────────────────────────────────────────────────────────
// Created once when the first hook mounts; stays alive until explicit logout.
let _socket: Socket | null = null;
let _isInitializing = false;

async function getOrCreateSocket(): Promise<Socket | null> {
  if (_socket?.connected) return _socket;
  if (_isInitializing) {
    // Wait briefly for the in-flight init to complete
    await new Promise((r) => setTimeout(r, 300));
    return _socket;
  }
  _isInitializing = true;
  try {
    const token = await SecureStore.getItemAsync('bridger_access_token');
    if (!token) return null;

    _socket = io(WS_BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      // Exponential backoff: starts at 1s, caps at 30s, adds jitter
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });

    // Heartbeat: respond to server pings to keep connection alive
    _socket.on('ping', () => _socket?.emit('pong'));

    return _socket;
  } finally {
    _isInitializing = false;
  }
}

/** Called on logout to fully tear down the connection. */
export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}

// ── useSocket — app-level hook ────────────────────────────────────────────────

interface UseSocketOptions {
  autoConnect?: boolean;
}

interface StructuredMessagePayload {
  roomId: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'LOCATION';
  imageUrl?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  sendMessage: (roomId: string, content: string, type?: 'TEXT' | 'IMAGE') => void;
  sendStructuredMessage: (payload: StructuredMessagePayload) => void;
  startTyping: (roomId: string) => void;
  stopTyping: (roomId: string) => void;
  onNewMessage: (callback: (message: any) => void) => () => void;
  onUserTyping: (callback: (data: { userId: string; roomId: string }) => void) => () => void;
  onUserStopTyping: (callback: (data: { userId: string; roomId: string }) => void) => () => void;
}

export function useSocket(options?: UseSocketOptions): UseSocketReturn {
  const { autoConnect = true } = options || {};

  const socketRef = useRef<Socket | null>(_socket);
  const [isConnected, setIsConnected] = useState(_socket?.connected ?? false);
  const errorCountRef = useRef(0);

  useEffect(() => {
    if (!autoConnect) return;

    let isMounted = true;

    const connect = async () => {
      const socket = await getOrCreateSocket();
      if (!socket || !isMounted) return;

      socketRef.current = socket;

      // Sync initial state
      if (socket.connected) setIsConnected(true);

      const onConnect = () => {
        if (isMounted) {
          setIsConnected(true);
          errorCountRef.current = 0;
        }
      };

      const onDisconnect = () => {
        if (isMounted) setIsConnected(false);
      };

      const onConnectError = (error: Error) => {
        errorCountRef.current += 1;
        if (errorCountRef.current === 1 || errorCountRef.current % 5 === 0) {
          console.warn(`[Socket] Connection error (attempt ${errorCountRef.current}):`, error.message);
        }
      };

      const onReconnectAttempt = (attempt: number) => {
        console.log(`[Socket] Reconnecting... attempt ${attempt}`);
      };

      const onReconnect = () => {
        if (isMounted) {
          setIsConnected(true);
          errorCountRef.current = 0;
          console.log('[Socket] Reconnected');
        }
      };

      const onReconnectFailed = () => {
        console.warn('[Socket] Reconnection failed after all attempts');
      };

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('connect_error', onConnectError);
      socket.on('reconnect_attempt', onReconnectAttempt);
      socket.on('reconnect', onReconnect);
      socket.on('reconnect_failed', onReconnectFailed);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('connect_error', onConnectError);
        socket.off('reconnect_attempt', onReconnectAttempt);
        socket.off('reconnect', onReconnect);
        socket.off('reconnect_failed', onReconnectFailed);
      };
    };

    let cleanup: (() => void) | undefined;
    connect().then((c) => { cleanup = c; });

    return () => {
      isMounted = false;
      cleanup?.();
      // NOTE: do NOT call socket.disconnect() here — the socket is a singleton.
      // It stays alive across screen navigations.
    };
  }, [autoConnect]);

  const joinRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('join_room', roomId);
  }, []);

  const leaveRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('leave_room', roomId);
  }, []);

  const sendMessage = useCallback((roomId: string, content: string, type: 'TEXT' | 'IMAGE' = 'TEXT') => {
    socketRef.current?.emit('send_message', { roomId, content, type });
  }, []);

  const sendStructuredMessage = useCallback((payload: StructuredMessagePayload) => {
    socketRef.current?.emit('send_message', payload);
  }, []);

  const startTyping = useCallback((roomId: string) => {
    socketRef.current?.emit('typing', { roomId });
  }, []);

  const stopTyping = useCallback((roomId: string) => {
    socketRef.current?.emit('stop_typing', { roomId });
  }, []);

  const onNewMessage = useCallback((callback: (message: any) => void) => {
    socketRef.current?.on('new_message', callback);
    return () => {
      socketRef.current?.off('new_message', callback);
    };
  }, []);

  const onUserTyping = useCallback((callback: (data: { userId: string; roomId: string }) => void) => {
    socketRef.current?.on('user_typing', callback);
    return () => {
      socketRef.current?.off('user_typing', callback);
    };
  }, []);

  const onUserStopTyping = useCallback((callback: (data: { userId: string; roomId: string }) => void) => {
    socketRef.current?.on('user_stop_typing', callback);
    return () => {
      socketRef.current?.off('user_stop_typing', callback);
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendStructuredMessage,
    startTyping,
    stopTyping,
    onNewMessage,
    onUserTyping,
    onUserStopTyping,
  };
}

// ── useSocketRoom — screen-level room management ─────────────────────────────
// Joins the room on mount, leaves on unmount. Does NOT disconnect the socket.

export function useSocketRoom(roomId: string | null | undefined) {
  const { socket, isConnected, sendMessage, startTyping, stopTyping, onNewMessage, onUserTyping, onUserStopTyping } = useSocket();

  useEffect(() => {
    if (!roomId || !socket) return;

    socket.emit('join_room', roomId);

    return () => {
      // Clean leave — does not call disconnect()
      socket.emit('leave_room', roomId);
    };
  }, [roomId, socket, isConnected]);

  return { socket, isConnected, sendMessage, startTyping, stopTyping, onNewMessage, onUserTyping, onUserStopTyping };
}
