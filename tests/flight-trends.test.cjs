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
function response(r){return {search_parameters:F.requestParams(r),best_flights:[{price:350000,flights:[{departure_airport:{id:r.origin,time:r.depart_on+' 10:00'},arrival_airport:{id:r.dest},airline:'Example Air'}]}],price_insights:{price_history:[[Date.parse('2026-11-10T00:00:00Z')/1000,330000]]}};}

test('distinct member dates generate exactly four one-way airport/date combinations',()=>{
  assert.equal(routes.length,4);assert.equal(new Set(routes.map(r=>r.key)).size,4);
  assert.deepEqual(Array.from(routes.filter(r=>r.direction==='outbound'),r=>r.key),['ICN-DPS-2027-09-22','ICN-DPS-2027-10-02']);
  assert.equal(routes.find(r=>r.key==='ICN-DPS-2027-09-22').people,7);
  assert.equal(routes.find(r=>r.key==='DPS-ICN-2027-09-28').people,1);
  assert.equal(F.routes([{starts_on:'invalid',ends_on:'2027-02-31'}]).length,0);
});

test('every request is a one-person economy nonstop one-way KRW search',()=>{
  for(const r of routes){const p=F.requestParams(r);assert.equal(p.stops,1);assert.equal(p.type,2);assert.equal(p.adults,1);assert.equal(p.travel_class,1);assert.equal(p.currency,'KRW');assert.equal(p.return_date,undefined);}
});

test('response validation rejects connections, technical stops, wrong dates and airports',()=>{
  const r=routes[0];assert.equal(F.parseResponse(response(r),r,now).price,350000);
  for(const change of [
    d=>d.best_flights[0].flights.push(d.best_flights[0].flights[0]),
    d=>d.best_flights[0].layovers=[{duration:10}],
    d=>d.best_flights[0].flights[0].stops=1,
    d=>d.best_flights[0].flights[0].departure_airport.time='2027-09-23 10:00',
    d=>d.best_flights[0].flights[0].arrival_airport.id='SIN',
    d=>d.best_flights[0].price=0
  ]){const data=response(r);change(data);assert.equal(F.parseResponse(data,r,now).price,null);}
  const data=response(r);data.search_parameters.stops=0;assert.throws(()=>F.parseResponse(data,r,now));
});

test('a provider-confirmed empty search is distinguished from a service error',()=>{
  const r=routes[0],empty={search_parameters:F.requestParams(r),error:"Google hasn't returned any results for this query."};
  assert.equal(F.parseResponse(empty,r,now).price,null);
  assert.throws(()=>F.parseResponse({...empty,error:'Service temporarily unavailable'},r,now),/Provider search error/);
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
  assert.equal((page.match(/class="card flight-trend-card"/g)||[]).length,4);
});

test('collector saves four validated quotes, ignores unverified history, and skips same-day repeats',()=>{
  const collectorUrl=require('node:url').pathToFileURL(path.join(root,'scripts/check-flight-prices.mjs')).href;
  const code=`
    import assert from 'node:assert/strict';
    const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-11T03:00:00Z']))}static now(){return new RealDate('2026-11-11T03:00:00Z').getTime()}};
    process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test_fixture';process.env.SERPAPI_API_KEY='test-api';
    const members=${JSON.stringify(members)},watches=[],ledger=new Map(),quotes=[];let apiCalls=0;
    globalThis.fetch=async(input,options={})=>{
      const url=new URL(input),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
      const json=data=>new Response(JSON.stringify(data),{status:200});
      if(url.hostname==='serpapi.com'){
        apiCalls++;assert.equal(url.searchParams.get('stops'),'1');assert.equal(url.searchParams.get('type'),'2');
        const p=Object.fromEntries(url.searchParams);delete p.api_key;
        return json({search_parameters:p,best_flights:[{price:350000,flights:[{departure_airport:{id:p.departure_id,time:p.outbound_date+' 10:00'},arrival_airport:{id:p.arrival_id}}]}],price_insights:{price_history:[[1794268800,300000]]}});
      }
      const table=url.pathname.split('/').at(-1);
      if(table==='trips')return json([{id:'trip'}]);
      if(table==='trip_members')return json(members);
      if(table==='watch_items'){
        if(method==='GET')return json(watches);
        if(method==='POST'){const w={...body,id:'w'+watches.length};watches.push(w);return json([w]);}
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
    assert.equal(apiCalls,4);assert.equal(quotes.length,4);assert(quotes.every(q=>q.provider==='Google Flights live · SerpAPI'));
    const two=await import(${JSON.stringify(collectorUrl+'?two')});await two.completed;assert.equal(apiCalls,4);assert.equal(quotes.length,4);
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
});
