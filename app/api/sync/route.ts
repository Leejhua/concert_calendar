
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

        if (!curlCommand) {
            return NextResponse.json({ success: false, message: 'Missing curlCommand' }, { status: 400 });
        }

        // 1. Parse Cookie from cURL
        let cookie = '';
        
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

        const tokenWithTime = tokenMatch[1];

        // 3. Start Sync (Background)
        updateSyncStatus({
            status: 'running',
            progress: 0,
            total: 0,
            current: 0,
            message: 'Initializing...',
            result: undefined
        });

        // Fire and forget
        (async () => {
            try {
                const result = await syncData({
                    cookie,
                    tokenWithTime,
                    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
                    onProgress: (msg, prog) => {
                        updateSyncStatus({
                            status: 'running',
                            message: msg,
                            progress: prog
                        });
                    }
                });
                
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
