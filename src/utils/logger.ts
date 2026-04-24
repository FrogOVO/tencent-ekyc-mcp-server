/**
 * 极简 structured logger。
 *
 * 关键规则：MCP stdio 模式下 **stdout 是协议通道**，日志必须写 stderr。
 * 所以本模块里只使用 console.error（以及 process.stderr.write）。
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): number {
  const env = (process.env.EKYC_LOG_LEVEL as Level | undefined) ?? "info";
  return LEVELS[env] ?? LEVELS.info;
}

/**
 * 脱敏可能包含 Base64 的字段。
 */
export function redactPayload(
  obj: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!obj) return obj;
  const SENSITIVE = /base64|faceinput|videobase64|imagebase64|bestframe/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && SENSITIVE.test(k)) {
      out[k] = `<base64:len=${v.length}>`;
    } else if (typeof v === "string" && v.length > 200) {
      out[k] = v.slice(0, 80) + `...<truncated:len=${v.length}>`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function log(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ?? {}),
  });
  process.stderr.write(line + "\n");
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => log("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => log("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => log("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => log("error", msg, fields),
};
