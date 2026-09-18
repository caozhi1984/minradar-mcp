# minradar — App Store opportunity data for coding agents

[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-com.minradar%2Fminradar-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=minradar)

Know **what to build** before you build it. minradar mines public App Store data for apps that
already have real install scale and visible dissatisfaction, checks whether users in that category
already pay, and hands your coding agent a paste-ready build brief.

- **Remote MCP (no install):** `https://minradar.com/mcp`
- **Human-readable setup:** https://minradar.com/agents
- **Machine-readable:** https://minradar.com/llms.txt · https://minradar.com/openapi.json
- **One-line CLI:** `curl -fsSL https://minradar.com/install.sh | sh`

## Tools

| Tool | What it answers |
|---|---|
| `find_unmet_demand` | Where is there scale with visible unhappiness? |
| `validate_paying_market` | Does anyone already pay in this category? |
| `get_opportunity_brief` | Full evidence dossier for one app: score, complaint themes, verbatim quotes |
| `generate_app_brief` | A ready-to-paste spec for Codex / Claude Code / Cursor |
| `search_open_source_accelerators` | Maintained OSS you can build on, with licence posture |
| `explain_method` | The formulas, weights and the dataset's limits |
| `market_stats` | Coverage and freshness of the data behind all of the above |

## Use it

```jsonc
// Claude Code
// claude mcp add --transport http minradar https://minradar.com/mcp

// Codex (~/.codex/config.toml)
[mcp_servers.minradar]
url = "https://minradar.com/mcp"

// Cursor (.cursor/mcp.json)
{ "mcpServers": { "minradar": { "url": "https://minradar.com/mcp" } } }
```

Recommended flow: `find_unmet_demand` → `get_opportunity_brief` → `generate_app_brief`.
Every result carries a `next` field for the step after it.

## Honest about the data

- Apple publishes **no download counts**. Rating volume is used as a stated install proxy, everywhere,
  and never presented as a measurement it is not.
- Scores are explainable: `explain_method` returns formulas, weights and limitations rather than marketing.
- **Per-region scale**: an app's rating volume is stored per storefront, so a German ranking is driven by
  German numbers (before this, 53.5% of region memberships quoted another region's volume).
- Anonymous quota: 120 MCP calls/hour per IP — enough for a real decision loop, not for scraping.

## Licence

MIT (this repository). The hosted service is operated at minradar.com.
