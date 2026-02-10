
import { fetchInitialToken, makeRequest, parseConcertNodes, getTargetCityList } from '../lib/damai-crawler';

async function diagnose() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: npx tsx scripts/debug_missing_concert.ts <CityName> <Keyword>');
        console.log('Example: npx tsx scripts/debug_missing_concert.ts 上海 邓紫棋');
        process.exit(1);
    }

    const [targetCity, keyword] = args;
    console.log(`🔍 Diagnosing: City="${targetCity}", Keyword="${keyword}"`);

    // 1. Auth
    await fetchInitialToken();

    // 2. Get City ID
    console.log('Fetching City ID...');
    const cityRes = await makeRequest('mtop.damai.wireless.area.groupcity', {
        platform: "8", comboChannel: "2", dmChannel: "damai@damaih5_h5"
    }, 'mtopjsonp4');

    let cityId = '';
    const groups = cityRes.data?.groups || [];
    const hotCities = cityRes.data?.hotCities || [];
    
    // Check hot cities first
    const hotCity = hotCities.find((c: any) => c.cityName === targetCity);
    if (hotCity) cityId = hotCity.cityId;

    // Check groups
    if (!cityId) {
        for (const group of groups) {
            if (group.sites) {
                const site = group.sites.find((s: any) => s.cityName === targetCity);
                if (site) {
                    cityId = site.cityId;
                    break;
                }
            }
        }
    }

    if (!cityId) {
        console.error(`❌ City "${targetCity}" not found in Damai list.`);
        process.exit(1);
    }
    console.log(`✅ Found City ID: ${cityId}`);

    // 3. Search Pages
    let found = false;
    let checkedCount = 0;

    console.log('Scanning first 10 pages...');
    for (let page = 1; page <= 10; page++) {
        console.log(`\n--- Page ${page} ---`);
        const args = {
            comboConfigRule: "true", sortType: "3", latitude: "0", longitude: "0",
            groupId: "2394", comboCityId: cityId, currentCityId: cityId,
            platform: "8", comboChannel: "2", dmChannel: "damai@damaih5_h5",
            pageIndex: String(page), pageSize: "20"
        };

        const res = await makeRequest('mtop.damai.mec.aristotle.get', {
            args: JSON.stringify(args), patternName: "category_solo", patternVersion: "4.2",
            platform: "8", comboChannel: "2", dmChannel: "damai@damaih5_h5"
        });

        if (!res.data?.nodes) {
            console.log('No more data.');
            break;
        }

        // We manually traverse to check EVERYTHING
        const checkNode = (node: any) => {
            if (node.type === '7587' && node.data) {
                const item = node.data;
                const title = item.name || item.showTag || item.projectName || '';
                const id = item.id || item.itemId;
                checkedCount++;

                if (title.includes(keyword)) {
                    console.log(`\n🎉 FOUND MATCH!`);
                    console.log(`ID: ${id}`);
                    console.log(`Title: ${title}`);
                    console.log(`Category: ${item.topRight?.tag || 'N/A'}`);
                    console.log(`ShowTag: ${item.showTag}`);
                    
                    // Check if it would be parsed
                    const parsed = parseConcertNodes([node], targetCity);
                    if (parsed.length > 0) {
                        console.log(`✅ Parsed Successfully:`, parsed[0]);
                    } else {
                        console.log(`⚠️ Parsed Result Empty! Why? Checking internal logic...`);
                        // Simulation logic from crawler
                        const INVALID_ARTIST_TAGS = ['演唱会', '榜', '热销', '上新', '优选', '折扣', '推荐', '必看', '演出', '麦'];
                        const showTag = item.showTag;
                        const isValidTag = showTag && !INVALID_ARTIST_TAGS.some(k => showTag.includes(k));
                        console.log(`   - ShowTag Valid? ${isValidTag}`);
                        // Note: parseConcertNodes doesn't filter out items unless structure is wrong.
                        // But maybe DeepSeek filter removes it later?
                        console.log(`   - DeepSeek Filter would check: "Candlelight", "Tribute", etc.`);
                    }
                    found = true;
                }
            } else {
                // Check if keyword exists in raw JSON even if type is not 7587
                const str = JSON.stringify(node);
                if (str.includes(keyword)) {
                    console.log(`\n❓ Found keyword in NON-CONCERT node (Type: ${node.type})`);
                    console.log(`   Data snippet: ${str.substring(0, 200)}...`);
                }
            }
            
            if (node.nodes) {
                node.nodes.forEach(checkNode);
            }
        };

        res.data.nodes.forEach(checkNode);
    }

    if (!found) {
        console.log(`\n❌ Scanned ${checkedCount} items, keyword "${keyword}" NOT found.`);
        console.log('Possibilities:');
        console.log('1. It is not in "Concert" category (groupId=2394).');
        console.log('2. It is not yet available in the API list.');
        console.log('3. City ID mismatch?');
    }
}

diagnose();
