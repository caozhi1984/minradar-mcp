#!/usr/bin/env node
/**
 * minradar MCP server over stdio.
 *
 * minradar is a hosted MCP endpoint (https://minradar.com/mcp, streamable HTTP).
 * Plenty of clients - Claude Desktop and several editors among them - only speak
 * stdio, so without this bridge the server is simply unreachable for them.
 *
 * Handshake and tool discovery are answered locally from an embedded snapshot
 * that is refreshed from upstream in the background. Only real data calls go
 * over the network. Three reasons:
 *   1. Introspection works even with no egress (registry and CI sandboxes).
 *   2. Clients discover tools instantly instead of waiting on a round trip.
 *   3. The anonymous quota is spent on data, not on handshakes.
 * The upstream endpoint is fully stateless - no session id, no state carried
 * between calls - so answering the handshake locally is safe.
 *
 * stdout carries the protocol and nothing else: one stray log line corrupts the
 * stream. Diagnostics go to stderr.
 */

const ENDPOINT = process.env.MINRADAR_MCP_URL || 'https://minradar.com/mcp';
const TIMEOUT_MS = Number(process.env.MINRADAR_MCP_TIMEOUT_MS || 60000);
const REFRESH_MS = Number(process.env.MINRADAR_MCP_REFRESH_MS || 15 * 60 * 1000);
const SERVER_INFO = { name: 'demand-radar', version: '1.0.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS =
  'Demand Radar mines public App Store data for buildable opportunities. ' +
  'Typical flow: find_unmet_demand (or find_solo_buildable) -> get_opportunity_brief -> ' +
  'generate_app_brief. Tool names here are exactly the names the server exposes.';

/**
 * Snapshot of tools/list, taken from the live endpoint. Refreshed in the
 * background at startup and whenever it goes stale, so discovery keeps working
 * even when this process cannot reach the network.
 */
const EMBEDDED_TOOLS = [
  {
    "name": "find_unmet_demand",
    "description": "Rank App Store opportunities in apps that already have a large user base but whose users are clearly unhappy (unmet demand). Returns a ranked table with tier, score, rating and scale. Use this first when deciding what app to build.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "storefront": {
          "type": "string",
          "default": "us",
          "description": "Two-letter App Store region. The value is region identity, never a label."
        },
        "limit": {
          "type": "integer",
          "default": 10,
          "maximum": 200,
          "description": "Maximum number of results to return."
        },
        "min_rating_count": {
          "type": "integer",
          "default": 5000,
          "description": "Rating volume is the install proxy. On /api/lens this remains a legacy alias for the scaled value; /api/hotspots uses it literally."
        },
        "min_rating_count_scaled": {
          "type": "integer",
          "default": 5000,
          "description": "Pre-scaled rating volume filter. /api/lens applies max(300, floor(value / 3)); /api/paying applies max(200, floor(value / 5))."
        },
        "max_rating_count": {
          "type": "integer",
          "default": 0,
          "description": "Optional ceiling to exclude unassailable giants."
        },
        "max_rating": {
          "type": "number",
          "description": "Only include apps at or below this average rating, e.g. 4.0."
        },
        "genre": {
          "type": "string",
          "description": "Restrict to one App Store category, e.g. Productivity."
        },
        "include_institutional": {
          "type": "boolean",
          "default": false,
          "description": "Include institution-locked products that a solo dev cannot win."
        }
      },
      "required": []
    }
  },
  {
    "name": "find_solo_buildable",
    "description": "Find opportunities a single developer can realistically build: clear winnability plus an explicit single-user, local or offline core. Use when solo feasibility is the primary constraint.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "storefront": {
          "type": "string",
          "default": "us",
          "description": "Two-letter App Store region. The value is region identity, never a label."
        },
        "limit": {
          "type": "integer",
          "default": 10,
          "maximum": 200,
          "description": "Maximum number of results to return."
        },
        "min_rating_count": {
          "type": "integer",
          "default": 5000,
          "description": "Rating volume is the install proxy. On /api/lens this remains a legacy alias for the scaled value; /api/hotspots uses it literally."
        },
        "min_rating_count_scaled": {
          "type": "integer",
          "default": 5000,
          "description": "Pre-scaled rating volume filter. /api/lens applies max(300, floor(value / 3)); /api/paying applies max(200, floor(value / 5))."
        },
        "max_rating_count": {
          "type": "integer",
          "default": 0,
          "description": "Optional ceiling to exclude unassailable giants."
        },
        "max_rating": {
          "type": "number",
          "description": "Only include apps at or below this average rating, e.g. 4.0."
        },
        "genre": {
          "type": "string",
          "description": "Restrict to one App Store category, e.g. Productivity."
        },
        "include_institutional": {
          "type": "boolean",
          "default": false,
          "description": "Include institution-locked products that a solo dev cannot win."
        }
      },
      "required": []
    }
  },
  {
    "name": "validate_paying_market",
    "description": "Rank app categories by evidence that users already pay inside them: how many of its apps reach the store-wide Top-Grossing chart, how many charge upfront, paywall language in sampled reviews, and review depth. Call this before building to confirm a market monetises.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "storefront": {
          "type": "string",
          "default": "us",
          "description": "Two-letter App Store region. The value is region identity, never a label."
        },
        "limit": {
          "type": "integer",
          "default": 10,
          "maximum": 200,
          "description": "Maximum number of results to return."
        },
        "min_rating_count": {
          "type": "integer",
          "default": 5000,
          "description": "Rating volume is the install proxy. On /api/lens this remains a legacy alias for the scaled value; /api/hotspots uses it literally."
        }
      },
      "required": []
    }
  },
  {
    "name": "get_opportunity_brief",
    "description": "Full evidence dossier for one app: score breakdown, plain-language diagnosis, complaint themes with verbatim user quotes, review provenance, and matching open-source accelerators. Use after find_low_hanging_fruit to inspect a specific candidate.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "app_id": {
          "type": "integer",
          "description": "App Store track id."
        },
        "storefront": {
          "type": "string",
          "default": "us",
          "description": "Two-letter App Store region. The value is region identity, never a label."
        },
        "include_github": {
          "type": "boolean",
          "default": true,
          "description": "MCP name for the REST with_github switch."
        }
      },
      "required": [
        "app_id"
      ]
    }
  },
  {
    "name": "generate_app_brief",
    "description": "Produce a ready-to-build product specification for an opportunity, formatted for a specific AI coding agent (codex, claude, or cursor). Includes the wedge, the verbatim complaints to fix, verified open-source accelerators, and a verification plan.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "app_id": {
          "type": "integer",
          "description": "App Store track id."
        },
        "storefront": {
          "type": "string",
          "default": "us",
          "description": "Two-letter App Store region. The value is region identity, never a label."
        },
        "target": {
          "type": "string",
          "enum": [
            "codex",
            "claude",
            "cursor"
          ],
          "default": "codex",
          "description": "AI coding agent that will receive the brief."
        }
      },
      "required": [
        "app_id"
      ]
    }
  },
  {
    "name": "search_open_source_accelerators",
    "description": "Find maintained, commercially reusable open-source projects for a niche, with license posture. Use to avoid rebuilding infrastructure and to check whether a dependency is safe to ship.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "genre": {
          "type": "string",
          "description": "Restrict to one App Store category, e.g. Productivity."
        },
        "theme": {
          "type": "string",
          "description": "Complaint theme key, e.g. data_loss_sync, paywall_aggressive, ai_quality."
        },
        "limit": {
          "type": "integer",
          "default": 6,
          "maximum": 200,
          "description": "Maximum number of results to return."
        }
      },
      "required": []
    }
  },
  {
    "name": "explain_method",
    "description": "Explain the scoring formulas, weights, and the honest limitations of the data. Use when a user questions the numbers.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "market_stats",
    "description": "Report local data coverage (apps, reviews, chart snapshots) and the last ingest run.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  }
];

