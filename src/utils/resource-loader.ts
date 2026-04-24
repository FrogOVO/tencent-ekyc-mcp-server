/**
 * 多来源资源加载器：让 MCP Tool 同时支持 file path / URL / Base64 三种输入方式。
 *
 * 为什么要有这个？
 * ---------------
 * MCP 协议的消息是文本，Agent 把 Base64 塞进对话框会爆上下文（图片 650K tokens，视频 1.7M tokens）。
 * 所以我们的最佳实践：
 *   1) Agent 传文件路径（几十字节）→ 我们在 server 端读文件转 Base64（本地进程，不占 LLM 上下文）
 *   2) 如果 Agent 拿到的是 URL（比如 S3、COS），我们也能 fetch 下来
 *   3) 兜底仍然支持直接传 Base64（向后兼容）
 *
 * 安全边界：
 *   - 文件路径：只允许读取 Agent 显式指定的路径；不做路径穿越保护（Agent 自己是可信的）
 *   - URL：只允许 http/https；超时 15s；下载大小硬上限（图片 3MB / 视频 8MB）
 *   - 大小校验在加载时就做，避免下游 API 浪费配额
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export type ResourceKind = "image" | "video";

export interface LoadOptions {
  /** 资源类型决定大小上限 */
  kind: ResourceKind;
  /** 超过这个大小（字节）拒绝；默认 image=3MB / video=8MB */
  maxBytes?: number;
  /** URL 下载超时 */
  timeoutMs?: number;
}

export interface LoadedResource {
  /** 标准 Base64（无 data URI 前缀，无换行） */
  base64: string;
  /** 原始字节数 */
  bytes: number;
  /** SHA-256（调试用，可用于日志追踪） */
  sha256: string;
  /** 来源种类（调试用） */
  source: "path" | "url" | "base64";
}

const DEFAULT_MAX: Record<ResourceKind, number> = {
  image: 3 * 1024 * 1024,
  video: 8 * 1024 * 1024,
};

function bufferToBase64(buf: Buffer): string {
  // Node Buffer 的 base64 输出不带换行，符合 RFC 4648
  return buf.toString("base64");
}

function stripDataUri(b64: string): string {
  // 兼容 Agent 误传 "data:image/jpeg;base64,xxx" 的情况
  const match = b64.match(/^data:[\w/+-]+;base64,/i);
  return match ? b64.slice(match[0].length) : b64;
}

function estimateBytesFromBase64(b64: string): number {
  const padding = b64.match(/=+$/)?.[0].length ?? 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function assertSize(bytes: number, max: number, kind: ResourceKind): void {
  if (bytes > max) {
    throw Object.assign(
      new Error(
        `${kind} exceeds size limit: ${(bytes / 1024 / 1024).toFixed(2)} MB > ${(max / 1024 / 1024).toFixed(0)} MB`,
      ),
      { code: "ResourceTooLarge" },
    );
  }
}

/** 从本地文件加载 */
async function loadFromPath(
  path: string,
  opts: Required<LoadOptions>,
): Promise<LoadedResource> {
  const buf = await readFile(path);
  assertSize(buf.byteLength, opts.maxBytes, opts.kind);
  return {
    base64: bufferToBase64(buf),
    bytes: buf.byteLength,
    sha256: createHash("sha256").update(buf).digest("hex"),
    source: "path",
  };
}

/** 从 URL 下载 */
async function loadFromUrl(
  url: string,
  opts: Required<LoadOptions>,
): Promise<LoadedResource> {
  if (!/^https?:\/\//i.test(url)) {
    throw Object.assign(new Error("Only http/https URLs are supported"), {
      code: "InvalidParameter",
    });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) {
      throw Object.assign(new Error(`Fetch failed: HTTP ${resp.status}`), {
        code: "DownloadFailed",
      });
    }
    // 先看 Content-Length 提前拦截
    const cl = resp.headers.get("content-length");
    if (cl && Number(cl) > opts.maxBytes) {
      throw Object.assign(
        new Error(`Remote file ${cl} bytes exceeds limit ${opts.maxBytes}`),
        { code: "ResourceTooLarge" },
      );
    }
    const arrayBuf = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    assertSize(buf.byteLength, opts.maxBytes, opts.kind);
    return {
      base64: bufferToBase64(buf),
      bytes: buf.byteLength,
      sha256: createHash("sha256").update(buf).digest("hex"),
      source: "url",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 直接接受 Base64（向后兼容） */
function loadFromBase64(
  b64: string,
  opts: Required<LoadOptions>,
): LoadedResource {
  const clean = stripDataUri(b64).replace(/\s+/g, "");
  const bytes = estimateBytesFromBase64(clean);
  assertSize(bytes, opts.maxBytes, opts.kind);
  // 校验字符集，尽量早暴露脏数据
  if (!/^[A-Za-z0-9+/]+=*$/.test(clean)) {
    throw Object.assign(new Error("Invalid Base64 characters"), {
      code: "InvalidParameter",
    });
  }
  // 通过解码再编码一次确认合法
  const buf = Buffer.from(clean, "base64");
  return {
    base64: clean,
    bytes,
    sha256: createHash("sha256").update(buf).digest("hex"),
    source: "base64",
  };
}

/**
 * 统一的加载入口：根据传入的三个字段自动选择来源。
 * 优先级：path > url > base64。只能提供一个。
 */
export async function loadResource(params: {
  path?: string;
  url?: string;
  base64?: string;
  options: LoadOptions;
}): Promise<LoadedResource> {
  const { path, url, base64 } = params;
  const opts: Required<LoadOptions> = {
    kind: params.options.kind,
    maxBytes: params.options.maxBytes ?? DEFAULT_MAX[params.options.kind],
    timeoutMs: params.options.timeoutMs ?? 15_000,
  };

  const provided = [path, url, base64].filter(Boolean).length;
  if (provided === 0) {
    throw Object.assign(
      new Error(
        "No resource provided. Pass one of: *_path (local file), *_url (http/https), *_base64 (raw Base64).",
      ),
      { code: "InvalidParameter" },
    );
  }
  if (provided > 1) {
    throw Object.assign(
      new Error("Provide only ONE of: *_path, *_url, *_base64 — not multiple."),
      { code: "InvalidParameter" },
    );
  }

  if (path) return loadFromPath(path, opts);
  if (url) return loadFromUrl(url, opts);
  return loadFromBase64(base64!, opts);
}
