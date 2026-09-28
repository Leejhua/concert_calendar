// Load .env.local into process.env FIRST — must happen before any module
// that reads process.env at import time (e.g. lib/db.ts creates a pg.Pool).
import '../lib/cli-env';
import fs from 'fs';
import { syncData } from '../lib/damai-crawler';
// Side-effect import: configures the global fetch dispatcher / proxy agent
// before any network request is made.
import '../lib/proxy-agent';
import { prepareProxyPool } from '../lib/proxy-pool';

// Configuration (can be updated here manually if running script directly)
const DAMAI_CONFIG_OVERRIDE = {
    // Leave empty to trigger auto-handshake
};

// Run sync
async function main() {
    console.log('[proxy-pool] Preparing proxy pool for damai...');
    await prepareProxyPool({ regionPreference: ['HK', 'TW', 'SG', 'JP'] });

    const res = await syncData(DAMAI_CONFIG_OVERRIDE);
    if (res.success) {
        console.log('Sync completed successfully.');
        process.exit(0);
    } else {
        console.error('Sync failed:', res.message);
        process.exit(1);
    }
}

main().catch((err: unknown) => {
    const e = err as Error;
    const msg = e.stack || e.message || String(err);
    const log = `[${new Date().toISOString()}] SYNC CATCH: ${msg}\n`;
    fs.appendFileSync('data/sync-error.log', log);
    console.error('❌ Sync crashed:', msg);
    process.exit(1);
});

// 全局错误兜底
process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
    const log = `[${new Date().toISOString()}] UNHANDLED REJECTION: ${msg}\n`;
    fs.appendFileSync('data/sync-error.log', log);
    console.error('❌ Unhandled Rejection:', msg);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    const msg = err.stack || err.message;
    const log = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${msg}\n`;
    fs.appendFileSync('data/sync-error.log', log);
    console.error('❌ Uncaught Exception:', msg);
    process.exit(1);
});
