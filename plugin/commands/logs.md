---
description: Fetch and summarize recent event logs for a contract
argument-hint: <contract-address> [chain] [fromBlock] [toBlock]
---

Fetch and summarise event logs for a contract using the nodeflare MCP server.

1. Parse `$ARGUMENTS` into: a contract address (required), an optional chain slug (default `ethereum`), and an optional block range (`fromBlock`/`toBlock`). If no range is given, first call `get_block_number` and query a recent window (e.g. the last few thousand blocks) so the range stays within limits.
2. Call `get_logs` for that address and range.
3. Summarise: how many events, grouped by the event signature (topic0). For recognisable signatures (ERC-20 `Transfer`/`Approval`, Uniswap `Swap`, etc.) decode and count them, and highlight notable entries (largest transfers, most active addresses).
4. `get_logs` needs a keyed request — remind the user to set `NODEFLARE_API_KEY` (free tier: 3,000,000 CU/month at https://nodeflare.app) if the call reports the method is unavailable on the public tier.
