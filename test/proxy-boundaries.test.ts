/** @jest-environment node */

import { NextRequest } from "next/server";
import { ModelProvider } from "../app/constant";
import { auth } from "../app/api/auth";
import {
  GET as webdavGet,
  PUT as webdavPut,
  OPTIONS as webdavOptions,
} from "../app/api/webdav/[...path]/route";
import { POST as modelTest } from "../app/api/model-test/route";
import { POST as providerPost } from "../app/api/[provider]/[...path]/route";
import { getServerSideConfig } from "../app/config/server";

const mockConfig = getServerSideConfig();

jest.mock("../app/config/server", () => {
  const config = {
    needCode: true,
    codes: new Set([require("spark-md5").hash("test-access-code")]),
    apiKey: "test-server-key",
    baseUrl: "https://api.openai.com",
    customModels: "",
    allowedWebDavEndpoints: [],
    hideUserApiKey: false,
  };
  return { getServerSideConfig: () => config };
});

describe("proxy credential and destination boundaries", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockConfig.baseUrl = "https://api.openai.com";
    mockConfig.apiKey = "test-server-key";
    global.fetch = jest.fn().mockResolvedValue(
      new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test.each([undefined, "Bearer nk-wrong-code"])(
    "rejects missing or invalid access credentials: %s",
    async (authorization) => {
      const response = await providerPost(
        new NextRequest("https://example.test/api/openai/v1/chat/completions", {
          method: "POST",
          headers: authorization ? { Authorization: authorization } : {},
          body: JSON.stringify({ model: "custom-model", stream: true }),
        }),
        {
          params: Promise.resolve({
            provider: "openai",
            path: ["v1", "chat", "completions"],
          }),
        },
      );
      expect(response.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  test.each([
    "https://api.openai.com",
    "https://cpa.example.test/compatible",
    "http://127.0.0.1:12345/cpa",
  ])(
    "preserves administrator-configured endpoint %s and SSE",
    async (endpoint) => {
      mockConfig.baseUrl = endpoint;
      const response = await providerPost(
        new NextRequest("https://example.test/api/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer nk-test-access-code",
            "x-base-url": "http://169.254.169.254",
          },
          body: JSON.stringify({ model: "custom-model", stream: true }),
        }),
        {
          params: Promise.resolve({
            provider: "openai",
            path: ["v1", "chat", "completions"],
          }),
        },
      );
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(String(url)).toBe(`${endpoint}/v1/chat/completions`);
      expect(options.headers.Authorization).toBe("Bearer test-server-key");
      expect(options.redirect).toBe("manual");
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(await response.text()).toContain("data: [DONE]");
    },
  );

  test("preserves a user-supplied API key without granting the server key", () => {
    const req = new NextRequest("https://example.test/api/openai/v1/models", {
      headers: { Authorization: "Bearer test-user-key" },
    });
    expect(auth(req, ModelProvider.GPT).error).toBe(false);
    expect(req.headers.get("Authorization")).toBe("Bearer test-user-key");
  });

  test("does not forward the access code when the server key is missing", () => {
    mockConfig.apiKey = "";
    const req = new NextRequest("https://example.test/api/openai/v1/models", {
      headers: { Authorization: "Bearer nk-test-access-code" },
    });
    expect(auth(req, ModelProvider.GPT).error).toBe(false);
    expect(req.headers.has("Authorization")).toBe(false);
  });

  test("uses resolved provider parameters after a legacy internal rewrite", async () => {
    const response = await providerPost(
      new NextRequest(
        "https://example.test/api/proxy/openai/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: "Bearer nk-test-access-code" },
          body: JSON.stringify({ model: "custom-model", stream: true }),
        },
      ),
      {
        params: Promise.resolve({
          provider: "openai",
          path: ["v1", "chat", "completions"],
        }),
      },
    );
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(response.status).toBe(200);
  });

  test.each([
    "https://api.openai.com.attacker.example",
    "https://example-api.openai.com",
    "https://api.openai.com@attacker.example:8443",
    "http://[::1]",
    "http://169.254.169.254",
  ])(
    "never uses client-supplied destination %s for the server key",
    async (target) => {
      const response = await providerPost(
        new NextRequest("https://example.test/api/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer nk-test-access-code",
            "x-base-url": target,
          },
          body: JSON.stringify({ model: "custom-model", stream: true }),
        }),
        {
          params: Promise.resolve({
            provider: "openai",
            path: ["v1", "chat", "completions"],
          }),
        },
      );
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
        "https://api.openai.com/v1/chat/completions",
      );
      expect(response.status).toBe(200);
    },
  );

  test.each([ModelProvider.Ernie, ModelProvider.Hunyuan])(
    "requires the access code for provider %s that always uses server credentials",
    (provider) => {
      const req = new NextRequest("https://example.test/api/provider/chat", {
        headers: { Authorization: "Bearer test-user-key" },
      });
      expect(auth(req, provider).error).toBe(true);
    },
  );

  test.each([
    "https://user:password@api.openai.com",
    "https://api.openai.com:99999",
    "https://api.openai.com:0",
    "ftp://api.openai.com",
    "https://api%2eopenai.com",
    "https://api.openai.com?override=https://attacker.example",
  ])(
    "rejects ambiguous configured endpoint %s before key injection",
    (endpoint) => {
      mockConfig.baseUrl = endpoint;
      const req = new NextRequest("https://example.test/api/openai/v1/models", {
        headers: { Authorization: "Bearer nk-test-access-code" },
      });
      expect(auth(req, ModelProvider.GPT).error).toBe(true);
      expect(req.headers.get("Authorization")).not.toContain("test-server-key");
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  test.each([webdavGet, webdavPut, webdavOptions])(
    "disables every exported WebDAV handler before any fetch",
    async (handler) => {
      const response = await handler();
      expect(response.status).toBe(410);
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  test("model test never follows a credential-bearing redirect", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response("{}", {
        status: 307,
        headers: { location: "http://169.254.169.254/" },
      }),
    );
    await modelTest(
      new NextRequest("https://example.test/api/model-test", {
        method: "POST",
        headers: {
          Authorization: "Bearer nk-test-access-code",
          "content-type": "application/json",
        },
        body: JSON.stringify({ models: ["custom-model"] }),
      }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][1].redirect).toBe("error");
  });
});
