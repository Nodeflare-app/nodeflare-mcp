---
description: Check an address's native balance (and optional ERC-20 balances) on one or more chains
argument-hint: <address> [chain] [token-address ...]
---

Check on-chain balances for the address in `$ARGUMENTS` using the nodeflare MCP server.

1. Parse `$ARGUMENTS` into: an `0x…` account address (required), an optional chain slug (default `ethereum`), and any optional ERC-20 token contract addresses.
2. Call `get_balance` for the native balance on the requested chain. If no chain was given, or the user said "all"/"everywhere", call `get_balance` across the major chains (ethereum, base, arbitrum, optimism, bnb) and show them side by side.
3. For each token address supplied, call `get_token_balance` (it resolves symbol + decimals and returns a human-readable amount).
4. Report native and token balances clearly, labelling each with its chain and symbol. Note that this uses the free public tier.
