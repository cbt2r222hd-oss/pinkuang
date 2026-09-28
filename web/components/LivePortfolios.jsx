'use client';
import { useEffect, useRef, useState } from 'react';
import { formatEther, ZeroAddress } from 'ethers';
import { Layers3, RefreshCw, ArrowRight, ChevronDown } from 'lucide-react';
import { readPortfolioPage, readPortfolioContext, readPortfolio, readPortfolioChildren, readPortfolioOrders, preparePortfolioAction } from '../lib/live-portfolios.mjs';
import { amount, shortAddress, explorerAddress, explorerTransaction, exportActivityCsv } from '../lib/live-view.mjs';
import { fundingAmount } from '../lib/funding-amount.mjs';
import LiveYieldChart from './LiveYieldChart';
import { sameUnsignedIntent } from '../lib/ui-context.mjs';
import './LivePortfolios.css';

const names = { deposit:'认购预算份额',withdrawDeposit:'撤回全部认购',finalizeFundingFailure:'开启募集失败退款',claimFailedFunding:'结算募集退款',
  finalizeAcquisition:'结束购机并结算余款',collectChildBem:'归集该台 BEM',claimBem:'领取项目 BEM',withdrawBnb:'领取项目 BNB',transfer:'转移项目份额',
  proposeChildSale:'提出子矿机出售',voteChildSale:'提交子矿机表决',executeChildSale:'执行子矿机挂牌',settleChildSale:'归集该台卖款',expireChildSale:'解除过期子机提案',
  createPortfolio:'创建预算项目',autoPurchase:'自动核价采购',marketList:'挂卖项目份额',marketFill:'买入项目份额',marketCancel:'撤回份额挂单',marketExpire:'解锁到期份额挂单',marketWithdraw:'领取预算市场 BNB' };
const states = ['募集中','购机期','运行中','出售中','已结束','可退款'];
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const brief = error => error?.shortMessage || error?.message || '预算项目读取未完成。';

