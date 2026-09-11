import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "The arbitrary URL proxy is disabled. Use a configured provider route.",
    },
    { status: 410 },
  );
}
