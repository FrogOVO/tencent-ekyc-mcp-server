/**
 * Tool: tencent_ekyc_verify_identity
 * 对应腾讯云 API: CompareFaceLiveness
 *
 * v2 改动：支持 path / url / base64 三种输入，优先用 path 避免占用 Agent 上下文。
 */

import { z } from "zod";
import { signAndCallTC3 } from "../auth/tc3-signer.js";
import {
  enhanceVerifyResponse,
  type CompareFaceLivenessRaw,
} from "../enhancer/response-enhancer.js";
import { wrapEnhancedError } from "../enhancer/error-mapper.js";
import { loadEnv, missingCredentialsResponse } from "../config/env.js";
import { logger, redactPayload } from "../utils/logger.js";
import { loadResource } from "../utils/resource-loader.js";

export const VerifyIdentityInputSchema = z
  .object({
    // 三选一：图片
    image_path: z
      .string()
      .optional()
      .describe(
        "⭐ Preferred: Absolute path to a LOCAL reference face photo (JPG/PNG, max 3 MB). Example: '/tmp/photo.jpg'. The server reads the file and Base64-encodes it — this is the recommended way for agents to avoid consuming context window.",
      ),
    image_url: z
      .string()
      .optional()
      .describe(
        "Public http(s) URL of a reference face photo (JPG/PNG, max 3 MB). The server will download it.",
      ),
    image_base64: z
      .string()
      .optional()
      .describe(
        "Raw Base64 of the reference face photo (JPG/PNG, max 3 MB). Only use if image_path/image_url are not available; passing Base64 here consumes agent context.",
      ),

    // 三选一：视频
    video_path: z
      .string()
      .optional()
      .describe(
        "⭐ Preferred: Absolute path to a LOCAL selfie video (MP4/AVI/FLV, max 8 MB, 2-5s recommended). Example: '/tmp/selfie.mp4'.",
      ),
    video_url: z
      .string()
      .optional()
      .describe("Public http(s) URL of the selfie video."),
    video_base64: z
      .string()
      .optional()
      .describe(
        "Raw Base64 of the selfie video. Avoid if possible — videos are large and will consume agent context.",
      ),

    liveness_type: z
      .enum(["SILENT", "ACTION"])
      .describe(
        "SILENT = no user interaction needed (recommended for agent flows). ACTION = user must perform actions (mouth/blink/nod/shake).",
      ),
    action_sequence: z
      .string()
      .optional()
      .describe(
        "Required only when liveness_type=ACTION. Comma-separated action codes: 1=open mouth, 2=blink, 3=nod, 4=shake head. e.g. '1,2'. Max 2 actions.",
      ),
  })
  .describe(
    "For each of image/video, provide EXACTLY ONE of: *_path (local file, preferred), *_url (http/https), or *_base64.",
  );

export type VerifyIdentityInput = z.infer<typeof VerifyIdentityInputSchema>;

export const verifyIdentityDefinition = {
  name: "tencent_ekyc_verify_identity",
  description: `Verify a person's identity by comparing their live selfie/video against a reference face photo. Uses Tencent Cloud eKYC's CompareFaceLiveness API.

**⚠️ PREREQUISITE — Credentials required:** Before calling this tool, ensure credentials are configured. If unsure, call \`tencent_ekyc_get_credential_status\` first (it's instant and free). If credentials are missing, ask the user for their Tencent Cloud SecretId (starts with "AKID") and SecretKey, and instruct them to update the MCP client configuration and restart the client.

Core capabilities:
- SILENT liveness detection (no user interaction needed — ideal for agent-driven flows)
- ACTION liveness (open mouth / blink / nod / shake head — stronger security when user cooperation is available)
- Anti-spoofing against photos, screens, masks and deepfakes
- Face comparison against a reference image (similarity thresholds 70 / 80)

Regional coverage: Southeast Asia (ID, MY, PH, TH, SG, VN), Hong Kong, Macau, Brazil, plus International Passport.
Supported document types: 20+ (see tencent_ekyc_get_supported_documents).

**How to pass images/videos (important for token usage):**
- ⭐ PREFERRED: use image_path + video_path with ABSOLUTE file paths. The server reads files locally — Base64 never enters the agent conversation, saving massive context window.
- Alternative: image_url + video_url with public http(s) URLs.
- Last resort: image_base64 + video_base64 (these will eat 500K+ tokens; only use for small images when no other option exists).

Use SILENT mode for fully automated agent flows. Use ACTION mode for high-value operations. If SILENT fails, the response's fallback_params will suggest retrying in ACTION mode.

Returns structured verification with confidence, risk score, face-comparison detail, and a suggested_action (PROCEED / MANUAL_REVIEW / RETRY / REJECT / SWITCH_MODE).`,
  inputSchema: {
    type: "object" as const,
    required: ["liveness_type"],
    properties: {
      image_path: {
        type: "string",
        description: "⭐ Preferred. Absolute path to local reference face photo.",
      },
      image_url: {
        type: "string",
        description: "http(s) URL of reference face photo.",
      },
      image_base64: {
        type: "string",
        description: "Raw Base64 of reference face photo (avoid — consumes context).",
      },
      video_path: {
        type: "string",
        description: "⭐ Preferred. Absolute path to local selfie video.",
      },
      video_url: {
        type: "string",
        description: "http(s) URL of selfie video.",
      },
      video_base64: {
        type: "string",
        description: "Raw Base64 of selfie video (avoid — very large).",
      },
      liveness_type: { type: "string", enum: ["SILENT", "ACTION"] },
      action_sequence: {
        type: "string",
        description: "For ACTION mode: e.g. '1,2'.",
      },
    },
  },
};

