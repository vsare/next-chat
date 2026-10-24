import { NextRequest } from "next/server";
import { getServerSideConfig } from "../config/server";
import md5 from "spark-md5";
import {
  ACCESS_CODE_PREFIX,
  ModelProvider,
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  GEMINI_BASE_URL,
  STABILITY_BASE_URL,
  BAIDU_BASE_URL,
  BYTEDANCE_BASE_URL,
  ALIBABA_BASE_URL,
  TENCENT_BASE_URL,
  MOONSHOT_BASE_URL,
  IFLYTEK_BASE_URL,
  XAI_BASE_URL,
  CHATGLM_BASE_URL,
} from "../constant";
import { parseServerEndpoint } from "./upstream";

function getIP(req: NextRequest) {
  let ip = req.headers.get("x-real-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (!ip && forwardedFor) {
    ip = forwardedFor.split(",").at(0) ?? "";
  }

  return ip;
}

function parseApiKey(bearToken: string) {
  const token = bearToken
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
  const isApiKey = !token.startsWith(ACCESS_CODE_PREFIX);

  return {
    accessCode: isApiKey ? "" : token.slice(ACCESS_CODE_PREFIX.length),
    apiKey: isApiKey ? token : "",
  };
}

export function auth(req: NextRequest, modelProvider: ModelProvider) {
  const authToken = req.headers.get("Authorization") ?? "";

  // check if it is openai api key or user token
  const { accessCode, apiKey } = parseApiKey(authToken);

  const hashedCode = md5.hash(accessCode ?? "").trim();

  const serverConfig = getServerSideConfig();
  console.log("[User IP] ", getIP(req));
  console.log("[Time] ", new Date().toLocaleString());

  // 这两个处理器始终使用服务端签名/Token；任意自带 Key 不能代替访问码。
  const requiresServerCredentials =
    modelProvider === ModelProvider.Ernie ||
    modelProvider === ModelProvider.Hunyuan;
  if (
    serverConfig.needCode &&
    !serverConfig.codes.has(hashedCode) &&
    (!apiKey || requiresServerCredentials)
  ) {
    return {
      error: true,
      msg: !accessCode ? "empty access code" : "wrong access code",
    };
  }

  if (serverConfig.hideUserApiKey && !!apiKey) {
    return {
      error: true,
      msg: "you are not allowed to access with your own api key",
    };
  }

  // Validate the administrator-selected destination before injecting a key.
  const isAzure = req.nextUrl.pathname.startsWith("/api/azure/");
  const endpoints: Partial<Record<ModelProvider, string | undefined>> = {
    [ModelProvider.GPT]: isAzure
      ? serverConfig.azureUrl
      : serverConfig.baseUrl || OPENAI_BASE_URL,
    [ModelProvider.Claude]:
      serverConfig.anthropicUrl || serverConfig.baseUrl || ANTHROPIC_BASE_URL,
    [ModelProvider.GeminiPro]: serverConfig.googleUrl || GEMINI_BASE_URL,
    [ModelProvider.Stability]: serverConfig.stabilityUrl || STABILITY_BASE_URL,
    [ModelProvider.Ernie]: serverConfig.baiduUrl || BAIDU_BASE_URL,
    [ModelProvider.Doubao]: serverConfig.bytedanceUrl || BYTEDANCE_BASE_URL,
    [ModelProvider.Qwen]: serverConfig.alibabaUrl || ALIBABA_BASE_URL,
    [ModelProvider.Hunyuan]: serverConfig.tencentUrl || TENCENT_BASE_URL,
    [ModelProvider.Moonshot]: serverConfig.moonshotUrl || MOONSHOT_BASE_URL,
    [ModelProvider.Iflytek]: serverConfig.iflytekUrl || IFLYTEK_BASE_URL,
    [ModelProvider.XAI]: serverConfig.xaiUrl || XAI_BASE_URL,
    [ModelProvider.ChatGLM]: serverConfig.chatglmUrl || CHATGLM_BASE_URL,
  };
  try {
    parseServerEndpoint(endpoints[modelProvider] ?? "");
  } catch {
    return { error: true, msg: "invalid configured provider endpoint" };
  }

  if (!apiKey) {
    const serverConfig = getServerSideConfig();

    // const systemApiKey =
    //   modelProvider === ModelProvider.GeminiPro
    //     ? serverConfig.googleApiKey
    //     : serverConfig.isAzure
    //     ? serverConfig.azureApiKey
    //     : serverConfig.apiKey;

    let systemApiKey: string | undefined;

    switch (modelProvider) {
      case ModelProvider.Stability:
        systemApiKey = serverConfig.stabilityApiKey;
        break;
      case ModelProvider.GeminiPro:
        systemApiKey = serverConfig.googleApiKey;
        break;
      case ModelProvider.Claude:
        systemApiKey = serverConfig.anthropicApiKey;
        break;
      case ModelProvider.Doubao:
        systemApiKey = serverConfig.bytedanceApiKey;
        break;
      case ModelProvider.Ernie:
        systemApiKey = serverConfig.baiduApiKey;
        break;
      case ModelProvider.Qwen:
        systemApiKey = serverConfig.alibabaApiKey;
        break;
      case ModelProvider.Moonshot:
        systemApiKey = serverConfig.moonshotApiKey;
        break;
      case ModelProvider.Iflytek:
        systemApiKey =
          serverConfig.iflytekApiKey + ":" + serverConfig.iflytekApiSecret;
        break;
      case ModelProvider.XAI:
        systemApiKey = serverConfig.xaiApiKey;
        break;
      case ModelProvider.ChatGLM:
        systemApiKey = serverConfig.chatglmApiKey;
        break;
      case ModelProvider.GPT:
      default:
        if (isAzure) {
          systemApiKey = serverConfig.azureApiKey;
        } else {
          systemApiKey = serverConfig.apiKey;
        }
    }

    if (systemApiKey) {
      console.log("[Auth] use system api key");
      req.headers.set("Authorization", `Bearer ${systemApiKey}`);
    } else {
      console.log("[Auth] admin did not provide an api key");
      req.headers.delete("Authorization");
    }
  } else {
    console.log("[Auth] use user api key");
  }

  return {
    error: false,
  };
}
