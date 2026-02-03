import https from 'https';
import { Concert, CITY_BLACKLIST } from './damai-crawler';

// --- Types ---

interface MoreTicketsConfig {
    src: string;
    ver: string;
    time: string; // timestamp string
    headers: Record<string, string>;
}

// Default configuration based on user provided curl
const CONFIG: MoreTicketsConfig = {
    src: 'm_web',
    ver: '6.59.0',
    time: '1770002270828', // This might need to be dynamic
    headers: {
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Origin': 'https://m3.tking.cn',
        'Referer': 'https://m3.tking.cn/package-guanaitong/list/guanaitong-list.channel?showType=1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
        'device-id': 'a564769f00a4cd5146cb882fa39221e7', // Reusing provided device-id
        'source': 'm_web',
        'src': 'm_web',
        // 'tsessionid': '...' // User needs to provide or we try without
    }
};

interface City {
    cityOID: string;
    cityName: string;
}

// --- Helper Functions ---

function makeRequest(path: string, method: 'GET' | 'POST', data: any = null): Promise<any> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'm3.tking.cn',
            path: path,
            method: method,
            headers: {
                ...CONFIG.headers,
                'Content-Length': data ? Buffer.byteLength(JSON.stringify(data)) : 0
            }
        };

        const req = https.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString();
                try {
                    const json = JSON.parse(body);
                    resolve(json);
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${body.substring(0, 100)}...`));
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// --- Main Logic ---

export async function fetchMoreTicketsCities(): Promise<City[]> {
    // URL: https://m3.tking.cn/showapi/cities?src=m_web&time=...&ver=...
    const time = Date.now().toString();
    const path = `/showapi/cities?src=${CONFIG.src}&time=${time}&ver=${CONFIG.ver}`;
    
    try {
        const res = await makeRequest(path, 'GET');
        if (res.statusCode === 200 && res.result && res.result.allCities) {
            const cities: City[] = [];
            // allCities is an array of groups [{title: "A", cities: [...]}, ...]
            res.result.allCities.forEach((group: any) => {
                if (group.cities) {
                    cities.push(...group.cities);
                }
            });
            return cities;
        }
        return [];
    } catch (e) {
        console.error('Failed to fetch cities from MoreTickets:', e);
        return [];
    }
}

export async function fetchMoreTicketsConcerts(cityId: string, page: number = 1): Promise<{ items: Concert[], total: number }> {
    const time = Date.now().toString();
    // Path seems to be /mtl_recommendapi/pub/search/v1/find_show_list
    // Query params in URL + Body
    const path = `/mtl_recommendapi/pub/search/v1/find_show_list?src=${CONFIG.src}&time=${time}&ver=${CONFIG.ver}`;
    
    const payload = {
        "src": CONFIG.src,
        "ver": CONFIG.ver,
        "time": time,
        "cityId": cityId,
        "showCityList": null,
        "beginDateTime": null,
        "endDateTime": null,
        "sorting": "weight",
        "showType": "VocalConcert", // "VocalConcert" seems to be the filter for concerts
        "offset": (page - 1) * 10,
        "length": 10
    };

    try {
        const res = await makeRequest(path, 'POST', payload);
        
        if (res.statusCode === 200 && res.data && res.data.searchData) {
            return {
                items: res.data.searchData.map((item: any) => transformToConcert(item)),
                total: res.data.pagination ? res.data.pagination.total : 0
            };
        }
        return { items: [], total: 0 };
    } catch (e) {
        console.error(`Failed to fetch concerts for city ${cityId}:`, e);
        return { items: [], total: 0 };
    }
}

export async function fetchAllMoreTicketsConcerts(onProgress?: (msg: string, progress?: number) => void): Promise<Concert[]> {
    const cities = await fetchMoreTicketsCities();
    
    // Filter out blacklisted cities immediately
    const targetCityObjs = cities.filter(c => {
         const isBlacklisted = CITY_BLACKLIST.some(b => c.cityName.includes(b));
         return !isBlacklisted;
    });

    console.log(`[MoreTickets] Found ${cities.length} cities, ${targetCityObjs.length} after blacklist.`);

    let allConcerts: Concert[] = [];

    for (const [index, city] of targetCityObjs.entries()) {
        const percentage = Math.floor((index / targetCityObjs.length) * 100);
        if (onProgress) onProgress(`Fetching MoreTickets: ${city.cityName} (${index + 1}/${targetCityObjs.length})`, percentage);
        
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
            const { items, total } = await fetchMoreTicketsConcerts(city.cityOID, page);
            
            if (items.length > 0) {
                // Filter blacklisted cities
                const validItems = items.filter(item => {
                    const isBlacklisted = CITY_BLACKLIST.some(b => item.city.includes(b));
                    return !isBlacklisted;
                });

                allConcerts.push(...validItems);
                // Check if we need next page
                // total is total items. 
                if (page * 10 >= total) {
                    hasMore = false;
                } else {
                    page++;
                    // Small delay to be nice
                    await new Promise(r => setTimeout(r, 200));
                }
            } else {
                hasMore = false;
            }
            
            // Safety break
            if (page > 20) hasMore = false; 
        }
    }
    
    return allConcerts;
}

function transformToConcert(item: any): Concert {
    // 摩天轮的数据结构需要映射
    // item.showName -> title
    // item.showDate -> date (usually a range or text, need to standardize)
    // item.venueName -> venue
    // item.posterUrl -> image
    // item.minPrice -> price
    // item.showId -> id (prefix with mt_)
    
    // Date formatting: item.showDate usually looks like "2024.05.17-05.18" or "2024.05.17"
    // We want "YYYY.MM.DD" format to match Damai
    let dateStr = item.showDate || '';
    
    // Extract Artist from tags if available
    let artist = '';
    if (item.tags && Array.isArray(item.tags)) {
        const artistTag = item.tags.find((t: any) => t.tagType === 'ARTIST');
        if (artistTag) {
            artist = artistTag.tagName;
        }
    }

    return {
        id: `mt_${item.showId}`,
        title: item.showName,
        image: '', // Image removed as requested
        date: dateStr,
        city: item.showCity || item.cityName || '',
        venue: item.venueName || '',
        price: item.priceInfo ? `${item.priceInfo.prefix}${item.priceInfo.yuanNum}${item.priceInfo.suffix || ''}` : '价格待定',
        status: item.showStatusDisplayName || '销售中',
        category: '演唱会',
        artist: artist, // Use the extracted artist
        updatedAt: Date.now()
    };
}
