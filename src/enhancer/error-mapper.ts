/**
 * 将腾讯云 eKYC 原始错误码映射为 Agent 可执行的 AgentHint。
 *
 * 权威来源：01_docs/error-mapping.md
 *
 * 设计原则：
 *  1) 所有映射必须显式；未映射的错误码走默认兜底，且 retryable=false，避免 Agent 无限重试。
 *  2) user_instruction 用自然英语写给最终用户看。
 *  3) fallback_params 让 Agent 能直接拿去重试，不用再做决策。
 */

export type SuggestedAction =
  | "PROCEED"
  | "RETRY"
  | "RETRY_WITH_HINT"
  | "SWITCH_MODE"
  | "RESIZE_INPUT"
  | "MANUAL_REVIEW"
  | "REJECT"
  | "BACKOFF"
  | "ALERT_ADMIN";

export interface AgentHint {
  retryable: boolean;
  suggested_action: SuggestedAction;
  user_instruction?: string;
  max_retries?: number;
  retry_after_ms?: number;
  fallback_action?: string;
  fallback_params?: Record<string, unknown>;
}

const SWITCH_TO_ACTION: AgentHint = {
  retryable: true,
  suggested_action: "SWITCH_MODE",
  user_instruction: "Silent liveness failed. Switch to ACTION mode for a stronger check.",
  fallback_action: "RETRY_WITH_PARAMS",
  fallback_params: { liveness_type: "ACTION" },
  max_retries: 1,
};

const RETRY_ENGINE = (ms = 2000): AgentHint => ({
  retryable: true,
  suggested_action: "RETRY",
  user_instruction: "Temporary service error. Please retry.",
  retry_after_ms: ms,
  max_retries: 2,
});

