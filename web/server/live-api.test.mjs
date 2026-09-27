import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet, Interface, getAddress, keccak256 } from 'ethers';
import { abi, ARTIFACT_DIGEST } from '../lib/chain-client.mjs';
import { createLiveApi } from './live-api.mjs';

const addr = number => getAddress(`0x${number.toString(16).padStart(40, '0')}`);
const factory = addr(1), lens = addr(2), market = addr(3), pool = addr(4), beacon = addr(5), timelock = addr(6);
const poolFactoryImpl = addr(7), marketImpl = addr(8), poolVaultImpl = addr(9);
const collection = '0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C';
const beaconAbi = new Interface(['function implementation() view returns(address)', 'function owner() view returns(address)']);
const origin = 'http://127.0.0.1:3000';
const hexHash = value => `0x${value.toString(16).padStart(64, '0')}`;

function rpc() {
  const transactions = new Map(), receipts = new Map();
  const orders = new Map();
  const proposals = new Map();
  const blockHashes = new Map();
  const activity = { chainReads: 0, codeReads: 0, blockReads: 0, calls: 0 };
  let nonce = 0, finalizedNumber = 0, chain = 56, timestamp = 1000, poolState = 2n;
  let registered = true, flexible = true, referenceWeight = 100n, modelInitialized = true;
  let poolCollection = collection, referenceCircuitId = 77n;
  const calls = [];
  let salePrice = 10000n, saleExpiry = 1000100n, listedProposalId = 2n;
  return { transactions, receipts, orders, proposals, calls, activity, setNonce(value) { nonce = value; },
    setFinalized(value) { finalizedNumber = value; }, setChain(value) { chain = value; },
    setTimestamp(value) { timestamp = value; }, setPoolState(value) { poolState = value; },
    setBlockHash(number, hash) { blockHashes.set(number, hash); },
    setRegistered(value) { registered = value; },
    setPurchase({ enabled = flexible, weight = referenceWeight, initialized = modelInitialized,
      circuits = poolCollection, referenceId = referenceCircuitId } = {}) {
      flexible = enabled; referenceWeight = weight; modelInitialized = initialized;
      poolCollection = circuits; referenceCircuitId = referenceId;
    },
    setSale({ price = salePrice, expiry = saleExpiry, proposalId = listedProposalId }) {
      salePrice = price; saleExpiry = expiry; listedProposalId = proposalId;
    },
    async send(method) { activity.chainReads += 1; assert.equal(method, 'eth_chainId'); return `0x${chain.toString(16)}`; },
    async getNetwork() { return { chainId: 56n }; },
    async getCode() { activity.codeReads += 1; return '0x6000'; },
    async getStorage(target) { return `0x${(target === factory ? poolFactoryImpl : marketImpl).slice(2).padStart(64, '0')}`; },
    async getTransactionCount() { return nonce; },
    async getTransaction(hash) { return transactions.get(hash) ?? null; },
    async getTransactionReceipt(hash) { return receipts.get(hash) ?? null; },
    async getBlock(tag) { activity.blockReads += 1; return tag === 'finalized' ? { number: finalizedNumber, hash: hexHash(finalizedNumber) }
      : tag === 'latest' ? { number: 10, hash: hexHash(10), timestamp }
        : { number: tag, hash: blockHashes.get(tag) ?? hexHash(tag), timestamp }; },
    async estimateGas() { return 100000n; },
    async call(tx) {
      activity.calls += 1;
      const contract = tx.to === factory ? abi.PoolFactory : tx.to === lens ? abi.PoolLens
        : tx.to === market ? abi.ShareMarket : tx.to === beacon ? beaconAbi : abi.PoolVault;
      const parsed = contract.parseTransaction(tx);
      if (!parsed) throw new Error('Unknown call.');
      calls.push({ name: parsed.name, blockTag: tx.blockTag });
      if (parsed.name === 'params') return contract.encodeFunctionResult(parsed.name,
        [[poolCollection, 77n, 1100n, 1000n, addr(0), 0n, 900n, 2000n]]);
      if (parsed.name === 'flexiblePurchase') return contract.encodeFunctionResult(parsed.name,
        [flexible, referenceCircuitId, [50n, 1000n, 10n, 1000n, 900n, 9n, hexHash(1)]]);
      if (parsed.name === 'purchaseModel') return contract.encodeFunctionResult(parsed.name, [modelInitialized, 42n]);
      if (parsed.name === 'purchaseReferenceWeight') return contract.encodeFunctionResult(parsed.name, [referenceWeight]);
      if (parsed.name === 'orders') {
        const order = orders.get(parsed.args[0].toString()) ?? { seller: addr(99), pool, remaining: 0n, pricePerUnit: 0n, active: false };
        return contract.encodeFunctionResult(parsed.name, [[order.seller, order.pool, order.remaining, order.pricePerUnit, order.active]]);
      }
      if (parsed.name === 'orderExpiresAt') return contract.encodeFunctionResult(parsed.name, [orders.get(parsed.args[0].toString())?.expiresAt ?? 0n]);
      if (parsed.name === 'getProposal') {
        const proposal = proposals.get(parsed.args[0].toString()) ?? { proposer: addr(55), snapshotTs: 999900n,
          endsAt: 1086300n, refAt: 999800n, price: 10000n, refPrice: 10000n,
          snapshotMemberCount: 1n, snapshotTotalShares: 100n, yesCount: 1n, yesShares: 100n, executed: false };
        return contract.encodeFunctionResult(parsed.name, [[proposal.proposer, proposal.snapshotTs,
          proposal.endsAt, proposal.refAt, proposal.price, proposal.refPrice, proposal.snapshotMemberCount,
          proposal.snapshotTotalShares, proposal.yesCount, proposal.yesShares, proposal.executed]]);
      }
      const value = { lens, shareMarket: market, beacon, timelock, isPool: registered, factory, VERSION: 1n,
        unitPriceWei: 100n, implementation: poolVaultImpl, owner: timelock, OFFICIAL_FACTORY: factory,
        feeBps: 100n, nextOrderId: 100n, bnbOwed: 500n, state: poolState, shareTradingAllowed: true,
        availableShares: 100n, lockedShares: 100n, balanceOf: 100n, activatedAt: 1n,
        activeProposalId: 1n, nextProposalId: 3n, hasVoted: false, proposalPassed: true,
        listedProposalId, expiresAt: saleExpiry, salePrice }[parsed.name];
      return value === undefined ? '0x' : contract.encodeFunctionResult(parsed.name, [value]);
    },
    destroy() {},
  };
}

