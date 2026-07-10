---
description: Show the current gas price on a chain, or compare gas across chains
argument-hint: [chain | "compare"]
---

Report current gas prices using the nodeflare MCP server.

1. If `$ARGUMENTS` names a single chain slug, call `get_gas_price` for that chain and report the base gas price and priority fee in gwei.
2. If `$ARGUMENTS` is empty, "compare", or "all", call `get_gas_price` across the major chains (ethereum, base, arbitrum, optimism, bnb, polygon) and present a ranked table from cheapest to most expensive, in gwei.
3. Add a one-line takeaway (e.g. which chain is currently cheapest for a simple transfer). Values come from the free public tier.
