# QUICKSTART — 5 分钟跑通

> 目标：从 clone 到在 Claude Desktop 里用自然语言调用，**最多 30 分钟**。

---

## 0. 前置

- Node.js **20+**：`node --version`
- 腾讯云 **SecretId / SecretKey**（eKYC 服务已开通）
- 可选：Claude Desktop 最新版

---

## 1. 安装依赖（1 分钟）

```powershell
cd D:\File\eKYC-MCP-Workspace\03_prototype\prototype-app
npm install
```

---

## 2. 编译（30 秒）

```powershell
npm run build
```

编译后所有产物在 `dist/` 目录。如果你要边改边试，可以直接跑 `npm run dev`（走 tsx）。

---

## 3. 本地用 MCP Inspector 测一下（5 分钟）

PowerShell 下：

```powershell
# 设置环境变量（仅当前终端有效）
$env:TENCENT_SECRET_ID  = "你的SecretId"
$env:TENCENT_SECRET_KEY = "你的SecretKey"
$env:TENCENT_REGION     = "ap-singapore"
$env:EKYC_LOG_LEVEL     = "info"

# 启动 MCP Inspector 并连接本项目
npx -y @modelcontextprotocol/inspector node dist\index.js
```

浏览器会自动打开 MCP Inspector UI。在里面应能看到 **5 个工具**：

- `tencent_ekyc_verify_identity`
- `tencent_ekyc_detect_deepfake`
- `tencent_ekyc_get_supported_documents`
- `tencent_ekyc_check_image_quality`
- `tencent_ekyc_get_verification_status`

**先试 3 个无副作用的工具**，可验证服务没问题：

1. 点 `tencent_ekyc_get_supported_documents`，`region=ALL` 运行 → 应返回 16 个地区、28 个证件
2. 点 `tencent_ekyc_get_supported_documents`，`region=MY` 运行 → 只返回 Malaysia
3. 点 `tencent_ekyc_check_image_quality`，随便粘贴一个 Base64（比如带 `data:image/jpeg;base64,` 前缀的）→ 会报出 `BASE64_HAS_DATA_URI_PREFIX`

然后试**真实 API 调用**：

4. 点 `tencent_ekyc_verify_identity`
   - `image_base64`: 你准备的证件照 Base64（不带前缀）
   - `video_base64`: 你准备的自拍视频 Base64（不带前缀）
   - `liveness_type`: `SILENT`
   - 期望：返回 `verification / liveness / face_comparison / decision / metadata` 五段完整结构

5. 点 `tencent_ekyc_detect_deepfake`
   - `face_input`: 任意一张证件照 Base64
   - `face_input_type`: `1`
   - 期望：返回 `attack_risk_level: "Low"`, `decision.suggested_action: "PROCEED"`

---

## 4. 接入 Claude Desktop（3 分钟）

**配置文件位置：**

- Windows：`%APPDATA%\Claude\claude_desktop_config.json`
- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`

把 `eKYC-MCP-Workspace/03_prototype/claude_desktop_config.example.json` 的内容复制过去，替换掉 SecretId/Key。示例（Windows 路径注意用 `\\`）：

```json
{
  "mcpServers": {
    "tencent-ekyc": {
      "command": "node",
      "args": [
        "D:\\File\\eKYC-MCP-Workspace\\03_prototype\\prototype-app\\dist\\index.js"
      ],
      "env": {
        "TENCENT_SECRET_ID": "<你的SecretId>",
        "TENCENT_SECRET_KEY": "<你的SecretKey>",
        "TENCENT_REGION": "ap-singapore",
        "EKYC_LOG_LEVEL": "info"
      }
    }
  }
}
```

**保存后，完全退出并重启 Claude Desktop**（托盘里右键 Quit，不是关闭窗口）。

---

## 5. 用自然语言试（10 分钟）

重启后，左下角"工具"图标应能看到 `tencent-ekyc`，里面有 5 个工具。然后在对话框里试：

1. `What document types do you support for identity verification in Indonesia?`
   → 期望：Claude 自动调 `get_supported_documents`，返回 KTP + SIM

2. `I'm onboarding a new crypto customer in Thailand. Do a full security check on them.`
   → 期望：Claude 理解并提示你提供照片 + 视频，或者至少说明它会调 verify_identity + detect_deepfake

3. 粘贴一张照片的 Base64 后：`Please verify this person using Malaysian MyKad`
   → 期望：Claude 调 `verify_identity`，返回结构化结果

4. `The verification failed because lighting was too dark. What should I do next?`
   → 期望：Claude 能读到 `agent_hint.user_instruction`，告诉用户"move to a well-lit area"

按 `test-checklist.md` §2 逐一打勾。

---

## 6. 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| `Environment variable TENCENT_SECRET_ID is required` | 忘设密钥 | PowerShell 里 `$env:TENCENT_SECRET_ID="..."` 或写进 Claude 配置 |
| `AuthFailure.SignatureFailure` | 系统时间不对 | 检查 Windows 时间同步（签名容差 5 分钟）|
| `FailedOperation.ImageDecodeFailed` | Base64 带了 `data:image/...` 前缀 | 去掉前缀，或先用 `check_image_quality` 预检 |
| Claude Desktop 看不到工具 | 配置路径错 / 没重启 | 完整退出 Claude 再打开；检查日志（Windows: `%APPDATA%\Claude\logs\mcp*.log`）|
| `Cannot find module '@modelcontextprotocol/sdk'` | 没跑 `npm install` | `npm install` |
| TS 编译报 NodeNext 错 | tsconfig 被改过 | 对照本仓库 `tsconfig.json` 还原 |

如果日志需要调试，设 `"EKYC_LOG_LEVEL": "debug"` 再重启。日志写在 stderr，Claude Desktop 会把它们记到 `%APPDATA%\Claude\logs\mcp-server-tencent-ekyc.log`。

---

## 7. 跑完后做什么

1. 录屏 30–60 s：从对话到工具调用、到结构化结果
2. 按 `../test-checklist.md` §3 的结论模板写一页结论
3. 拿给团队评审 → 如果方向 OK，切到 `04_production/` 走 6 周正式版

---

## 8. 项目文件速查

```
prototype-app/
├── src/
│   ├── index.ts                    # 主入口，注册 5 个工具
│   ├── auth/tc3-signer.ts          # TC3-HMAC-SHA256 签名
│   ├── config/
│   │   ├── documents.ts            # 支持的证件矩阵
│   │   └── env.ts                  # 环境变量读取 + 校验
│   ├── enhancer/
│   │   ├── error-mapper.ts         # 错误码 → AgentHint
│   │   └── response-enhancer.ts    # 响应增强
│   ├── tools/
│   │   ├── verify-identity.ts
│   │   ├── detect-deepfake.ts
│   │   ├── supported-docs.ts
│   │   ├── check-quality.ts
│   │   └── verification-status.ts
│   └── utils/logger.ts             # 写 stderr 的结构化 logger
├── package.json
├── tsconfig.json
├── .env.example
└── QUICKSTART.md                   ← 你现在看的
```
