
import fs from 'fs';
import path from 'path';

export type SyncState = 'idle' | 'running' | 'completed' | 'error';

export interface SyncStatus {
  status: SyncState;
  progress: number; // 0 to 100
  total: number;
  current: number;
  message: string;
  lastUpdated: number;
  result?: {
    success: boolean;
    totalNew: number;
    totalCombined: number;
    message?: string;
  };
}

const STATUS_FILE = path.join(process.cwd(), 'data', 'sync-status.json');

export function getSyncStatus(): SyncStatus {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const data = fs.readFileSync(STATUS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to read sync status:', error);
  }
  return {
    status: 'idle',
    progress: 0,
    total: 0,
    current: 0,
    message: '',
    lastUpdated: Date.now()
  };
}

export function updateSyncStatus(status: Partial<SyncStatus>) {
  const current = getSyncStatus();
  const newStatus = { ...current, ...status, lastUpdated: Date.now() };
  
  // Ensure directory exists
  const dir = path.dirname(STATUS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(STATUS_FILE, JSON.stringify(newStatus, null, 2));
  return newStatus;
}
