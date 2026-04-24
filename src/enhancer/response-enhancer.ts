/**
 * 响应增强：把腾讯云原始 API 响应转成 Agent 友好的结构化结果。
 */

import { mapErrorToAgentHint, type AgentHint } from "./error-mapper.js";

// ---------------------------------------------------------------------------
// verify_identity 增强（CompareFaceLiveness）
// ---------------------------------------------------------------------------

export interface CompareFaceLivenessRaw {
  Result: string;
  Description?: string;
  Sim?: number;
  BestFrameBase64?: string | null;
  RequestId?: string;
}

export interface VerifyEnhanced {
  verification: { passed: boolean; confidence: number; risk_score: number };
  liveness: { passed: boolean; method: "SILENT" | "ACTION"; spoof_probability: number };
  face_comparison: {
    passed: boolean;
    similarity: number;
    threshold_applied: number;
    above_threshold: boolean;
  };
  decision: {
    suggested_action: "PROCEED" | "MANUAL_REVIEW" | "RETRY" | "REJECT" | "SWITCH_MODE";
    requires_human_review: boolean;
    retryable: boolean;
    reason: string | null;
    agent_hint?: AgentHint;
  };
  metadata: {
    request_id: string;
    processing_time_ms: number;
    region: string;
    best_frame_available: boolean;
  };
}

export function enhanceVerifyResponse(
  raw: CompareFaceLivenessRaw,
  ctx: { startTime: number; region: string; method: "SILENT" | "ACTION" },
): VerifyEnhanced {
  const sim = raw.Sim ?? 0;
  const passed = raw.Result === "Success";
  const threshold = 70;

  // 置信度：成功时为 sim/100；失败时 0
  const confidence = passed ? sim / 100 : 0;
  // 风险分：通过时为 1-confidence；失败时根据 hint 打分
  const hint = passed ? undefined : mapErrorToAgentHint(raw.Result);
  const riskScore = passed
    ? Math.max(0, 1 - confidence)
    : hint?.suggested_action === "REJECT"
      ? 0.95
      : hint?.suggested_action === "MANUAL_REVIEW"
        ? 0.6
        : 0.4;

  let decision: VerifyEnhanced["decision"];

  if (passed && sim >= 80) {
    decision = {
      suggested_action: "PROCEED",
      requires_human_review: false,
      retryable: false,
      reason: null,
    };
  } else if (passed && sim >= threshold) {
    decision = {
      suggested_action: "PROCEED",
      requires_human_review: false,
      retryable: false,
      reason:
        "Similarity score is borderline (70–80). Consider an extra check for high-value operations.",
    };
  } else if (passed && sim >= 50) {
    decision = {
      suggested_action: "MANUAL_REVIEW",
      requires_human_review: true,
      retryable: false,
      reason: "Low confidence match.",
    };
  } else {
    // 未通过：把 error-mapper 的建议翻译成决策
    const action =
      hint?.suggested_action === "REJECT"
        ? "REJECT"
        : hint?.suggested_action === "MANUAL_REVIEW"
          ? "MANUAL_REVIEW"
          : hint?.suggested_action === "SWITCH_MODE"
            ? "SWITCH_MODE"
            : hint?.retryable
              ? "RETRY"
              : "REJECT";
    decision = {
      suggested_action: action as VerifyEnhanced["decision"]["suggested_action"],
      requires_human_review: hint?.suggested_action === "MANUAL_REVIEW",
      retryable: hint?.retryable ?? false,
      reason: hint?.user_instruction ?? raw.Description ?? raw.Result,
      agent_hint: hint,
    };
  }

  return {
    verification: { passed, confidence, risk_score: Number(riskScore.toFixed(4)) },
    liveness: {
      passed,
      method: ctx.method,
      spoof_probability: Number((1 - confidence).toFixed(4)),
    },
    face_comparison: {
      passed: sim >= threshold,
      similarity: sim,
      threshold_applied: threshold,
      above_threshold: sim >= threshold,
    },
    decision,
    metadata: {
      request_id: raw.RequestId ?? "",
      processing_time_ms: Date.now() - ctx.startTime,
      region: ctx.region,
      best_frame_available: Boolean(raw.BestFrameBase64),
    },
  };
}

// ---------------------------------------------------------------------------
// detect_deepfake 增强（DetectAIFakeFaces）
// ---------------------------------------------------------------------------

export interface DetectAIFakeFacesRaw {
  AttackRiskLevel?: "Low" | "Mid" | "High" | string;
  AttackRiskDetailList?: Array<{ Type?: string }>;
  RequestId?: string;
}

export interface DeepfakeEnhanced {
  is_fake: boolean;
  fake_probability: number;
  confidence: number;
  attack_risk_level: string;
  attack_types_detected: string[];
  decision: {
    suggested_action: "PROCEED" | "MANUAL_REVIEW" | "REJECT";
    requires_human_review: boolean;
    reason: string | null;
  };
  metadata: { request_id: string; processing_time_ms: number };
}

export function enhanceDeepfakeResponse(
  raw: DetectAIFakeFacesRaw,
  ctx: { startTime: number },
): DeepfakeEnhanced {
  const level = raw.AttackRiskLevel ?? "Low";
  const riskMap: Record<string, number> = { Low: 0.1, Mid: 0.55, High: 0.9 };
  const p = riskMap[level] ?? 0.5;

  const decision: DeepfakeEnhanced["decision"] =
    level === "Low"
      ? { suggested_action: "PROCEED", requires_human_review: false, reason: null }
      : level === "Mid"
        ? {
            suggested_action: "MANUAL_REVIEW",
            requires_human_review: true,
            reason: "Suspected AI-generated content.",
          }
        : {
            suggested_action: "REJECT",
            requires_human_review: false,
            reason: "High-confidence deepfake detected.",
          };

  return {
    is_fake: level !== "Low",
    fake_probability: p,
    confidence: Number((1 - p).toFixed(4)),
    attack_risk_level: level,
    attack_types_detected: (raw.AttackRiskDetailList ?? [])
      .map((d) => d.Type)
      .filter((x): x is string => Boolean(x)),
    decision,
    metadata: {
      request_id: raw.RequestId ?? "",
      processing_time_ms: Date.now() - ctx.startTime,
    },
  };
}

// ---------------------------------------------------------------------------
// get_verification_status 增强（GetSdkVerificationResult）
// ---------------------------------------------------------------------------

export interface GetSdkVerificationResultRaw {
  Result?: string;
  Description?: string;
  ChargeCount?: number;
  CardVerifyResults?: unknown[];
  CompareResults?: unknown[];
  Extra?: string;
  DeviceInfoLevel?: string;
  RequestId?: string;
}

export function enhanceStatusResponse(
  raw: GetSdkVerificationResultRaw,
  ctx: { startTime: number },
) {
  const deviceLevelMap: Record<string, string> = {
    "1": "Secure",
    "2": "Low Risk",
    "3": "Medium Risk",
    "4": "High Risk",
  };

  return {
    result_code: raw.Result ?? "",
    description: raw.Description ?? "",
    charge_count: raw.ChargeCount ?? 0,
    card_verify_count: raw.CardVerifyResults?.length ?? 0,
    compare_count: raw.CompareResults?.length ?? 0,
    extra: raw.Extra ?? null,
    device_info_level: raw.DeviceInfoLevel ?? null,
    device_info_level_label: raw.DeviceInfoLevel
      ? deviceLevelMap[raw.DeviceInfoLevel] ?? "Unknown"
      : null,
    metadata: {
      request_id: raw.RequestId ?? "",
      processing_time_ms: Date.now() - ctx.startTime,
    },
  };
}
