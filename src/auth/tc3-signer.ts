/**
 * 腾讯云 TC3-HMAC-SHA256 签名实现（Node.js / TypeScript）。
 *
 * 官方规范：https://www.tencentcloud.com/document/product/213/33223
 *
 * 使用方式：
 *   import { signAndCallTC3 } from "./tc3-signer";
 *   const resp = await signAndCallTC3({
 *     service: "faceid",
 *     host:    "faceid.tencentcloudapi.com",
 *     action:  "CompareFaceLiveness",
 *     version: "2018-03-01",
 *     region:  "ap-singapore",
 *     payload: { ImageBase64, VideoBase64, LivenessType: "SILENT" },
 *     secretId:  process.env.TENCENT_SECRET_ID!,
 *     secretKey: process.env.TENCENT_SECRET_KEY!,
 *   });
 */

import { createHash, createHmac } from "node:crypto";

export interface TC3CallOptions {
  service: string;
  host: string;
  action: string;
  version: string;
  region?: string;
  payload: Record<string, unknown>;
  secretId: string;
  secretKey: string;
  timeoutMs?: number;
  token?: string;
}

function sha256Hex(message: string | Buffer): string {
  return createHash("sha256").update(message).digest("hex");
}

function hmac256(key: string | Buffer, message: string): Buffer {
  return createHmac("sha256", key).update(message, "utf8").digest();
}

export interface SignedHeaders {
  Authorization: string;
  "Content-Type": "application/json; charset=utf-8";
  Host: string;
  "X-TC-Action": string;
  "X-TC-Version": string;
  "X-TC-Timestamp": string;
  "X-TC-Region"?: string;
  "X-TC-Token"?: string;
}

export interface SignResult {
  headers: SignedHeaders;
  /** 必须用这个字符串作为 HTTP body，不能再 JSON.stringify 一次 */
  payloadString: string;
  timestamp: number;
}

export function signTC3(
  opts: TC3CallOptions,
  timestamp: number = Math.floor(Date.now() / 1000),
): SignResult {
  const { service, host, action, version, region, payload, secretId, secretKey, token } = opts;

  // --- Step 1: CanonicalRequest -------------------------------------------
  const httpRequestMethod = "POST";
  const canonicalUri = "/";
  const canonicalQueryString = "";

  const payloadString = JSON.stringify(payload);
  const hashedRequestPayload = sha256Hex(payloadString);

  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\n` +
    `host:${host}\n` +
    `x-tc-action:${action.toLowerCase()}\n`;

  const signedHeaders = "content-type;host;x-tc-action";

  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join("\n");

  // --- Step 2: StringToSign ------------------------------------------------
  const algorithm = "TC3-HMAC-SHA256";
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);

  const stringToSign = [algorithm, String(timestamp), credentialScope, hashedCanonicalRequest].join(
    "\n",
  );

  // --- Step 3: Signature ---------------------------------------------------
  const secretDate = hmac256("TC3" + secretKey, date);
  const secretService = hmac256(secretDate, service);
  const secretSigning = hmac256(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");

  // --- Step 4: Authorization Header ---------------------------------------
  const authorization =
    `${algorithm} ` +
    `Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  const headers: SignedHeaders = {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: host,
    "X-TC-Action": action,
    "X-TC-Version": version,
    "X-TC-Timestamp": String(timestamp),
  };
  if (region) headers["X-TC-Region"] = region;
  if (token) headers["X-TC-Token"] = token;

  return { headers, payloadString, timestamp };
}

export interface TC3Response<T = unknown> {
  Response: T & {
    RequestId?: string;
    Error?: { Code: string; Message: string };
  };
}

export async function signAndCallTC3<T = unknown>(opts: TC3CallOptions): Promise<TC3Response<T>> {
  const { headers, payloadString } = signTC3(opts);
  const url = `https://${opts.host}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: headers as unknown as Record<string, string>,
      body: payloadString,
      signal: ctrl.signal,
    });
    const json = (await resp.json()) as TC3Response<T>;
    return json;
  } finally {
    clearTimeout(timer);
  }
}
