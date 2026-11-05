# Release notes

## 0.8.1 — 5 November 2026

- Align the advertised inventory with NodeFlare's current 18 supported EVM chains.
  Add Arc (5042, USDC); remove retired Linea, Mantle, Arbitrum Nova, Cronos, Sei and
  Plasma routes and Nova aliases. Existing supported identifiers remain valid.
- Reject inherited JavaScript object names and malformed hexadecimal chain IDs
  instead of resolving them to unintended routes.
- Correct the free allowance to 3M CU/month, disclose public/keyed rate limits,
  and remove unsupported competitor-coverage claims from tool descriptions.
- Document chain-specific method/history limits and third-party fallback scope.
- Gate npm publication on build and protocol-level inventory/error-path tests.

Inventory reference: NodeFlare website `lib/chains.ts` at `bd9cac4c`, checked on
4 November. `tests/chain-inventory.json` is a reviewed snapshot, not a live fetch;
update it alongside inventory changes. The test does not establish live node
health, archive depth, paid x402 settlement or full composite-tool coverage.
