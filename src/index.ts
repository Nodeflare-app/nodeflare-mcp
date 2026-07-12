#!/usr/bin/env node
// NodeFlare MCP server — blockchain JSON-RPC on 23 EVM chains for AI agents.
//
// Access tiers, picked automatically from the environment:
//   (none)                → free public endpoints (standard read methods)
//   NODEFLARE_API_KEY     → keyed endpoints (heavy methods, higher limits)
//   X402_PRIVATE_KEY      → pay-per-call with x402: heavy methods are paid in
//                           USDC (Base / Polygon / Arbitrum) from this wallet
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { encodeFunctionData, decodeFunctionResult, formatUnits } from "viem";
import { z } from "zod";

// Minimal ERC-20 ABI for token tools (encode calldata / decode results with viem).
const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol",    type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "name",      type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const GATEWAY = "https://rpc.nodeflare.app";

// Mirrors https://x402.nodeflare.app/ — kept static so the server works offline-first.
const CHAINS: Record<string, { label: string; chainId: number; currency: string }> = {
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
  linea: { label: "Linea", chainId: 59144, currency: "ETH" },
  mantle: { label: "Mantle", chainId: 5000, currency: "MNT" },
  zircuit: { label: "Zircuit", chainId: 48900, currency: "ETH" },
  robinhood: { label: "Robinhood Chain", chainId: 4663, currency: "ETH" },
  xlayer: { label: "XLayer", chainId: 196, currency: "OKB" },
  soneium: { label: "Soneium", chainId: 1868, currency: "ETH" },
  nova: { label: "Arbitrum Nova", chainId: 42170, currency: "ETH" },
  bob: { label: "BOB", chainId: 60808, currency: "ETH" },
  ink: { label: "Ink", chainId: 57073, currency: "ETH" },
  cronos: { label: "Cronos", chainId: 25, currency: "CRO" },
  mode: { label: "Mode", chainId: 34443, currency: "ETH" },
  sei: { label: "Sei", chainId: 1329, currency: "SEI" },
  plasma: { label: "Plasma", chainId: 9745, currency: "XPL" },
};

// Common alternate names agents/humans use → canonical slug. The slug itself and
// the numeric chain ID are always accepted too (handled in resolveChain).
const ALIASES: Record<string, string> = {
  ethereum: "eth", mainnet: "eth", "eth-mainnet": "eth",
  arbitrum: "arb", "arbitrum-one": "arb", arbitrumone: "arb",
  "arbitrum-nova": "nova", arbitrumnova: "nova",
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
function resolveChain(input: string): string | null {
  const s = String(input).trim().toLowerCase();
  if (CHAINS[s]) return s;
  if (ALIASES[s]) return ALIASES[s];
  // numeric or hex chain ID
  const n = s.startsWith("0x") ? parseInt(s, 16) : /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
  if (!Number.isNaN(n) && BY_CHAIN_ID[n]) return BY_CHAIN_ID[n];
  return null;
}

const API_KEY = process.env.NODEFLARE_API_KEY;
const X402_PK = process.env.X402_PRIVATE_KEY;

// Lazily build the x402-paying fetch only when a wallet is configured.
let payFetchPromise: Promise<typeof fetch> | null = null;
function getPayFetch(): Promise<typeof fetch> {
  if (!payFetchPromise) {
    payFetchPromise = (async () => {
      const [{ wrapFetchWithPaymentFromConfig }, { ExactEvmScheme }, { privateKeyToAccount }] = await Promise.all([
        import("@x402/fetch"),
        import("@x402/evm"),
        import("viem/accounts"),
      ]);
      const account = privateKeyToAccount(X402_PK as `0x${string}`);
      return wrapFetchWithPaymentFromConfig(fetch, {
        schemes: [{ network: "eip155:*", client: new ExactEvmScheme(account) }],
      }) as typeof fetch;
    })();
  }
  return payFetchPromise;
}

interface RpcResult {
  ok: boolean;
  status: number;
  body: unknown;
  paid?: string; // settlement tx hash when the call was paid via x402
}

async function rpc(chainInput: string, method: string, params: unknown[]): Promise<RpcResult> {
  const chain = resolveChain(chainInput);
  if (!chain) {
    return { ok: false, status: 400, body: { error: `Unknown chain '${chainInput}'. Pass a slug, name, or chain ID — see list_chains for valid values.` } };
  }
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body } as const;

  if (API_KEY) {
    const res = await fetch(`${GATEWAY}/${chain}/v1/${API_KEY}`, init);
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
  }

  const res = await fetch(`${GATEWAY}/${chain}/public`, init);
  const json = await res.json().catch(() => null);
  // Heavy methods are blocked on the public tier — retry as a paid x402 call
  // when a wallet is configured.
  if (res.status === 403 && X402_PK) {
    const payFetch = await getPayFetch();
    const paidRes = await payFetch(`${GATEWAY}/${chain}/x402`, init);
    const paidJson = await paidRes.json().catch(() => null);
    return {
      ok: paidRes.ok,
      status: paidRes.status,
      body: paidJson,
      paid: paidRes.headers.get("PAYMENT-RESPONSE") ? "settled via x402" : undefined,
    };
  }
  if (res.status === 403) {
    return {
      ok: false, status: 403,
      body: {
        error: `${method} is not available on the free public tier.`,
        options: [
          "Set NODEFLARE_API_KEY (free key, 3M compute units/month: https://nodeflare.app)",
          "Set X402_PRIVATE_KEY (wallet with USDC on Base/Polygon/Arbitrum) to pay ~$0.001 per call via x402",
        ],
      },
    };
  }
  return { ok: res.ok, status: res.status, body: json };
}

