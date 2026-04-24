# Tencent Cloud eKYC MCP Server

A Model Context Protocol (MCP) server that wraps Tencent Cloud eKYC APIs as callable tools for AI agents (Claude Desktop, Cursor, Windsurf, etc.). Enables face verification, liveness detection, deepfake detection, and identity verification — all via natural language.

## Features

- **Face Verification (1:1)** — Compare ID card photo with selfie video
- **Liveness Detection** — Anti-spoofing with silent challenge
- **Deepfake Detection** — Detect AI-generated or manipulated face images
- **Image Quality Check** — Pre-verify image quality before KYC submission
- **Supported Documents Query** — List all supported ID types by region
- **Verification Status Tracking** — Check async verification results

## Supported Regions & Documents

| Region | Documents |
|--------|-----------|
| Indonesia (ID) | KTP (ID Card), SIM (Driver License) |
| Malaysia (MY) | MyKad, MyTentera |
| Thailand (TH) | Thai ID Card |
| Singapore (SG) | NRIC |
| Philippines (PH) | UMID, SSS ID |
| Vietnam (VN) | Chip-based ID |
| More... | 16 regions, 28 document types |

## Quick Start

### Prerequisites

- Node.js >= 20
- Tencent Cloud account with eKYC service enabled
- SecretId & SecretKey from Tencent Cloud Console

### Install & Build

```bash
git clone https://github.com/FrogOVO/tencent-ekyc-mcp-server.git
cd tencent-ekyc-mcp-server
npm install
npm run build
```

### Configure Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tencent-ekyc": {
      "command": "node",
      "args": ["D:\\path\\to\\tencent-ekyc-mcp-server\\dist\\index.js"],
      "env": {
        "TENCENT_SECRET_ID": "your-secret-id",
        "TENCENT_SECRET_KEY": "your-secret-key",
        "TENCENT_REGION": "ap-singapore",
        "EKYC_LOG_LEVEL": "info"
      }
    }
  }
}
```

Restart Claude Desktop. You should see `tencent-ekyc` tools available.

### Usage (Natural Language)

Once configured, just talk to your AI agent:

```
Please verify this person's identity using their KTP photo and selfie video.
```

The agent will automatically call `tencent_ekyc_verify_identity` with the correct parameters.

## Available Tools

| Tool Name | Description |
|-----------|-------------|
| `tencent_ekyc_get_credential_status` | Check if API credentials are configured |
| `tencent_ekyc_get_supported_documents` | List supported ID documents by region |
| `tencent_ekyc_check_image_quality` | Validate image quality before submission |
| `tencent_ekyc_verify_identity` | Full KYC: face comparison + liveness + verification |
| `tencent_ekyc_detect_deepfake` | Detect deepfake/AI-generated face images |
| `tencent_ekyc_get_verification_status` | Query async verification result |

## Project Structure

```
src/
├── index.ts                    # MCP server entry point
├── auth/tc3-signer.ts         # TC3-HMAC-SHA256 signature
├── config/
│   ├── documents.ts            # Supported document matrix
│   └── env.ts                 # Environment variable validation
├── enhancer/
│   ├── error-mapper.ts         # Error code → AgentHint mapping
│   └── response-enhancer.ts   # Response enrichment
├── tools/
│   ├── verify-identity.ts      # KYC verification tool
│   ├── detect-deepfake.ts     # Deepfake detection tool
│   ├── supported-docs.ts      # Document query tool
│   ├── check-quality.ts        # Image quality tool
│   └── verification-status.ts # Status query tool
└── utils/logger.ts            # Structured stderr logger
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TENCENT_SECRET_ID` | Yes | Tencent Cloud API Secret ID |
| `TENCENT_SECRET_KEY` | Yes | Tencent Cloud API Secret Key |
| `TENCENT_REGION` | No | API region (default: `ap-singapore`) |
| `EKYC_LOG_LEVEL` | No | Log level: `info` / `debug` (default: `info`) |

## Development

```bash
# Run in dev mode (tsx, hot reload)
npm run dev

# Inspect MCP tools via MCP Inspector
npm run inspect

# Run tests
npm test
```

## License

Apache License 2.0

## Related Links

- [Tencent Cloud eKYC Documentation](https://www.tencentcloud.com/dynamic/ebook/1186)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)

---

**Keywords**: MCP, Model Context Protocol, face recognition, face verification, identity verification, KYC, eKYC, liveness detection, deepfake detection, Indonesian KTP, Tencent Cloud
