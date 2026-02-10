"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';

export type SyncState = 'idle' | 'running' | 'completed' | 'error';

export interface SyncStatus {
  status: SyncState;
  progress: number;
  message: string;
  lastUpdated: number;
  result?: {
    success: boolean;
    totalNew: number;
    totalCombined: number;
    message?: string;
  };
}

interface SyncContextType {
  status: SyncStatus;
  startSync: (curlCommand?: string) => Promise<void>;
  isPolling: boolean;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>({
    status: 'idle',
    progress: 0,
    message: '',
    lastUpdated: 0
  });
  const [isPolling, setIsPolling] = useState(false);
  const prevStatusRef = useRef<SyncState>('idle');
  const autoSyncAttempted = useRef(false);

  // Polling Logic
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/sync/status');
        const data = await res.json();
        
        // Auto-Sync Check (Once per session load)
        if (!autoSyncAttempted.current && data.lastUpdated > 0) {
            const AUTO_SYNC_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours
            // If data is older than 8h and not currently running
            if (Date.now() - data.lastUpdated > AUTO_SYNC_INTERVAL && data.status !== 'running') {
                console.log('🔄 Data is stale (>8h), triggering auto-sync...');
                autoSyncAttempted.current = true;
                // Trigger auto sync silently
                startSync(); 
            } else {
                // Mark as attempted so we don't check again this session
                autoSyncAttempted.current = true;
            }
        }
        
        // Handle transitions
        if (prevStatusRef.current === 'running' && data.status === 'completed') {
           toast.success("同步完成", {
             description: data.message,
             duration: Infinity,
             action: {
               label: "关闭",
               onClick: () => console.log("Toast dismissed"),
             },
           });
           // Trigger page refresh to show new data? 
           // Optional: emit event or just let user navigate
        }
        
        if (prevStatusRef.current === 'running' && data.status === 'error') {
            toast.error("同步失败", {
                description: data.message + " (请尝试手动同步)",
                duration: Infinity,
            });
        }

        setStatus(data);
        prevStatusRef.current = data.status;

        if (data.status === 'running') {
            setIsPolling(true);
        } else {
            setIsPolling(false);
        }

      } catch (error) {
        console.error('Failed to fetch sync status:', error);
      }
    };

    // Initial check
    fetchStatus();

    // Set up polling
    if (isPolling || status.status === 'running') {
      intervalId = setInterval(fetchStatus, 2000);
    }

    return () => {
        if (intervalId) clearInterval(intervalId);
    };
  }, [isPolling, status.status]);

  const startSync = async (curlCommand?: string) => {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curlCommand }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setStatus(prev => ({ ...prev, status: 'running', progress: 0, message: curlCommand ? 'Starting manual sync...' : 'Starting auto sync...' }));
        prevStatusRef.current = 'running';
        setIsPolling(true);
      } else {
        throw new Error(data.message || 'Failed to start sync');
      }
    } catch (error: any) {
      toast.error(error.message);
      throw error;
    }
  };

  return (
    <SyncContext.Provider value={{ status, startSync, isPolling }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