function asText(result: RpcResult) {
  const payload = result.paid ? { ...(result.body as object), _x402: result.paid } : result.body;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError: !result.ok,
  };
}

function asJson(obj: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }], isError };
}

// Extract the JSON-RPC `result` from an rpc() call, or null on any error.
async function callResult(chain: string, method: string, params: unknown[]): Promise<string | null> {
  const r = await rpc(chain, method, params);
  const body = r.body as { result?: unknown } | null;
  if (!r.ok || !body || typeof body.result !== "string") return null;
  return body.result;
}

// Batch several eth_calls into ONE JSON-RPC request. A batch counts as a single
// rate-limit token, so token-metadata reads (balanceOf + decimals + symbol)
// don't trip the per-IP public limit the way 3 concurrent calls would.
async function ethCallBatch(chainInput: string, calls: { to: string; data: string }[]): Promise<(string | null)[]> {
  const chain = resolveChain(chainInput);
  if (!chain) return calls.map(() => null);
  const batch = calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [c, "latest"] }));
  const url = API_KEY ? `${GATEWAY}/${chain}/v1/${API_KEY}` : `${GATEWAY}/${chain}/public`;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch) });
    const arr = await res.json().catch(() => null) as Array<{ id: number; result?: unknown; error?: unknown }> | null;
    if (!Array.isArray(arr)) return calls.map(() => null);
    const byId = new Map(arr.map((r) => [r.id, r]));
    return calls.map((_, i) => {
      const r = byId.get(i);
      return r && !r.error && typeof r.result === "string" ? r.result : null;
    });
  } catch {
    return calls.map(() => null);
  }
}

const server = new McpServer({ name: "nodeflare", version: "0.3.0" });

const chainParam = z.string().describe(
  "Chain to query. Accepts a slug (eth, base, arb, op, robinhood…), a common name (ethereum, arbitrum, optimism, bsc), or a numeric chain ID (1, 8453). Call list_chains for all valid values.",
);

server.tool(
  "list_chains",
  "List the 23 EVM chains NodeFlare serves, with chain IDs and endpoint URLs.",
  {},
  async () => ({
    content: [{
      type: "text" as const,
      text: JSON.stringify(
        Object.entries(CHAINS).map(([slug, c]) => ({
          slug, ...c,
          public: `${GATEWAY}/${slug}/public`,
          x402: `${GATEWAY}/${slug}/x402`,
        })), null, 2),
    }],
  }),
);

