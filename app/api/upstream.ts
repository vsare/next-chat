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
  const target = new URL(`${base.href.replace(/\/$/, "")}/${path}`);
  if (
    target.origin !== base.origin ||
    target.username ||
    target.password ||
    !target.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`)
  ) {
    throw new Error("Request escapes configured provider endpoint");
  }
  return target.href;
}
