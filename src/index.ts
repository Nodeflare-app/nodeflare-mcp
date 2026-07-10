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
const CHAINS: Record<string, { label: string; chainId: number }> = {
  eth: { label: "Ethereum", chainId: 1 },
  base: { label: "Base", chainId: 8453 },
  bnb: { label: "BNB Chain", chainId: 56 },
  arb: { label: "Arbitrum One", chainId: 42161 },
  op: { label: "Optimism", chainId: 10 },
  hl: { label: "HyperEVM (HyperLiquid)", chainId: 999 },
  avax: { label: "Avalanche C-Chain", chainId: 43114 },
  unichain: { label: "Unichain", chainId: 130 },
  sonic: { label: "Sonic", chainId: 146 },
  polygon: { label: "Polygon PoS", chainId: 137 },
  linea: { label: "Linea", chainId: 59144 },
  mantle: { label: "Mantle", chainId: 5000 },
  zircuit: { label: "Zircuit", chainId: 48900 },
  robinhood: { label: "Robinhood Chain", chainId: 4663 },
  xlayer: { label: "XLayer", chainId: 196 },
  soneium: { label: "Soneium", chainId: 1868 },
  nova: { label: "Arbitrum Nova", chainId: 42170 },
  bob: { label: "BOB", chainId: 60808 },
  ink: { label: "Ink", chainId: 57073 },
  cronos: { label: "Cronos", chainId: 25 },
  mode: { label: "Mode", chainId: 34443 },
  sei: { label: "Sei", chainId: 1329 },
  plasma: { label: "Plasma", chainId: 9745 },
};

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

async function rpc(chain: string, method: string, params: unknown[]): Promise<RpcResult> {
  if (!CHAINS[chain]) {
    return { ok: false, status: 400, body: { error: `Unknown chain '${chain}'. Use list_chains for valid slugs.` } };
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
async function ethCallBatch(chain: string, calls: { to: string; data: string }[]): Promise<(string | null)[]> {
  if (!CHAINS[chain]) return calls.map(() => null);
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

const server = new McpServer({ name: "nodeflare", version: "0.2.0" });

const chainParam = z.enum(Object.keys(CHAINS) as [string, ...string[]]).describe("Chain slug, e.g. 'eth', 'base', 'robinhood'");

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
  "Get the latest block number on a chain.",
  { chain: chainParam },
  async ({ chain }) => asText(await rpc(chain, "eth_blockNumber", [])),
);

server.tool(
  "get_balance",
  "Get the native-token balance of an address (in wei, hex).",
  { chain: chainParam, address: z.string().describe("0x-address") },
  async ({ chain, address }) => asText(await rpc(chain, "eth_getBalance", [address, "latest"])),
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
      chain, gasPriceWei: gas, gasPriceGwei: formatUnits(BigInt(gas), 9),
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
    return asJson({ chain, token, address, symbol, decimals, raw: raw.toString(), balance: formatUnits(raw, decimals) });
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
    return asJson({ chain, token, name: str(nameHex, "name"), symbol: str(symHex, "symbol"), decimals, totalSupplyRaw, totalSupply });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
