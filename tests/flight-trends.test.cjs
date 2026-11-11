const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({console,Date});
vm.runInContext(fs.readFileSync(path.join(root,'flight-trends.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'flight-trends-view.js'),'utf8'),context);
const F=context.BaliFlights;
const members=[...Array.from({length:6},()=>({starts_on:'2027-09-22',ends_on:'2027-10-08'})),{starts_on:'2027-10-02',ends_on:'2027-10-08'},{starts_on:'2027-09-22',ends_on:'2027-09-28'}];
const routes=F.routes(members);
const now=new Date('2026-11-11T03:00:00Z');
function response(r,phase='outbound',token='chosen-outbound'){const inbound=phase==='inbound';return {search_parameters:{...F.requestParams(r),...(inbound?{departure_token:token}:{})},best_flights:[{type:'Round trip',price:inbound?612345:350000,departure_token:inbound?undefined:token,flights:[{departure_airport:{id:inbound?r.dest:r.origin,time:(inbound?r.return_on:r.depart_on)+' 10:00'},arrival_airport:{id:inbound?r.origin:r.dest},airline:'Example Air'}]}]};}

test('member date pairs generate three round-trip combinations without inventing cross-pairs',()=>{
  assert.equal(routes.length,3);assert.equal(new Set(routes.map(r=>r.key)).size,3);
  assert.deepEqual(Array.from(routes,r=>r.key),['ICN-DPS-2027-09-22-2027-10-08','ICN-DPS-2027-09-22-2027-09-28','ICN-DPS-2027-10-02-2027-10-08']);
  assert.equal(routes[0].people,6);assert.equal(routes[1].people,1);assert.equal(routes[2].people,1);
  assert.equal(F.routes([{starts_on:'invalid',ends_on:'2027-02-31'},{starts_on:'2027-10-08',ends_on:'2027-09-22'}]).length,0);
});

test('every request uses actual round-trip dates with nonstop economy and one adult',()=>{
  for(const r of routes){const p=F.requestParams(r);assert.equal(p.stops,1);assert.equal(p.type,1);assert.equal(p.adults,1);assert.equal(p.travel_class,1);assert.equal(p.currency,'KRW');assert.equal(p.return_date,r.return_on);}
});

test('changing a member date immediately rebuilds the deduplicated list',()=>{
  const changed=members.map(m=>({...m}));
  changed[7].ends_on='2027-10-08';
  const updated=F.routes(changed);
  assert.equal(updated.length,2);
  assert.equal(updated.find(r=>r.depart_on==='2027-09-22').people,7);
  assert(!updated.some(r=>r.return_on==='2027-09-28'));
  changed[7].starts_on='2027-09-23';
  assert.equal(F.routes(changed).length,3);
  const page=context.BaliFlightView.render({members:changed,watches:[],quotes:[]},[],now);
  assert.match(page,/2027-09-23/);
  assert(!page.includes('귀국 2027-09-28'));
});

test('outbound and inbound must both be nonstop on their exact dates',()=>{
  const r=routes[0];assert.equal(F.parseResponse(response(r),r).price,350000);
  for(const phase of ['outbound','inbound'])for(const change of [
    d=>d.best_flights[0].flights.push(d.best_flights[0].flights[0]),
    d=>d.best_flights[0].layovers=[{duration:10}],
    d=>d.best_flights[0].flights[0].stops=1,
    d=>d.best_flights[0].flights[0].departure_airport.time='2027-09-23 10:00',
    d=>d.best_flights[0].flights[0].arrival_airport.id='SIN',
    d=>d.best_flights[0].price=0,
    d=>d.best_flights[0].type='One way'
  ]){const data=response(r,phase);change(data);assert.equal(F.parseResponse(data,r,phase,phase==='inbound'?'chosen-outbound':null).price,null);}
  const data=response(r);data.search_parameters.stops=0;assert.throws(()=>F.parseResponse(data,r));
  const inbound=response(r,'inbound');assert.equal(F.parseResponse(inbound,r,'inbound','chosen-outbound').price,612345);
  assert.throws(()=>F.parseResponse(inbound,r,'inbound','another-flight'));
});

test('a provider-confirmed empty search is distinguished from a service error',()=>{
  const r=routes[0],empty={search_parameters:F.requestParams(r),error:"Google Flights hasn't returned any results for this query."};
  assert.equal(F.parseResponse(empty,r).price,null);
  assert.throws(()=>F.parseResponse({...empty,error:'Service temporarily unavailable'},r),/Provider search error/);
});

test('trend window excludes old, future, fake and mismatched-currency observations',()=>{
  const q=(price,date,provider=F.LIVE,currency='KRW')=>({watch_id:'w',price,observed_at:date,provider,currency});
  const s=F.series([q(100,'2026-10-01'),q(200,'2026-11-10'),q(150,'2026-11-10T01:00:00Z'),q(300,'2026-11-12'),q(0,'2026-11-10'),q(2,'2026-11-10',F.LIVE,'USD'),q(50,'2026-11-10','예시 데이터')],['w'],now);
  assert.equal(s.live.length,1);assert.equal(s.live[0].price,150);assert.equal(s.start,'2026-10-13');
});

test('strict chart never plots unverifiable Google historical prices',()=>{
  const html=context.BaliFlightView.chart({start:'2026-10-13',end:'2026-11-11',live:[],history:[{day:'2026-11-10',price:350000}]},'route');
  assert.match(html,/아직 저장된 가격/);assert(!html.includes('<circle'));
  const page=context.BaliFlightView.render({members,watches:[],quotes:[]},[],now);
  assert.equal((page.match(/class="card flight-trend-card"/g)||[]).length,3);
});

test('collector saves three actual round-trip totals, ignores unverified history, and skips same-day repeats',()=>{
  const collectorUrl=require('node:url').pathToFileURL(path.join(root,'scripts/check-flight-prices.mjs')).href;
  const code=`
    import assert from 'node:assert/strict';
    const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-11T03:00:00Z']))}static now(){return new RealDate('2026-11-11T03:00:00Z').getTime()}};
    process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test_fixture';process.env.SERPAPI_API_KEY='test-api';
    const members=${JSON.stringify(members)},watches=[{id:'old',kind:'flight',note:'AUTO_DIRECT_FLIGHT_V1',origin:'ICN',dest:'DPS',depart_on:'2027-09-22',return_on:null,nonstop:true,adults:1,is_active:true}],ledger=new Map(),quotes=[];let apiCalls=0;
    globalThis.fetch=async(input,options={})=>{
      const url=new URL(input),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
      const json=data=>new Response(JSON.stringify(data),{status:200});
      if(url.hostname==='serpapi.com'){
        apiCalls++;assert.equal(url.searchParams.get('stops'),'1');assert.equal(url.searchParams.get('type'),'1');
        const p=Object.fromEntries(url.searchParams);delete p.api_key;
        const inbound=!!p.departure_token;return json({search_parameters:p,best_flights:[{type:'Round trip',price:inbound?612345:350000,departure_token:inbound?undefined:'chosen-outbound',flights:[{departure_airport:{id:inbound?p.arrival_id:p.departure_id,time:(inbound?p.return_date:p.outbound_date)+' 10:00'},arrival_airport:{id:inbound?p.departure_id:p.arrival_id}}]}]});
      }
      const table=url.pathname.split('/').at(-1);
      if(table==='trips')return json([{id:'trip'}]);
      if(table==='trip_members')return json(members);
      if(table==='watch_items'){
        if(method==='GET')return json(watches);
        if(method==='POST'){const w={...body,id:'w'+watches.length};watches.push(w);return json([w]);}
        if(method==='PATCH')Object.assign(watches.find(w=>w.id===url.searchParams.get('id').slice(3)),body);
        return json(null);
      }
      if(table==='flight_price_checks'){
        if(method==='GET')return json([]);
        if(method==='POST'){const key=body.watch_id+'|'+body.checked_on;if(ledger.has(key))return json([]);const row={...body,id:'c'+ledger.size};ledger.set(key,row);return json([row]);}
        return json(null);
      }
      if(table==='price_quotes'){
        if(method==='GET')return json(quotes.filter(q=>q.watch_id===url.searchParams.get('watch_id').slice(3)));
        quotes.push(...body);return json(null);
      }
      throw Error('Unexpected request '+table);
    };
    const one=await import(${JSON.stringify(collectorUrl+'?one')});await one.completed;
    assert.equal(apiCalls,6);assert.equal(quotes.length,3);assert(quotes.every(q=>q.provider==='Google Flights round trip · SerpAPI'&&q.price===612345));
    assert.equal(watches[0].is_active,false);
    const two=await import(${JSON.stringify(collectorUrl+'?two')});await two.completed;assert.equal(apiCalls,6);assert.equal(quotes.length,3);
    members[7].ends_on='2027-10-08';
    const three=await import(${JSON.stringify(collectorUrl+'?three')});await three.completed;
    assert.equal(apiCalls,6);assert.equal(quotes.length,3);
    assert.equal(watches.find(w=>w.return_on==='2027-09-28').is_active,false);
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
});
