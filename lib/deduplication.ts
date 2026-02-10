import { Concert } from './damai-crawler';

/**
 * Normalizes a string for comparison:
 * - Lowercase
 * - Remove spaces
 * - Remove common noise words (years, generic terms)
 */
function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/\s+/g, '') // Remove spaces
        .replace(/【.*?】/g, '') // Remove brackets and content inside
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '') // Remove parens
        .replace(/\d{4}/g, '') // Remove years like 2024, 2025
        .replace(/演唱会|巡回|站|世界|live|tour|concert/g, ''); // Remove generic keywords
}

/**
 * Extracts the start date from a date string.
 * Supports: "2024.05.17", "2024.05.17-05.18", "2024.05.17 周五"
 */
function getStartDate(dateStr: string): string {
    // Try to find YYYY.MM.DD or YYYY-MM-DD
    const match = dateStr.match(/(\d{4}[.-]\d{2}[.-]\d{2})/);
    return match ? match[1].replace(/-/g, '.') : '';
}

/**
 * Checks if two concerts are likely the same event.
 * Simplified Logic: Same Artist + Same City + Same Date = Same Concert.
 */
export function isDuplicate(c1: Concert, c2: Concert): boolean {
    // 1. Check Artist (Must Match)
    // If either artist is missing, we fall back to Title fuzzy match
    if (!c1.artist || !c2.artist) {
        return isTitleDuplicate(c1, c2);
    }

    if (c1.artist !== c2.artist) {
        return false;
    }

    // 2. Check City (Must Match)
    if (!isCityMatch(c1.city, c2.city)) {
        return false;
    }

    // 3. Check Date (Start Date Must Match)
    const d1 = getStartDate(c1.date);
    const d2 = getStartDate(c2.date);
    if (!d1 || !d2 || d1 !== d2) {
        return false;
    }

    // If Artist, City, and Date all match, it's a duplicate.
    return true;
}

function isCityMatch(city1: string, city2: string): boolean {
    if (city1 === city2) return true;
    // Handle "上海市" vs "上海"
    return city1.includes(city2) || city2.includes(city1);
}

function isTitleDuplicate(c1: Concert, c2: Concert): boolean {
    // 1. Check City
    if (!isCityMatch(c1.city, c2.city)) return false;

    // 2. Check Date
    const d1 = getStartDate(c1.date);
    const d2 = getStartDate(c2.date);
    if (!d1 || !d2 || d1 !== d2) return false;

    // 3. Check Title Similarity
    const t1 = normalizeTitle(c1.title);
    const t2 = normalizeTitle(c2.title);

    if (t1.length < 2 || t2.length < 2) {
        return c1.title.includes(c2.title) || c2.title.includes(c1.title);
    }

    return t1.includes(t2) || t2.includes(t1);
}

/**
 * Merges two lists of concerts, prioritizing the first list (primary).
 * Performs "Smart Enrichment": If primary has missing data (e.g. Artist) that secondary has, fill it in.
 */
export function mergeConcertLists(primary: Concert[], secondary: Concert[]): Concert[] {
    const merged = [...primary];
    let newCount = 0;
    let enrichedCount = 0;

    for (const item of secondary) {
        // Check if this item exists in primary
        const existingIndex = merged.findIndex(existing => isDuplicate(existing, item));
        
        if (existingIndex !== -1) {
            // Duplicate found. Check for Enrichment opportunities.
            const existing = merged[existingIndex];
            
            // 1. Enrich Artist
            const isExistingArtistInvalid = !existing.artist || existing.artist === 'Unknown' || existing.artist === '群星' || existing.artist === '待定' || existing.artist === '歌手' || existing.artist === '音乐会';
            const isNewArtistValid = item.artist && item.artist !== 'Unknown' && item.artist !== '群星' && item.artist !== '待定' && item.artist !== '歌手' && item.artist !== '音乐会';
            
            if (isExistingArtistInvalid && isNewArtistValid) {
                // console.log(`[Deduplication] Enriching Artist for "${existing.title}": ${existing.artist} -> ${item.artist}`);
                existing.artist = item.artist;
                
                // Optionally update title if it doesn't contain the new artist name
                if (!existing.title.includes(item.artist!)) {
                     // Remove old generic prefixes if any
                     let cleanTitle = existing.title.replace(/^【.*?】/, '');
                     existing.title = `【${item.artist}】${cleanTitle}`;
                }
                
                enrichedCount++;
            }
            
            // 2. Enrich other fields if needed (e.g. Status, if primary is 'Unknown' and secondary is 'On Sale')
            // (For now, just Artist is the priority)
            
        } else {
            merged.push(item);
            newCount++;
        }
    }

    console.log(`[Deduplication] Merged ${secondary.length} secondary items. Added ${newCount} new, Enriched ${enrichedCount} existing.`);
    return merged;
}
