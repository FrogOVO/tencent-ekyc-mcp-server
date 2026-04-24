/**
 * Tool: tencent_ekyc_get_credential_status
 *
 * 用途：让 Agent 在调用真正需要密钥的工具之前，先确认当前 MCP Server 是否已配置好凭据。
 * 不会实际调用腾讯云 API，也不会泄露密钥原文，只返回"是否就绪 + 缺什么 + 怎么配"。
 */

import { getEnvStatus } from "../config/env.js";

export const credentialStatusDefinition = {
  name: "tencent_ekyc_get_credential_status",
  description: `Check whether this MCP Server has Tencent Cloud API credentials (SecretId / SecretKey) configured and ready to use.

**⭐ IMPORTANT: Call this tool FIRST, before invoking any other Tencent eKYC tool.** It is instant, free, and tells you exactly what the user needs to provide if credentials are missing.

Returns one of two states:

1) ready=true — credentials are configured; you may proceed to call verify_identity / detect_deepfake / etc.
2) ready=false — tell the user which env vars are missing and instruct them to:
   - obtain a SecretId (starts with "AKID") and SecretKey from https://console.tencentcloud.com/cam/capi
   - activate the eKYC service on their Tencent Cloud account if not yet activated
   - update their MCP client config (e.g. Claude Desktop's claude_desktop_config.json, or \`claude mcp add\` for Claude Code CLI)
   - RESTART the MCP client after updating

This tool never exposes secret values. Only a preview like "AKID...xxxx" is returned for confirmation.`,
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
};

export async function executeCredentialStatus(): Promise<unknown> {
  const s = getEnvStatus();
  if (s.ready) {
    return {
      ready: true,
      secret_id_preview: s.secret_id_preview,
      region: s.region,
      message:
        "Credentials are configured. You can now call verify_identity, detect_deepfake, or any other Tencent eKYC tool.",
    };
  }
  return {
    ready: false,
    missing: s.missing,
    user_instruction:
      "Tencent Cloud API credentials are not configured on this MCP Server. " +
      "Please ask the user for their SecretId (starts with 'AKID') and SecretKey, " +
      "obtained from https://console.tencentcloud.com/cam/capi. " +
      "Also ensure the eKYC (Faceid) service is activated on their account.",
    next_steps: [
      "1. User obtains SecretId and SecretKey from https://console.tencentcloud.com/cam/capi",
      "2. User updates MCP client config with TENCENT_SECRET_ID and TENCENT_SECRET_KEY env vars",
      "3. User restarts the MCP client (Claude Desktop / Cursor / Claude Code)",
      "4. Agent calls this tool again to confirm ready=true",
    ],
    config_example: {
      claude_desktop: {
        mcpServers: {
          "tencent-ekyc": {
            command: "npx",
            args: ["-y", "@tencentcloud/ekyc-mcp-server"],
            env: {
              TENCENT_SECRET_ID: "AKID...",
              TENCENT_SECRET_KEY: "...",
              TENCENT_REGION: "ap-singapore",
            },
          },
        },
      },
      claude_code_cli:
        "claude mcp add tencent-ekyc --env TENCENT_SECRET_ID=AKID... --env TENCENT_SECRET_KEY=... --env TENCENT_REGION=ap-singapore -- node /path/to/dist/index.js",
    },
  };
}
