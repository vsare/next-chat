/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/[provider]/[...path]/route";
import { POST as testModels } from "../app/api/model-test/route";
import { getServerSideConfig } from "../app/config/server";
import { providerRequestUrl } from "../app/api/upstream";
import { cloudflareAIGatewayUrl } from "../app/utils/cloudflare";

jest.mock("../app/config/server", () => {
  const config = {
    needCode: true,
    codes: new Set([require("spark-md5").hash("test-code")]),
    apiKey: "test-openai-key",
    anthropicApiKey: "test-anthropic-key",
    googleApiKey: "test-google-key",
    azureApiKey: "test-azure-key",
    alibabaApiKey: "test-alibaba-key",
    customModels: "",
    baseUrl: "https://cpa.example.test/openai",
    anthropicUrl: "https://cpa.example.test/anthropic",
    googleUrl: "https://cpa.example.test/google",
    azureUrl: "https://cpa.example.test/azure/openai/deployments/production",
    azureApiVersion: "2024-10-21",
    alibabaUrl: "https://cpa.example.test/alibaba/api",
  };
  return { getServerSideConfig: () => config };
});

const config = getServerSideConfig();
const defaults = { ...config };
const originalFetch = global.fetch;

async function dispatch(
  provider: string,
  path: string,
  legacy = false,
  method = "POST",
) {
  const pathname = path.split("?")[0];
  const prefix = legacy ? `/api/proxy/${provider}` : `/api/${provider}`;
  const req = new NextRequest(`https://example.test${prefix}/${path}`, {
    method,
    headers: {
      Authorization: "Bearer nk-test-code",
      "content-type": "application/json",
    },
    ...(method === "POST" && {
      body: JSON.stringify({ model: "custom-model", stream: true }),
    }),
  });
  const handler = method === "GET" ? GET : POST;
  return handler(req, {
    params: Promise.resolve({
      provider,
      path: pathname.split("/").map(decodeURIComponent),
    }),
  });
}

beforeEach(() => {
  Object.assign(config, defaults);
  global.fetch = jest.fn().mockImplementation(
    async () =>
      new Response('{"data":[],"choices":[]}', {
        headers: { "content-type": "application/json" },
      }),
  );
});
afterAll(() => {
  global.fetch = originalFetch;
});

test.each([
  ["openai", "v1/chat/completions", "/openai/v1/chat/completions"],
  ["anthropic", "v1/messages", "/anthropic/v1/messages"],
  [
    "google",
    "v1beta/models/gemini%2D2:streamGenerateContent?alt=sse",
    "/google/v1beta/models/gemini-2:streamGenerateContent?alt=sse",
  ],
  [
    "azure",
    "deployments/model%20name/chat/completions?api-version=2025-01-01-preview",
    "/azure/openai/deployments/model%20name/chat/completions?api-version=2025-01-01-preview",
  ],
  [
    "alibaba",
    "services/aigc/text-generation/generation",
    "/alibaba/api/services/aigc/text-generation/generation",
  ],
])(
  "preserves %s paths, encoding and legacy aliases",
  async (provider, path, expected) => {
    for (const legacy of [false, true]) {
      const response = await dispatch(provider, path, legacy);
      expect(response.status).toBe(200);
      const [url, options] = (global.fetch as jest.Mock).mock.calls.at(-1);
      expect(new URL(url).href).toBe(`https://cpa.example.test${expected}`);
      expect(options.redirect).toBe("manual");
    }
  },
);

test.each([
  ["anthropic", "v1/messages", "anthropicUrl", "claude"],
  ["google", "v1beta/models/model:generateContent", "googleUrl", "google"],
  [
    "alibaba",
    "services/aigc/text-generation/generation",
    "alibabaUrl",
    "alibaba",
  ],
])(
  "uses the parsed administrator URL for %s",
  async (provider, path, key, prefix) => {
    Object.assign(config, { [key]: `HTTPS://CPA.EXAMPLE.TEST/${prefix}` });
    await dispatch(provider, path);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).origin).toBe("https://cpa.example.test");
  },
);

