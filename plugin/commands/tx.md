---
description: Fetch a transaction and its receipt by hash and explain what it did
argument-hint: <tx-hash> [chain]
---

Explain a transaction using the nodeflare MCP server.

1. Parse `$ARGUMENTS` into a transaction hash (required) and an optional chain slug (default `ethereum`).
2. Call `get_transaction` for the transaction (from, to, value, gas, input) and `get_transaction_receipt` for status, gas used, and emitted logs.
3. Explain in plain language: did it succeed or revert, who sent it, what contract it hit, how much value/gas, and what the emitted events suggest happened (e.g. an ERC-20 Transfer, a swap, an approval). Decode the well-known event signatures you recognise from the logs.
4. If the hash is not found on the given chain, suggest trying another chain via `/nodeflare:chains`.
