---
description: List the EVM chains NodeFlare serves, with chain IDs and endpoint URLs
---

Use the `list_chains` tool from the nodeflare MCP server to list every EVM chain NodeFlare serves.

Present the result as a compact table with columns: chain slug, chain ID, and the public endpoint URL. If the user passed an argument in `$ARGUMENTS`, filter the list to chains whose slug or name matches it (case-insensitive) and, for a single match, also show its keyed and x402 endpoint URLs.
