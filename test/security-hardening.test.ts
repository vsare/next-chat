/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET as providerHandler } from "../app/api/[provider]/[...path]/route";
import { POST as disabledProxyPost } from "../app/api/proxy/route";
import { GET as upstashGet } from "../app/api/upstash/[action]/[...key]/route";
import { addMcpServer, isMcpEnabled } from "../app/mcp/actions";
import { getModelTestApiKey } from "../app/api/model-test/auth";

describe("server-side security boundaries", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test.each([
    "proxy",
    "http://127.0.0.1",
    "localhost",
    "api.openai.com.example.com",
    "example-api.openai.com",
    "api.openai.com.attacker.example",
  ])("rejects unknown provider %s without fetching", async (provider) => {
    const request = new NextRequest(`https://example.test/api/${provider}/v1`);
    const response = await providerHandler(request, {
      params: Promise.resolve({ provider, path: ["v1"] }),
    });

    expect(response.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("rejects oversized provider requests before dispatch", async () => {
    const request = new NextRequest(
      "https://example.test/api/openai/v1/models",
      {
        headers: { "content-length": String(2 * 1024 * 1024 + 1) },
      },
    );
    const response = await providerHandler(request, {
      params: Promise.resolve({ provider: "openai", path: ["v1", "models"] }),
    });

    expect(response.status).toBe(413);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("rejects an oversized streamed body without a content-length header", async () => {
    const request = new NextRequest(
      "https://example.test/api/openai/v1/chat/completions",
      {
        method: "POST",
        body: new Uint8Array(2 * 1024 * 1024 + 1),
      },
    );
    const response = await providerHandler(request, {
      params: Promise.resolve({
        provider: "openai",
        path: ["v1", "chat", "completions"],
      }),
    });

    expect(response.status).toBe(413);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("keeps the legacy arbitrary URL proxy disabled", async () => {
    const response = await disabledProxyPost();

    expect(response.status).toBe(410);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each([
    "http://127.0.0.1",
    "http://localhost",
    "http://10.0.0.1",
    "http://172.17.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254",
    "https://example.upstash.io.attacker.example",
    "http://example.upstash.io",
  ])("rejects unsafe Upstash endpoint %s", async (endpoint) => {
    const request = new NextRequest(
      `https://example.test/api/upstash/get/key?endpoint=${encodeURIComponent(
        endpoint,
      )}`,
    );
    const response = await upstashGet(request, {
      params: Promise.resolve({ action: "get", key: ["key"] }),
    });

    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("disables MCP process execution even when a command is supplied", async () => {
    await expect(
      addMcpServer("malicious", {
        command: "powershell",
        args: ["-Command", "Get-ChildItem Env:"],
      }),
    ).rejects.toThrow("MCP command execution is disabled");
    await expect(isMcpEnabled()).resolves.toBe(false);
  });

  test("never treats an access code as an upstream API key", () => {
    const accessCodeRequest = new NextRequest(
      "https://example.test/api/model-test",
      { headers: { Authorization: "Bearer nk-private-access-code" } },
    );
    const userKeyRequest = new NextRequest(
      "https://example.test/api/model-test",
      { headers: { Authorization: "Bearer sk-user-key" } },
    );

    expect(getModelTestApiKey(accessCodeRequest, undefined)).toBeUndefined();
    expect(getModelTestApiKey(accessCodeRequest, "sk-server-key")).toBe(
      "sk-server-key",
    );
    expect(getModelTestApiKey(userKeyRequest, "sk-server-key")).toBe(
      "sk-user-key",
    );
  });
});
