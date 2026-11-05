// Verified against nodeflare/lib/chains.ts on 2026-11-04.
// Static inventory keeps tool discovery available without a network request.
export const CHAINS: Record<string, { label: string; chainId: number; currency: string }> = {
  eth: { label: "Ethereum", chainId: 1, currency: "ETH" },
  base: { label: "Base", chainId: 8453, currency: "ETH" },
  bnb: { label: "BNB Chain", chainId: 56, currency: "BNB" },
  arb: { label: "Arbitrum One", chainId: 42161, currency: "ETH" },
  op: { label: "Optimism", chainId: 10, currency: "ETH" },
  hl: { label: "HyperEVM (HyperLiquid)", chainId: 999, currency: "HYPE" },
  avax: { label: "Avalanche C-Chain", chainId: 43114, currency: "AVAX" },
  unichain: { label: "Unichain", chainId: 130, currency: "ETH" },
  sonic: { label: "Sonic", chainId: 146, currency: "S" },
  polygon: { label: "Polygon PoS", chainId: 137, currency: "POL" },
  zircuit: { label: "Zircuit", chainId: 48900, currency: "ETH" },
  robinhood: { label: "Robinhood Chain", chainId: 4663, currency: "ETH" },
  xlayer: { label: "XLayer", chainId: 196, currency: "OKB" },
  soneium: { label: "Soneium", chainId: 1868, currency: "ETH" },
  bob: { label: "BOB", chainId: 60808, currency: "ETH" },
  ink: { label: "Ink", chainId: 57073, currency: "ETH" },
  mode: { label: "Mode", chainId: 34443, currency: "ETH" },
  arc: { label: "Arc", chainId: 5042, currency: "USDC" },
};

// Common alternate names agents/humans use → canonical slug. The slug itself and
// the numeric chain ID are always accepted too (handled in resolveChain).
const ALIASES: Record<string, string> = {
  ethereum: "eth", mainnet: "eth", "eth-mainnet": "eth",
  arbitrum: "arb", "arbitrum-one": "arb", arbitrumone: "arb",
  optimism: "op", "op-mainnet": "op",
  bsc: "bnb", binance: "bnb", "bnb-chain": "bnb", "binance-smart-chain": "bnb",
  avalanche: "avax", "avalanche-c-chain": "avax",
  matic: "polygon", "polygon-pos": "polygon", pol: "polygon",
  hyperevm: "hl", hyperliquid: "hl", hype: "hl",
  "x-layer": "xlayer", okx: "xlayer",
};

// Accept a chain slug, a common name/alias, or a numeric chain ID and return the
// canonical slug (or null if unknown). Removes the "ethereum vs eth vs 1" friction.
const BY_CHAIN_ID: Record<number, string> = Object.fromEntries(
  Object.entries(CHAINS).map(([slug, c]) => [c.chainId, slug]),
);
export function resolveChain(input: string): string | null {
  const s = String(input).trim().toLowerCase();
  if (Object.hasOwn(CHAINS, s)) return s;
  if (Object.hasOwn(ALIASES, s) && Object.hasOwn(CHAINS, ALIASES[s])) return ALIASES[s];
  // numeric or hex chain ID
  const n = /^0x[0-9a-f]+$/.test(s) ? parseInt(s, 16) : /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
  if (!Number.isNaN(n) && BY_CHAIN_ID[n]) return BY_CHAIN_ID[n];
  return null;
}

