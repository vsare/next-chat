import { NextRequest, NextResponse } from "next/server";

export async function handle(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.warn(
    "[Proxy Route] blocked deprecated arbitrary proxy request",
    params,
  );
  return NextResponse.json(
    { error: true, msg: "arbitrary upstream proxying is disabled" },
    { status: 410 },
  );
}
