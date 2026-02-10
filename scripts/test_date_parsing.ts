
import { transformConcertsToEvents } from '../lib/data-transformer';

const testConcerts = [
    {
        id: '1',
        title: 'Normal Date',
        date: '2026.03.28 周六 19:00',
        image: '', city: '杭州', venue: '', price: '', status: '', category: '', artist: ''
    },
    {
        id: '2',
        title: 'Leading Space',
        date: ' 2026.03.29 周日 19:00',
        image: '', city: '杭州', venue: '', price: '', status: '', category: '', artist: ''
    },
    {
        id: '3',
        title: 'Prefix Text',
        date: '时间：2026.03.30',
        image: '', city: '杭州', venue: '', price: '', status: '', category: '', artist: ''
    }
];

// Mock console.warn to suppress output
const originalWarn = console.warn;
console.warn = () => {};

const events = transformConcertsToEvents(testConcerts as any);

// Restore console.warn
console.warn = originalWarn;

console.log('--- Parsing Results ---');
events.forEach(e => {
    console.log(`[${e.title}] -> ${e.start.toLocaleString()}`);
});

if (events.length === 3) {
    console.log('\n✅ All formats parsed successfully!');
} else {
    console.error(`\n❌ Failed: Expected 3 events, got ${events.length}`);
}
