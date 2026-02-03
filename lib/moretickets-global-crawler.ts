
import https from 'https';
import { Concert, CITY_BLACKLIST } from './damai-crawler';
import * as OpenCC from 'opencc-js';
import crypto from 'crypto';

// Initialize converter: Traditional -> Simplified
// from 'hk' (Hong Kong Traditional) to 'cn' (Mainland Simplified)
const converter = OpenCC.Converter({ from: 'hk', to: 'cn' });

// --- Types ---

interface MoreTicketsGlobalConfig {
    headers: Record<string, string>;
    baseUrl: string;
}

const CONFIG: MoreTicketsGlobalConfig = {
    baseUrl: 'api-global.moretickets.com',
    headers: {
        'accept': '*/*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        // 'access_token': '', 
        'cc': 'CNY',
        'channel': 'PC',
        'code': 'WEB',
        // 'deviceid': '...', // User provided one, let's use a static one or generate random
        'lan': 'zh-HK',
        'lc': 'HK',
        'locationid': '662e61ac5aa19945010236bf', // Default HK, will be overridden
        'oc': 'MTS',
        'origin': 'https://www.moretickets.com',
        'referer': 'https://www.moretickets.com/',
        'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Microsoft Edge";v="144"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'src': 'WEB',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
        'ver': '2.5.0'
    }
};

interface GlobalLocation {
    id: string;
    code: string;
    name: string; // "Hong Kong", "Macau", etc.
}

// --- Helper Functions ---

