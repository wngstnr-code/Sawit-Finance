# MCP evidence — a real LLM calling Sawit Finance tools

The Casper MCP server (`agents/mcp_server.py`) exposes Sawit Finance's live
on-chain state to any MCP-compatible LLM as standardized tools. This page is the
primary evidence that an actual LLM client (Claude Desktop) invoked those tools
over the MCP protocol — not just that the tools exist.

## The 7 live-state tools

| Tool | Returns |
|------|---------|
| `get_protocol_state` | SAWIT supply, CPO value/tons/price, GORR, oracle reputation, epochs, claim window |
| `get_oracle_reputation` | On-chain rolling accuracy score of the oracle agent |
| `get_palm_oil_price` | Latest verified CPO price + x402 provenance (paid vs. fallback) |
| `get_account_position` | A specific holder's SAWIT balance and claimable yield |
| `get_contracts` | The four deployed contract package hashes |
| `get_economic_loop` | The full record → mint → fund → claim loop as structured steps |
| `refresh_protocol_state` | Forces a fresh on-chain read, bypassing the cache |

## How to reproduce

1. Add the server to `~/Library/Application Support/Claude/claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "sawit-finance": {
         "command": "/Users/mac/Desktop/sawit-fi/.venv/bin/python",
         "args": ["/Users/mac/Desktop/sawit-fi/agents/mcp_server.py"]
       }
     }
   }
   ```

2. Restart Claude Desktop. The `sawit-finance` tools appear in the tools menu (🔌).

3. Ask a question that requires chaining two tools, e.g.:

   > "What's the current oracle reputation for Sawit Finance, and is the latest
   > palm oil price it posted actually paid for via x402 or a fallback?"

   This makes the LLM call `get_oracle_reputation` **and** `get_palm_oil_price`
   to answer — a genuine multi-step agentic use of the tools, not a single read.

## Captured session

<!--
  Paste below:
  1. A screenshot of Claude Desktop showing the tool-call chips for
     sawit-finance tools (get_oracle_reputation / get_palm_oil_price) firing.
     Save the image to docs/img/mcp-call.png and reference it:
       ![MCP tool call in Claude Desktop](img/mcp-call.png)
  2. The plain-text transcript of the question + the LLM's answer, showing the
     values it pulled from the live chain (reputation score, CPO price,
     paid_via_x402 flag). Paste it in the fenced block below.
-->

_Screenshot:_

<!-- ![MCP tool call in Claude Desktop](img/mcp-call.png) -->

_Transcript:_

```
(paste the Claude Desktop question + tool-call trace + answer here)
```

> Verify the underlying data independently: the same values are served by the
> live app at [sawitfinance.xyz](https://sawitfinance.xyz) and the `/api/agents`
> and `/api/state` routes, and every contract read resolves on
> [cspr.live](https://testnet.cspr.live).
