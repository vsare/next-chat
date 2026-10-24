import { BAIDU_OATUH_URL } from "../constant";
/**
 * 使用 AK，SK 生成鉴权签名（Access Token）
 * @return 鉴权签名信息
 */
export async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<{
  access_token: string;
  expires_in: number;
  error?: number;
}> {
  const res = await fetch(
    `${BAIDU_OATUH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(
      clientId,
    )}&client_secret=${encodeURIComponent(clientSecret)}`,
    {
      method: "POST",
      redirect: "error",
      mode: "cors",
    },
  );
  const resJson = await res.json();
  return resJson;
}
