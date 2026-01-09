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
      
      let updatedDate: Date | null = null;
      const dateStr = consumer.lastUpdated;
    
      // Try parsing YYYY-MM-DD (ISO format)
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        updatedDate = new Date(dateStr);
      } 
      // Try parsing DD-MM-YYYY
      else if (/^\d{2}-\d{2}-\d{4}/.test(dateStr)) {
        const [day, month, year] = dateStr.split(/[-/]/);
        updatedDate = new Date(`${year}-${month}-${day}`);
      }
      // Try parsing MM/DD/YYYY from Sheets (and other formats JS `new Date` can handle)
      else {
        // This handles MM/DD/YYYY and full timestamps like "1/9/2026 14:35:10"
        updatedDate = new Date(dateStr);
      }
      
      return updatedDate && !isNaN(updatedDate.getTime()) && updatedDate >= fortyEightHoursAgo;
    });

    return NextResponse.json(patchData, {
      status: 200,
      headers: {
        // Ensure patches are never cached by the CDN or browser.
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("💥 API /consumers/patch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch patch data" },
      { status: 500 }
    )
  }
}
