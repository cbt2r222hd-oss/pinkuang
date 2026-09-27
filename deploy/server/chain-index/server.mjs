import { fileURLToPath } from 'node:url';
import { FetchRequest, JsonRpcProvider } from 'ethers';
import { ChainIndex } from './indexer.mjs';
import { createChainIndexServer } from './api.mjs';

const required = (env, key) => {
  if (!env[key]) throw new Error(`${key} is required.`);
  return env[key];
};
const exactNumber = (value, label) => {
  if (!/^(0|[1-9]\d*)$/.test(String(value))) throw new Error(`Invalid ${label}.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`Invalid ${label}.`);
  return number;
};

export function serverConfiguration(env = process.env) {
  const rpc = required(env, 'CHAIN_INDEX_RPC_URL');
  if (!/^https:\/\//.test(rpc)) throw new Error('CHAIN_INDEX_RPC_URL must use HTTPS.');
  const host = env.CHAIN_INDEX_HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('Bind the index only to loopback; use an authenticated/rate-limited reverse proxy.');
  const port = exactNumber(env.CHAIN_INDEX_PORT || '4180', 'port');
  if (port < 1 || port > 65535) throw new Error('Invalid port.');
  return { rpc, host, port, dbPath: required(env, 'CHAIN_INDEX_DB'), factory: required(env, 'CHAIN_INDEX_FACTORY'),
    market: required(env, 'CHAIN_INDEX_MARKET'), startBlock: exactNumber(required(env, 'CHAIN_INDEX_START_BLOCK'), 'start block'),
    confirmations: exactNumber(env.CHAIN_INDEX_CONFIRMATIONS || '12', 'confirmations') };
}

export async function startChainIndex(config) {
  const request = new FetchRequest(config.rpc);
  request.timeout = 12_000;
  // The sync loop retries failures; an upstream Retry-After must not hold shutdown open.
  request.retryFunc = async () => false;
  const provider = new JsonRpcProvider(request, 56, {
    staticNetwork: true, cacheTimeout: -1, batchMaxCount: 8,
  });
  // ChainIndex asks eth_chainId directly on every sync before indexing any data.
  // The static network avoids ethers' separate, indefinitely retrying bootstrap loop.
  let index;
  let server;
  try {
    index = new ChainIndex(provider, config);
    server = createChainIndexServer(index);
    await new Promise((resolve, reject) => {
      const onError = error => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      try { server.listen(config.port, config.host); }
      catch (error) { server.off('error', onError); server.off('listening', onListening); reject(error); }
    });
  } catch (error) {
    index?.close();
    provider.destroy();
    throw error;
  }
  let stopped = false;
  let timer = null;
  let running;
  let closing;
  async function tick() {
    if (stopped) return;
    try { await index.sync(); }
    catch { console.error(`Chain index unavailable: ${index.status().unknownReason}`); }
    if (!stopped) timer = setTimeout(() => { running = tick(); }, index.status().complete ? 10_000 : 1_000);
  }
  running = tick();
  return { index, server, close() {
    if (closing) return closing;
    closing = (async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      // Cancel queued reads now; any active HTTP request is bounded by its 12s timeout.
      provider.destroy();
      await running;
      await new Promise(resolve => server.close(resolve));
      index.close();
    })();
    return closing;
  } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const service = await startChainIndex(serverConfiguration());
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void service.close().then(() => process.exit(0)); });
}
