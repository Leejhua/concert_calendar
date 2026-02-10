
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server side
    console.log('⏱️ Starting Background Sync Service...');
    
    // We need to dynamically import to avoid build-time issues
    // and ensure we are in the runtime environment
    const { syncData } = await import('./lib/damai-crawler');
    const { getSyncStatus, updateSyncStatus } = await import('./lib/sync-status');

    const SYNC_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours

    // Function to run the sync
    const runBackgroundSync = async () => {
        try {
            const status = getSyncStatus();
            const now = Date.now();
            
            // 1. Check if already running
            if (status.status === 'running') {
                console.log('Background Sync: Task already running. Skipping.');
                return;
            }

            // 2. Check if data is fresh enough (Staleness Check)
            // We use a slightly shorter threshold (e.g. 7.9h) to ensure we catch it if it's close
            if (now - status.lastUpdated < SYNC_INTERVAL) {
                // console.log('Background Sync: Data is fresh. Skipping.');
                return;
            }

            console.log('Background Sync: Triggering scheduled update...');
            
            // 3. Start Sync
            updateSyncStatus({
                status: 'running',
                progress: 0,
                message: 'Background Auto-Sync Started...',
            });

            const result = await syncData({
                onProgress: (msg, prog) => {
                    updateSyncStatus({
                        status: 'running',
                        message: msg,
                        progress: prog
                    });
                }
            });

            if (result.success) {
                updateSyncStatus({
                    status: 'completed',
                    progress: 100,
                    message: `Background Sync Success: +${result.totalNew} new, ${result.totalCombined} total.`,
                    result
                });
                console.log('Background Sync: Completed successfully.');
            } else {
                updateSyncStatus({
                    status: 'error',
                    message: result.message || 'Unknown error',
                });
                console.error('Background Sync: Failed.', result.message);
            }

        } catch (error) {
            console.error('Background Sync: Fatal Error', error);
            updateSyncStatus({
                status: 'error',
                message: 'Background Task Crashed'
            });
        }
    };

    // Run immediately on startup if stale (optional, but good for restart)
    // Delay slightly to let server boot
    setTimeout(() => {
        runBackgroundSync();
    }, 10000);

    // Set interval
    setInterval(runBackgroundSync, SYNC_INTERVAL);
  }
}
