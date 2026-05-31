import { NextResponse } from 'next/server';
import { getAgencyLastUpdates } from '@/lib/google-sheets'; // Your data source

// Define the response type
type AgencyUpdate = {
  name: string;
  lastUpdate: string;
  lastUpdateCount: number;
};

export async function GET() {
  try {
    const updates = await getAgencyLastUpdates();

    if (!Array.isArray(updates)) {
      throw new Error('Invalid data format from getAgencyLastUpdates');
    }

    return NextResponse.json(updates, {
      headers: {
        // Derived from the consumer data warm-fn cache (30s TTL), so
        // caching here for 30s is safe and eliminates repeated origin calls.
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}