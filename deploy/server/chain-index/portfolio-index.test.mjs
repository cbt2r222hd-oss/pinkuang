import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,ZeroAddress} from 'ethers';
import {ChainIndex,chainIndexInterfaces as interfaces} from './indexer.mjs';
const addr=n=>`0x${n.toString(16).padStart(40,'0')}`,hash=n=>`0x${n.toString(16).padStart(64,'0')}`;
const factory=addr(1),market=addr(2),portfolioFactory=addr(3),portfolioMarket=addr(4),portfolio=addr(5),pool=addr(6),collection=addr(7),alice=addr(8),bob=addr(9);
const abi=new Interface(['function shareMarket() view returns(address)','function factory() view returns(address)',
  'function legacyFactory() view returns(address)','function OFFICIAL_FACTORY() view returns(address)','function isPool(address) view returns(bool)',
  'function poolCount() view returns(uint256)','function portfolioCount() view returns(uint256)','function childCount() view returns(uint256)',
  'function nextOrderId() view returns(uint256)','function childInfo(address) view returns(address collection,uint256 tokenId,uint256 purchaseCost,bool official,bool sold)']);
function fixture() {
  const events=[];let reorg=false;const state={wrongBinding:false,missingChild:false,incomplete:false};
  const block=n=>({number:n,hash:hash(n+(reorg&&n>=5?1000:0)),parentHash:hash(n-1+(reorg&&n>5?1000:0)),timestamp:1800000000+n});
  function event(kind,name,args,n,to){const index=events.length;events.push({...interfaces[kind].encodeEventLog(interfaces[kind].getEvent(name),args),
    address:to??({factory,market,portfolioFactory,portfolioMarket,portfolio,pool})[kind],blockNumber:n,blockHash:block(n).hash,transactionHash:hash(100+index),transactionIndex:0,index});}
  event('factory','PoolCreated',[pool,collection,7,1000,1000,alice],1);
  event('portfolioFactory','PortfolioCreated',[portfolio,1000,800,100],1);
  event('portfolio','Deposited',[alice,100,1000],2);
  event('portfolio','Transfer',[ZeroAddress,alice,100],2);
  event('pool','Deposited',[portfolio,100,1000,1000],5);
  event('pool','Transfer',[ZeroAddress,portfolio,100],5);
  event('pool','Purchased',[500,0,1],5);
  event('portfolio','ChildPurchased',[pool,collection,7,500,true],5);
  event('portfolio','Transfer',[alice,bob,100],6);
  const provider={send:async()=> '0x38',getCode:async()=> '0x6000',getBlock:async n=>block(n==='latest'?8:Number(n)),
    getLogs:async({address,fromBlock,toBlock,topics})=>events.filter(e=>e.blockNumber>=fromBlock&&e.blockNumber<=toBlock&&(!reorg||e.blockNumber<5)
      &&[address].flat().includes(e.address)&&topics[0].includes(e.topics[0])&&!(state.missingChild&&e.address===portfolio&&e.blockNumber===5)),
    call:async({to,data,blockTag})=>{assert(Number.isSafeInteger(blockTag));const call=abi.parseTransaction({data});
      if(call.name==='childInfo')return abi.encodeFunctionResult(call.name,[collection,7,500,true,false]);
      const values={shareMarket:to===factory?market:portfolioMarket,factory:to===market?factory:portfolioFactory,
        legacyFactory:state.wrongBinding?addr(99):factory,OFFICIAL_FACTORY:portfolioFactory,isPool:true,poolCount:1n,portfolioCount:1n,
        childCount:state.incomplete?2n:reorg?0n:1n,nextOrderId:1n};
      return abi.encodeFunctionResult(call.name,[values[call.name]]);}};
  const index=new ChainIndex(provider,{dbPath:':memory:',factory,market,portfolioFactory,portfolioMarket,startBlock:1,confirmations:2});
  return {index,state,reorg(){reorg=true;}};
}
test('budget discovery counts parent once, preserves former-member rights and rolls child wrapping back on reorg',async()=>{
  const f=fixture();try {
    await f.index.sync();assert.deepEqual(f.index.pools().items,[]);
    assert.equal(f.index.portfolios().items[0].address,portfolio);
    assert.equal(f.index.portfolios({account:alice}).items.length,1,'sold-out parent members remain discoverable');
    assert.equal(f.index.portfolios({account:bob}).items.length,1);
    assert.equal(f.index.portfolioChildren(portfolio).items[0].costWei,'500');
    assert.equal(f.index.stats().topLevelProjectCount,'1');assert.equal(f.index.stats().everParticipantAddressCount,'2');
    assert.equal(f.index.stats().purchasedCostWei,'500','wrapper event is not a second purchase');
    f.reorg();await f.index.sync();assert.equal(f.index.pools().items.length,1);assert.equal(f.index.portfolioChildren(portfolio).items.length,0);
    assert.equal(f.index.stats().topLevelProjectCount,'2');assert.equal(f.index.stats().purchasedCostWei,'0');
  }finally{f.index.close();}
});
test('portfolio bindings and omitted child history keep data unavailable',async()=>{
  for(const field of ['wrongBinding','missingChild','incomplete']){const f=fixture();f.state[field]=true;try {
    await assert.rejects(f.index.sync());assert.equal(f.index.status().complete,false);
  }finally{f.index.close();}}
});
