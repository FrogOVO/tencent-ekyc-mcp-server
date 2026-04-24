#!/usr/bin/env node
/**
 * @tencentcloud/ekyc-mcp-server (prototype)
 *
 * Tencent Cloud eKYC MCP Server — entry point.
 * Transport: stdio (compatible with Claude Desktop / Cursor / Windsurf / MCP Inspector).
 *
 * 重要：stdio 模式下 stdout 是协议通道，日志必须写 stderr。
 * 本项目里所有日志通过 src/utils/logger.ts（内部只用 process.stderr）。
 *
 * v2 改动：没有密钥也能启动，让 Agent 可以先调 get_credential_status 询问用户。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import {
  verifyIdentityDefinition,
  executeVerifyIdentity,
} from "./tools/verify-identity.js";
import {
  detectDeepfakeDefinition,
  executeDetectDeepfake,
} from "./tools/detect-deepfake.js";
import {
  supportedDocsDefinition,
  executeSupportedDocs,
} from "./tools/supported-docs.js";
import {
  checkQualityDefinition,
  executeCheckQuality,
} from "./tools/check-quality.js";
import {
  verificationStatusDefinition,
  executeVerificationStatus,
} from "./tools/verification-status.js";
import {
  credentialStatusDefinition,
  executeCredentialStatus,
} from "./tools/credential-status.js";

import { getEnvStatus } from "./config/env.js";
import { logger } from "./utils/logger.js";

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

type ToolHandler = (input: unknown) => Promise<unknown>;

interface ToolEntry {
  definition: Tool;
  handler: ToolHandler;
}

const TOOLS: Record<string, ToolEntry> = {
  // 放在最前，Agent 列 tools 时一眼看到这是"第一步"
  [credentialStatusDefinition.name]: {
    definition: credentialStatusDefinition as unknown as Tool,
    handler: executeCredentialStatus,
  },
  [supportedDocsDefinition.name]: {
    definition: supportedDocsDefinition as unknown as Tool,
    handler: executeSupportedDocs,
  },
  [checkQualityDefinition.name]: {
    definition: checkQualityDefinition as unknown as Tool,
    handler: executeCheckQuality,
  },
  [verifyIdentityDefinition.name]: {
    definition: verifyIdentityDefinition as unknown as Tool,
    handler: executeVerifyIdentity,
  },
  [detectDeepfakeDefinition.name]: {
    definition: detectDeepfakeDefinition as unknown as Tool,
    handler: executeDetectDeepfake,
  },
  [verificationStatusDefinition.name]: {
    definition: verificationStatusDefinition as unknown as Tool,
    handler: executeVerificationStatus,
  },
};

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

async function main() {
  // 启动时只"检查"，不阻塞启动
  const status = getEnvStatus();

  const server = new Server(
    { name: "tencent-ekyc-mcp", version: "0.0.2" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.values(TOOLS).map((e) => e.definition),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const entry = TOOLS[name];
    if (!entry) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: true,
              code: "UnknownTool",
              message: `Unknown tool: ${name}`,
            }),
          },
        ],
      };
    }

    const result = await entry.handler(args ?? {});
    const isError =
      typeof result === "object" &&
      result !== null &&
      (result as { error?: boolean }).error === true;

    return {
      isError,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  await server.connect(new StdioServerTransport());

  logger.info("server:started", {
    tool_count: Object.keys(TOOLS).length,
    region: status.region,
    credentials_ready: status.ready,
    secret_id: status.secret_id_preview,
    missing: status.missing,
  });

  if (!status.ready) {
    // 不报错，只告诉 stderr：启动 OK 但密钥缺失，Agent 调 verify/deepfake 时会收到
    // CredentialsRequired 结构化响应，引导用户提供。
    logger.warn("server:credentials_missing", {
      hint:
        "Agent can still list tools. It should call tencent_ekyc_get_credential_status first.",
      missing: status.missing,
    });
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`[fatal] ${msg}\n`);
  process.exit(1);
});
