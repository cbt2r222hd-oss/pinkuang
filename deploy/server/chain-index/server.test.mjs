import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { serverConfiguration, startChainIndex } from './server.mjs';

const config = rpc => ({ rpc, host: '127.0.0.1', port: 0, dbPath: ':memory:',
  factory: '0x0000000000000000000000000000000000000001',
  market: '0x0000000000000000000000000000000000000002', startBlock: 1, confirmations: 2 });
async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function stop(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

test('production configuration keeps HTTPS and loopback requirements', () => {
  const env = { CHAIN_INDEX_RPC_URL: 'https://bsc-rpc.blockreq.com/v1/rpc/public',
    CHAIN_INDEX_DB: '/tmp/index.sqlite', CHAIN_INDEX_FACTORY: config('').factory,
    CHAIN_INDEX_MARKET: config('').market, CHAIN_INDEX_START_BLOCK: '100' };
  assert.equal(serverConfiguration(env).rpc, env.CHAIN_INDEX_RPC_URL);
  assert.equal(serverConfiguration(env).host, '127.0.0.1');
  assert.throws(() => serverConfiguration({ ...env, CHAIN_INDEX_RPC_URL: 'http://untrusted.example' }), /HTTPS/);
  assert.throws(() => serverConfiguration({ ...env, CHAIN_INDEX_HOST: '0.0.0.0' }), /loopback/);
});

test('a stalled RPC is bounded and service close is idempotent', { timeout: 16_000 }, async () => {
  let entered; const started = new Promise(resolve => { entered = resolve; });
  const upstream = createServer(() => { entered(); });
  let service;
  try {
    const rpc = await listen(upstream); service = await startChainIndex(config(rpc));
    await started;
    const begin = performance.now(); const closing = service.close();
    assert.equal(service.close(), closing, 'simultaneous shutdown requests share one completion');
    await closing;
    assert(performance.now() - begin < 14_000, 'shutdown must not retain a multi-minute HTTP request');
  } finally { await service?.close(); await stop(upstream); }
});

test('HTTP 429 Retry-After cannot trap the index in a hidden long retry or advance data', { timeout: 5_000 }, async () => {
  let entered, requests = 0; const started = new Promise(resolve => { entered = resolve; });
  const upstream = createServer((_request, response) => {
    requests++; response.writeHead(429, { 'Retry-After': '90', 'content-type': 'application/json' });
    response.end('{"error":"rate limited"}'); entered();
  });
  let service;
  try {
    const rpc = await listen(upstream); service = await startChainIndex(config(rpc));
    await started; const begin = performance.now(); await service.close();
    assert(performance.now() - begin < 2_000, 'Retry-After is handled by the sync loop, not an HTTP backoff');
    assert.equal(requests, 1, 'no invisible retry loop after stopping');
  } finally { await service?.close(); await stop(upstream); }
});
