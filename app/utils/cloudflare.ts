export function cloudflareAIGatewayUrl(fetchUrl: string) {
  // 客户端也调用此函数，保留本地 /api 路径。
  let url: URL;
  try {
    url = new URL(fetchUrl);
  } catch {
    return fetchUrl;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "gateway.ai.cloudflare.com" ||
    url.port ||
    url.username ||
    url.password
  )
    return fetchUrl;

  const parts = url.pathname.split("/");
  // /v1/{account}/{gateway}/{provider}/...
  if (parts[1] !== "v1") return fetchUrl;
  if (parts[4] === "openai" && parts[5] === "v1") {
    while (parts[5] === "v1") parts.splice(5, 1);
  } else if (parts[4] === "azure-openai") {
    // 保留配置中的 resource；只移除附加的 deployments 标记及旧 deployment。
    const index =
      parts[7] === "deployments"
        ? 7
        : parts[6] === "deployments" && parts.length >= 10
        ? 6
        : -1;
    if (index === 6 || index === 7) {
      parts.splice(6, index - 5);
    }
  }
  url.pathname = parts.join("/");
  return url.href;
}