let tools = EMBEDDED_TOOLS;
let lastRefreshAttempt = 0;
let lastRefreshOk = 0;

const log = (...parts) => process.stderr.write(`[minradar-mcp] ${parts.join(' ')}\n`);

/** Streamable HTTP may answer with JSON or with SSE; accept both. */
function extractPayload(text, contentType) {
  if (!/text\/event-stream/i.test(contentType || '')) return text.trim();
  const chunks = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  return chunks.length ? chunks[chunks.length - 1] : '';
}

/** POST one JSON-RPC message to the hosted endpoint. */
async function postUpstream(raw) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'user-agent': 'minradar-mcp/1.0 (+https://minradar.com)',
      },
      body: raw,
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, payload: extractPayload(text, response.headers.get('content-type')) };
  } finally {
    clearTimeout(timer);
  }
}

/** Pull a fresh tools/list from upstream. Never throws, never blocks startup. */
async function refreshTools(force) {
  const now = Date.now();
  if (!force && now - lastRefreshAttempt < REFRESH_MS) return;
  lastRefreshAttempt = now;
  try {
    const { ok, status, payload } = await postUpstream(
      JSON.stringify({ jsonrpc: '2.0', id: 'refresh', method: 'tools/list', params: {} }),
    );
    if (!ok) return log(`tools/list refresh: upstream HTTP ${status}, keeping previous snapshot`);
    const list = JSON.parse(payload)?.result?.tools;
    if (Array.isArray(list) && list.length) {
      tools = list;
      lastRefreshOk = Date.now();
      log(`tools/list refreshed: ${list.length} tools from upstream`);
    }
  } catch (error) {
    const reason = error.name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : error.message;
    log(`tools/list refresh failed: ${reason}; serving embedded snapshot (${EMBEDDED_TOOLS.length} tools)`);
  }
}

