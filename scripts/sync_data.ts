import { syncData } from '../lib/damai-crawler';

// Configuration (can be updated here manually if running script directly)
const DAMAI_CONFIG_OVERRIDE = {
    // Leave empty to trigger auto-handshake
};

// Run sync
syncData(DAMAI_CONFIG_OVERRIDE).then((res) => {
    if (res.success) {
        console.log('Sync completed successfully.');
        process.exit(0);
    } else {
        console.error('Sync failed:', res.message);
        process.exit(1);
    }
});