function makeRequest(path: string, method: 'GET' | 'POST', headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: CONFIG.baseUrl,
            path: path,
            method: method,
            headers: {
                ...CONFIG.headers,
                ...headers
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve(json);
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${body.substring(0, 100)}...`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// --- Main Logic ---

export async function fetchGlobalLocations(): Promise<GlobalLocation[]> {
    // URL: /pub/home/v1/show/location/list
    try {
        const res = await makeRequest('/pub/home/v1/show/location/list', 'GET');
        if (res.success && Array.isArray(res.data)) {
            return res.data;
        }
        return [];
    } catch (e) {
        console.error('Failed to fetch global locations:', e);
        return [];
    }
}

export async function fetchMoreTicketsGlobalConcerts(onProgress?: (msg: string, progress?: number) => void): Promise<Concert[]> {
    console.log('[MoreTickets-Global] Starting fetch...');
    if (onProgress) onProgress('[MoreTickets-Global] Fetching locations...', 0);

    const locations = await fetchGlobalLocations();
    console.log(`[MoreTickets-Global] Found ${locations.length} locations.`);

    let allConcerts: Concert[] = [];

    // Filter locations? 
    // The user wants "MoreTickets PC Web Interface" to supplement data.
    // Usually we want HK, Macau, and maybe overseas.
    // Let's filter out Mainland China ("CN") if we trust Damai/MoreTickets-Mobile for that.
    // The Location list has "parentCode": "CN" for HK/Macau/Taiwan.
    // Code "CN" is Mainland.
    
    // Strategy: Fetch ALL non-Mainland locations to supplement our database.
    // Or just fetch everything and let deduplication handle it?
    // Given the user specifically asked for "Korea tickets" and "Overseas", 
    // we should prioritize these.
    // Let's exclude Mainland China (code: 'CN', name: 'China') to avoid huge duplication and slow sync.
    // Wait, 'Hong Kong' has parentCode 'CN'. 'China' has code 'CN'.
    
    const targetLocations = locations.filter(loc => loc.code !== 'CN');
    
    console.log(`[MoreTickets-Global] Targeting ${targetLocations.length} locations (excluding Mainland China).`);

    for (const [index, loc] of targetLocations.entries()) {
        const percentage = Math.floor((index / targetLocations.length) * 100);
        if (onProgress) onProgress(`[MoreTickets-Global] Fetching ${loc.name}...`, percentage);
        
        let offset = 0;
        const length = 20;
        let hasMore = true;
        
        // Category ID for Concerts seems fixed: 668fa364407ad90001885db2
        const categoryId = '668fa364407ad90001885db2';

        while (hasMore) {
            // URL: /pub/home/v2/show/list?locationId=...&categoryId=...&sorting=HOT_WEIGHT&offset=...&length=...
            const path = `/pub/home/v2/show/list?locationId=${loc.id}&categoryId=${categoryId}&sorting=HOT_WEIGHT&offset=${offset}&length=${length}`;
            
            try {
                // We need to inject locationid header? The curl command showed it.
                // It might be required for the API to return correct currency/language.
                const headers = {
                    'locationid': loc.id,
                    'locationcityid': loc.id // Just in case
                };

                const res = await makeRequest(path, 'GET', headers);
                
                if (res.statusCode === 200 && res.data && Array.isArray(res.data)) {
                    const items = res.data;
                    if (items.length === 0) {
                        hasMore = false;
                        break;
                    }

                    for (const item of items) {
                        const concert = transformToConcert(item, loc.name);
                        // Filter against BLACKLIST (Double check)
                        // Note: concert.city is now Simplified Chinese.
                        const isBlacklisted = CITY_BLACKLIST.some(b => concert.city.includes(b));
                        
                        // BUT wait, we just un-blacklisted Korea/etc. 
                        // The CITY_BLACKLIST is now a "Exclude List".
                        // If it is in blacklist, we skip.
                        
                        if (!isBlacklisted) {
                            allConcerts.push(concert);
                        }
                    }

                    // Pagination
                    if (items.length < length) {
                        hasMore = false;
                    } else {
                        offset += length;
                        await new Promise(r => setTimeout(r, 200)); // Rate limit
                    }
                    
                    // Safety break
                    if (offset > 100) hasMore = false; // Limit to top 100 per country to save time
                } else {
                    hasMore = false;
                }
            } catch (e) {
                console.error(`Error fetching ${loc.name} offset ${offset}:`, e);
                hasMore = false;
            }
        }
    }

    return allConcerts;
}

function transformToConcert(item: any, locationName: string): Concert {
    // 1. Convert to Simplified Chinese
    const rawTitle = item.title || '';
    const rawVenue = item.venueName || '';
    const rawCity = item.location || locationName || ''; // Use item.location if avail, else fallback

    const simpleTitle = converter(rawTitle);
    const simpleVenue = converter(rawVenue);
    const simpleCity = converter(rawCity);

    // 2. Format Date
    // Input: "2026/02/07 - 2026/02/08" or "2026/03/13"
    // Target: "2026.02.07"
    let dateStr = item.showDate || '';
    if (dateStr.includes(' - ')) {
        dateStr = dateStr.split(' - ')[0];
    }
    dateStr = dateStr.replace(/\//g, '.'); // 2026/02/07 -> 2026.02.07
    // Remove weekday info if present (e.g., "2026/02/21 Sat 20:00")
    // Regex to match YYYY.MM.DD
    const dateMatch = dateStr.match(/(\d{4}\.\d{2}\.\d{2})/);
    if (dateMatch) {
        dateStr = dateMatch[1];
    }

    // 3. Extract Artist (Simple heuristic + opencc)
    // The Global API returns titles like "[2025-26 AESPA LIVE Tour...]".
    // We rely on DeepSeek in the main loop to refine this, but let's try to get a clean title first.
    // No specific artist tag in the list item usually, unless `showTags` has it?
    // showTags: [{"tagName": "Live Concert"}, {"tagName": "K-POP"}] -> K-POP is genre.
    // So we leave artist empty and let the AI extractor handle it later if needed.
    // Or if `showTag` (singular) is used? item.showTag is "This Weekend".
    
    return {
        id: `mtglobal_${item.id}`, // Unique prefix
        title: simpleTitle,
        image: item.imgUrl || '',
        date: dateStr,
        city: simpleCity,
        venue: simpleVenue,
        price: item.salePrice || 'Pending', // Global API often has numeric price
        status: item.status === 'ONSALE' ? '销售中' : (item.status || 'Unknown'),
        category: '演唱会',
        artist: '', // Will be filled by DeepSeek later
        updatedAt: Date.now()
    };
}
