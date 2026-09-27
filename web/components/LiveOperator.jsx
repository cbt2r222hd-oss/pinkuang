'use client';
import { useEffect, useRef, useState } from 'react';
import { formatEther, parseEther } from 'ethers';
import { Plus, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { prepareAdminAction } from '../lib/live-admin.mjs';
import { createUiContext } from '../lib/ui-context.mjs';
import '../app/live-operator.css';

const collections = [
  ['TapeOut', '0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C'],
  ['Behemoth', '0x1F5Cb4aeaE1807Bf60c3b9C0D8aDBCC14e91f12C'],
];
const initial = { circuits: collections[0][1], circuitId: '', targetRaise: '', priceCap: '', fundingHours: '24', purchaseHours: '48' };
const errorText = error => error?.shortMessage || error?.message || '操作准备失败，请重新读取。';
const when = value => value == null ? '—' : new Date(Number(value) * 1000).toLocaleString('zh-CN');

export default function LiveOperator({ config, account, wallet, operator, disabled, onSend, onRefresh }) {
  const [form, setForm] = useState(initial), [mode, setMode] = useState('createPool');
  const [imported, setImported] = useState(''), [pool, setPool] = useState(''), [listingId, setListingId] = useState('');
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const context = useRef(createUiContext()), identity = useRef(null);
  const key = `${config?.factory}:${account}`;
  if (identity.current?.key !== key || identity.current?.wallet !== wallet) {
    context.current.invalidate(); identity.current = { key, wallet };
  }
  useEffect(() => { setPreview(null); setError(''); setBusy(false); }, [key, wallet]);
  useEffect(() => () => context.current.invalidate(), []);
  const frozen = busy || disabled || !operator?.isOperator;
  const change = (name, value) => { context.current.invalidate(); setPreview(null); setForm(current => ({ ...current, [name]: value })); };

  async function prepare(kind = mode, miningAction) {
    const ticket = context.current.begin(); setBusy(true); setError(''); setPreview(null);
    try {
      let input;
      if (kind === 'createPool') input = { kind, params: { circuits: form.circuits, circuitId: form.circuitId,
        targetRaiseWei: parseEther(form.targetRaise).toString(), priceCapWei: parseEther(form.priceCap).toString(),
        fundingHours: form.fundingHours, purchaseHours: form.purchaseHours } };
      else if (kind === 'createFlexiblePoolChecked') {
        const data = JSON.parse(imported);
        input = { kind, params: data.params, flexible: data.flexible,
          expectedTaskId: data.expectedTaskId, expectedReferenceWeight: data.expectedReferenceWeight };
      } else input = { kind, pool, listingId, miningAction };
      const prepared = await prepareAdminAction({ provider: wallet, config, account, ...input });
      if (!context.current.current(ticket)) return;
      setPreview({ ...prepared, input: prepared.request || { ...input, ...(prepared.params ? { params: prepared.params } : {}) }, ticket, identity: key });
    } catch (problem) { if (context.current.current(ticket)) setError(errorText(problem)); }
    finally { if (context.current.current(ticket)) setBusy(false); }
  }
  async function send() {
    if (!preview || preview.identity !== key || !context.current.current(preview.ticket)) return;
    const ticket = preview.ticket; setBusy(true); setError('');
    try { await onSend(preview); if (context.current.current(ticket)) setPreview(null); }
    catch (problem) { if (context.current.current(ticket)) { setError(errorText(problem)); setPreview(null); } }
    finally { if (context.current.current(ticket)) setBusy(false); }
  }

  return <section className="panel live-operator" aria-label="运营建池与矿机管理">
    <div className="section-head"><div><h2><ShieldCheck size={21}/>运营工作台</h2><p>读取链上运营权限；每笔操作先预览，再由你的钱包确认。</p></div><button className="btn secondary" disabled={frozen} onClick={onRefresh}><RefreshCw size={16}/>刷新权限</button></div>
    {error && <div className="live-notice error" role="alert">{error}</div>}
    {!operator?.isOperator ? <p className="subtle-note">当前钱包不是 Factory 登记的运营地址。</p> : <>
      <div className="operator-identity"><span>当前运营钱包</span><strong>{account}</strong><span>Factory</span><strong>{config.factory}</strong></div>
      <div className="operator-tabs"><button className={`btn${mode === 'createPool' ? '' : ' secondary'}`} disabled={frozen} onClick={() => { setMode('createPool'); setPreview(null); }}>指定矿机建池</button><button className={`btn${mode === 'createFlexiblePoolChecked' ? '' : ' secondary'}`} disabled={frozen} onClick={() => { setMode('createFlexiblePoolChecked'); setPreview(null); }}>灵活购机报价建池</button></div>
      {operator.creationPaused && <p className="live-notice error">链上建池已暂停，需要治理权限恢复后才能新建。</p>}
      {mode === 'createPool' ? <div className="operator-grid">
        <label>矿机系列<select value={form.circuits} disabled={frozen || !!preview} onChange={event => change('circuits', event.target.value)}>{collections.map(([name, address]) => <option key={address} value={address}>{name}</option>)}</select></label>
        <label>矿机编号<input inputMode="numeric" placeholder="输入已核对的 Token ID" value={form.circuitId} disabled={frozen || !!preview} onChange={event => change('circuitId', event.target.value)}/></label>
        <label>募集总额（BNB）<input inputMode="decimal" placeholder="精确到 18 位小数" value={form.targetRaise} disabled={frozen || !!preview} onChange={event => change('targetRaise', event.target.value)}/></label>
        <label>购机价格上限（BNB）<input inputMode="decimal" value={form.priceCap} disabled={frozen || !!preview} onChange={event => change('priceCap', event.target.value)}/></label>
        <label>募集截止（距当前小时）<input inputMode="numeric" value={form.fundingHours} disabled={frozen || !!preview} onChange={event => change('fundingHours', event.target.value)}/></label>
        <label>购机期限（募集结束后小时）<input inputMode="numeric" value={form.purchaseHours} disabled={frozen || !!preview} onChange={event => change('purchaseHours', event.target.value)}/></label>
      </div> : <label className="operator-import">已核验矿机报价 JSON<textarea value={imported} disabled={frozen || !!preview} onChange={event => { context.current.invalidate(); setPreview(null); setImported(event.target.value); }} placeholder={'{"params": {...}, "flexible": {...}, "expectedTaskId": "...", "expectedReferenceWeight": "..."}'}/><small>使用矿机报价工具导出的参数；发送前会重新核对任务编号、参考权重及报价时效。</small></label>}
      <p className="subtle-note">每池固定 100 份。创建矿池只支付 Gas；募集款在成员认购时进入矿池。</p>
      <button className="btn" disabled={frozen || !!preview || operator.creationPaused} onClick={() => void prepare()}><Plus size={17}/>预览创建矿池</button>
      <hr/>
      <h3>已募集矿池管理</h3><p className="subtle-note">先核对矿池与外部市场订单。挖矿启动需要有效的工作证明，不会自动构造或发送启动交易。</p>
      <div className="operator-grid"><label>矿池合约<input placeholder="0x…" value={pool} disabled={frozen || !!preview} onChange={event => { context.current.invalidate(); setPool(event.target.value); setPreview(null); }}/></label><label>矿机市场订单编号<input inputMode="numeric" value={listingId} disabled={frozen || !!preview} onChange={event => { context.current.invalidate(); setListingId(event.target.value); setPreview(null); }}/></label></div>
      <div className="operator-tabs"><button className="btn secondary" disabled={frozen || !!preview || !pool || !listingId} onClick={() => void prepare('buyFromMarket')}>预览购入指定矿机</button><button className="btn secondary" disabled={frozen || !!preview || !pool} onClick={() => void prepare('mine', 'arm')}>预览挖矿准备</button><button className="btn secondary" disabled={frozen || !!preview || !pool} onClick={() => void prepare('mine', 'reclaim')}>预览停止并取回矿机</button></div>
      {preview && preview.identity === key && <div className="operator-confirm" role="dialog" aria-label="确认运营操作"><h3>核对后前往钱包</h3><dl><div><dt>操作</dt><dd>{preview.requestKind || preview.kind}</dd></div><div><dt>接收合约</dt><dd>{preview.transaction.to}</dd></div><div><dt>业务支付</dt><dd>{formatEther(preview.transaction.value || 0)} BNB + Gas</dd></div>{preview.input.params && <><div><dt>募集截止</dt><dd>{when(preview.input.params.fundingDeadline)}</dd></div><div><dt>购机截止</dt><dd>{when(preview.input.params.purchaseDeadline)}</dd></div></>}</dl><div className="operator-tabs"><button className="btn secondary" disabled={busy} onClick={() => { context.current.invalidate(); setPreview(null); }}>返回修改</button><button className="btn" disabled={frozen} onClick={() => void send()}>发送到钱包确认<ArrowRight size={16}/></button></div></div>}
    </>}
  </section>;
}