export const ERROR_MAP: Record<string, AgentHint> = {
  // Auth
  "AuthFailure.InvalidAuthorization": {
    retryable: false,
    suggested_action: "ALERT_ADMIN",
    user_instruction: "CAM authentication failed. Check SecretId / SecretKey and TC3 signing implementation.",
  },

  // Action 类
  "FailedOperation.ActionCloseEye":     { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Please keep your eyes open while recording.", max_retries: 3 },
  "FailedOperation.ActionFaceClose":    { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face too close — hold the device at arm's length.", max_retries: 3 },
  "FailedOperation.ActionFaceFar":      { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face too far — move closer to the camera.", max_retries: 3 },
  "FailedOperation.ActionFaceLeft":     { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face too far left — center your face in frame.", max_retries: 3 },
  "FailedOperation.ActionFaceRight":    { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face too far right — center your face in frame.", max_retries: 3 },
  "FailedOperation.ActionFirstAction":  { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "No motion detected — follow the on-screen action prompts.", max_retries: 3 },
  "FailedOperation.ActionLightDark":    { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Lighting too dark — move to a well-lit area.", max_retries: 3 },
  "FailedOperation.ActionLightStrong":  { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Lighting too bright — avoid direct light or glare.", max_retries: 3 },
  "FailedOperation.ActionNodetectFace": { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "No full face detected — look straight at the camera.", max_retries: 3 },
  "FailedOperation.ActionOpenMouth":    { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Open your mouth wider when instructed.", max_retries: 3 },
  "InternalError.ActionLightDark":      { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Lighting too dark — move to a well-lit area.", max_retries: 3 },
  "InternalError.ActionLightStrong":    { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Lighting too bright — avoid direct light.", max_retries: 3 },
  "InternalError.ActionNodetectFace":   { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "No full face detected.", max_retries: 3 },

  // 图片/视频质量
  "FailedOperation.ImageBlur":              { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Image is blurry — retake with a steady hand.", max_retries: 3 },
  "FailedOperation.ImageDecodeFailed":      { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Could not decode image — ensure JPG/PNG and standard Base64 (no data URI prefix)." },
  "FailedOperation.ImageSizeTooLarge":      { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Image exceeds 3 MB — compress and retry." },
  "FailedOperation.PoorImageQuality":       { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Image quality too low — use better lighting and a higher-resolution camera.", max_retries: 3 },
  "FailedOperation.LifePhotoPoorQuality":   { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Reference photo resolution too low — upload a clearer one." },
  "FailedOperation.LifePhotoSizeError":     { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Reference photo size out of range." },
  "FailedOperation.IncompleteFace":         { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face is cropped — show the whole face in frame.", max_retries: 3 },
  "FailedOperation.CoveredFace":            { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face is blocked — remove mask/hand/glasses that obscure the face.", max_retries: 3 },
  "FailedOperation.LifePhotoDetectFaces":   { retryable: false, suggested_action: "MANUAL_REVIEW", user_instruction: "Multiple faces detected in the reference photo." },
  "FailedOperation.LifePhotoDetectNoFaces": { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "No face detected in the reference photo — upload a clear portrait." },
  "InternalError.LifePhotoPoorQuality":     { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Reference photo resolution too low." },
  "InternalError.LifePhotoSizeError":       { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Reference photo size out of range." },
  "FailedOperation.VideoDecodeFailed":      { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Video could not be decoded — use MP4/AVI/FLV and standard Base64." },
  "FailedOperation.VideoDurationExceeded":  { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Video too long — max 20 s, recommended 2–5 s." },
  "FailedOperation.CompressVideoError":     { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Video compression failed — reduce the input video size." },

  // 活体 / 防伪
  "FailedOperation.LivessDetectFail":       SWITCH_TO_ACTION,
  "FailedOperation.LivessDetectFake":       { retryable: false, suggested_action: "REJECT", user_instruction: "Liveness failed — potential spoofing detected." },
  "FailedOperation.LivessSystemError":      RETRY_ENGINE(2000),
  "FailedOperation.LivessBestFrameError":   { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Could not extract a good frame — ensure clear lighting and a stable face.", max_retries: 2 },
  "FailedOperation.LivessUnknownError":     RETRY_ENGINE(1500),
  "FailedOperation.SilentDetectFail":       SWITCH_TO_ACTION,
  "FailedOperation.SilentEyeLiveFail":      { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Eye-level liveness failed — face the camera directly with eyes open.", max_retries: 3 },
  "FailedOperation.SilentFaceDetectFail":   { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "No face detected in video — center a clear face in frame.", max_retries: 3 },
  "FailedOperation.SilentFaceQualityFail":  { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face quality in video too low — use better lighting.", max_retries: 3 },
  "FailedOperation.SilentFaceWithMaskFail": { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face mask detected — remove mask and retry.", max_retries: 2 },
  "FailedOperation.SilentMouthLiveFail":    { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Mouth-movement detection failed — follow the action instructions." },
  "FailedOperation.SilentMultiFaceFail":    { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Multiple faces in video — ensure only one person is in frame." },
  "FailedOperation.SilentPictureLiveFail":  { retryable: false, suggested_action: "REJECT", user_instruction: "Video appears to be a photo/screen replay — potential spoofing." },
  "FailedOperation.SilentThreshold":        SWITCH_TO_ACTION,
  "FailedOperation.SilentTooShort":         { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Video too short — record at least 2 seconds." },
  "FailedOperation.LifePhotoDetectFake":    { retryable: false, suggested_action: "REJECT", user_instruction: "Real-person comparison failed — suspected forgery." },

  // 比对
  "FailedOperation.CompareFail":            { retryable: true, suggested_action: "RETRY", user_instruction: "Comparison failed — retry.", max_retries: 2 },
  "FailedOperation.CompareLowSimilarity":   { retryable: false, suggested_action: "MANUAL_REVIEW", user_instruction: "Similarity below threshold — may not be the same person." },
  "FailedOperation.CompareSystemError":     RETRY_ENGINE(2000),
  "InternalError.CompareLowSimilarity":     { retryable: false, suggested_action: "MANUAL_REVIEW", user_instruction: "Similarity below threshold." },

  // 唇语
  "FailedOperation.LipFaceIncomplete":      { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Face not fully visible — show the whole face.", max_retries: 3 },
  "FailedOperation.LipMoveSmall":           { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Lip movement too small — speak the numbers clearly.", max_retries: 3 },
  "FailedOperation.LipNetFailed":           { retryable: true, suggested_action: "RETRY", user_instruction: "Could not pull the video — retry.", max_retries: 2 },
  "FailedOperation.LipSizeError":           { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Video is empty or wrong size (expect ~6 s)." },
  "FailedOperation.LipVideoInvalid":        { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Video format invalid — use MP4/AVI/FLV." },
  "FailedOperation.LipVideoQuaility":       { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Video resolution too low." },
  "FailedOperation.LipVoiceDetect":         { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "No sound detected — speak aloud." },
  "FailedOperation.LipVoiceLow":            { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Voice volume too low — speak louder." },
  "FailedOperation.LipVoiceRecognize":      { retryable: true, suggested_action: "RETRY_WITH_HINT", user_instruction: "Speech not recognized — read the numbers clearly." },

  // 解密 / 引擎 / 下载
  "FailedOperation.DecryptSystemError":      { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Decryption error — verify encryption params." },
  "FailedOperation.DetectEngineSystemError": RETRY_ENGINE(1500),
  "FailedOperation.DownLoadError":           { retryable: true, suggested_action: "RETRY", user_instruction: "File download failed — retry." },
  "FailedOperation.DownLoadTimeoutError":    { retryable: true, suggested_action: "RETRY", user_instruction: "File download timed out.", retry_after_ms: 2000 },

  // 业务 / 内部
  "FailedOperation.StsUnAuthErrError":       { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "STS unauthorized — contact support." },
  "FailedOperation.UnKnown":                 RETRY_ENGINE(1000),
  InternalError:                             RETRY_ENGINE(1000),
  "InternalError.UnKnown":                   RETRY_ENGINE(1000),

  // 参数错误
  InvalidParameter:                              { retryable: false, suggested_action: "REJECT", user_instruction: "Invalid parameter — check API inputs." },
  "InvalidParameter.UnsupportEncryptField":      { retryable: false, suggested_action: "REJECT", user_instruction: "Unsupported encrypt field." },
  InvalidParameterValue:                         { retryable: false, suggested_action: "REJECT", user_instruction: "Parameter value incorrect." },
  "InvalidParameterValue.BizTokenExpired":       { retryable: false, suggested_action: "REJECT", user_instruction: "BizToken expired — apply a new one." },
  "InvalidParameterValue.BizTokenIllegal":       { retryable: false, suggested_action: "REJECT", user_instruction: "Invalid BizToken." },
  "InvalidParameterValue.ImageSizeExceed":       { retryable: true, suggested_action: "RESIZE_INPUT", user_instruction: "Image exceeds 3 MB limit. Compress and retry." },

  // 限流 / 权限 / 计费
  RequestLimitExceeded:                          { retryable: true, suggested_action: "BACKOFF", user_instruction: "Rate limit reached. Wait and retry.", retry_after_ms: 1000, max_retries: 3 },
  OperationDenied:                               { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Operation denied." },
  UnauthorizedOperation:                         { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Unauthorized operation." },
  "UnauthorizedOperation.ActivateError":         { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Service activation exception." },
  "UnauthorizedOperation.Activating":            { retryable: true, suggested_action: "BACKOFF", user_instruction: "Service is activating — retry later.", retry_after_ms: 60000 },
  "UnauthorizedOperation.Arrears":               { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Account in arrears — contact account administrator." },
  "UnauthorizedOperation.ChargeStatusException": { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Billing status abnormal." },
  "UnauthorizedOperation.NonAuthorize":          { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Account identity verification incomplete." },
  "UnauthorizedOperation.Nonactivated":          { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Service not activated." },
  UnsupportedOperation:                          { retryable: false, suggested_action: "REJECT", user_instruction: "Unsupported operation." },

  // 资源类
  "ResourceUnavailable.InsufficientBalance":     { retryable: false, suggested_action: "ALERT_ADMIN", user_instruction: "Account balance insufficient. Contact account administrator." },
};

const DEFAULT_HINT = (code: string): AgentHint => ({
  retryable: false,
  suggested_action: "MANUAL_REVIEW",
  user_instruction: `Unhandled error ${code}. Please contact support with the request_id.`,
});

export function mapErrorToAgentHint(code: string): AgentHint {
  return ERROR_MAP[code] ?? DEFAULT_HINT(code);
}

export interface EnhancedErrorResponse {
  error: true;
  code: string;
  message: string;
  agent_hint: AgentHint;
  metadata?: { request_id?: string };
}

export function wrapEnhancedError(params: {
  code: string;
  message: string;
  requestId?: string;
}): EnhancedErrorResponse {
  return {
    error: true,
    code: params.code,
    message: params.message,
    agent_hint: mapErrorToAgentHint(params.code),
    metadata: params.requestId ? { request_id: params.requestId } : undefined,
  };
}
