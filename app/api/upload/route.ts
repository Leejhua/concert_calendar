import { NextRequest, NextResponse } from 'next/server';
import { saveConcertsToStorage, getAllConcertsFromStorage } from '@/lib/db';
import { mergeConcertLists } from '@/lib/deduplication';
import { updateSyncStatus } from '@/lib/sync-status';
import { Concert } from '@/lib/damai-crawler';

/**
 * POST /api/upload
 * 
 * Receives crawled concert data from a local crawler and saves it.
 * 
 * Headers:
 *   Authorization: Bearer <UPLOAD_TOKEN>
 * 
 * Body (JSON):
 *   { 
 *     concerts: Concert[],
 *     mode?: 'merge' | 'replace'   // default: 'merge'
 *   }
 * 
 * - merge: merges uploaded data with existing data (deduplication)
 * - replace: replaces all existing data with uploaded data
 */
export async function POST(request: NextRequest) {
    // 1. Auth check
    const token = process.env.UPLOAD_TOKEN;
    if (token) {
        const authHeader = request.headers.get('authorization');
        const provided = authHeader?.replace('Bearer ', '');
        if (provided !== token) {
            return NextResponse.json(
                { success: false, message: 'Unauthorized' },
                { status: 401 }
            );
        }
    }

    try {
        const body = await request.json();
        const concerts: Concert[] = body.concerts;
        const mode: string = body.mode || 'merge';

        if (!Array.isArray(concerts) || concerts.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No concert data provided' },
                { status: 400 }
            );
        }

        // Validate basic structure
        const sample = concerts[0];
        if (!sample.id || !sample.title || !sample.date) {
            return NextResponse.json(
                { success: false, message: 'Invalid concert data structure. Required fields: id, title, date' },
                { status: 400 }
            );
        }

        let finalConcerts: Concert[];
        let existingCount = 0;

        if (mode === 'replace') {
            finalConcerts = concerts;
        } else {
            // merge mode: deduplicate with existing data
            const existing = await getAllConcertsFromStorage();
            existingCount = existing.length;
            finalConcerts = mergeConcertLists(existing, concerts);
        }

        await saveConcertsToStorage(finalConcerts);

        // Update sync status so the frontend knows data was refreshed
        updateSyncStatus({
            status: 'completed',
            progress: 100,
            message: `Upload complete: ${concerts.length} items received, ${finalConcerts.length} total after ${mode}`,
            result: {
                success: true,
                totalNew: finalConcerts.length - existingCount,
                totalCombined: finalConcerts.length,
            }
        });

        return NextResponse.json({
            success: true,
            received: concerts.length,
            total: finalConcerts.length,
            mode,
            message: `Saved ${finalConcerts.length} concerts (${mode} mode)`,
        });

    } catch (error: any) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
