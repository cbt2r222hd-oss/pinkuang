import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoShareUrl, createDemoShare, DEMO_SHARE_BASE } from '../lib/demo-share.mjs';
import { createProjectShare, DEFAULT_PUBLIC_SHARE_BASE } from '../lib/project-share.mjs';

const project = { id: '16928', name: 'TapeOut', status: 'Funding', funded: 73 };

test('demo links only point to known preview projects with allowlisted source', () => {
  assert.equal(buildDemoShareUrl('16928'), `${DEMO_SHARE_BASE}#detail/16928`);
  for (const bad of [undefined, 'evil', '999999', '../16928', '16928?wallet=abc', 16928, '0x' + 'a'.repeat(40)]) assert.equal(buildDemoShareUrl(bad), null);
  assert.equal(buildDemoShareUrl('16928', 'x&wallet=secret'), null);
  const tg = new URL(buildDemoShareUrl('16928', 'tg'));
  assert.deepEqual([...tg.searchParams], [['source', 'tg']]);
});

test('both language share payloads carry clear demo notice and safe X length', () => {
  for (const locale of ['zh', 'en']) {
    const model = createDemoShare({ project, locale });
    assert.equal(model.demo, true);
    assert.equal(model.remaining, 27);
    assert.match(model.text, locale === 'zh' ? /演示预览.*\n.*\n.*未发生真实交易/u : /\[Demo\].*\n.*\n.*No real transaction/u);
    // Conservative bound: count every text code point as two, plus newline and X's shortened URL.
    assert.ok([...model.xText].length * 2 + 24 <= 280, `${locale} copy fits X with URL`);
    assert.equal(new URL(model.telegramUrl).searchParams.get('text'), model.text);
    assert.equal(new URL(model.xUrl).searchParams.get('text'), model.xText);
    assert.equal(new URL(model.xUrl).origin, 'https://x.com');
    assert.equal(new URL(model.telegramUrl).origin, 'https://t.me');
    assert.equal(new URL(new URL(model.xUrl).searchParams.get('url')).pathname, '/bemine/preview.html');
  }
});

test('demo slogans rotate without claiming availability for full or inactive projects', () => {
  for (const locale of ['zh', 'en']) {
    const mottos = Array.from({ length: 3 }, (_, mottoIndex) => createDemoShare({ project, locale, mottoIndex }).motto);
    assert.equal(new Set(mottos).size, 3);
    for (let mottoIndex = 0; mottoIndex < 3; mottoIndex++) {
      const model = createDemoShare({ project, locale, mottoIndex });
      assert.doesNotMatch(model.text, /共持 BEM|共享 BEM|Co-own BEM/u);
      assert.match(model.xText, locale === 'zh' ? /演示.*\n.*\n.*未发生真实交易/u : /\[Demo\].*\n.*\n.*No real transaction/u);
      assert.ok([...model.xText].length * 2 + 24 <= 280);
      for (const override of [{ funded: 100 }, { funded: undefined }, { status: 'Active' }, { status: 'Listed' }]) {
        const inactive = createDemoShare({ project: { ...project, ...override }, locale, mottoIndex });
        assert.equal(inactive.canSubscribe, false);
        assert.ok(!mottos.includes(inactive.motto));
      }
    }
  }
});

test('demo sharing cannot turn arbitrary metadata into public claims', () => {
  assert.equal(createDemoShare({ project: { ...project, name: 'Behemoth' } }), null);
  const model = createDemoShare({ project: { ...project, wallet: 'privatewallet', amount: '98765', confirmed: true, receipt: 'privatehash', text: 'guaranteed returns' } });
  for (const secret of ['privatewallet', '98765', 'privatehash', 'guaranteed returns']) assert.ok(!JSON.stringify(model).includes(secret));
  assert.equal(createDemoShare({ project: { ...project, status: 'Funded' } }).remaining, null);
  assert.equal(createDemoShare({ project: { ...project, funded: -1 } }).remaining, null);
});

test('real sharing remains closed to preview identifiers and demo URLs', () => {
  assert.equal(createProjectShare({ publicBaseUrl: DEMO_SHARE_BASE, project: { name: 'TapeOut', circuitId: '16928', poolAddress: '0x' + 'a'.repeat(40) } }), null);
  assert.equal(createProjectShare({ publicBaseUrl: DEFAULT_PUBLIC_SHARE_BASE, project: { name: 'TapeOut', circuitId: '16928', poolAddress: '16928' } }), null);
});
