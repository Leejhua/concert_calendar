
import { getTargetCityList } from '../lib/damai-crawler';

async function main() {
    console.log('Fetching target city list...');
    try {
        const cities = await getTargetCityList();
        console.log(`\nFound ${cities.length} target cities:`);
        console.log(cities.join(', '));
    } catch (error) {
        console.error('Error fetching cities:', error);
    }
}

main();
