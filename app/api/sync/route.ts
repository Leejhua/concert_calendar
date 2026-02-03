
import { NextResponse } from 'next/server';
import { syncData } from '@/lib/damai-crawler';
import { updateSyncStatus, getSyncStatus } from '@/lib/sync-status';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { curlCommand } = body;

        // Check if already running (and active within last 5 minutes)
        const currentStatus = getSyncStatus();
        const isStale = (Date.now() - currentStatus.lastUpdated) > 5 * 60 * 1000;
        
        if (currentStatus.status === 'running' && !isStale) {
             return NextResponse.json({ success: false, message: 'Sync already in progress' }, { status: 409 });
        }

        // Global Cooldown Check (e.g., 4 hours)
        // If the last successful sync was recent, skip this request to prevent abuse.
        const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
        // Check "completed" status specifically to ensure we only block if data is actually fresh
        if (currentStatus.status === 'completed' && (Date.now() - currentStatus.lastUpdated) < COOLDOWN_MS) {
            const minutesLeft = Math.ceil((COOLDOWN_MS - (Date.now() - currentStatus.lastUpdated)) / 60000);
            console.log(`API: Sync cooldown active. ${minutesLeft} minutes remaining. Skipping sync.`);
            return NextResponse.json({ 
                success: true, 
                message: `Data is fresh. Cooldown active (${minutesLeft}m remaining).`,
                skipped: true
            });
        }

        let cookie = '';
        let tokenWithTime = '';

        if (curlCommand) {
            // 1. Parse Cookie from cURL
            
            // Try -b / --cookie
            const cookieFlagRegex = /(?:-b|--cookie)\s+['"]([^'"]+)['"]/;
            const cookieFlagMatch = curlCommand.match(cookieFlagRegex);
            if (cookieFlagMatch) {
                cookie = cookieFlagMatch[1];
            }

            // If not found, try -H 'cookie: ...'
            if (!cookie) {
                const headerCookieRegex = /-H\s+['"]cookie:\s*([^'"]+)['"]/i;
                const headerMatch = curlCommand.match(headerCookieRegex);
                if (headerMatch) {
                    cookie = headerMatch[1];
                }
            }

            if (!cookie) {
                return NextResponse.json({ success: false, message: 'Could not extract cookie from cURL command' }, { status: 400 });
            }

            // 2. Extract Token (_m_h5_tk) from Cookie
            const tokenRegex = /_m_h5_tk=([^;]+)/;
            const tokenMatch = cookie.match(tokenRegex);
            
            if (!tokenMatch) {
                return NextResponse.json({ success: false, message: 'Could not find _m_h5_tk token in cookie' }, { status: 400 });
            }

            tokenWithTime = tokenMatch[1];
        } else {
            console.log('API: No cURL provided, switching to Auto-Handshake Mode');
        }

        // 3. Start Sync (Background)
        updateSyncStatus({
            status: 'running',
            progress: 0,
            total: 0,
            current: 0,
            message: curlCommand ? 'Initializing with manual token...' : 'Initializing auto-handshake...',
            result: undefined
        });

        // Fire and forget
        (async () => {
            try {
                const syncConfig: any = {
                    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
                    onProgress: (msg: string, prog: number) => {
                        updateSyncStatus({
                            status: 'running',
                            message: msg,
                            progress: prog
                        });
                    }
                };

                if (cookie && tokenWithTime) {
                    syncConfig.cookie = cookie;
                    syncConfig.tokenWithTime = tokenWithTime;
                }

                const result = await syncData(syncConfig);
                
                updateSyncStatus({
                    status: result.success ? 'completed' : 'error',
                    progress: 100,
                    message: result.message || (result.success ? 'Sync completed' : 'Sync failed'),
                    result
                });
            } catch (err: any) {
                console.error('Background Sync Error:', err);
                updateSyncStatus({
                    status: 'error',
                    message: err.message || 'Unknown error',
                    progress: 0
                });
            }
        })();

        return NextResponse.json({ success: true, message: 'Sync started in background' });

    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
