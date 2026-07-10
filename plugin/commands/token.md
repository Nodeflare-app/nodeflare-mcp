---
description: Look up an ERC-20 token's metadata (name, symbol, decimals, supply) and optionally a holder's balance
argument-hint: <token-address> [chain] [holder-address]
---

Inspect an ERC-20 token using the nodeflare MCP server.

1. Parse `$ARGUMENTS` into: the token contract address (required), an optional chain slug (default `ethereum`), and an optional holder address.
2. Call `get_token_metadata` for the token's name, symbol, decimals and total supply.
3. If a holder address was given, also call `get_token_balance` for that holder's human-readable balance.
4. Summarise: token name/symbol, decimals, total supply (formatted with decimals), and the holder balance if requested. Flag anything unusual (e.g. a token that reverts on `symbol()` or has 0 supply).