/** A parent project owns its miners. Its 100 shares are never counted once per child. */
export default function LivePortfolios({ config, provider, client, locale, account, wallet, mode = 'pools', initialPool, disabled, onConnect, onSend, onBuyChild, refreshKey = 0 }) {
  const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[selected,setSelected]=useState(null),[operator,setOperator]=useState(null);
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(null);
  const [loadedIdentity,setLoadedIdentity]=useState(''),[orders,setOrders]=useState([]),[orderCursor,setOrderCursor]=useState(null),[orderPool,setOrderPool]=useState(null);
  const [purchaseChild,setPurchaseChild]=useState('');
  const [quantity,setQuantity]=useState('1'),[recipient,setRecipient]=useState(''),[child,setChild]=useState(''),[price,setPrice]=useState(''),[reference,setReference]=useState('');
  const [budget,setBudget]=useState(''),[cap,setCap]=useState(''),[unitCap,setUnitCap]=useState(''),[fundHours,setFundHours]=useState('24'),[buyHours,setBuyHours]=useState('48');
  const context=useRef({}), sequence=useRef(0);
  const identity=`${config?.portfolioFactory || ''}:${account || ''}:${mode}:${initialPool || ''}:${refreshKey}`;
  if(context.current.identity!==identity || context.current.provider!==provider || context.current.wallet!==wallet){
    sequence.current++;context.current={identity,provider,wallet};
  }
  const enabled=config?.kind==='integrated-v2' && provider;
  const mine=['overview','rewards'].includes(mode);
  const current=ticket=>ticket===sequence.current;
  const isOperator=same(operator,account);
  const visibleRows=loadedIdentity===identity?rows:[];
  const selectedCurrent=selected && visibleRows.some(row=>same(row.pool,selected.pool)) && same(selected.account,account || ZeroAddress) ? selected:null;
  const frozen=busy || loading || disabled;
  useEffect(()=>{setLoadedIdentity('');setOrders([]);setOrderPool(null);setOrderCursor(null);setRows([]);setSelected(null);setPreview(null);setError('');setOperator(null);setCursor(null);setBusy(false);setLoading(false);if(enabled && (!mine || account))void load();},[identity,provider]);
  useEffect(()=>()=>{sequence.current++;},[]);

  async function load(nextCursor=0){
    const ticket=++sequence.current;setLoading(true);setError('');setPreview(null);
    try{
      let result;
      if(initialPool){const ctx=await readPortfolioContext(config,provider);const row=await readPortfolio(ctx,initialPool,account || ZeroAddress);await ctx.canonical();result={items:[row],nextCursor:null,operator:ctx.operator};}
      else result=await readPortfolioPage(config,provider,{account:account || undefined,mine,cursor:nextCursor});
      if(!current(ticket))return;
      setRows(previous=>nextCursor? [...previous,...result.items.filter(item=>!previous.some(p=>same(p.pool,item.pool)))]:result.items);
      setLoadedIdentity(identity);setCursor(result.nextCursor);setOperator(result.operator);if(!nextCursor){setSelected(initialPool?result.items[0]:null);if(initialPool)setChild(result.items[0].children.find(c=>!c.sold)?.pool || '');}
    }catch(problem){if(current(ticket)){setError(brief(problem));if(!nextCursor)setRows([]);}}
    finally{if(current(ticket))setLoading(false);}
  }
  async function select(row){
    const ticket=++sequence.current;setLoading(true);setError('');setPreview(null);setOrders([]);setOrderPool(null);setOrderCursor(null);
    try{const ctx=await readPortfolioContext(config,provider);const details=await readPortfolio(ctx,row.pool,account || ZeroAddress);await ctx.canonical();
      if(current(ticket)){setSelected(details);setChild(details.children.find(c=>!c.sold)?.pool || '');}
    }catch(problem){if(current(ticket)){setSelected(null);setError(brief(problem));}}
    finally{if(current(ticket))setLoading(false);}
  }
  async function moreChildren(){
    if(!selectedCurrent)return;const ticket=++sequence.current;setLoading(true);setError('');
    try{const ctx=await readPortfolioContext(config,provider,selectedCurrent.blockNumber);
      if(ctx.block.hash.toLowerCase()!==selectedCurrent.blockHash.toLowerCase())throw new Error('项目区块已变化，请重新展开项目。');
      const more=await readPortfolioChildren(ctx,selectedCurrent.pool,selectedCurrent.childCount,BigInt(selectedCurrent.children.length));await ctx.canonical();
      if(current(ticket))setSelected({...selectedCurrent,children:[...selectedCurrent.children,...more]});
    }catch(problem){if(current(ticket))setError(brief(problem));}finally{if(current(ticket))setLoading(false);}
  }
  async function loadOrders(nextCursor){
    if(!selectedCurrent)return;const target=selectedCurrent.pool,ticket=++sequence.current;setLoading(true);setError('');setPreview(null);
    try{const result=await readPortfolioOrders(config,provider,target,{cursor:nextCursor});
      if(current(ticket)){setOrderPool(target);setOrders(previous=>nextCursor?[...previous,...result.items]:result.items);setOrderCursor(result.nextCursor);}
    }catch(problem){if(current(ticket)){setOrders([]);setOrderPool(null);setError(brief(problem));}}finally{if(current(ticket))setLoading(false);}
  }
  async function prepare(action,pool=selectedCurrent?.pool){
    if(!account || !wallet){onConnect?.();return;}const ticket=++sequence.current;setBusy(true);setError('');setPreview(null);
    try{const input={config,provider:wallet,account,pool,action};const result=await preparePortfolioAction(input);
      if(current(ticket))setPreview({input:{...input, action: {...action, ...(result.procurement ? { expectedPurchaseWei: result.procurement.priceWei.toString(), frozenOrder: result.procurement.frozenOrder } : {}), ...(result.marketTrade?.seller ? {expectedSeller:result.marketTrade.seller,expectedPricePerUnitWei:result.marketTrade.pricePerUnitWei.toString()}: {})}},result,identity,ticket});
    }catch(problem){if(current(ticket))setError(brief(problem));}finally{if(current(ticket))setBusy(false);}
  }
  async function submit(){
    if(!preview || preview.identity!==identity || !current(preview.ticket) || frozen)return;
    const ticket=preview.ticket;setBusy(true);setError('');
    try{const checked=await preparePortfolioAction(preview.input);
      if(!current(ticket)||!sameUnsignedIntent(checked.transaction,preview.result.transaction))throw new Error('确认内容已变化，请重新预览。');
      const result=await onSend(checked,preview.input);
      if(!current(ticket))return;setPreview(null);if(result?.status==='confirmed')await load();
    }catch(problem){if(current(ticket))setError(brief(problem));}finally{if(current(ticket))setBusy(false);}
  }
  const act=(kind,extra={})=>void prepare({kind,...extra});
  const p=selectedCurrent?.proposal;
  const nextRound=selectedCurrent?.nextRoundAt ?? 0n;
  const pChild=selectedCurrent?.children.find(c=>same(c.pool,p?.child));
  return <section className="panel portfolio-panel" aria-label="多矿机预算项目">
    <div className="portfolio-heading"><div><h2><Layers3 size={21}/>多矿机预算项目</h2><p>整个项目共 100 份，共同持有项目内多台矿机。每台矿机的出售单独表决，余款与收益归项目份额持有人。</p></div>
      <button className="btn secondary" disabled={!enabled || frozen || mine&&!account} onClick={()=>void load()}><RefreshCw size={15}/>刷新项目</button></div>
    {!enabled ? <p role="status">预算项目合约尚未完成部署验收。</p> : mine&&!account ? <button className="btn" onClick={onConnect}>连接钱包查看项目权益</button> : <>
      {error&&<p className="portfolio-error" role="alert">{error}</p>}
      {loading&&<p role="status">正在核对预算项目…</p>}
      {!loading&&!error&&!visibleRows.length&&<p>当前没有{mine?'与你相关的':''}预算项目。</p>}
      <div className="portfolio-cards">{visibleRows.map(row=><button key={row.pool} className={`portfolio-card${same(selectedCurrent?.pool,row.pool)?' selected':''}`} disabled={frozen} onClick={()=>void select(row)}>
        <strong>预算项目 {shortAddress(row.pool)}</strong><span>{states[Number(row.state)]} · {row.activeChildCount.toString()} 台运行 / {row.childCount.toString()} 台购入</span>
        <dl><div><dt>预算</dt><dd>{fundingAmount(formatEther(row.budgetWei)).display} BNB</dd></div><div><dt>已认购</dt><dd>{row.totalSupply.toString()} / 100 份</dd></div><div><dt>我的份额</dt><dd>{account?row.shares.toString():'—'}</dd></div><div><dt>可领 BNB</dt><dd>{account?amount(row.withdrawableBnb,18,3):'—'}</dd></div><div><dt>已入账 BEM</dt><dd>{account?amount(row.claimableBem,8,3):'—'}</dd></div></dl><span>查看矿机与项目操作 <ChevronDown size={15}/></span>
      </button>)}</div>
      {cursor!==null&&<button className="btn secondary" disabled={frozen} onClick={()=>void load(cursor)}>加载更多预算项目</button>}
      {selectedCurrent&&<div className="portfolio-detail"><div className="portfolio-heading"><h3>项目详情</h3><a href={explorerAddress(selectedCurrent.pool)} target="_blank" rel="noopener noreferrer">{shortAddress(selectedCurrent.pool)} ↗</a></div>
        <p>每份 {amount(selectedCurrent.unitPriceWei,18,3)} BNB · 已购机 {amount(selectedCurrent.spentWei,18,3)} BNB · 我的可转份额 {selectedCurrent.availableShares.toString()}。未领取 BEM 随转出份额按比例移动；历史 BNB 余款和卖款留给原持有人。</p>
        <div className="portfolio-actions">
          {selectedCurrent.state===0n&&<><label>认购份数<input type="number" min="1" max="100" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button className="btn" disabled={frozen} onClick={()=>act('deposit',{quantity})}>预览认购</button>{selectedCurrent.shares>0n&&<button className="btn secondary" disabled={frozen} onClick={()=>act('withdrawDeposit')}>撤回全部认购</button>}{selectedCurrent.timestamp>=selectedCurrent.fundingDeadline&&<button className="btn secondary" disabled={frozen} onClick={()=>act('finalizeFundingFailure')}>开启募集失败退款</button>}</>}
          {selectedCurrent.state===1n&&selectedCurrent.timestamp>=selectedCurrent.purchaseDeadline&&<button className="btn" disabled={frozen} onClick={()=>act('finalizeAcquisition')}>结束购机并结算余款</button>}
          {selectedCurrent.fundingFailed&&selectedCurrent.state===5n&&selectedCurrent.shares>0n&&<button className="btn" disabled={frozen} onClick={()=>act('claimFailedFunding')}>结算募集退款</button>}
          {selectedCurrent.withdrawableBnb>0n&&<button className="btn" disabled={frozen} onClick={()=>act('withdrawBnb')}>领取 {amount(selectedCurrent.withdrawableBnb,18,3)} BNB</button>}
          {selectedCurrent.claimableBem>0n&&<button className="btn" disabled={frozen} onClick={()=>act('claimBem')}>领取 {amount(selectedCurrent.claimableBem,8,3)} BEM</button>}
        </div>
        <div className="portfolio-child-table"><table><thead><tr><th>项目内矿机</th><th>采购来源 / 成本</th><th>状态</th><th>操作</th></tr></thead><tbody>{selectedCurrent.children.map(item=><tr key={item.pool}><td><a href={explorerAddress(item.pool)} target="_blank" rel="noopener noreferrer">#{item.tokenId.toString()} · {shortAddress(item.pool)}</a></td><td>{item.official?'官网':'Firsto'} · {amount(item.costWei,18,3)} BNB</td><td>{item.sold?'已归集卖款':states[Number(item.state)]}</td><td><button className="btn secondary" disabled={frozen||item.sold} onClick={()=>act('collectChildBem',{child:item.pool})}>归集该台 BEM</button>{item.state===3n&&<button className="btn" disabled={frozen} onClick={()=>onBuyChild?.(item.pool)}>预览 Firsto 购买</button>}</td></tr>)}</tbody></table></div>
        {selectedCurrent.children.length<Number(selectedCurrent.childCount)&&<button className="btn secondary" disabled={frozen} onClick={()=>void moreChildren()}>加载更多子矿机</button>}
        {!selectedCurrent.children.length&&<p>该项目尚未购入矿机。</p>}
        {client&&<PortfolioHistory key={`${selectedCurrent.pool}:${account || ''}`} client={client} config={config} pool={selectedCurrent.pool} account={account} locale={locale}/>}
        {mode==='operator'&&isOperator&&selectedCurrent.state===1n&&<details><summary>用本项目预算采购矿机</summary><p>先在上方运营工作台选矿机创建一个尚无人认购的单机池，再在这里选择对应子矿池。系统核对官网挂牌并优先官网采购；官网无符合上限的原目标时才校验 Firsto 签名单。成员不用再向子池出资。</p><div className="portfolio-actions"><label>待采购子矿池地址<input placeholder="0x…" value={purchaseChild} onChange={e=>setPurchaseChild(e.target.value)}/></label><button className="btn" disabled={frozen||!purchaseChild} onClick={()=>act('autoPurchase',{child:purchaseChild})}>自动核价并预览采购</button></div></details>}

        {selectedCurrent.shareTradingAllowed&&selectedCurrent.availableShares>0n&&<details><summary>转移项目份额</summary><p>接收人取得对应未领取 BEM 及未来权益；已结算的历史 BNB 余款和卖款保留在你的地址。此操作是赠予转移，不会收取对价。</p><div className="portfolio-actions"><label>接收钱包<input placeholder="0x…" value={recipient} onChange={e=>setRecipient(e.target.value)}/></label><label>份数<input inputMode="numeric" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button className="btn" disabled={frozen} onClick={()=>act('transfer',{recipient,quantity})}>预览份额转移</button></div></details>}
        <details className="portfolio-market"><summary>预算项目份额市场</summary><p>买方另付成交价的 1%，卖方从成交价扣除 1%。未领取 BEM 随份额按比例移动，历史 BNB 债权不随份额转移。治理期间暂停新增挂单和成交，原挂单仍可撤销。</p>
          <div className="portfolio-actions"><button className="btn secondary" disabled={frozen} onClick={()=>void loadOrders()}>读取本项目挂单</button><button className="btn secondary" disabled={frozen||!account} onClick={()=>act('marketWithdraw')}>预览领取预算市场 BNB</button></div>
          {selectedCurrent.shareTradingAllowed&&selectedCurrent.availableShares>0n&&<div className="portfolio-actions"><label>挂牌份数<input inputMode="numeric" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>每份价格（BNB）<input inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label><button className="btn" disabled={frozen} onClick={()=>act('marketList',{quantity,price})}>预览挂卖份额</button></div>}
          {same(orderPool,selectedCurrent.pool)&&<><div className="portfolio-child-table"><table><thead><tr><th>订单</th><th>卖方</th><th>剩余份额 / 每份价</th><th>操作</th></tr></thead><tbody>{orders.map(order=><tr key={order.id.toString()}><td>#{order.id.toString()}</td><td>{shortAddress(order.seller)}</td><td>{order.remaining.toString()} / {amount(order.pricePerUnitWei,18,3)} BNB</td><td>{order.active&&order.remaining>0n? <>{same(order.seller,account)?<button className="btn secondary" disabled={frozen} onClick={()=>act('marketCancel',{orderId:order.id.toString()})}>撤销挂单</button>:!order.expired&&<button className="btn" disabled={frozen||!selectedCurrent.shareTradingAllowed} onClick={()=>act('marketFill',{orderId:order.id.toString(),quantity,expectedSeller:order.seller,expectedPricePerUnitWei:order.pricePerUnitWei.toString()})}>预览买入 {quantity} 份</button>}{order.expired&&<button className="btn secondary" disabled={frozen} onClick={()=>act('marketExpire',{orderId:order.id.toString()})}>解锁到期挂单</button>}</>:'已结束'}</td></tr>)}</tbody></table></div><label>买入份数<input inputMode="numeric" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>{!orders.length&&<p>暂无本项目挂单。</p>}{orderCursor!==null&&<button className="btn secondary" disabled={frozen} onClick={()=>void loadOrders(orderCursor)}>加载更多挂单</button>}</>}
        </details>
        {p?<div className="portfolio-governance"><h3>子矿机出售提案 #{p.id.toString()}</h3><p>{shortAddress(p.child)} · {amount(p.price,18,3)} BNB · 赞成 {p.yesShares.toString()}/{p.threshold.toString()} 份，{p.yesMembers.toString()}/{(p.memberCount/2n+1n).toString()} 人。提案期间项目份额冻结，其他矿机继续归集收益。</p><div className="portfolio-actions">
          {!p.executed&&selectedCurrent.timestamp<p.endsAt&&<><button className="btn" disabled={frozen||p.hasVoted||selectedCurrent.shares===0n} onClick={()=>act('voteChildSale',{proposalId:p.id.toString(),support:true})}>赞成</button><button className="btn secondary" disabled={frozen||p.hasVoted||selectedCurrent.shares===0n} onClick={()=>act('voteChildSale',{proposalId:p.id.toString(),support:false})}>反对</button><button className="btn" disabled={frozen||p.yesShares<p.threshold||p.yesMembers*2n<=p.memberCount} onClick={()=>act('executeChildSale',{proposalId:p.id.toString()})}>执行该台挂牌</button></>}
          {p.executed&&pChild?.state===4n&&<button className="btn" disabled={frozen} onClick={()=>act('settleChildSale')}>归集该台卖款</button>}
          {(!p.executed&&selectedCurrent.timestamp>=p.endsAt||p.executed&&pChild?.state===3n&&selectedCurrent.timestamp>=pChild.expiresAt)&&<button className="btn secondary" disabled={frozen} onClick={()=>act('expireChildSale')}>解除过期子机提案</button>}
        </div></div>:null}
        {selectedCurrent.state===2n&&selectedCurrent.shares>0n&&(!p || !p.executed&&selectedCurrent.timestamp>=p.endsAt)&&<details><summary>发起逐台出售提案</summary><p>预算项目每轮只审议一台矿机，下一轮最早 {nextRound===0n?'现在':new Date(Number(nextRound)*1000).toLocaleString()}；未通过提案到期后自动恢复份额转让。</p><div className="portfolio-actions"><label>项目内矿机<select value={child} onChange={e=>setChild(e.target.value)}>{selectedCurrent.children.filter(c=>!c.sold&&c.state===2n).map(c=><option key={c.pool} value={c.pool}>#{c.tokenId.toString()} · {shortAddress(c.pool)}</option>)}</select></label><label>拟售价格（BNB）<input inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>观察到的参考价（BNB）<input inputMode="decimal" value={reference} onChange={e=>setReference(e.target.value)}/></label><button className="btn" disabled={frozen||!child||selectedCurrent.timestamp<nextRound} onClick={()=>act('proposeChildSale',{child,price,reference,referenceAt:selectedCurrent.timestamp.toString()})}>预览出售提案</button></div></details>}
      </div>}
      {mode==='operator'&&isOperator&&<details className="portfolio-create"><summary>创建多矿机预算项目</summary><p>预算项目固定 100 份；总预算、单机绝对上限和单位算力价格上限写入合约，采购不能突破上限。</p><div className="portfolio-actions"><label>募集预算（BNB）<input inputMode="decimal" placeholder="0.005" value={budget} onChange={e=>setBudget(e.target.value)}/></label><label>单机价格上限（BNB）<input inputMode="decimal" value={cap} onChange={e=>setCap(e.target.value)}/></label><label>每单位核验算力上限（BNB）<input inputMode="decimal" value={unitCap} onChange={e=>setUnitCap(e.target.value)}/></label><label>募集期（小时）<input inputMode="numeric" value={fundHours} onChange={e=>setFundHours(e.target.value)}/></label><label>募集结束后购机期（小时）<input inputMode="numeric" value={buyHours} onChange={e=>setBuyHours(e.target.value)}/></label><button className="btn" disabled={frozen} onClick={()=>{
        if(!/^[1-9]\d{0,2}$/.test(fundHours)||!/^[1-9]\d{0,2}$/.test(buyHours)){setError('请输入整数小时。');return;}
        const now=BigInt(Math.floor(Date.now()/1000)),fundingDeadline=now+BigInt(fundHours)*3600n;
        let rounded;try{rounded=fundingAmount(budget).rounded;setBudget(rounded);}catch(problem){setError(brief(problem));return;}
        void prepare({kind:'createPortfolio',budget:rounded,absoluteCap:cap,unitCap,fundingDeadline:fundingDeadline.toString(),purchaseDeadline:(fundingDeadline+BigInt(buyHours)*3600n).toString()},null);
      }}>预览创建预算项目 <ArrowRight size={15}/></button></div></details>}
    </>}
    {preview&&preview.identity===identity&&current(preview.ticket)&&<div className="portfolio-confirm" role="dialog" aria-modal="true" aria-label="确认预算项目操作"><div><h3>{names[preview.input.action.kind] || preview.input.action.kind}</h3><p>目标 {shortAddress(preview.result.transaction.to)} · 区块 #{preview.result.blockNumber.toString()}</p><p>本次支付 {formatEther(BigInt(preview.result.transaction.value))} BNB + Gas</p><PortfolioConfirmationDetails preview={preview}/>{preview.result.marketTrade&&<p>成交基价 {formatEther(preview.result.marketTrade.baseWei)} BNB；买方另付 {formatEther(preview.result.marketTrade.buyerFeeWei)} BNB；卖方扣除 {formatEther(preview.result.marketTrade.sellerFeeWei)} BNB。</p>}{preview.result.procurement&&<p>来源 {preview.result.procurement.route==='official'?'官网':'Firsto'} · 本次含来源费报价 {formatEther(preview.result.procurement.priceWei)} BNB · 合约价格上限 {formatEther(preview.result.procurement.capWei)} BNB。款项来自项目预算，本钱包只付 Gas。</p>}{preview.result.payoutWei!==null&&<p>已模拟可领取 {preview.input.action.kind==='claimBem'?amount(preview.result.payoutWei,8,8):formatEther(preview.result.payoutWei)} {preview.input.action.kind==='claimBem'?'BEM':'BNB'}</p>}{preview.input.action.kind==='transfer'&&<p>向 {preview.input.action.recipient} 转移 {preview.input.action.quantity} 份，无对价。</p>}<p>金额按精确链上整数发送；发送前重新核对内容，并先保存交易意图。</p><div className="portfolio-actions"><button className="btn secondary" disabled={busy} onClick={()=>setPreview(null)}>返回</button><button className="btn" disabled={frozen} onClick={()=>void submit()}>发送到钱包确认</button></div></div></div>}
  </section>;
}

function PortfolioConfirmationDetails({preview}){
  const a=preview.input.action,row=preview.result.row;
  return <>
    {a.kind==='createPortfolio'&&<p>募集预算 {a.budget} BNB / 100 份；单机上限 {a.absoluteCap} BNB；每单位核验算力上限 {a.unitCap} BNB。募集截至 {new Date(Number(a.fundingDeadline)*1000).toLocaleString()}，购机截至 {new Date(Number(a.purchaseDeadline)*1000).toLocaleString()}。</p>}
    {a.kind==='deposit'&&<p>认购 {a.quantity} / 100 份。</p>}
    {a.kind==='marketList'&&<p>挂卖 {a.quantity} 份，每份 {a.price} BNB；买卖双方各收成交价的 1%。</p>}
    {a.orderId&&<p>份额订单 #{a.orderId}{a.quantity?` · ${a.quantity} 份`:''}。</p>}
    {a.child&&<p>子矿池 <a href={explorerAddress(a.child)} target="_blank" rel="noopener noreferrer">{a.child} ↗</a></p>}
    {a.kind==='proposeChildSale'&&<p>拟售价 {a.price} BNB；参考价 {a.reference} BNB；观察时间 {new Date(Number(a.referenceAt)*1000).toLocaleString()}。提案发起后本轮项目份额暂时冻结。</p>}
    {['voteChildSale','executeChildSale','settleChildSale','expireChildSale'].includes(a.kind)&&row?.proposal&&<p>子矿池 {shortAddress(row.proposal.child)}；提案 #{row.proposal.id.toString()}；挂牌价 {formatEther(row.proposal.price)} BNB。{a.kind==='voteChildSale'?a.support?'本次投赞成票。':'本次投反对票。':''}</p>}
  </>;
}

/** Parent-only history: never add child Harvested events to the parent's BemCollected totals. */
function PortfolioHistory({client,config,pool,account,locale}){
  const [history,setHistory]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[days,setDays]=useState(7);
  const epoch=useRef(0);useEffect(()=>()=>{epoch.current++;},[]);
  async function load(window=days,more=false){const ticket=++epoch.current;setBusy(true);setError('');
    try{
      const yieldResult=more?{data:history.yield,source:history.source}:await client.readYield({pool,account:account || undefined,days:window});
      if(!same(yieldResult.source.portfolioFactory,config.portfolioFactory)||!same(yieldResult.source.portfolioMarket,config.portfolioMarket))throw new Error('预算历史记录来源不一致。');
      const events=await client.readActivity({pool,source:yieldResult.source,...(more?{cursor:history.nextCursor}:{})});
      if(ticket===epoch.current)setHistory({yield:yieldResult.data,source:yieldResult.source,items:more?[...history.items,...events.items]:events.items,nextCursor:events.nextCursor});
    }catch(problem){if(ticket===epoch.current){setHistory(null);setError(brief(problem));}}
    finally{if(ticket===epoch.current)setBusy(false);}
  }
  function download(){const url=URL.createObjectURL(new Blob([exportActivityCsv(history.items)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='BEMine-budget-records.csv';a.click();URL.revokeObjectURL(url);}
  return <details><summary>项目收益与公开记录</summary><p>这里仅统计进入本预算项目的 BEM，避免与子矿池重复计入；个人未领取权益以项目当前读数为准。</p>
    <button className="btn secondary" disabled={busy} onClick={()=>void load()}>读取项目收益与记录</button>{busy&&<p role="status">正在读取项目记录…</p>}{error&&<p role="alert">{error}</p>}
    {history&&<><LiveYieldChart data={history.yield} locale={locale} days={days} onDays={next=>{if(!busy){setDays(next);void load(next);}}}/><div className="portfolio-child-table"><table><thead><tr><th>区块</th><th>记录</th><th>链上凭证</th></tr></thead><tbody>{history.items.map(item=><tr key={`${item.blockNumber}:${item.transactionIndex}:${item.logIndex}`}><td>{item.blockNumber}</td><td>{item.event}</td><td><a href={explorerTransaction(item.transactionHash)} target="_blank" rel="noopener noreferrer">查看交易 ↗</a></td></tr>)}</tbody></table></div>{!history.items.length&&<p>暂无该项目已确认记录。</p>}<div className="portfolio-actions"><button className="btn secondary" onClick={download}>导出已加载记录</button>{history.nextCursor!==null&&<button className="btn secondary" disabled={busy} onClick={()=>void load(days,true)}>加载更多记录</button>}</div></>}
  </details>;
}
