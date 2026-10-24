/** @jest-environment node */
import { NextRequest } from "next/server";
import {
  GET as getArtifact,
  POST as postArtifact,
} from "../app/api/artifacts/route";
import { GET as getUpstash } from "../app/api/upstash/[action]/[...key]/route";

jest.mock("../app/config/server", () => ({
  getServerSideConfig: () => ({
    needCode: true,
    codes: new Set([require("spark-md5").hash("test-code")]),
    apiKey: "test-openai-key",
    cloudflareAccountId: "test-account",
    cloudflareKVNamespaceId: "test-namespace",
    cloudflareKVApiKey: "test-kv-key",
  }),
}));
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest
    .fn()
    .mockImplementation(
      async () =>
        new Response('{"success":true,"result":"value"}', {
          headers: { "content-type": "application/json" },
        }),
    );
});
afterAll(() => {
  global.fetch = originalFetch;
});

test.each([
  "../other",
  "../../../../accounts",
  "%2e%2e/other",
  "id?query",
  "id#fragment",
])("rejects artifact ID %s before using the server KV token", async (id) => {
  const response = await getArtifact(
    new NextRequest(
      `https://example.test/api/artifacts?id=${encodeURIComponent(id)}`,
    ),
  );
  expect(response.status).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
});
test("keeps public artifact sharing with a valid content ID", async () => {
  const id = "a".repeat(32);
  const response = await getArtifact(
    new NextRequest(`https://example.test/api/artifacts?id=${id}`),
  );
  expect(response.status).toBe(200);
  const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe(
    `https://api.cloudflare.com/client/v4/accounts/test-account/storage/kv/namespaces/test-namespace/values/${id}`,
  );
  expect(options.redirect).toBe("error");
});
test.each([undefined, "Bearer test-user-key", "Bearer nk-wrong-code"])(
  "requires the access code for artifact writes: %s",
  async (authorization) => {
    const req = new NextRequest("https://example.test/api/artifacts", {
      method: "POST",
      headers: authorization ? { Authorization: authorization } : {},
      body: "test-content",
    });
    expect((await postArtifact(req)).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  },
);
test("keeps authenticated artifact uploads working", async () => {
  const req = new NextRequest("https://example.test/api/artifacts", {
    method: "POST",
    headers: { Authorization: "Bearer nk-test-code" },
    body: "test-content",
  });
  expect((await postArtifact(req)).status).toBe(200);
  const [, options] = (global.fetch as jest.Mock).mock.calls[0];
  expect(options.headers.Authorization).toBe("Bearer test-kv-key");
  expect(options.redirect).toBe("error");
});
test.each([
  "https://user:password@tenant.upstash.io",
  "https://tenant.upstash.io?override=yes",
  "https://tenant.upstash.io#fragment",
])("rejects ambiguous Upstash endpoint %s", async (endpoint) => {
  const req = new NextRequest(
    `https://example.test/api/upstash/get/key?endpoint=${encodeURIComponent(
      endpoint,
    )}`,
  );
  const response = await getUpstash(req, {
    params: Promise.resolve({ action: "get", key: ["key"] }),
  });
  expect(response.status).toBe(403);
  expect(global.fetch).not.toHaveBeenCalled();
});
test("Upstash keeps its own token without logging credentials", async () => {
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  try {
    const req = new NextRequest(
      "https://example.test/api/upstash/get/key?endpoint=https://tenant.upstash.io",
      {
        headers: { Authorization: "Bearer test-upstash-token" },
      },
    );
    expect(
      (
        await getUpstash(req, {
          params: Promise.resolve({ action: "get", key: ["key"] }),
        })
      ).status,
    ).toBe(200);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://tenant.upstash.io/get/key");
    expect(options.headers.authorization).toBe("Bearer test-upstash-token");
    expect(options.redirect).toBe("manual");
    expect(JSON.stringify(log.mock.calls)).not.toContain("test-upstash-token");
  } finally {
    log.mockRestore();
  }
});