export async function executeVerifyIdentity(rawInput: unknown): Promise<unknown> {
  const startTime = Date.now();
  let input: VerifyIdentityInput;

  try {
    input = VerifyIdentityInputSchema.parse(rawInput);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return wrapEnhancedError({
      code: "InvalidParameter",
      message: `Input validation failed: ${msg}`,
    });
  }

  const env = loadEnv();
  if (!env) return missingCredentialsResponse("tencent_ekyc_verify_identity");

  // 加载图片和视频（此处才是真正"把大数据带进进程"，但不经过 Agent 上下文）
  let imageBase64: string;
  let videoBase64: string;
  try {
    const image = await loadResource({
      path: input.image_path,
      url: input.image_url,
      base64: input.image_base64,
      options: { kind: "image" },
    });
    const video = await loadResource({
      path: input.video_path,
      url: input.video_url,
      base64: input.video_base64,
      options: { kind: "video" },
    });
    imageBase64 = image.base64;
    videoBase64 = video.base64;

    logger.info("verify_identity:loaded", {
      image_source: image.source,
      image_bytes: image.bytes,
      image_sha256: image.sha256.slice(0, 12),
      video_source: video.source,
      video_bytes: video.bytes,
      video_sha256: video.sha256.slice(0, 12),
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    return wrapEnhancedError({
      code: err.code ?? "InvalidParameter",
      message: err.message,
    });
  }

  const payload: Record<string, unknown> = {
    ImageBase64: imageBase64,
    VideoBase64: videoBase64,
    LivenessType: input.liveness_type,
  };
  if (input.liveness_type === "ACTION" && input.action_sequence) {
    payload.ValidateData = input.action_sequence;
  }

  logger.info("verify_identity:call", {
    tool: "tencent_ekyc_verify_identity",
    liveness_type: input.liveness_type,
    payload: redactPayload(payload),
    region: env.region,
  });

  try {
    const resp = await signAndCallTC3<CompareFaceLivenessRaw>({
      service: "faceid",
      host: "faceid.tencentcloudapi.com",
      action: "CompareFaceLiveness",
      version: "2018-03-01",
      region: env.region,
      payload,
      secretId: env.secretId,
      secretKey: env.secretKey,
      timeoutMs: env.timeoutMs,
    });

    if (resp.Response.Error) {
      logger.warn("verify_identity:error", {
        code: resp.Response.Error.Code,
        request_id: resp.Response.RequestId,
      });
      return wrapEnhancedError({
        code: resp.Response.Error.Code,
        message: resp.Response.Error.Message,
        requestId: resp.Response.RequestId,
      });
    }

    const enhanced = enhanceVerifyResponse(resp.Response as CompareFaceLivenessRaw, {
      startTime,
      region: env.region,
      method: input.liveness_type,
    });

    logger.info("verify_identity:ok", {
      request_id: enhanced.metadata.request_id,
      latency_ms: enhanced.metadata.processing_time_ms,
      decision: enhanced.decision.suggested_action,
      similarity: enhanced.face_comparison.similarity,
    });

    return enhanced;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("verify_identity:exception", { error: msg });
    return wrapEnhancedError({ code: "InternalError", message: msg });
  }
}
