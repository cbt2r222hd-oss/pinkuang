import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { guardJournalWrites } from './dev-artifact-guard.mjs';

test('development journal stops writes before the wallet intent reaches storage when build inputs drift', async () => {
  let current = true, stored = 0, checks = 0;
  const middleware = guardJournalWrites(() => {
    checks++;
    if (!current) throw new Error('source changed');
  });
  const server = createServer((req, res) => middleware(req, res, () => {
    if (req.method === 'PUT') stored++;
    res.statusCode = 200;
    res.end('ok');
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/journal/deployment`, { method: 'PUT' })).status, 200);
    assert.equal(stored, 1);
    current = false;
    const blocked = await fetch(`${base}/api/journal/deployment`, { method: 'PUT' });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.headers.get('cache-control'), 'no-store');
    assert.match((await blocked.json()).error, /部署产物已更改/);
    assert.equal(stored, 1);
    assert.equal((await fetch(`${base}/api/journal/deployment`)).status, 200);
    assert.equal(checks, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
