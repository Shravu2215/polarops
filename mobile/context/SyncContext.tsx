import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useApp, SyncStatus } from './AppContext';
import { BACKEND_URL } from '../config';

export type QueuePriority = 0 | 1 | 2; // 0: SOS, 1: Cargo, 2: Inventory / Location / Other
export type QueueState = 'pending' | 'sent' | 'failed' | 'retry';

export interface QueueItem {
  id: string; // UUID idempotency key
  type: 'sos' | 'cargo_create' | 'cargo_status' | 'inventory_create' | 'inventory_update' | 'location_update';
  payload: any;
  priority: QueuePriority;
  client_timestamp: string;
  state: QueueState;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  error_message?: string;
}

interface SyncContextType {
  queue: QueueItem[];
  pendingCount: number;
  addToQueue: (
    type: QueueItem['type'],
    payload: any,
    priority: QueuePriority,
    endpoint: string,
    method?: QueueItem['method']
  ) => Promise<string>;
  flushQueue: () => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  isSyncing: boolean;
}

const STORAGE_KEY = '@polarops_sync_queue';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { syncStatus, setSyncStatus, token } = useApp();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Load initial queue from AsyncStorage
  const loadQueue = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setQueue(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load sync queue from AsyncStorage:', e);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Persist queue updates
  const saveQueue = async (newQueue: QueueItem[]) => {
    setQueue(newQueue);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newQueue));
    } catch (e) {
      console.error('Failed to save sync queue to AsyncStorage:', e);
    }
  };

  // Flush Queue logic
  const flushQueue = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      const storedStr = await AsyncStorage.getItem(STORAGE_KEY);
      let currentQueue: QueueItem[] = storedStr ? JSON.parse(storedStr) : [];
      
      const pendingItems = currentQueue.filter(item => item.state !== 'sent');
      if (pendingItems.length === 0) {
        setIsSyncing(false);
        return;
      }

      // Filter by syncStatus quality: when status is Low, only send priority 0 and 1 items
      let itemsToProcess = pendingItems;
      if (syncStatus === 'Low') {
        itemsToProcess = pendingItems.filter(item => item.priority <= 1);
      }

      // Sort strictly by priority (0 -> 1 -> 2), then by client_timestamp ascending
      itemsToProcess.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.client_timestamp).getTime() - new Date(b.client_timestamp).getTime();
      });

      let updatedQueue = [...currentQueue];

      for (const item of itemsToProcess) {
        try {
          const reqHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Idempotency-Key': item.id,
            'Client-Timestamp': item.client_timestamp,
          };
          if (token) {
            reqHeaders['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(`${BACKEND_URL}${item.endpoint}`, {
            method: item.method,
            headers: reqHeaders,
            body: JSON.stringify(item.payload),
          });

          if (response.ok) {
            // Success: remove or mark sent
            updatedQueue = updatedQueue.filter(q => q.id !== item.id);
          } else {
            const errText = await response.text();
            updatedQueue = updatedQueue.map(q => 
              q.id === item.id ? { ...q, state: 'failed', error_message: errText } : q
            );
          }
        } catch (err: any) {
          // Network error or timeout: mark retry
          updatedQueue = updatedQueue.map(q => 
            q.id === item.id ? { ...q, state: 'retry', error_message: err.message || 'Network error' } : q
          );
          // If offline network failure, break batch flush
          break;
        }
      }

      await saveQueue(updatedQueue);
    } catch (e) {
      console.error('Error during sync queue flush:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, syncStatus, token]);

  // Add Action item to Queue
  const addToQueue = async (
    type: QueueItem['type'],
    payload: any,
    priority: QueuePriority,
    endpoint: string,
    method: QueueItem['method'] = 'POST'
  ): Promise<string> => {
    const newItem: QueueItem = {
      id: generateUUID(),
      type,
      payload,
      priority,
      client_timestamp: new Date().toISOString(),
      state: 'pending',
      endpoint,
      method,
    };

    const storedStr = await AsyncStorage.getItem(STORAGE_KEY);
    const currentQueue: QueueItem[] = storedStr ? JSON.parse(storedStr) : [];
    const newQueue = [...currentQueue, newItem];
    await saveQueue(newQueue);

    // Auto-flush immediately if connection is not offline
    if (syncStatus !== 'Offline') {
      setTimeout(() => {
        flushQueue();
      }, 300);
    }

    return newItem.id;
  };

  const removeItem = async (id: string) => {
    const newQueue = queue.filter(item => item.id !== id);
    await saveQueue(newQueue);
  };

  const clearCompleted = async () => {
    const newQueue = queue.filter(item => item.state !== 'sent');
    await saveQueue(newQueue);
  };

  // Listen to NetInfo & AppState
  useEffect(() => {
    const unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        if (syncStatus === 'Offline') {
          setSyncStatus('Online');
        }
        flushQueue();
      } else if (!state.isConnected) {
        setSyncStatus('Offline');
      }
    });

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && syncStatus !== 'Offline') {
        flushQueue();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      unsubscribeNetInfo();
      appStateSub.remove();
    };
  }, [flushQueue, setSyncStatus, syncStatus]);

  const pendingCount = queue.filter(q => q.state !== 'sent').length;

  return (
    <SyncContext.Provider
      value={{
        queue,
        pendingCount,
        addToQueue,
        flushQueue,
        removeItem,
        clearCompleted,
        isSyncing,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSyncQueue = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSyncQueue must be used within a SyncProvider');
  }
  return context;
};
