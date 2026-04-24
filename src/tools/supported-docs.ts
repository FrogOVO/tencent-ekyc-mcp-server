/**
 * Tool: tencent_ekyc_get_supported_documents
 * 无 API 调用，仅返回静态数据。
 */

import { z } from "zod";
import { getRegions, getDocumentStats } from "../config/documents.js";

export const SupportedDocsInputSchema = z.object({
  region: z
    .string()
    .optional()
    .describe(
      "ISO-like region code. Examples: 'ID', 'MY', 'PH', 'TH', 'SG', 'VN', 'HK', 'MO', 'BR', 'INTL'. Use 'ALL' or omit to get the full list.",
    ),
});

export type SupportedDocsInput = z.infer<typeof SupportedDocsInputSchema>;

export const supportedDocsDefinition = {
  name: "tencent_ekyc_get_supported_documents",
  description: `Get the list of supported identity document types and regions for Tencent Cloud eKYC verification.

Use this tool to:
- Check if a specific document type is supported before initiating verification
- Get information about regional coverage (Southeast Asia, HK/MO/TW, Brazil, International Passport, etc.)
- Understand which liveness modes (SILENT / ACTION) work with which document types

This is a metadata-only tool that does not make any remote API call.`,
  inputSchema: {
    type: "object" as const,
    properties: {
      region: {
        type: "string",
        description:
          "Region code, e.g. 'ID', 'MY'. Use 'ALL' or omit for the full list.",
      },
    },
  },
};

export async function executeSupportedDocs(rawInput: unknown): Promise<unknown> {
  const input = SupportedDocsInputSchema.parse(rawInput ?? {});
  const regions = getRegions(input.region);
  const stats = getDocumentStats();
  return {
    ...stats,
    filtered_by_region: input.region ?? "ALL",
    regions,
  };
}