test("Azure strips only the deployments segment and preserves its parent path", async () => {
  config.azureUrl =
    "https://cpa.example.test/deployments-proxy/openai/deployments/production";
  await dispatch("azure", "deployments/model/chat/completions");
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
    "https://cpa.example.test/deployments-proxy/openai/deployments/model/chat/completions?api-version=2024-10-21",
  );
});

test("preserves nested Azure prefixes and the configured deployment alias", async () => {
  config.azureUrl =
    "https://cpa.example.test/deployments/proxy/openai/deployments/deployments";
  config.customModels = "alias@azure";
  await dispatch("azure", "deployments/alias/chat/completions", false, "GET");
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
    "https://cpa.example.test/deployments/proxy/openai/deployments/deployments/chat/completions?api-version=2024-10-21",
  );
});

test.each(["../openai", "..\\openai", ".."])(
  "rejects decoded route segment %s before it changes the provider identity",
  async (segment) => {
    const response = await POST(
      new NextRequest("https://example.test/api/azure/encoded", {
        method: "POST",
        headers: { Authorization: "Bearer nk-test-code" },
        body: "{}",
      }),
      {
        params: Promise.resolve({
          provider: "azure",
          path: [segment, "v1", "chat", "completions"],
        }),
      },
    );
    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  },
);

test.each(["models", "embeddings", "chat/completions", "audio/speech"])(
  "Cloudflare OpenAI conversion keeps the complete %s operation",
  (operation) => {
    expect(
      cloudflareAIGatewayUrl(
        `https://gateway.ai.cloudflare.com/v1/account/gateway/openai/v1/${operation}`,
      ),
    ).toBe(
      `https://gateway.ai.cloudflare.com/v1/account/gateway/openai/${operation}`,
    );
  },
);

test("model tests use the same final Cloudflare target as chat", async () => {
  config.baseUrl =
    "https://gateway.ai.cloudflare.com/v1/account/gateway/openai";
  await testModels(
    new NextRequest("https://example.test/api/model-test", {
      method: "POST",
      headers: {
        Authorization: "Bearer nk-test-code",
        "content-type": "application/json",
      },
      body: JSON.stringify({ models: ["custom-model"] }),
    }),
  );
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
    "https://gateway.ai.cloudflare.com/v1/account/gateway/openai/chat/completions",
  );
});

test.each([
  [
    "https://gateway.ai.cloudflare.com/v1/account/gateway/azure-openai/resource/production/deployments/model/chat/completions?api-version=2024-10-21",
    "/v1/account/gateway/azure-openai/resource/model/chat/completions?api-version=2024-10-21",
  ],
  [
    "https://gateway.ai.cloudflare.com/v1/account/gateway/azure-openai/resource/deployments/model/chat/completions",
    "/v1/account/gateway/azure-openai/resource/model/chat/completions",
  ],
  [
    "https://gateway.ai.cloudflare.com/v1/account/gateway/azure-openai/resource/deployments/chat/completions",
    "/v1/account/gateway/azure-openai/resource/deployments/chat/completions",
  ],
])(
  "keeps Azure Gateway resource and operation boundaries",
  (input, expected) => {
    expect(cloudflareAIGatewayUrl(input)).toBe(
      `https://gateway.ai.cloudflare.com${expected}`,
    );
  },
);

test("supports an OpenAI Gateway base that already contains v1", () => {
  expect(
    providerRequestUrl(
      "https://gateway.ai.cloudflare.com/v1/account/gateway/openai/v1",
      "v1/chat/completions",
    ),
  ).toBe(
    "https://gateway.ai.cloudflare.com/v1/account/gateway/openai/chat/completions",
  );
});

test.each([
  "http://127.0.0.1:12345/cpa",
  "http://[::1]:12345/cpa",
  "http://cpa:8317/cpa",
])(
  "preserves explicitly configured local or Docker endpoint %s",
  (endpoint) => {
    expect(providerRequestUrl(endpoint, "v1/chat/completions")).toBe(
      `${endpoint}/v1/chat/completions`,
    );
  },
);
