import { NextRequest, NextResponse } from "next/server";

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ action: string; key: string[] }> },
) {
  const resolvedParams = await params;
  const requestUrl = new URL(req.url);
  const endpoint = requestUrl.searchParams.get("endpoint");

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }
  let endpointUrl: URL | null = null;
  try {
    endpointUrl = endpoint ? new URL(endpoint) : null;
  } catch {
    endpointUrl = null;
  }

  // only allow to request to *.upstash.io
  if (
    !endpointUrl ||
    endpointUrl.protocol !== "https:" ||
    (endpointUrl.port !== "" && endpointUrl.port !== "443") ||
    !endpointUrl.hostname.endsWith(".upstash.io")
  ) {
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + resolvedParams.key.join("/"),
      },
      {
        status: 403,
      },
    );
  }

  // only allow upstash get and set method
  if (resolvedParams.action !== "get" && resolvedParams.action !== "set") {
    console.log("[Upstash Route] forbidden action ", resolvedParams.action);
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + resolvedParams.action,
      },
      {
        status: 403,
      },
    );
  }

  const targetUrl = `${endpoint}/${
    resolvedParams.action
  }/${resolvedParams.key.join("/")}`;

  const method = req.method;
  const shouldNotHaveBody = ["get", "head"].includes(
    method?.toLowerCase() ?? "",
  );

  const fetchOptions: RequestInit = {
    headers: {
      authorization: req.headers.get("authorization") ?? "",
    },
    body: shouldNotHaveBody ? null : req.body,
    method,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
  };

  console.log("[Upstash Proxy]", targetUrl, fetchOptions);
  const fetchResult = await fetch(targetUrl, fetchOptions);

  console.log("[Any Proxy]", targetUrl, {
    status: fetchResult.status,
    statusText: fetchResult.statusText,
  });

  return fetchResult;
}

export const POST = handle;
export const GET = handle;
export const OPTIONS = handle;

export const runtime = "edge";
