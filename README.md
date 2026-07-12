# NodeFlare MCP Server

[![nodeflare-mcp MCP server](https://glama.ai/mcp/servers/Nodeflare-app/nodeflare-mcp/badges/card.svg)](https://glama.ai/mcp/servers/Nodeflare-app/nodeflare-mcp)


Blockchain JSON-RPC for AI agents on **23 EVM chains** — Ethereum, Base, BNB Chain, Arbitrum, Optimism, Avalanche, HyperEVM, Polygon, and young chains like Robinhood Chain, Plasma, Ink, Zircuit, BOB and Soneium. Served from [NodeFlare](https://nodeflare.app)'s own bare-metal nodes across 5 regions.

## Quick start

```json
{
  "mcpServers": {
    "nodeflare": {
      "command": "npx",
      "args": ["-y", "nodeflare-mcp"]
    }
  }
}
```

That's it — no API key required for standard reads (block numbers, balances, transactions, `eth_call`).

Every tool's `chain` argument accepts a **slug** (`eth`, `base`, `arb`), a **name** (`ethereum`, `arbitrum`, `bsc`), or a **numeric chain ID** (`1`, `8453`) — so agents don't have to know NodeFlare's internal slugs.

## Install as a Claude Code plugin

This repo doubles as a [Claude Code](https://claude.com/claude-code) plugin marketplace. Installing the plugin wires up the MCP server **and** a set of slash-command recipes in one step:

```bash
claude plugin marketplace add Nodeflare-app/nodeflare-mcp
claude plugin install nodeflare
```

Then use the recipes below (`/nodeflare:balance`, `/nodeflare:token`, …). To unlock heavy methods, export `NODEFLARE_API_KEY` in your shell before starting Claude Code ([free key, 3M CU/month](https://nodeflare.app)).

## Recipes

Ready-made slash commands bundled with the plugin:

| Recipe | What it does |
|---|---|
| `/nodeflare:chains [filter]` | List supported chains, IDs and endpoint URLs |
| `/nodeflare:balance <address> [chain] [token…]` | Native + ERC-20 balances, one chain or across the majors |
| `/nodeflare:token <token> [chain] [holder]` | ERC-20 metadata (name/symbol/decimals/supply) + optional holder balance |
| `/nodeflare:tx <hash> [chain]` | Fetch a transaction + receipt and explain what it did |
| `/nodeflare:logs <contract> [chain] [from] [to]` | Fetch and summarise a contract's recent event logs |
| `/nodeflare:gas [chain \| compare]` | Current gas price on a chain, or a cheapest-first comparison |

## Access tiers

The server picks its access tier from the environment:

| Env var | Tier |
|---|---|
| *(none)* | Free public endpoints — standard read methods, rate-limited per IP |
| `NODEFLARE_API_KEY` | Free/paid key — heavy methods, 3,000,000 compute units/month free ([get one](https://nodeflare.app)) |
| `X402_PRIVATE_KEY` | **Pay per call with [x402](https://nodeflare.app/x402)** — heavy methods (`eth_getLogs`, `trace_*`, `debug_*`) are paid from this wallet in USDC on Base, Polygon or Arbitrum, ~$0.001/call. No account needed; gas is covered by the facilitator. |

With an x402 wallet, a blocked heavy method is retried automatically as a paid call — the tool result includes `"_x402": "settled via x402"` when a payment settled on-chain.

```json
{
  "mcpServers": {
    "nodeflare": {
      "command": "npx",
      "args": ["-y", "nodeflare-mcp"],
      "env": { "X402_PRIVATE_KEY": "0x…" }
    }
  }
}
```

> Use a dedicated agent wallet holding a small USDC balance — never your main wallet.

## Tools

| Tool | Description |
|---|---|
| `list_chains` | The 23 supported chains with chain IDs and endpoints |
| `get_block_number` | Latest block number (decimal + hex) |
| `get_balance` | Native-token balance — raw wei + human-readable amount in the chain's currency |
| `get_transaction_receipt` | Transaction receipt by hash |
| `eth_call` | Read-only contract call |
| `get_logs` | Contract event logs (heavy — key or x402 wallet) |
| `rpc_call` | Any JSON-RPC method on any supported chain |
| `get_transaction` | Transaction by hash (from, to, value, input) |
| `get_block` | Block by number/tag, optional full transactions |
| `get_gas_price` | Current gas price + EIP-1559 priority fee |
| `get_token_balance` | ERC-20 balance, raw + human-readable |
| `get_token_metadata` | ERC-20 name, symbol, decimals, total supply |
| `resolve_ens` | ENS name → address (forward) or address → primary ENS name (reverse) |

Address arguments (`get_balance`, `get_token_balance`, `eth_call`) also accept **ENS names** — pass `vitalik.eth` and it's resolved to an address automatically.

## Prompts (any MCP client)

The server also exposes the recipes as **MCP prompts**, so guided workflows show up in any MCP client (Cursor, Windsurf, …), not just the Claude Code plugin: `chains`, `balance`, `token`, `tx`, `logs`, `gas`.

## Links

- [NodeFlare](https://nodeflare.app) — free API key, 3M CU/month
- [x402 pay-per-request](https://nodeflare.app/x402) — pricing and how it works
- [Docs](https://nodeflare.app/docs) · [Status](https://nodeflare.app/status) · [Discord](https://discord.gg/ameHnRy2D6)

MIT
