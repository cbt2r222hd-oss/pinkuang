import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioCreateForm } from '../lib/portfolio-create-form.mjs';

const valid={budget:'1.000',absoluteCap:'0.2',unitCap:'0.042',fundHours:'24',buyHours:'48'};
test('portfolio form identifies the missing cap instead of reporting a generic BNB error',()=>{
  assert.throws(()=>portfolioCreateForm({...valid,unitCap:''}),/链上每 H 价格上限/);
  assert.throws(()=>portfolioCreateForm({...valid,absoluteCap:''}),/单机价格上限/);
  assert.throws(()=>portfolioCreateForm({...valid,budget:''}),/募集预算/);
  assert.equal(portfolioCreateForm(valid).unitCap,'0.042');
});
test('portfolio form rejects oversized budgets and amounts beyond wei precision',()=>{
  assert.throws(()=>portfolioCreateForm({...valid,absoluteCap:'1.1'}),/不能超过募集预算/);
  assert.throws(()=>portfolioCreateForm({...valid,unitCap:'9.0000000000000000001'}),/链上每 H/);
  assert.throws(()=>portfolioCreateForm({...valid,budget:'0.0004',absoluteCap:'0.0001'}),/为 0/);
});
