import { NextResponse } from "next/server"
import { fetchConsumerData } from "@/lib/google-sheets"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await fetchConsumerData()

    // If the dataset is small (e.g., under 100 rows), return it all.
    // This avoids complex date logic for small datasets.
    if (data.length < 100) {
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    // Filter for rows updated in the last 48 hours to reliably cover timezone differences.
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    const patchData = data.filter((consumer) => {
      if (!consumer.lastUpdated) {
        return false;
      }
      try {
        // Robustly parse the lastUpdated string into a Date object.
        const updatedDate = new Date(consumer.lastUpdated);
        // Ensure the date is valid and falls within the last 48 hours.
        return !isNaN(updatedDate.getTime()) && updatedDate >= fortyEightHoursAgo;
      } catch (e) {
        console.error(`Failed to parse date string: "${consumer.lastUpdated}"`);
        return false;
      }
    });

    return NextResponse.json(patchData, {
      status: 200,
      headers: {
        // Ensure patches are never cached by the CDN or browser.
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch patch data" },
      { status: 500 }
    )
  }
}
