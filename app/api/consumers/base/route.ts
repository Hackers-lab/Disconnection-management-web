// c:\Users\Pc\Documents\GitHub\Disconnection-management-web\app\api\consumers\base\route.ts
import { NextResponse } from "next/server";
import { fetchConsumerData } from "@/lib/google-sheets";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await fetchConsumerData();
    const lastRow = data[data.length - 1];

    // Smart Integrity Check
    if (lastRow && lastRow.consumerId && !lastRow.agency) {
      // Data is incomplete, prevent caching
      return NextResponse.json(data, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    // Data is complete, allow caching
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    console.error("💥 API /consumers/base error:", error);
    return NextResponse.json(
      { error: "Failed to fetch base data" },
      { status: 500 }
    );
  }
}
