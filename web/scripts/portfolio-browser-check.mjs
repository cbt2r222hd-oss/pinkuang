/** Offline browser regression. Every RPC and journal write is intercepted; there are no keys or broadcasts. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { toQuantity } from 'ethers';
import { abi } from '../lib/chain-client.mjs';
import { portfolioFixture, PORTFOLIOS } from './portfolio-fixture.mjs';
import { FIXTURE_OTHER_ACCOUNT } from './live-browser-fixture.mjs';
const { chromium } = await import(process.env.BEMINE_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.BEMINE_TEST_URL||'http://127.0.0.1:3198/';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const output=process.env.BEMINE_BROWSER_OUTPUT||join(tmpdir(),'bemine-portfolio-browser');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BEMINE_TEST_BROWSER?{channel:process.env.BEMINE_TEST_BROWSER}:{})});
const checks=[],errors=[],trace=[],sends=[];
let page;
try {
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  const f=portfolioFixture(),json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
  let revision=0,record=null,armed=false,nonce=7,result=null;
  const txhash=`0x${'d3'.repeat(32)}`;
  const checkedTx=tx=>{assert(record&&armed);assert.equal(tx.to.toLowerCase(),PORTFOLIOS[0].toLowerCase());
    assert.equal(tx.data,record.data);assert.equal(BigInt(tx.value),BigInt(record.value));assert.equal(Number(BigInt(tx.nonce)),nonce);};
  const read=async payload=>{
    if(payload.method==='eth_getBalance')return toQuantity(10n**20n);
    if(payload.method==='eth_gasPrice')return toQuantity(100000000n);
    if(payload.method==='eth_getTransactionCount')return toQuantity(nonce);
    if(payload.method==='eth_estimateGas')return toQuantity(150000n);
    if(payload.method==='eth_sendTransaction'){checkedTx(payload.params[0]);assert.equal(sends.length,0);sends.push(payload.params[0]);trace.push('wallet:fake-send');return txhash;}
    return f.request(payload);
  };
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await page.route(/\/data\/frontend-manifest\.json(?:\?.*)?$/,route=>route.fulfill({contentType:'application/json',body:json(f.manifest)}));
  await page.route(/\/api\/rpc(?:\?.*)?$/,async route=>{try{const p=route.request().postDataJSON();const value=await read(p);await route.fulfill({contentType:'application/json',body:json({jsonrpc:'2.0',id:p.id,result:value})});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:json({error:e.message})});}});
  await page.route(/\/api\/chain-index\//,async route=>{try{await route.fulfill({contentType:'application/json',body:json(f.index(route.request().url()))});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:json({error:e.message})});}});
  await page.route(/\/api\/journal\//,async route=>{
    const request=route.request(),path=new URL(request.url()).pathname.split('/journal/')[1],method=request.method();
    const body=request.postData()?request.postDataJSON():null;let response;
    try{
      if(path==='session')response={account:f.state.account};
      else if(path==='notifications/capabilities')response={enabled:false};
      else if(path==='market/result')response={result};
      else if(path==='market/arm'&&method==='POST'){
        assert.equal(body.expectedRevision,revision);assert(record&&!armed);armed=true;revision++;trace.push('journal:armed');
        response={revision,record,transaction:{from:record.account,to:record.target,chainId:'0x38',nonce:toQuantity(nonce),data:record.data,value:toQuantity(BigInt(record.value)),gas:toQuantity(BigInt(record.gas)),gasPrice:toQuantity(BigInt(record.gasPrice)),type:'0x0'}};
      }else if(path==='market'&&method==='GET')response={revision,record,canAbandon:!!record&&!armed};
      else if(path==='market'&&method==='PUT'){
        assert.equal(body.expectedRevision,revision);assert.equal(body.record.targetType,'portfolio');assert.equal(body.record.factory,f.manifest.portfolioFactory);
        assert.equal(body.record.action.kind,'deposit');assert.equal(BigInt(body.record.value),100000000000000n);
        assert.equal(abi.BudgetPortfolioVault.parseTransaction({data:body.record.data}).args[0],2n);
        record=body.record;revision++;trace.push('journal:ack');response={revision,record};
      }else if(path==='market'&&method==='DELETE'){
        assert.equal(body.expectedRevision,revision);assert.equal(body.hash,txhash);assert.equal(sends.length,1);
        result={status:'confirmed',finalized:true,action:'deposit',targetType:'portfolio',account:f.account,target:PORTFOLIOS[0],factory:f.manifest.portfolioFactory,nonce,
          transactionHash:txhash,poolAddress:PORTFOLIOS[0],shares:'2',amountWei:record.value,
          receipt:{status:1,transactionHash:txhash,to:PORTFOLIOS[0],blockNumber:100,blockHash:f.source().indexedBlockHash}};
        record=null;revision++;nonce++;trace.push('journal:finalized');response={result,record,revision};
      }else throw new Error(`Unexpected fixture journal route ${method} ${path}`);
      await route.fulfill({contentType:'application/json',body:json(response)});
    }catch(e){errors.push(e.message);await route.fulfill({status:400,contentType:'application/json',body:json({error:e.message})});}
  });
  await page.exposeFunction('__budgetRead',read);
  await page.addInitScript(({account})=>{
    let connected=false,selected=account;const events=new Map();
    const wallet={isMetaMask:true,async request(payload){
      if(payload.method==='eth_requestAccounts'){connected=true;return[selected];}
      if(payload.method==='eth_accounts')return connected?[selected]:[];
      if(/sign|wallet_/i.test(payload.method))throw new Error('Offline fixture refuses signatures and chain writes');
      return window.__budgetRead(payload);
    },on(event,fn){if(!events.has(event))events.set(event,new Set());events.get(event).add(fn);return wallet;},removeListener(event,fn){events.get(event)?.delete(fn);return wallet;},
    __switch(next){selected=next;for(const fn of events.get('accountsChanged')||[])fn([next]);}};
    Object.defineProperty(window,'ethereum',{configurable:true,value:wallet});
  },{account:f.account});
  await page.goto(`${base}#portfolio/${PORTFOLIOS[0]}`);
  await page.getByRole('button',{name:'连接钱包',exact:true}).click();
  await page.getByRole('button',{name:'连接 MetaMask',exact:true}).click();
  const panel=page.getByRole('region',{name:'多矿机预算项目'});
  await panel.getByRole('heading',{name:'项目详情',exact:true}).waitFor();
  await panel.getByLabel('认购份数',{exact:true}).fill('2');
  await panel.getByRole('button',{name:'预览认购',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'确认预算项目操作',exact:true});await dialog.waitFor();
  await dialog.getByText('本次支付 0.0001 BNB + Gas',{exact:true}).waitFor();
  await page.screenshot({path:join(output,'desktop-budget-confirm.png'),fullPage:true});
  await dialog.getByRole('button',{name:'发送到钱包确认',exact:true}).click();
  await page.getByText('交易已在链上确认。',{exact:true}).waitFor();
  assert.equal(sends.length,1);assert(trace.indexOf('journal:ack')<trace.indexOf('journal:armed'));assert(trace.indexOf('journal:armed')<trace.indexOf('wallet:fake-send'));
  assert(!await page.getByText('认购已确认，暂时无法读取项目资料。请稍后在矿机详情中分享。',{exact:true}).count());
  checks.push('budget subscription exact amount -> durable ACK -> one signing permit -> one fake wallet request -> confirmed budget receipt');
  await page.waitForFunction(()=>!document.querySelector('.portfolio-heading > button')?.disabled);

  // Keep an old project read pending while navigation replaces its context.
  let release,seen;const pending=new Promise(r=>release=r),entered=new Promise(r=>seen=r);let held=false;
  f.state.beforeRead=async p=>{if(!held&&p.method==='eth_call'&&p.params[0].to.toLowerCase()===PORTFOLIOS[0].toLowerCase()
      &&p.params[0].data===abi.BudgetPortfolioVault.encodeFunctionData('budgetWei')){held=true;seen();await pending;}};
  await panel.getByRole('button',{name:'刷新项目',exact:true}).click();await entered;
  await page.evaluate(pool=>{location.hash=`portfolio/${pool}`;},PORTFOLIOS[1]);
  await page.waitForFunction(pool=>document.querySelector('.portfolio-detail a')?.href.toLowerCase().endsWith(pool.toLowerCase()),PORTFOLIOS[1]);
  release();f.state.beforeRead=null;
  await page.waitForFunction(pool=>document.querySelector('.portfolio-detail a')?.href.toLowerCase().endsWith(pool.toLowerCase()),PORTFOLIOS[1]);
  assert.equal(await panel.getByLabel('认购份数',{exact:true}).count(),0);assert.equal(await dialog.count(),0);
  checks.push('slow previous-project response cannot replace the new project or revive an old transaction preview');
  await panel.getByText('项目收益与公开记录',{exact:true}).click();
  await panel.getByRole('button',{name:'读取项目收益与记录',exact:true}).click();
  await panel.getByRole('heading',{name:'矿池收益归集',exact:true}).waitFor();
  await panel.getByText('暂无该项目已确认记录。',{exact:true}).waitFor();
  assert.equal(await panel.locator('.chart-summary strong').first().innerText(),'7 BEM');
  checks.push('parent yield and public history use the selected parent and do not add child harvest totals');

  await page.evaluate(pool=>{location.hash=`portfolio/${pool}`;},PORTFOLIOS[0]);
  await panel.getByLabel('认购份数',{exact:true}).waitFor();await panel.getByRole('button',{name:'预览认购',exact:true}).click();await dialog.waitFor();
  f.state.account=FIXTURE_OTHER_ACCOUNT;
  await page.evaluate(account=>window.ethereum.__switch(account),FIXTURE_OTHER_ACCOUNT);await dialog.waitFor({state:'hidden'});
  assert.equal(sends.length,1);checks.push('wallet change clears the confirmation and never triggers another send');
  await page.getByRole('button',{name:'连接钱包',exact:true}).click();
  await page.getByRole('button',{name:'连接 MetaMask',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('main')?.getAttribute('aria-busy')==='false');
  for(const width of [375,390,430]){
    await page.setViewportSize({width,height:844});await panel.getByRole('heading',{name:'项目详情',exact:true}).waitFor();
    const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(size.scroll<=size.width+1,`overflow ${width}: ${json(size)}`);
    await panel.getByRole('button',{name:'预览认购',exact:true}).click();await dialog.waitFor();
    const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    await page.screenshot({path:join(output,`mobile-${width}-budget-confirm.png`),fullPage:true});
    await dialog.getByRole('button',{name:'返回',exact:true}).click();checks.push(`${width}px: budget controls, wallet dialog visible, no horizontal overflow`);
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'results.json'),json({checks,trace,offlineWalletRequests:sends.length,errors})+'\n');
  console.log(json({checks,output}));
}catch(e){if(page){await writeFile(join(output,'failure.txt'),await page.locator('body').innerText());await page.screenshot({path:join(output,'failure.png'),fullPage:true});}throw e;}
finally{await browser.close();}
