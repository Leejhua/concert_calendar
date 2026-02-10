
import { getTargetCityList } from '../lib/damai-crawler';

async function main() {
    try {
        console.log('Fetching target city list...');
        const cities = await getTargetCityList();
        console.log('--- Target Cities ---');
        console.log(cities.join(', '));
        console.log(`Total: ${cities.length}`);
    } catch (error) {
        console.error('Error fetching cities:', error);
    }
}

main();
