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
| `get_block_number` | Latest block number |
| `get_balance` | Native-token balance of an address |
| `get_transaction_receipt` | Transaction receipt by hash |
| `eth_call` | Read-only contract call |
| `get_logs` | Contract event logs (heavy — key or x402 wallet) |
| `rpc_call` | Any JSON-RPC method on any supported chain |
| `get_transaction` | Transaction by hash (from, to, value, input) |
| `get_block` | Block by number/tag, optional full transactions |
| `get_gas_price` | Current gas price + EIP-1559 priority fee |
| `get_token_balance` | ERC-20 balance, raw + human-readable |
| `get_token_metadata` | ERC-20 name, symbol, decimals, total supply |

## Links

- [NodeFlare](https://nodeflare.app) — free API key, 3M CU/month
- [x402 pay-per-request](https://nodeflare.app/x402) — pricing and how it works
- [Docs](https://nodeflare.app/docs) · [Status](https://nodeflare.app/status) · [Discord](https://discord.gg/ameHnRy2D6)

MIT
