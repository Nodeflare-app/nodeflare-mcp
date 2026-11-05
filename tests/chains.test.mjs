import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CHAINS, resolveChain } from '../dist/chains.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const retired = ['linea', 'mantle', 'nova', 'cronos', 'sei', 'plasma'];
test('retired names, aliases and IDs fail closed; malformed inputs do not resolve', () => {
  for (const value of [...retired, 'arbitrum-nova', 'arbitrumnova', '59144', '5000', '42170', '25', '1329', '9745', '__proto__', 'constructor', '0x1garbage', '1garbage']) {
    assert.equal(resolveChain(value), null, value);
  }
});
test('supported identifiers resolve including Arc and existing aliases', () => {
  const expected = JSON.parse(readFileSync(new URL('./chain-inventory.json', import.meta.url)));
  assert.deepEqual(Object.fromEntries(Object.entries(CHAINS).map(([slug, {chainId, currency}]) => [slug, {chainId, currency}])), expected);
  assert.deepEqual(CHAINS.arc, { label: 'Arc', chainId: 5042, currency: 'USDC' });
  for (const [slug, chain] of Object.entries(CHAINS)) {
    assert.equal(resolveChain(slug), slug);
    assert.equal(resolveChain(String(chain.chainId)), slug);
    assert.equal(resolveChain('0x' + chain.chainId.toString(16)), slug);
  }
  for (const [alias, slug] of [['Ethereum','eth'], ['bsc','bnb'], ['arbitrum','arb'], ['hyperliquid','hl']]) assert.equal(resolveChain(alias), slug);
});
test('built stdio server advertises current chains and rejects retired RPC requests', { timeout: 15000 }, async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'], env: { PATH: process.env.PATH }, stderr: 'pipe' });
  transport.stderr?.on('data', data => process.stderr.write(data));
  const client = new Client({ name: 'inventory-acceptance', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, '0.8.1');
    const result = await client.callTool({ name: 'list_chains', arguments: {} });
    const rows = JSON.parse(result.content[0].text);
    assert.equal(rows.length, 18);
    assert.deepEqual(rows.find(r => r.slug === 'arc'), { slug: 'arc', ...CHAINS.arc, public: 'https://rpc.nodeflare.app/arc/public', x402: 'https://rpc.nodeflare.app/arc/x402' });
    for (const chain of retired) {
      const rejected = await client.callTool({ name: 'get_block_number', arguments: { chain } });
      assert.equal(rejected.isError, true);
      assert.match(rejected.content[0].text, /Unknown chain/);
    }
    const tools = await client.listTools();
    assert.doesNotMatch(JSON.stringify(tools), /23 EVM|all 23|Plasma|2M compute/);
  } finally { await client.close(); await transport.close(); }
});
