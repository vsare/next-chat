import { NextRequest } from "next/server";
import { ACCESS_CODE_PREFIX } from "@/app/constant";

export function getModelTestApiKey(
  req: NextRequest,
  configuredApiKey: string | undefined,
) {
  const requestToken =
    req.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? "";

  return requestToken.startsWith(ACCESS_CODE_PREFIX)
    ? configuredApiKey
    : requestToken || configuredApiKey;
}