server.tool(
  "get_block_number",
  "Get the latest block number on a chain (decimal and hex).",
  { chain: chainParam },
  async ({ chain }) => {
    const r = await rpc(chain, "eth_blockNumber", []);
    const hex = (r.body as { result?: string } | null)?.result;
    if (!r.ok || typeof hex !== "string") return asText(r);
    return asJson({ chain: resolveChain(chain) ?? chain, blockNumber: parseInt(hex, 16), hex });
  },
);

server.tool(
  "get_balance",
  "Get the native-token balance of an address — raw wei plus a human-readable amount in the chain's native currency.",
  { chain: chainParam, address: z.string().describe("0x-address") },
  async ({ chain, address }) => {
    const r = await rpc(chain, "eth_getBalance", [address, "latest"]);
    const hex = (r.body as { result?: string } | null)?.result;
    if (!r.ok || typeof hex !== "string") return asText(r);
    const slug = resolveChain(chain) ?? chain;
    const wei = BigInt(hex);
    return asJson({ chain: slug, address, currency: CHAINS[slug]?.currency ?? "native", balance: formatUnits(wei, 18), wei: wei.toString() });
  },
);

server.tool(
  "get_transaction_receipt",
  "Get the receipt of a transaction by hash (status, logs, gas used).",
  { chain: chainParam, hash: z.string().describe("0x-transaction hash") },
  async ({ chain, hash }) => asText(await rpc(chain, "eth_getTransactionReceipt", [hash])),
);

server.tool(
  "eth_call",
  "Execute a read-only contract call (eth_call) and return the raw result.",
  {
    chain: chainParam,
    to: z.string().describe("Contract address"),
    data: z.string().describe("ABI-encoded calldata (0x…)"),
    from: z.string().optional().describe("Optional caller address"),
  },
  async ({ chain, to, data, from }) =>
    asText(await rpc(chain, "eth_call", [{ to, data, ...(from ? { from } : {}) }, "latest"])),
);

server.tool(
  "get_logs",
  "Fetch contract event logs (eth_getLogs). Heavy method: needs NODEFLARE_API_KEY or an x402 wallet (X402_PRIVATE_KEY) — costs ~$0.001 via x402.",
  {
    chain: chainParam,
    fromBlock: z.string().describe("Hex block number or tag, e.g. '0x112a880' or 'latest'"),
    toBlock: z.string().describe("Hex block number or tag"),
    address: z.string().optional().describe("Contract address filter"),
    topics: z.array(z.string().nullable()).optional().describe("Topic filters"),
  },
  async ({ chain, fromBlock, toBlock, address, topics }) =>
    asText(await rpc(chain, "eth_getLogs", [{ fromBlock, toBlock, ...(address ? { address } : {}), ...(topics ? { topics } : {}) }])),
);

server.tool(
  "rpc_call",
  "Make any JSON-RPC call on any supported chain. Heavy methods (eth_getLogs, trace_*, debug_*) need NODEFLARE_API_KEY or an x402 wallet.",
  {
    chain: chainParam,
    method: z.string().describe("JSON-RPC method name, e.g. 'eth_gasPrice'"),
    params: z.array(z.unknown()).optional().describe("JSON-RPC params array"),
  },
  async ({ chain, method, params }) => asText(await rpc(chain, method, params ?? [])),
);

server.tool(
  "get_transaction",
  "Get a transaction by its hash (from, to, value, input, block, gas).",
  { chain: chainParam, hash: z.string().describe("0x-transaction hash") },
  async ({ chain, hash }) => asText(await rpc(chain, "eth_getTransactionByHash", [hash])),
);

server.tool(
  "get_block",
  "Get a block by number or tag (e.g. 'latest', 'finalized', or a hex number). Set fullTransactions to include full tx objects instead of hashes.",
  {
    chain: chainParam,
    block: z.string().default("latest").describe("Hex block number or tag ('latest', 'finalized', 'safe', 'earliest')"),
    fullTransactions: z.boolean().default(false).describe("Include full transaction objects"),
  },
  async ({ chain, block, fullTransactions }) => asText(await rpc(chain, "eth_getBlockByNumber", [block, fullTransactions])),
);

