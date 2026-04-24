/**
 * Tool: tencent_ekyc_check_image_quality
 * 本地预检，无 API 调用。
 *
 * v2 改动：支持 path / url / base64 三种输入。
 */

import { z } from "zod";
import { loadResource } from "../utils/resource-loader.js";

export const CheckQualityInputSchema = z.object({
  image_path: z
    .string()
    .optional()
    .describe(
      "⭐ Preferred: Absolute path to a LOCAL image file. Example: '/tmp/photo.jpg'.",
    ),
  image_url: z.string().optional().describe("http(s) URL of the image."),
  image_base64: z
    .string()
    .optional()
    .describe("Raw Base64 of the image. Avoid if path/url available."),
  check_type: z
    .enum(["FACE_PHOTO", "ID_DOCUMENT"])
    .describe("FACE_PHOTO = selfie. ID_DOCUMENT = ID card / passport photo."),
});

export type CheckQualityInput = z.infer<typeof CheckQualityInputSchema>;

export const checkQualityDefinition = {
  name: "tencent_ekyc_check_image_quality",
  description: `Pre-check image quality before submitting for identity verification. Validates size, format, and Base64 encoding correctness, returning specific, actionable feedback. Call this FIRST in multi-step verification flows to reduce failed attempts.

This tool runs entirely locally and does NOT consume remote API quota.

**How to pass the image:**
- ⭐ PREFERRED: use image_path with an ABSOLUTE local file path. The server reads the file — no Base64 in the agent conversation.
- Alternative: image_url (http/https).
- Last resort: image_base64.`,
  inputSchema: {
    type: "object" as const,
    required: ["check_type"],
    properties: {
      image_path: {
        type: "string",
        description: "⭐ Preferred. Absolute path to local image.",
      },
      image_url: { type: "string", description: "http(s) URL." },
      image_base64: { type: "string", description: "Raw Base64 (avoid)." },
      check_type: { type: "string", enum: ["FACE_PHOTO", "ID_DOCUMENT"] },
    },
  },
};

interface Issue {
  code: string;
  severity: "error" | "warning";
  instruction: string;
}

function detectMagic(bytes: Buffer): "JPG" | "PNG" | "UNKNOWN" {
  if (bytes.length < 8) return "UNKNOWN";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "JPG";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "PNG";
  }
  return "UNKNOWN";
}

export async function executeCheckQuality(rawInput: unknown): Promise<unknown> {
  let input: CheckQualityInput;
  try {
    input = CheckQualityInputSchema.parse(rawInput);
  } catch (e) {
    return {
      passed: false,
      issues: [
        {
          code: "INVALID_INPUT",
          severity: "error",
          instruction: e instanceof Error ? e.message : String(e),
        },
      ],
      suggested_action: "RESIZE_INPUT",
    };
  }

  // 统一加载资源
  let loaded;
  try {
    loaded = await loadResource({
      path: input.image_path,
      url: input.image_url,
      base64: input.image_base64,
      options: { kind: "image" },
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    return {
      passed: false,
      check_type: input.check_type,
      issues: [
        {
          code: err.code ?? "LOAD_FAILED",
          severity: "error",
          instruction: err.message,
        },
      ],
      suggested_action:
        err.code === "ResourceTooLarge" ? "RESIZE_INPUT" : "RETRY_WITH_HINT",
    };
  }

  const issues: Issue[] = [];
  const buf = Buffer.from(loaded.base64, "base64");

  // 1. 格式
  const kind = detectMagic(buf);
  if (kind === "UNKNOWN") {
    issues.push({
      code: "UNSUPPORTED_FORMAT",
      severity: "error",
      instruction: "Only JPG and PNG are supported for " + input.check_type + ".",
    });
  }

  // 2. 大小（虽然 loader 已经拦过硬上限，再做个软警告）
  if (loaded.bytes < 2048) {
    issues.push({
      code: "IMAGE_TOO_SMALL",
      severity: "warning",
      instruction:
        "Image is very small (< 2 KB). Likely too low resolution for reliable face detection.",
    });
  }

  const hasError = issues.some((i) => i.severity === "error");
  const passed = !hasError;
  const suggested_action = passed
    ? "PROCEED"
    : issues.some((i) => i.code === "UNSUPPORTED_FORMAT")
      ? "RESIZE_INPUT"
      : "RETRY_WITH_HINT";

  return {
    passed,
    check_type: input.check_type,
    bytes: loaded.bytes,
    format_detected: kind,
    sha256: loaded.sha256.slice(0, 12),
    source: loaded.source,
    issues,
    suggested_action,
  };
}
