import { NextResponse } from 'next/server';
import { getAgencyLastUpdates } from '@/lib/google-sheets'; // Your data source

// Define the response type
type AgencyUpdate = {
  name: string;
  lastUpdate: string;
};

export async function GET() {
  try {
    console.log('Fetching agency updates...'); // Debug log
    
    const updates = await getAgencyLastUpdates();
    
    // Validate response format
    if (!Array.isArray(updates)) {
      throw new Error('Invalid data format from getAgencyLastUpdates');
    }
    
    return NextResponse.json(updates);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}