server.tool(
  "get_gas_price",
  "Get current gas pricing on a chain: base gas price and the suggested priority fee (EIP-1559), both in wei (hex).",
  { chain: chainParam },
  async ({ chain }) => {
    const [gas, prio] = await Promise.all([
      callResult(chain, "eth_gasPrice", []),
      callResult(chain, "eth_maxPriorityFeePerGas", []).catch(() => null),
    ]);
    if (gas === null) return asJson({ error: "Could not fetch gas price" }, true);
    return asJson({
      chain: resolveChain(chain) ?? chain, gasPriceWei: gas, gasPriceGwei: formatUnits(BigInt(gas), 9),
      maxPriorityFeePerGasWei: prio ?? null,
    });
  },
);

server.tool(
  "get_token_balance",
  "Get an ERC-20 token balance for an address, returned both raw and human-readable (uses the token's decimals and symbol).",
  {
    chain: chainParam,
    token: z.string().describe("ERC-20 contract address"),
    address: z.string().describe("Holder address to check"),
  },
  async ({ chain, token, address }) => {
    const [balHex, decHex, symHex] = await ethCallBatch(chain, [
      { to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [address as `0x${string}`] }) },
      { to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "decimals" }) },
      { to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "symbol" }) },
    ]);
    if (balHex === null) return asJson({ error: "Could not read token balance — check the token address and chain" }, true);
    const raw = decodeFunctionResult({ abi: ERC20_ABI, functionName: "balanceOf", data: balHex as `0x${string}` }) as bigint;
    const decimals = decHex ? Number(decodeFunctionResult({ abi: ERC20_ABI, functionName: "decimals", data: decHex as `0x${string}` })) : 18;
    let symbol = "";
    try { symbol = symHex ? String(decodeFunctionResult({ abi: ERC20_ABI, functionName: "symbol", data: symHex as `0x${string}` })) : ""; } catch { /* non-standard token */ }
    return asJson({ chain: resolveChain(chain) ?? chain, token, address, symbol, decimals, raw: raw.toString(), balance: formatUnits(raw, decimals) });
  },
);

server.tool(
  "get_token_metadata",
  "Get ERC-20 token metadata: name, symbol, decimals and total supply (raw + human-readable).",
  { chain: chainParam, token: z.string().describe("ERC-20 contract address") },
  async ({ chain, token }) => {
    const [nameHex, symHex, decHex, supHex] = await ethCallBatch(chain,
      (["name", "symbol", "decimals", "totalSupply"] as const).map((fn) => ({ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: fn }) })),
    );
    if (decHex === null && supHex === null) return asJson({ error: "Not an ERC-20 token, or unreachable — check the address and chain" }, true);
    const dec = (h: string | null, fn: "decimals") => { try { return h ? Number(decodeFunctionResult({ abi: ERC20_ABI, functionName: fn, data: h as `0x${string}` })) : null; } catch { return null; } };
    const str = (h: string | null, fn: "name" | "symbol") => { try { return h ? String(decodeFunctionResult({ abi: ERC20_ABI, functionName: fn, data: h as `0x${string}` })) : null; } catch { return null; } };
    const decimals = dec(decHex, "decimals");
    let totalSupply: string | null = null, totalSupplyRaw: string | null = null;
    if (supHex) { try { const t = decodeFunctionResult({ abi: ERC20_ABI, functionName: "totalSupply", data: supHex as `0x${string}` }) as bigint; totalSupplyRaw = t.toString(); totalSupply = formatUnits(t, decimals ?? 18); } catch { /* ignore */ } }
    return asJson({ chain: resolveChain(chain) ?? chain, token, name: str(nameHex, "name"), symbol: str(symHex, "symbol"), decimals, totalSupplyRaw, totalSupply });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
