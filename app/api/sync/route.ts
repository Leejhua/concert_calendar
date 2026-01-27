import { NextResponse } from 'next/server';
import { syncData } from '@/lib/damai-crawler';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { curlCommand } = body;

        if (!curlCommand) {
            return NextResponse.json({ success: false, message: 'Missing curlCommand' }, { status: 400 });
        }

        // 1. Parse Cookie from cURL
        // Match -b '...' or --cookie '...' or -H 'cookie: ...'
        // Simplified regex to catch the content inside quotes for cookie-like flags
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
        // Format: _m_h5_tk=TOKEN_TIMESTAMP;
        const tokenRegex = /_m_h5_tk=([^;]+)/;
        const tokenMatch = cookie.match(tokenRegex);
        
        if (!tokenMatch) {
            return NextResponse.json({ success: false, message: 'Could not find _m_h5_tk token in cookie' }, { status: 400 });
        }

        const tokenWithTime = tokenMatch[1];

        // 3. Run Sync
        // We run this asynchronously but await it to return status. 
        // For long running tasks, we might want to return immediately, but the user wants a toast "after completion".
        // So we await. Next.js functions have a timeout (usually 10s-60s on Vercel, but longer on self-hosted/dev).
        // Since we fetch 50 pages, it might take a while.
        // However, in local dev `npm run dev`, it shouldn't timeout quickly.
        
        const result = await syncData({
            cookie,
            tokenWithTime,
            deepseekApiKey: process.env.DEEPSEEK_API_KEY
        });

        if (result.success) {
            return NextResponse.json({ 
                success: true, 
                message: `Synced ${result.totalNew} items. Total: ${result.totalCombined}` 
            });
        } else {
            return NextResponse.json({ success: false, message: result.message || 'Sync failed' }, { status: 500 });
        }

    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
