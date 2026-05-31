import { NextResponse } from "next/server";
import { fetchConsumerData } from "@/lib/google-sheets";

// No force-dynamic — allow CDN to cache the response.
// The 24h s-maxage means most client loads are served from CDN edge.
// The integrity check below falls back to no-store only when data is incomplete.

export async function GET() {
  try {
    const data = await fetchConsumerData();
    const lastRow = data[data.length - 1];

    // If the last row has an ID but no agency, the sheet may still be loading.
    // Serve it but don't cache so the next client gets a fresh read.
    if (lastRow && lastRow.consumerId && !lastRow.agency) {
      return NextResponse.json(data, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    console.error("💥 API /consumers/base error:", error);
    return NextResponse.json({ error: "Failed to fetch base data" }, { status: 500 });
  }
}
