/**
 * Tool: tencent_ekyc_get_verification_status
 * 对应腾讯云 API: GetSdkVerificationResult
 */

import { z } from "zod";
import { signAndCallTC3 } from "../auth/tc3-signer.js";
import {
  enhanceStatusResponse,
  type GetSdkVerificationResultRaw,
} from "../enhancer/response-enhancer.js";
import { wrapEnhancedError } from "../enhancer/error-mapper.js";
import { loadEnv, missingCredentialsResponse } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const VerificationStatusInputSchema = z.object({
  sdk_token: z
    .string()
    .min(1)
    .describe("SdkToken returned by a previous ApplySdkVerificationToken call."),
});

export type VerificationStatusInput = z.infer<typeof VerificationStatusInputSchema>;

export const verificationStatusDefinition = {
  name: "tencent_ekyc_get_verification_status",
  description: `Retrieve the result of a previous SDK-based eKYC verification by SdkToken. Uses Tencent Cloud eKYC's GetSdkVerificationResult API.

**⚠️ PREREQUISITE — Credentials required:** Call \`tencent_ekyc_get_credential_status\` first if you are unsure whether credentials are configured.

Use this tool to:
- Check the status / final result of an async verification started by a mobile SDK flow
- Retrieve detailed results for audit / compliance purposes
- Obtain device risk level (Enhance / Plus edition only)

Results are available for 24 hours after verification completes.`,
  inputSchema: {
    type: "object" as const,
    required: ["sdk_token"],
    properties: {
      sdk_token: { type: "string", description: "SdkToken from ApplySdkVerificationToken." },
    },
  },
};

export async function executeVerificationStatus(rawInput: unknown): Promise<unknown> {
  const startTime = Date.now();
  let input: VerificationStatusInput;
  try {
    input = VerificationStatusInputSchema.parse(rawInput);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return wrapEnhancedError({
      code: "InvalidParameter",
      message: `Input validation failed: ${msg}`,
    });
  }

  const env = loadEnv();
  if (!env) return missingCredentialsResponse("tencent_ekyc_get_verification_status");

  logger.info("verification_status:call", {
    tool: "tencent_ekyc_get_verification_status",
    sdk_token_prefix: input.sdk_token.slice(0, 8),
    region: env.region,
  });

  try {
    const resp = await signAndCallTC3<GetSdkVerificationResultRaw>({
      service: "faceid",
      host: "faceid.tencentcloudapi.com",
      action: "GetSdkVerificationResult",
      version: "2018-03-01",
      region: env.region,
      payload: { SdkToken: input.sdk_token },
      secretId: env.secretId,
      secretKey: env.secretKey,
      timeoutMs: env.timeoutMs,
    });

    if (resp.Response.Error) {
      logger.warn("verification_status:error", {
        code: resp.Response.Error.Code,
        request_id: resp.Response.RequestId,
      });
      return wrapEnhancedError({
        code: resp.Response.Error.Code,
        message: resp.Response.Error.Message,
        requestId: resp.Response.RequestId,
      });
    }

    const enhanced = enhanceStatusResponse(resp.Response as GetSdkVerificationResultRaw, {
      startTime,
    });
    logger.info("verification_status:ok", {
      request_id: enhanced.metadata.request_id,
      latency_ms: enhanced.metadata.processing_time_ms,
      result_code: enhanced.result_code,
    });
    return enhanced;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("verification_status:exception", { error: msg });
    return wrapEnhancedError({ code: "InternalError", message: msg });
  }
}
