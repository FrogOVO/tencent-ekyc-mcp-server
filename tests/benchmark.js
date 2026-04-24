#!/usr/bin/env node
/**
 * 阶段 1 压测脚本：连续跑 N 次 verify_identity + detect_deepfake，
 * 统计成功率和延迟分位数。
 *
 * 用法（在 prototype-app 目录下）：
 *   # 1. 准备一组测试素材（至少 1 组证件照 + 自拍视频）
 *   mkdir -p tests/fixtures
 *   # 把 photo.jpg 和 selfie.mp4 放进 tests/fixtures/
 *
 *   # 2. 跑 100 次压测
 *   TENCENT_SECRET_ID=AKID... \
 *   TENCENT_SECRET_KEY=... \
 *   TENCENT_REGION=ap-singapore \
 *     node tests/benchmark.js
 *
 *   # 或指定次数
 *   node tests/benchmark.js 50
 *
 * 输出：成功率、延迟 p50/p95/p99、错误分布。
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { signAndCallTC3 } from "../dist/auth/tc3-signer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------
// 配置
// ------------------------------------------------------------------
const TOTAL = Number(process.argv[2] ?? 100);
const FIXTURES_DIR = resolve(__dirname, "fixtures");
const IMAGE_PATH = resolve(FIXTURES_DIR, "photo.jpg");
const VIDEO_PATH = resolve(FIXTURES_DIR, "selfie.mp4");

const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const REGION = process.env.TENCENT_REGION || "ap-singapore";

// ------------------------------------------------------------------
// 预检
// ------------------------------------------------------------------
if (!SECRET_ID || !SECRET_KEY) {
  console.error("❌ 需要设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY");
  process.exit(1);
}

if (!existsSync(IMAGE_PATH) || !existsSync(VIDEO_PATH)) {
  console.error(`❌ 找不到测试素材。请把以下文件准备好：
    - ${IMAGE_PATH}
    - ${VIDEO_PATH}`);
  process.exit(1);
}

const imageB64 = readFileSync(IMAGE_PATH).toString("base64");
const videoB64 = readFileSync(VIDEO_PATH).toString("base64");

console.log(`\n🔬 压测开始`);
console.log(`   - 目标总次数: ${TOTAL}`);
console.log(`   - 图片大小:   ${(imageB64.length / 1024).toFixed(1)} KB (Base64)`);
console.log(`   - 视频大小:   ${(videoB64.length / 1024).toFixed(1)} KB (Base64)`);
console.log(`   - Region:     ${REGION}`);
console.log(`   - 并发:       串行（避免腾讯云限流）\n`);

// ------------------------------------------------------------------
// 主循环
// ------------------------------------------------------------------
const results = [];
const startTotal = Date.now();

for (let i = 1; i <= TOTAL; i++) {
  const t0 = Date.now();
  let status = "ok";
  let errorCode = null;
  let errorMsg = null;
  let sim = null;

  try {
    const resp = await signAndCallTC3({
      service: "faceid",
      host: "faceid.tencentcloudapi.com",
      action: "CompareFaceLiveness",
      version: "2018-03-01",
      region: REGION,
      payload: {
        ImageBase64: imageB64,
        VideoBase64: videoB64,
        LivenessType: "SILENT",
      },
      secretId: SECRET_ID,
      secretKey: SECRET_KEY,
      timeoutMs: 30_000,
    });

    if (resp.Response.Error) {
      status = "api_error";
      errorCode = resp.Response.Error.Code;
      errorMsg = resp.Response.Error.Message;
    } else {
      const result = resp.Response.Result;
      sim = resp.Response.Sim;
      if (result !== "Success") {
        status = "biz_error";
        errorCode = result;
      }
    }
  } catch (e) {
    status = "exception";
    errorCode = "NetworkOrTimeout";
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const latency = Date.now() - t0;
  results.push({ i, status, errorCode, latency, sim });

  const marker =
    status === "ok" ? "✅" : status === "api_error" ? "⚠️ " : "❌";
  process.stdout.write(
    `\r[${i}/${TOTAL}] ${marker} latency=${latency}ms sim=${sim ?? "-"} ${errorCode ?? ""}         `,
  );
}
process.stdout.write("\n");

const durationTotal = ((Date.now() - startTotal) / 1000).toFixed(1);

// ------------------------------------------------------------------
// 统计
// ------------------------------------------------------------------
const ok = results.filter((r) => r.status === "ok");
const okRate = ((ok.length / results.length) * 100).toFixed(1);

const latencies = results.map((r) => r.latency).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.floor((p / 100) * (latencies.length - 1))];

const errorBuckets = {};
for (const r of results) {
  if (r.status !== "ok") {
    const key = `${r.status}:${r.errorCode}`;
    errorBuckets[key] = (errorBuckets[key] ?? 0) + 1;
  }
}

// ------------------------------------------------------------------
// 输出报告
// ------------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log("📊 压测报告");
console.log("=".repeat(60));
console.log(`总次数:     ${results.length}`);
console.log(`总耗时:     ${durationTotal}s`);
console.log(`成功次数:   ${ok.length}`);
console.log(`成功率:     ${okRate}%  (目标 >95%)`);
console.log("");
console.log("延迟分位数 (目标 P95 < 8000ms):");
console.log(`  P50:      ${percentile(50)}ms`);
console.log(`  P75:      ${percentile(75)}ms`);
console.log(`  P90:      ${percentile(90)}ms`);
console.log(`  P95:      ${percentile(95)}ms  ${percentile(95) < 8000 ? "✅" : "❌"}`);
console.log(`  P99:      ${percentile(99)}ms`);
console.log(`  Max:      ${latencies[latencies.length - 1]}ms`);
console.log(`  Min:      ${latencies[0]}ms`);

if (Object.keys(errorBuckets).length > 0) {
  console.log("\n失败分布:");
  for (const [key, count] of Object.entries(errorBuckets).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(3)}x  ${key}`);
  }
}

// 相似度分布（仅成功）
if (ok.length > 0) {
  const sims = ok.map((r) => r.sim).sort((a, b) => a - b);
  console.log("\n相似度分布（仅成功）:");
  console.log(`  Min: ${sims[0].toFixed(2)}`);
  console.log(`  P50: ${sims[Math.floor(sims.length * 0.5)].toFixed(2)}`);
  console.log(`  Max: ${sims[sims.length - 1].toFixed(2)}`);
}

console.log("\n" + "=".repeat(60));

// ------------------------------------------------------------------
// 通过判定
// ------------------------------------------------------------------
const successRateOK = parseFloat(okRate) > 95;
const p95OK = percentile(95) < 8000;

console.log(`\n验证结果：`);
console.log(`  [${successRateOK ? "✅" : "❌"}] 一次调用成功率 > 95%`);
console.log(`  [${p95OK ? "✅" : "❌"}] 响应延迟 P95 < 8s`);

if (successRateOK && p95OK) {
  console.log("\n🎉 两项指标都通过，可以写进 CONCLUSION.md 的"技术可用性"章节。\n");
  process.exit(0);
} else {
  console.log("\n⚠️  有指标未达标，看失败分布或延迟详情定位问题。\n");
  process.exit(1);
}
