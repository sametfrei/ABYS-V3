import { NextResponse } from "next/server";
import { getMarketPulse } from "@/lib/market-pulse";

export async function GET() {
  const data = await getMarketPulse();
  return NextResponse.json(data);
}
