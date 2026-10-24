import { NextResponse } from "next/server";

// simplify 不使用服务端 WebDAV 同步；在解析目标或凭据前拒绝所有方法。
// 不提供重新开启旧代理的环境变量，避免恢复路径穿越及 SSRF 入口。
async function handle() {
  return NextResponse.json(
    { error: true, msg: "Server-side WebDAV proxy is disabled" },
    { status: 410 },
  );
}

export const PUT = handle;
export const GET = handle;
export const OPTIONS = handle;

export const runtime = "edge";