const result = (id, value) => JSON.stringify({ jsonrpc: '2.0', id, result: value });
const error = (id, code, message) => JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });

/** Answer a message locally, or return undefined to forward it upstream. */
function handleLocally(message) {
  switch (message.method) {
    case 'initialize': {
      const asked = message.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return result(message.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return result(message.id, {});
    case 'tools/list':
      refreshTools(false);
      return result(message.id, { tools });
    case 'prompts/list':
      return result(message.id, { prompts: [] });
    case 'resources/list':
      return result(message.id, { resources: [] });
    case 'resources/templates/list':
      return result(message.id, { resourceTemplates: [] });
    default:
      return undefined;
  }
}

async function forward(raw, id) {
  try {
    const { ok, status, payload } = await postUpstream(raw);
    if (!payload) {
      log(`upstream returned an empty body (HTTP ${status})`);
      return error(id, -32000, `minradar upstream returned an empty body (HTTP ${status})`);
    }
    if (!ok) log(`upstream HTTP ${status}`);
    return payload;
  } catch (unreachable) {
    const reason = unreachable.name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : unreachable.message;
    log(`request failed: ${reason}`);
    return error(id, -32000, `minradar upstream unreachable: ${reason}`);
  }
}

let buffer = '';
let chain = Promise.resolve();

function enqueue(raw) {
  chain = chain.then(async () => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return void process.stdout.write(`${error(null, -32700, 'Parse error')}\n`);
    }
    // A notification has no id and must not be answered at all. The upstream is
    // stateless, so there is nothing to notify either: swallow it and save quota.
    if (!('id' in message)) return;

    const local = handleLocally(message);
    const reply = local !== undefined ? local : await forward(raw, message.id);
    if (reply) process.stdout.write(`${reply}\n`);
  });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) enqueue(line);
  }
});
process.stdin.on('end', () => {
  const rest = buffer.trim();
  if (rest) enqueue(rest);
  chain.then(() => process.exit(0));
});

log(`stdio bridge -> ${ENDPOINT} (handshake answered locally from a ${EMBEDDED_TOOLS.length}-tool snapshot)`);
refreshTools(true);
