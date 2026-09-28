# minradar — App Store opportunity data for coding agents

[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-com.minradar%2Fminradar-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=minradar)

Know **what to build** before you build it. minradar mines public App Store data for apps that
already have real install scale and visible dissatisfaction, checks whether users in that category
already pay, and hands your coding agent a paste-ready build brief.

- **Remote MCP (no install):** `https://minradar.com/mcp`
- **Local stdio MCP (this repo):** `node index.js`, or the Docker image below
- **Human-readable setup:** https://minradar.com/agents
- **Machine-readable:** https://minradar.com/llms.txt · https://minradar.com/openapi.json
- **One-line CLI:** `curl -fsSL https://minradar.com/install.sh | sh`

## Tools

| Tool | What it answers |
|---|---|
| `find_unmet_demand` | Where is there scale with visible unhappiness? |
| `find_solo_buildable` | Which of those can one developer actually ship and win? |
| `validate_paying_market` | Does anyone already pay in this category? |
| `get_opportunity_brief` | Full evidence dossier for one app: score, complaint themes, verbatim quotes |
| `generate_app_brief` | A ready-to-paste spec for Codex / Claude Code / Cursor |
| `search_open_source_accelerators` | Maintained OSS you can build on, with licence posture |
| `explain_method` | The formulas, weights and the dataset's limits |
| `market_stats` | Coverage and freshness of the data behind all of the above |

## Use it over HTTP

```jsonc
// Claude Code
// claude mcp add --transport http minradar https://minradar.com/mcp

// Codex (~/.codex/config.toml)
[mcp_servers.minradar]
url = "https://minradar.com/mcp"

// Cursor (.cursor/mcp.json)
{ "mcpServers": { "minradar": { "url": "https://minradar.com/mcp" } } }
```

## Use it over stdio

Some clients — Claude Desktop, and several editors — only speak stdio. `index.js` is a small
zero-dependency bridge that exposes the same eight tools over stdio, so those clients work too.

```jsonc
// Claude Desktop (claude_desktop_config.json)
{
  "mcpServers": {
    "minradar": {
      "command": "node",
      "args": ["/absolute/path/to/minradar-mcp/index.js"]
    }
  }
}
```

No dependencies and no build step: Node 18 or newer is the whole requirement.

```bash
node index.js          # speaks JSON-RPC on stdin/stdout
```

### Docker

```bash
docker build -t minradar-mcp .
docker run -i --rm minradar-mcp
```

`-i` matters: the container talks MCP over stdin/stdout, so it needs a connected stdin.

Handshake and tool discovery are answered locally from a snapshot that is refreshed from upstream in
the background; only real data calls go over the network. That keeps introspection working where
egress is blocked, makes tool discovery instant, and stops handshakes from eating the anonymous
hourly quota. Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `MINRADAR_MCP_URL` | `https://minradar.com/mcp` | Upstream endpoint to bridge to |
| `MINRADAR_MCP_TIMEOUT_MS` | `60000` | Per-call timeout |
| `MINRADAR_MCP_REFRESH_MS` | `900000` | How stale the tool snapshot may get before a refresh |

Recommended flow: `find_unmet_demand` → `get_opportunity_brief` → `generate_app_brief`.
Every result carries a `next` field for the step after it.

## Free tier, and what the paid tiers add

The free tier is enough for a real decision loop: every opportunity view, every piece of evidence,
and a daily allowance of **1 build brief** and **3 evidence dossiers** per IP.

Beyond that, [minradar.com/pricing](https://minradar.com/pricing):

- **Decision pack — US$9 one-off.** Ten build briefs: enough to weigh three to five candidate
  ideas. No expiry, no auto-renewal, no subscription.
- **Pro — US$19/month.** Higher API quota, batch export, watchlist change alerts, unlimited briefs.

No account is needed to start: the free tier works anonymously and the same origin serves both.

## Honest about the data

- Apple publishes **no download counts**. Rating volume is used as a stated install proxy, everywhere,
  and never presented as a measurement it is not.
- Scores are explainable: `explain_method` returns formulas, weights and limitations rather than marketing.
- **Per-region scale**: an app's rating volume is stored per storefront, so a German ranking is driven by
  German numbers (before this, 53.5% of region memberships quoted another region's volume).

## Licence

MIT (this repository). The hosted service is operated at minradar.com.
