import { cloudflareAIGatewayUrl } from "../utils/cloudflare";

// 仅用于服务端可信配置。请求头、查询参数不能扩充目标允许范围。
export function parseServerEndpoint(value: string) {
  const input = value.trim();
  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(input)
    ? input
    : `https://${input}`;
  const url = new URL(normalized);
  const authority = normalized.split("/")[2];

  if (
    !input ||
    /[\s\\]/.test(input) ||
    !["https:", "http:"].includes(url.protocol) ||
    !url.hostname ||
    url.port === "0" ||
    url.username ||
    url.password ||
    /[%@]/.test(authority) ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid configured provider endpoint");
  }

  return url;
}

export function providerRequestUrl(endpoint: string, path: string) {
  const base = parseServerEndpoint(endpoint);
  const target = new URL(
    `${base.href.replace(/\/$/, "")}/${path.replace(/^\/+/, "")}`,
  );
  if (
    target.origin !== base.origin ||
    target.username ||
    target.password ||
    !target.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`)
  ) {
    throw new Error("Request escapes configured provider endpoint");
  }
  const finalTarget = new URL(cloudflareAIGatewayUrl(target.href));
  // Gateway 转换可调整 provider 内部路径，但不能改变 origin、account 或 gateway。
  const gatewayParts = base.pathname.split("/");
  const isGateway =
    base.protocol === "https:" &&
    base.hostname === "gateway.ai.cloudflare.com" &&
    !base.port &&
    gatewayParts[1] === "v1";
  const prefix = isGateway
    ? gatewayParts
        .slice(0, gatewayParts[4] === "azure-openai" ? 6 : 5)
        .join("/")
    : base.pathname.replace(/\/$/, "");
  if (
    finalTarget.origin !== base.origin ||
    !finalTarget.pathname.startsWith(`${prefix}/`)
  ) {
    throw new Error("Converted request escapes configured provider endpoint");
  }
  return finalTarget.href;
}
