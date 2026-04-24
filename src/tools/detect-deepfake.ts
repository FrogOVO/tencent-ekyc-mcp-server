/**
 * Tool: tencent_ekyc_detect_deepfake
 * 对应腾讯云 API: DetectAIFakeFaces
 *
 * v2 改动：支持 path / url / base64 三种输入。
 */

import { z } from "zod";
import { signAndCallTC3 } from "../auth/tc3-signer.js";
import {
  enhanceDeepfakeResponse,
  type DetectAIFakeFacesRaw,
} from "../enhancer/response-enhancer.js";
import { wrapEnhancedError } from "../enhancer/error-mapper.js";
import { loadEnv, missingCredentialsResponse } from "../config/env.js";
import { logger, redactPayload } from "../utils/logger.js";
import { loadResource } from "../utils/resource-loader.js";

export const DetectDeepfakeInputSchema = z.object({
  face_input_path: z
    .string()
    .optional()
    .describe(
      "⭐ Preferred: Absolute path to a LOCAL face image/video. Example: '/tmp/photo.jpg'.",
    ),
  face_input_url: z
    .string()
    .optional()
    .describe("http(s) URL of the face image/video to analyze."),
  face_input_base64: z
    .string()
    .optional()
    .describe(
      "Raw Base64 of the face image/video. Avoid if path/url available — consumes context.",
    ),
  face_input_type: z
    .union([z.literal(1), z.literal(2)])
    .describe("1 = image, 2 = video."),
});

export type DetectDeepfakeInput = z.infer<typeof DetectDeepfakeInputSchema>;

export const detectDeepfakeDefinition = {
  name: "tencent_ekyc_detect_deepfake",
  description: `Detect AI-generated fake faces, deepfakes, and face swaps in an image or short video. Uses Tencent Cloud eKYC's DetectAIFakeFaces API.

**⚠️ PREREQUISITE — Credentials required:** Before calling this tool, ensure credentials are configured. If unsure, call \`tencent_ekyc_get_credential_status\` first. If credentials are missing, ask the user for their Tencent Cloud SecretId / SecretKey, and instruct them to configure + restart the MCP client.

Use this as an additional security layer in identity verification flows, especially for:
- High-value transactions / payments / customer onboarding
- Regions with known high deepfake fraud rates
- A second-line confidence check after standard liveness

**How to pass the input:**
- ⭐ PREFERRED: use face_input_path with an ABSOLUTE local file path. The server reads the file itself — no Base64 in the agent conversation.
- Alternative: face_input_url (http/https).
- Last resort: face_input_base64 (only for small images, eats context).

Returns an attack_risk_level (Low / Mid / High) and a decision.suggested_action (PROCEED / MANUAL_REVIEW / REJECT). Complementary to tencent_ekyc_verify_identity (which does liveness + face comparison).`,
  inputSchema: {
    type: "object" as const,
    required: ["face_input_type"],
    properties: {
      face_input_path: {
        type: "string",
        description: "⭐ Preferred. Absolute path to local face image/video.",
      },
      face_input_url: {
        type: "string",
        description: "http(s) URL of face image/video.",
      },
      face_input_base64: {
        type: "string",
        description: "Raw Base64 (avoid if possible).",
      },
      face_input_type: { type: "number", enum: [1, 2], description: "1 = image, 2 = video." },
    },
  },
};

export async function executeDetectDeepfake(rawInput: unknown): Promise<unknown> {
  const startTime = Date.now();
  let input: DetectDeepfakeInput;
  try {
    input = DetectDeepfakeInputSchema.parse(rawInput);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return wrapEnhancedError({
      code: "InvalidParameter",
      message: `Input validation failed: ${msg}`,
    });
  }

  const env = loadEnv();
  if (!env) return missingCredentialsResponse("tencent_ekyc_detect_deepfake");

  let faceBase64: string;
  try {
    const face = await loadResource({
      path: input.face_input_path,
      url: input.face_input_url,
      base64: input.face_input_base64,
      options: { kind: input.face_input_type === 2 ? "video" : "image" },
    });
    faceBase64 = face.base64;
    logger.info("detect_deepfake:loaded", {
      source: face.source,
      bytes: face.bytes,
      sha256: face.sha256.slice(0, 12),
      input_type: input.face_input_type,
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    return wrapEnhancedError({
      code: err.code ?? "InvalidParameter",
      message: err.message,
    });
  }

  const payload = {
    FaceInput: faceBase64,
    FaceInputType: input.face_input_type,
  };

  logger.info("detect_deepfake:call", {
    tool: "tencent_ekyc_detect_deepfake",
    payload: redactPayload(payload),
    region: env.region,
  });

  try {
    const resp = await signAndCallTC3<DetectAIFakeFacesRaw>({
      service: "faceid",
      host: "faceid.tencentcloudapi.com",
      action: "DetectAIFakeFaces",
      version: "2018-03-01",
      region: env.region,
      payload,
      secretId: env.secretId,
      secretKey: env.secretKey,
      timeoutMs: env.timeoutMs,
    });

    if (resp.Response.Error) {
      logger.warn("detect_deepfake:error", {
        code: resp.Response.Error.Code,
        request_id: resp.Response.RequestId,
      });
      return wrapEnhancedError({
        code: resp.Response.Error.Code,
        message: resp.Response.Error.Message,
        requestId: resp.Response.RequestId,
      });
    }

    const enhanced = enhanceDeepfakeResponse(resp.Response as DetectAIFakeFacesRaw, { startTime });
    logger.info("detect_deepfake:ok", {
      request_id: enhanced.metadata.request_id,
      latency_ms: enhanced.metadata.processing_time_ms,
      attack_risk_level: enhanced.attack_risk_level,
      decision: enhanced.decision.suggested_action,
    });
    return enhanced;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("detect_deepfake:exception", { error: msg });
    return wrapEnhancedError({ code: "InternalError", message: msg });
  }
}