async function fixture({ badHash = false, now = Date.now, discoverOfficial = async (_provider, options) =>
  ({ complete: true, chainBlock: options.blockNumber, candidates: [] }) } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'bemine-live-test-'));
  const provider = rpc();
  const code = Object.fromEntries(Object.entries({ factory, shareMarket: market, lens, beacon, timelock,
    PoolFactory: poolFactoryImpl, ShareMarket: marketImpl, PoolVault: poolVaultImpl })
    .map(([name, address]) => [name, { address, hash: keccak256('0x6000') }]));
  if (badHash) code.PoolVault.hash = hexHash(999);
  const config = { factory, expected: { artifactDigest: ARTIFACT_DIGEST, code }, origin,
    rpc: 'https://example.invalid', index: 'https://example.invalid', dbPath: join(directory, 'private', 'live.sqlite') };
  const options = { provider, discoverOfficial, now, onError: error => console.error(error), fetchImpl: async () => ({ ok: true, async json() { return { source: { complete: true, chainId: 56, factory, market }, data: { items: [] } }; } }) };
  let service = createLiveApi(config, options);
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  let base = `http://127.0.0.1:${service.server.address().port}`;
  async function request(path, method = 'GET', body, cookie, account) {
    const response = await fetch(`${base}/api/live${path}`, { method, headers: {
      ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(account ? { 'X-Bemine-Account': account } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function signIn(wallet) {
    const challenge = await request('/challenge', 'POST', { account: wallet.address });
    assert.equal(challenge.status, 200);
    const signed = await request('/session', 'POST', { account: wallet.address, nonce: challenge.body.nonce,
      signature: await wallet.signMessage(challenge.body.message) });
    assert.equal(signed.status, 200);
    return signed.cookie;
  }
  return { provider, request, signIn, async reopen() {
    await new Promise(resolve => service.server.close(resolve)); service.close();
    service = createLiveApi(config, options);
    await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${service.server.address().port}`;
  }, async close() {
    await new Promise(resolve => service.server.close(resolve));
    service.close(); rmSync(directory, { recursive: true, force: true });
  } };
}

test('exact wallet session, server index identity and one durable 100-share intent', async () => {
  const f = await fixture(), alice = Wallet.createRandom(), bob = Wallet.createRandom();
  try {
    const config = await f.request('/config');
    assert.equal(config.body.factory, factory);
    assert.equal((await f.request('/index/v1/pools?limit=20')).status, 200);
    const cookie = await f.signIn(alice);
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, bob.address)).status, 403);
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, alice.address)).body.intent, null);
    const data = abi.PoolVault.encodeFunctionData('deposit', [100n]);
    const tx = { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST, nonce: 0, pool, data, value: '10000' };
    assert.equal((await f.request('/intent', 'POST', { ...tx, value: '10001' }, cookie, alice.address)).status, 400);
    const saved = await f.request('/intent', 'POST', tx, cookie, alice.address);
    assert.equal(saved.status, 201); assert.equal(saved.body.intent.action, 'deposit');
    assert.equal(saved.body.intent.value, '10000'); assert.equal(saved.body.intent.gasEstimate, '100000');
    assert.equal((await f.request('/intent', 'POST', tx, cookie, alice.address)).status, 409);
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, alice.address)).body.intent.id, saved.body.intent.id);
    const bobCookie = await f.signIn(bob);
    assert.equal((await f.request('/intent', 'GET', undefined, bobCookie, bob.address)).body.intent, null);
  } finally { await f.close(); }
});

test('only a canonical finalized original or cancellation retires an intent', async () => {
  const f = await fixture(), alice = Wallet.createRandom();
  try {
    const cookie = await f.signIn(alice), data = abi.PoolVault.encodeFunctionData('claim');
    const saved = await f.request('/intent', 'POST', { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST, nonce: 0, pool, data, value: '0' }, cookie, alice.address);
    assert.equal(saved.status, 201);
    const id = saved.body.intent.id, hash = hexHash(100);
    assert.equal((await f.request('/arm', 'POST', { id }, cookie, alice.address)).body.intent.status, 'armed');
    assert.equal((await f.request('/hash', 'POST', { id, hash }, cookie, alice.address)).body.intent.active, true);
    f.provider.transactions.set(hash, { hash, from: alice.address, nonce: 0, chainId: 56n, to: pool, data, value: 0n,
      blockNumber: 12, blockHash: hexHash(12) });
    f.provider.receipts.set(hash, { hash, from: alice.address, blockNumber: 12, blockHash: hexHash(12), status: 1 });
    f.provider.setFinalized(11);
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, alice.address)).body.intent.active, true);
    f.provider.setFinalized(12);
    f.provider.setChain(97);
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, alice.address)).status, 503);
    f.provider.setChain(56);
    const finished = await f.request('/intent', 'GET', undefined, cookie, alice.address);
    assert.equal(finished.body.intent.status, 'complete'); assert.equal(finished.body.intent.active, false);
    assert.equal(finished.body.history[0].completedHash, hash);
    f.provider.setNonce(1);
    const next = await f.request('/intent', 'POST', { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST, nonce: 1, pool, data, value: '0' }, cookie, alice.address);
    assert.equal(next.status, 201);
    assert.equal((await f.request('/arm', 'POST', { id: next.body.intent.id }, cookie, alice.address)).body.intent.status, 'armed');
    const cancelHash = hexHash(101);
    f.provider.transactions.set(cancelHash, { hash: cancelHash, from: alice.address, nonce: 1, chainId: 56n,
      to: alice.address, data: '0x', value: 0n, blockNumber: 13, blockHash: hexHash(13) });
    f.provider.receipts.set(cancelHash, { hash: cancelHash, from: alice.address, blockNumber: 13, blockHash: hexHash(13), status: 1 });
    f.provider.setFinalized(13);
    assert.equal((await f.request('/hash', 'POST', { id: next.body.intent.id, hash: cancelHash }, cookie, alice.address)).body.intent.status, 'cancelled');
  } finally { await f.close(); }
});

test('wrong Origin and foreign nonce or hash never authorize transaction completion', async () => {
  const f = await fixture(), alice = Wallet.createRandom();
  try {
    const cookie = await f.signIn(alice), data = abi.PoolVault.encodeFunctionData('claim');
    assert.equal((await f.request('/intent', 'POST', { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST, nonce: 1, pool, data, value: '0' }, cookie, alice.address)).status, 409);
    const saved = await f.request('/intent', 'POST', { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST, nonce: 0, pool, data, value: '0' }, cookie, alice.address);
    assert.equal((await f.request('/arm', 'POST', { id: saved.body.intent.id }, cookie, alice.address)).status, 200);
    const hash = hexHash(200);
    f.provider.transactions.set(hash, { hash, from: addr(9), nonce: 0, chainId: 56n, to: pool, data, value: 0n,
      blockNumber: 12, blockHash: hexHash(12) });
    f.provider.receipts.set(hash, { hash, from: addr(9), blockNumber: 12, blockHash: hexHash(12), status: 1 });
    f.provider.setFinalized(12);
    assert.equal((await f.request('/hash', 'POST', { id: saved.body.intent.id, hash }, cookie, alice.address)).status, 409);
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, alice.address)).body.intent.active, true);
  } finally { await f.close(); }
});

test('a changed implementation code hash blocks live config and all signatures', async () => {
  const f = await fixture({ badHash: true }), alice = Wallet.createRandom();
  try {
    assert.equal((await f.request('/config')).status, 503);
    const cookie = await f.signIn(alice);
    const data = abi.PoolVault.encodeFunctionData('deposit', [1n]);
    assert.equal((await f.request('/intent', 'POST', { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST, nonce: 0,
      pool, data, value: '100' }, cookie, alice.address)).status, 503);
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, alice.address)).body.intent, null);
  } finally { await f.close(); }
});

test('raw RPC chain ID change blocks config and transaction intents even with reviewed bytecode', async () => {
  const f = await fixture(), alice = Wallet.createRandom();
  try {
    assert.equal((await f.request('/config')).status, 200);
    const cookie = await f.signIn(alice);
    f.provider.setChain(97);
    assert.equal((await f.request('/config')).status, 200, 'read-only config may remain cached for 10 seconds');
    const data = abi.PoolVault.encodeFunctionData('deposit', [1n]);
    assert.equal((await f.request('/intent', 'POST', { account: alice.address, chainId: 56,
      artifactDigest: ARTIFACT_DIGEST, nonce: 0, pool, data, value: '100' }, cookie, alice.address)).status, 503);
    f.provider.setChain(56);
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, alice.address)).body.intent, null);
  } finally { await f.close(); }
});

test('pending transaction is restored from SQLite after server restart and new wallet login', async () => {
  const f = await fixture(), alice = Wallet.createRandom();
  try {
    const cookie = await f.signIn(alice), data = abi.PoolVault.encodeFunctionData('withdrawBnb');
    const saved = await f.request('/intent', 'POST', { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST, nonce: 0,
      pool, data, value: '0' }, cookie, alice.address);
    assert.equal(saved.status, 201);
    await f.reopen();
    assert.equal((await f.request('/intent', 'GET', undefined, cookie, alice.address)).status, 401);
    const newCookie = await f.signIn(alice);
    const restored = await f.request('/intent', 'GET', undefined, newCookie, alice.address);
    assert.equal(restored.body.intent.id, saved.body.intent.id);
    assert.equal(restored.body.intent.status, 'prepared');
  } finally { await f.close(); }
});

test('prepared intent can be abandoned without a wallet transaction; armed intent cannot', async () => {
  const f = await fixture(), alice = Wallet.createRandom();
  try {
    const cookie = await f.signIn(alice), data = abi.PoolVault.encodeFunctionData('claim');
    const input = { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST,
      nonce: 0, pool, data, value: '0' };
    const first = await f.request('/intent', 'POST', input, cookie, alice.address);
    assert.equal(first.status, 201);
    assert.equal((await f.request('/hash', 'POST', { id: first.body.intent.id, hash: hexHash(1) }, cookie, alice.address)).status, 409);
    assert.equal((await f.request('/abandon', 'POST', { id: first.body.intent.id }, cookie, alice.address)).body.intent.status, 'abandoned');
    const second = await f.request('/intent', 'POST', input, cookie, alice.address);
    assert.equal(second.status, 201);
    assert.equal((await f.request('/arm', 'POST', { id: second.body.intent.id }, cookie, alice.address)).status, 200);
    assert.equal((await f.request('/abandon', 'POST', { id: second.body.intent.id }, cookie, alice.address)).status, 409);
  } finally { await f.close(); }
});

test('ShareMarket listing uses the same wallet journal and only its exact target receipt completes it', async () => {
  const f = await fixture(), alice = Wallet.createRandom();
  try {
    const cookie = await f.signIn(alice), data = abi.ShareMarket.encodeFunctionData('list', [pool, 100n, 20n]);
    const input = { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST,
      target: market, pool, nonce: 0, data, value: '0' };
    const saved = await f.request('/intent', 'POST', input, cookie, alice.address);
    assert.equal(saved.status, 201); assert.equal(saved.body.intent.action, 'market:list');
    assert.equal(saved.body.intent.target, market.toLowerCase());
    const poolData = abi.PoolVault.encodeFunctionData('deposit', [1n]);
    assert.equal((await f.request('/intent', 'POST', { ...input, target: pool, data: poolData, value: '100' }, cookie, alice.address)).status, 409);
    assert.equal((await f.request('/arm', 'POST', { id: saved.body.intent.id }, cookie, alice.address)).status, 200);
    const hash = hexHash(900);
    f.provider.transactions.set(hash, { hash, from: alice.address, nonce: 0, chainId: 56n,
      to: pool, data, value: 0n, blockNumber: 12, blockHash: hexHash(12) });
    f.provider.receipts.set(hash, { hash, from: alice.address, blockNumber: 12, blockHash: hexHash(12), status: 1 });
    f.provider.setFinalized(12);
    assert.equal((await f.request('/hash', 'POST', { id: saved.body.intent.id, hash }, cookie, alice.address)).body.intent.status, 'replaced');
    f.provider.setNonce(1);
    const next = await f.request('/intent', 'POST', { ...input, nonce: 1 }, cookie, alice.address);
    assert.equal(next.status, 201);
    assert.equal((await f.request('/arm', 'POST', { id: next.body.intent.id }, cookie, alice.address)).status, 200);
    const marketHash = hexHash(901);
    f.provider.transactions.set(marketHash, { hash: marketHash, from: alice.address, nonce: 1, chainId: 56n,
      to: market, data, value: 0n, blockNumber: 13, blockHash: hexHash(13) });
    f.provider.receipts.set(marketHash, { hash: marketHash, from: alice.address, blockNumber: 13, blockHash: hexHash(13), status: 1 });
    f.provider.setFinalized(13);
    assert.equal((await f.request('/hash', 'POST', { id: next.body.intent.id, hash: marketHash }, cookie, alice.address)).body.intent.status, 'complete');
  } finally { await f.close(); }
});

test('ShareMarket fill binds order, seller, unit price, pool, quantity and exact BNB', async () => {
  const f = await fixture(), buyer = Wallet.createRandom(), seller = Wallet.createRandom();
  try {
    f.provider.orders.set('7', { seller: seller.address, pool, remaining: 20n, pricePerUnit: 10n, active: true, expiresAt: 2000n });
    const cookie = await f.signIn(buyer), data = abi.ShareMarket.encodeFunctionData('fill', [7n, 10n]);
    const input = { account: buyer.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST,
      target: market, pool, nonce: 0, data, value: '100', expected: { seller: seller.address, pricePerUnitWei: '10' } };
    assert.equal((await f.request('/intent', 'POST', { ...input, value: '99' }, cookie, buyer.address)).status, 400);
    assert.equal((await f.request('/intent', 'POST', { ...input, pool: addr(50) }, cookie, buyer.address)).status, 409);
    assert.equal((await f.request('/intent', 'POST', { ...input, expected: { ...input.expected, pricePerUnitWei: '11' } }, cookie, buyer.address)).status, 409);
    assert.equal((await f.request('/intent', 'POST', { ...input, expected: { ...input.expected, seller: buyer.address } }, cookie, buyer.address)).status, 409);
    assert.equal((await f.request('/intent', 'POST', { ...input, data: abi.ShareMarket.encodeFunctionData('fill', [7n, 21n]), value: '210' }, cookie, buyer.address)).status, 400);
    const saved = await f.request('/intent', 'POST', input, cookie, buyer.address);
    assert.equal(saved.status, 201); assert.equal(saved.body.intent.action, 'market:fill');
    f.provider.orders.get('7').remaining = 9n;
    assert.equal((await f.request('/arm', 'POST', { id: saved.body.intent.id }, cookie, buyer.address)).status, 400);
    assert.equal((await f.request('/abandon', 'POST', { id: saved.body.intent.id }, cookie, buyer.address)).body.intent.status, 'abandoned');
  } finally { await f.close(); }
});

test('ShareMarket cancel, expiry and BNB credit each enforce exact current eligibility', async () => {
  const f = await fixture(), seller = Wallet.createRandom(), other = Wallet.createRandom();
  try {
    f.provider.orders.set('8', { seller: seller.address, pool, remaining: 2n, pricePerUnit: 10n, active: true, expiresAt: 2000n });
    const sellerCookie = await f.signIn(seller), otherCookie = await f.signIn(other);
    const base = { chainId: 56, artifactDigest: ARTIFACT_DIGEST, target: market, pool, nonce: 0, value: '0' };
    const cancel = abi.ShareMarket.encodeFunctionData('cancel', [8n]);
    assert.equal((await f.request('/intent', 'POST', { ...base, account: other.address, data: cancel }, otherCookie, other.address)).status, 403);
    const saved = await f.request('/intent', 'POST', { ...base, account: seller.address, data: cancel }, sellerCookie, seller.address);
    assert.equal(saved.status, 201); assert.equal(saved.body.intent.action, 'market:cancel');
    assert.equal((await f.request('/abandon', 'POST', { id: saved.body.intent.id }, sellerCookie, seller.address)).status, 200);
    const expire = abi.ShareMarket.encodeFunctionData('expire', [8n]);
    assert.equal((await f.request('/intent', 'POST', { ...base, account: other.address, data: expire }, otherCookie, other.address)).status, 409);
    f.provider.orders.get('8').expiresAt = 900n;
    const expired = await f.request('/intent', 'POST', { ...base, account: other.address, data: expire }, otherCookie, other.address);
    assert.equal(expired.status, 201); assert.equal(expired.body.intent.action, 'market:expire');
    const withdrawal = await f.request('/intent', 'POST', { ...base, account: seller.address, pool: market,
      data: abi.ShareMarket.encodeFunctionData('withdrawBnb') }, sellerCookie, seller.address);
    assert.equal(withdrawal.status, 201); assert.equal(withdrawal.body.intent.action, 'market:withdrawBnb');
  } finally { await f.close(); }
});

test('sale governance journal admits only exact current proposal, vote and execution calldata', async () => {
  const f = await fixture(), alice = Wallet.createRandom();
  try {
    f.provider.setTimestamp(1000000);
    const cookie = await f.signIn(alice);
    const base = { account: alice.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST,
      target: pool, pool, nonce: 0, value: '0' };
    const propose = abi.PoolVault.encodeFunctionData('propose', [10000n, 10000n, 999900n]);
    assert.equal((await f.request('/intent', 'POST', { ...base, data: propose, value: '1' }, cookie, alice.address)).status, 409);
    assert.equal((await f.request('/intent', 'POST', { ...base,
      data: abi.PoolVault.encodeFunctionData('propose', [10000n, 10000n, 1000001n]) }, cookie, alice.address)).status, 409);
    const proposal = await f.request('/intent', 'POST', { ...base, data: propose }, cookie, alice.address);
    assert.equal(proposal.status, 201); assert.equal(proposal.body.intent.action, 'governance:propose');
    assert.equal((await f.request('/abandon', 'POST', { id: proposal.body.intent.id }, cookie, alice.address)).status, 200);
    const vote = await f.request('/intent', 'POST', { ...base,
      data: abi.PoolVault.encodeFunctionData('vote', [2n, true]) }, cookie, alice.address);
    assert.equal(vote.status, 201); assert.equal(vote.body.intent.action, 'governance:vote');
    assert.equal((await f.request('/abandon', 'POST', { id: vote.body.intent.id }, cookie, alice.address)).status, 200);
    const execute = await f.request('/intent', 'POST', { ...base,
      data: abi.PoolVault.encodeFunctionData('executeSale', [2n]) }, cookie, alice.address);
    assert.equal(execute.status, 201); assert.equal(execute.body.intent.action, 'governance:executeSale');
    assert.equal((await f.request('/abandon', 'POST', { id: execute.body.intent.id }, cookie, alice.address)).status, 200);
    assert.equal((await f.request('/intent', 'POST', { ...base,
      data: abi.PoolVault.encodeFunctionData('vote', [3n, true]) }, cookie, alice.address)).status, 409);
  } finally { await f.close(); }
});

test('whole-miner completion requires exact sale BNB; expiry unlock is a separate zero-value action', async () => {
  const f = await fixture(), buyer = Wallet.createRandom();
  try {
    f.provider.setTimestamp(1000000); f.provider.setPoolState(3n);
    f.provider.proposals.set('2', { proposer: addr(55), snapshotTs: 999900n,
      endsAt: 1086300n, refAt: 999800n, price: 10000n, refPrice: 10000n,
      snapshotMemberCount: 1n, snapshotTotalShares: 100n, yesCount: 1n, yesShares: 100n, executed: true });
    const cookie = await f.signIn(buyer);
    const base = { account: buyer.address, chainId: 56, artifactDigest: ARTIFACT_DIGEST,
      target: pool, pool, nonce: 0 };
    const finish = abi.PoolVault.encodeFunctionData('completeSale');
    assert.equal((await f.request('/intent', 'POST', { ...base, data: finish, value: '9999' }, cookie, buyer.address)).status, 409);
    const saved = await f.request('/intent', 'POST', { ...base, data: finish, value: '10000' }, cookie, buyer.address);
    assert.equal(saved.status, 201); assert.equal(saved.body.intent.action, 'governance:completeSale');
    f.provider.setSale({ price: 10001n });
    assert.equal((await f.request('/arm', 'POST', { id: saved.body.intent.id }, cookie, buyer.address)).status, 409);
    assert.equal((await f.request('/abandon', 'POST', { id: saved.body.intent.id }, cookie, buyer.address)).status, 200);
    f.provider.setTimestamp(1000101);
    const cancel = await f.request('/intent', 'POST', { ...base,
      data: abi.PoolVault.encodeFunctionData('cancelExpired'), value: '0' }, cookie, buyer.address);
    assert.equal(cancel.status, 201); assert.equal(cancel.body.intent.action, 'governance:cancelExpired');
  } finally { await f.close(); }
});

const officialPath = (number = 10) => `/official-candidates?pool=${pool}&block=${number}&hash=${hexHash(number)}`;

test('public official candidates use the registered Funded pool model at the requested BSC block and coalesce a short cache', async () => {
  let scanned = 0;
  const f = await fixture({ discoverOfficial: async (_provider, options, constraints) => {
    scanned += 1;
    assert.equal(options.blockNumber, 10);
    assert.equal(constraints.circuits, collection);
    assert.equal(constraints.taskId, 42n);
    assert.equal(constraints.referenceVerifiedWeight, 100n);
    assert.equal(constraints.minVerifiedWeight, 50n);
    assert.equal(constraints.referencePriceWei, 1000n);
    assert.equal(constraints.priceCap, 1000n);
    return { complete: true, chainBlock: 10, candidates: [{ listingId: 8n, collection,
      tokenId: 78n, seller: addr(90), priceWei: 700n, verifiedWeight: 80n }] };
  } });
  try {
    f.provider.setPoolState(1n);
    const first = await f.request(officialPath());
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, {
      complete: true, chainId: 56, factory, artifactDigest: ARTIFACT_DIGEST,
      pool, blockNumber: '10', blockHash: hexHash(10), flexible: true,
      model: { circuits: collection, taskId: '42', minVerifiedWeight: '50',
        referenceVerifiedWeight: '100', referencePriceWei: '1000', priceCap: '1000' },
      candidates: [{ listingId: '8', collection, tokenId: '78', seller: addr(90),
        priceWei: '700', verifiedWeight: '80' }],
    });
    assert.equal((await f.request(officialPath())).status, 200);
    assert.equal(scanned, 1);
    for (const name of ['isPool', 'factory', 'OFFICIAL_FACTORY', 'state', 'params',
      'flexiblePurchase', 'purchaseModel', 'purchaseReferenceWeight']) {
      assert.ok(f.provider.calls.some(call => call.name === name && call.blockTag === 10), `${name} must be pinned`);
    }
  } finally { await f.close(); }
});

test('official candidate query fails closed on invalid identity, registry, block and purchase window', async () => {
  const f = await fixture();
  try {
    f.provider.setPoolState(1n);
    for (const path of [
      '/official-candidates', `${officialPath()}&extra=1`,
      `/official-candidates?pool=${pool}&block=010&hash=${hexHash(10)}`,
      `/official-candidates?pool=${pool}&block=10&hash=0x01`,
    ]) assert.equal((await f.request(path)).status, 400);
    assert.equal((await f.request(`/official-candidates?pool=${pool}&block=10&hash=${hexHash(11)}`)).status, 409);
    f.provider.setRegistered(false);
    assert.equal((await f.request(officialPath())).status, 400);
    f.provider.setRegistered(true);
    f.provider.setChain(97);
    assert.equal((await f.request(officialPath())).status, 503);
    f.provider.setChain(56);
    f.provider.setPoolState(2n);
    assert.equal((await f.request(officialPath())).status, 409);
    f.provider.setPoolState(1n); f.provider.setTimestamp(2000);
    assert.equal((await f.request(officialPath())).status, 409);
    f.provider.setTimestamp(1000); f.provider.setPurchase({ weight: 0n });
    assert.equal((await f.request(officialPath())).status, 503);
  } finally { await f.close(); }
});

test('fixed pool gives a complete empty official-alternative set without contacting the external snapshot', async () => {
  let scans = 0;
  const f = await fixture({ discoverOfficial: async () => { scans += 1; throw Error('must not scan'); } });
  try {
    f.provider.setPoolState(1n);
    f.provider.setPurchase({ enabled: false });
    const result = await f.request(officialPath());
    assert.equal(result.status, 200);
    assert.equal(result.body.complete, true);
    assert.equal(result.body.flexible, false);
    assert.equal(result.body.model, null);
    assert.deepEqual(result.body.candidates, []);
    assert.equal(scans, 0);
  } finally { await f.close(); }
});

test('flexible preview refuses a detached reference miner or non-official collection before discovery', async () => {
  let scans = 0;
  const f = await fixture({ discoverOfficial: async () => { scans += 1; throw Error('must not scan'); } });
  try {
    f.provider.setPoolState(1n);
    f.provider.setPurchase({ referenceId: 78n });
    assert.equal((await f.request(officialPath())).status, 503);
    f.provider.setPurchase({ referenceId: 77n, circuits: addr(90) });
    assert.equal((await f.request(officialPath())).status, 503);
    assert.equal(scans, 0);
  } finally { await f.close(); }
});

test('incomplete or failed discovery returns 503, never a verified empty market', async () => {
  let behavior = 'reject';
  const f = await fixture({ discoverOfficial: async (_provider, options) => {
    if (behavior === 'reject') throw Error('snapshot offline');
    if (behavior === 'incomplete') return { complete: false, chainBlock: options.blockNumber, candidates: [] };
    return { complete: true, chainBlock: options.blockNumber, candidates: [] };
  } });
  try {
    f.provider.setPoolState(1n);
    assert.equal((await f.request(officialPath())).status, 503);
    behavior = 'incomplete';
    assert.equal((await f.request(officialPath())).status, 503);
    behavior = 'complete';
    const result = await f.request(officialPath());
    assert.equal(result.status, 200);
    assert.equal(result.body.complete, true);
    assert.deepEqual(result.body.candidates, []);
  } finally { await f.close(); }
});

test('only two distinct official scans run at once and same-block callers share one scan', async () => {
  let started = 0;
  const releases = [];
  const f = await fixture({ discoverOfficial: (_provider, options) => new Promise(resolve => {
    started += 1;
    releases.push(() => resolve({ complete: true, chainBlock: options.blockNumber, candidates: [] }));
  }) });
  try {
    f.provider.setPoolState(1n);
    const first = f.request(officialPath(10));
    for (let i = 0; started < 1 && i < 100; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(started, 1);
    const shared = f.request(officialPath(10));
    const second = f.request(officialPath(11));
    for (let i = 0; started < 2 && i < 100; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(started, 2);
    assert.equal((await f.request(officialPath(12))).status, 503);
    assert.equal(started, 2);
    releases.forEach(release => release());
    assert.equal((await first).status, 200);
    assert.equal((await shared).status, 200);
    assert.equal((await second).status, 200);
  } finally { await f.close(); }
});

test('a block reorganization during discovery cannot be cached as a complete official scan', async () => {
  let scanned = 0, release;
  const f = await fixture({ discoverOfficial: (_provider, options) => {
    scanned += 1;
    if (scanned > 1) return { complete: true, chainBlock: options.blockNumber, candidates: [] };
    return new Promise(resolve => { release = () => resolve({ complete: true, chainBlock: options.blockNumber, candidates: [] }); });
  } });
  try {
    f.provider.setPoolState(1n);
    const first = f.request(officialPath());
    for (let i = 0; !release && i < 100; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(typeof release, 'function');
    f.provider.setBlockHash(10, hexHash(99));
    release();
    assert.equal((await first).status, 409);
    f.provider.setBlockHash(10, hexHash(10));
    assert.equal((await f.request(officialPath())).status, 200);
    assert.equal(scanned, 2);
  } finally { await f.close(); }
});

test('anonymous official previews are rate-limited before deployment identity or pool RPC', async () => {
  let time = 100_000, scans = 0;
  const f = await fixture({ now: () => time, discoverOfficial: async (_provider, options) => {
    scans += 1;
    return { complete: true, chainBlock: options.blockNumber, candidates: [] };
  } });
  try {
    f.provider.setPoolState(1n);
    for (let i = 0; i < 6; i += 1) assert.equal((await f.request(officialPath())).status, 200);
    assert.equal(scans, 1, 'short cache still prevents repeated snapshot scans');
    const rpcCalls = { ...f.provider.activity };
    assert.equal((await f.request(officialPath())).status, 429);
    assert.deepEqual(f.provider.activity, rpcCalls, 'rejected request must not reach any chain RPC');
    time += 500;
    assert.equal((await f.request(officialPath())).status, 200);
    assert.equal(scans, 1);
  } finally { await f.close(); }
});
