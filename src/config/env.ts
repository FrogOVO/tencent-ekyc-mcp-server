/**
 * 集中读取 + 校验环境变量。
 *
 * v2 改动：不再 throw 导致 server crash。缺失密钥时返回 null，
 * 让 tool 层能返回结构化错误给 Agent，引导它问用户。
 */

export interface EkycEnv {
  secretId: string;
  secretKey: string;
  region: string;
  timeoutMs: number;
  rateLimit: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

export interface EnvStatus {
  ready: boolean;
  missing: string[];
  region: string;
  /** SecretId 脱敏预览，用于日志与告知用户"已配置" */
  secret_id_preview: string | null;
}

let cached: EkycEnv | null = null;

/**
 * 严格版：必须有密钥才返回。给工具层在"真正要调 API 前"用。
 * 没密钥时返回 null，**不抛异常**。
 */
export function loadEnv(): EkycEnv | null {
  if (cached) return cached;

  const secretId = process.env.TENCENT_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SECRET_KEY?.trim();

  if (!secretId || !secretKey) return null;

  const region = process.env.TENCENT_REGION?.trim() || "ap-singapore";
  const timeoutMs = Number.parseInt(process.env.EKYC_TIMEOUT_MS ?? "30000", 10);
  const rateLimit = Number.parseInt(process.env.EKYC_RATE_LIMIT ?? "20", 10);
  const logLevel =
    (process.env.EKYC_LOG_LEVEL as EkycEnv["logLevel"]) ?? "info";

  cached = { secretId, secretKey, region, timeoutMs, rateLimit, logLevel };
  return cached;
}

/**
 * 宽松版：返回"当前配置状态"，用于 get_credential_status 工具
 * 与启动时日志。从不抛异常。
 */
export function getEnvStatus(): EnvStatus {
  const secretId = process.env.TENCENT_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SECRET_KEY?.trim();
  const region = process.env.TENCENT_REGION?.trim() || "ap-singapore";

  const missing: string[] = [];
  if (!secretId) missing.push("TENCENT_SECRET_ID");
  if (!secretKey) missing.push("TENCENT_SECRET_KEY");

  return {
    ready: missing.length === 0,
    missing,
    region,
    secret_id_preview: secretId ? redactSecret(secretId) : null,
  };
}

/**
 * 脱敏：SecretId 仅保留前 4 位和后 4 位，SecretKey 完全不显示。
 */
export function redactSecret(value: string | undefined, keep = 4): string {
  if (!value) return "<empty>";
  if (value.length <= keep * 2) return "<redacted>";
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

/**
 * 生成"需要用户提供密钥"的结构化响应。所有需要密钥的工具调用前都能共用。
 */
export function missingCredentialsResponse(toolName: string) {
  const status = getEnvStatus();
  return {
    error: true,
    code: "CredentialsRequired",
    message: `Tencent Cloud API credentials are required for "${toolName}" but were not provided.`,
    agent_hint: {
      retryable: true,
      suggested_action: "REQUEST_USER_INPUT",
      user_instruction:
        "Please ask the user for their Tencent Cloud API SecretId and SecretKey. " +
        "They can obtain them at https://console.tencentcloud.com/cam/capi. " +
        "The SecretId starts with 'AKID'. Also ensure the eKYC service is activated on their account.",
      required_env_vars: status.missing,
      how_to_configure: {
        claude_code_cli: `claude mcp add tencent-ekyc --env TENCENT_SECRET_ID=AKID... --env TENCENT_SECRET_KEY=... --env TENCENT_REGION=ap-singapore -- node /path/to/dist/index.js`,
        claude_desktop_config: {
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
        note:
          "After updating the configuration, the user must RESTART their MCP client (Claude Desktop / Cursor / Claude Code) for changes to take effect.",
      },
    },
  };
}
