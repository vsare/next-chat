import { ApiPath } from "@/app/constant";
import { NextRequest } from "next/server";
import { handle as openaiHandler } from "../../openai";
import { handle as azureHandler } from "../../azure";
import { handle as googleHandler } from "../../google";
import { handle as anthropicHandler } from "../../anthropic";
import { handle as baiduHandler } from "../../baidu";
import { handle as bytedanceHandler } from "../../bytedance";
import { handle as alibabaHandler } from "../../alibaba";
import { handle as moonshotHandler } from "../../moonshot";
import { handle as stabilityHandler } from "../../stability";
import { handle as iflytekHandler } from "../../iflytek";
import { handle as xaiHandler } from "../../xai";
import { handle as chatglmHandler } from "../../glm";

const MAX_REQUEST_SIZE = 2 * 1024 * 1024;
const SUPPORTED_API_PATHS = new Set([
  ApiPath.Azure,
  ApiPath.Google,
  ApiPath.Anthropic,
  ApiPath.Baidu,
  ApiPath.ByteDance,
  ApiPath.Alibaba,
  ApiPath.Moonshot,
  ApiPath.Stability,
  ApiPath.Iflytek,
  ApiPath.XAI,
  ApiPath.ChatGLM,
  ApiPath.OpenAI,
]);

function isRequestTooLarge(req: NextRequest) {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) return false;

  const size = Number(contentLength);
  return !Number.isFinite(size) || size < 0 || size > MAX_REQUEST_SIZE;
}

function requestTooLargeResponse() {
  return Response.json(
    { error: true, msg: "request body is too large" },
    { status: 413 },
  );
}

async function enforceRequestSize(req: NextRequest) {
  if (isRequestTooLarge(req)) return requestTooLargeResponse();
  if (!req.body) return req;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.byteLength;
      if (totalSize > MAX_REQUEST_SIZE) {
        await reader.cancel();
        return requestTooLargeResponse();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(req.headers);
  headers.delete("transfer-encoding");
  headers.set("content-length", String(totalSize));

  return new NextRequest(req.url, {
    method: req.method,
    headers,
    body,
    signal: req.signal,
    // @ts-ignore Node.js fetch requires duplex for streamed request bodies.
    duplex: "half",
  });
}

async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string; path: string[] }> },
) {
  const resolvedParams = await params;
  const apiPath = `/api/${resolvedParams.provider}`;

  if (!SUPPORTED_API_PATHS.has(apiPath as ApiPath)) {
    return Response.json(
      { error: true, msg: "unknown API provider" },
      { status: 404 },
    );
  }

  const sizeCheckedRequest = await enforceRequestSize(req);
  if (sizeCheckedRequest instanceof Response) return sizeCheckedRequest;
  req = sizeCheckedRequest;

  console.log(`[${resolvedParams.provider} Route] params `, resolvedParams);
  switch (apiPath) {
    case ApiPath.Azure:
      return azureHandler(req, { params: resolvedParams });
    case ApiPath.Google:
      return googleHandler(req, { params: resolvedParams });
    case ApiPath.Anthropic:
      return anthropicHandler(req, { params: resolvedParams });
    case ApiPath.Baidu:
      return baiduHandler(req, { params: resolvedParams });
    case ApiPath.ByteDance:
      return bytedanceHandler(req, { params: resolvedParams });
    case ApiPath.Alibaba:
      return alibabaHandler(req, { params: resolvedParams });
    // case ApiPath.Tencent: using "/api/tencent"
    case ApiPath.Moonshot:
      return moonshotHandler(req, { params: resolvedParams });
    case ApiPath.Stability:
      return stabilityHandler(req, { params: resolvedParams });
    case ApiPath.Iflytek:
      return iflytekHandler(req, { params: resolvedParams });
    case ApiPath.XAI:
      return xaiHandler(req, { params: resolvedParams });
    case ApiPath.ChatGLM:
      return chatglmHandler(req, { params: resolvedParams });
    case ApiPath.OpenAI:
      return openaiHandler(req, { params: resolvedParams });
    default:
      return Response.json(
        { error: true, msg: "unknown API provider" },
        { status: 404 },
      );
  }
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;

export const runtime = "edge";
export const preferredRegion = [
  "arn1",
  "bom1",
  "cdg1",
  "cle1",
  "cpt1",
  "dub1",
  "fra1",
  "gru1",
  "hnd1",
  "iad1",
  "icn1",
  "kix1",
  "lhr1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1",
];
