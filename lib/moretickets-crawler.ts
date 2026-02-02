import https from 'https';
import { Concert } from './damai-crawler';

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

export async function fetchAllMoreTicketsConcerts(onProgress?: (msg: string) => void): Promise<Concert[]> {
    const cities = await fetchMoreTicketsCities();
    console.log(`[MoreTickets] Found ${cities.length} cities.`);
    
    // Filter to top cities to save time/resources, or use a specific list
    // For now, let's pick top 20 cities based on common knowledge or just process all (might be slow)
    // The API returns cities in groups. The "Hot" cities are usually in the list but not explicitly marked in the 'allCities' structure I saw.
    // However, the user's web reference showed a "Hot Cities" section in the UI, but the API response structure I coded only extracts from 'allCities'.
    // Let's rely on a manual list of major cities to ensure we get the important ones first.
    const TARGET_CITIES = ['北京', '上海', '广州', '深圳', '成都', '武汉', '杭州', '重庆', '西安', '南京', '长沙', '天津', '苏州', '郑州', '沈阳', '济南', '青岛', '大连', '哈尔滨', '福州', '厦门', '昆明', '南宁', '合肥', '石家庄', '太原', '长春', '贵阳', '兰州', '银川', '西宁', '呼和浩特', '乌鲁木齐', '海口', '三亚', '香港', '澳门'];
    
    const targetCityObjs = cities.filter(c => TARGET_CITIES.includes(c.cityName));
    console.log(`[MoreTickets] Targeting ${targetCityObjs.length} major cities.`);

    let allConcerts: Concert[] = [];

    for (const city of targetCityObjs) {
        if (onProgress) onProgress(`Fetching MoreTickets: ${city.cityName}`);
        
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
            const { items, total } = await fetchMoreTicketsConcerts(city.cityOID, page);
            
            if (items.length > 0) {
                allConcerts.push(...items);
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
