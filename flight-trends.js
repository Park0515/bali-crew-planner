/* Shared by the browser and scheduled collector. No API credentials here. */
(()=>{'use strict';
const MARKER='AUTO_DIRECT_FLIGHT_ROUNDTRIP_V2';
const LIVE='Google Flights round trip · SerpAPI',HISTORY='Google Flights history · SerpAPI';
const airports={ICN:'인천',DPS:'덴파사'};
const day=value=>new Date(new Date(value).getTime()+9*3600000).toISOString().slice(0,10);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const key=r=>`${r.origin}-${r.dest}-${r.depart_on}-${r.return_on||''}`;
function routes(members){
  const groups=new Map();
  for(const m of members){
    if(!validDate(m.starts_on)||!validDate(m.ends_on)||m.ends_on<m.starts_on)continue;
    const r={origin:'ICN',dest:'DPS',depart_on:m.starts_on,return_on:m.ends_on};
    const k=key(r),old=groups.get(k);
    if(old)old.people++;else groups.set(k,{...r,key:k,people:1,label:`인천 ↔ 덴파사 · ${r.depart_on} ~ ${r.return_on}`});
  }
  return [...groups.values()].sort((a,b)=>b.people-a.people||a.depart_on.localeCompare(b.depart_on)||a.return_on.localeCompare(b.return_on));
}
function matches(w,r){return w.kind==='flight'&&w.note===MARKER&&w.origin===r.origin&&w.dest===r.dest&&w.depart_on===r.depart_on&&w.return_on===r.return_on&&w.nonstop===true&&Number(w.adults)===1;}
function series(quotes,watchIds,now=new Date()){
  const end=day(now),start=new Date(Date.parse(end+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);
  const ids=new Set(watchIds),groups={live:new Map(),history:new Map()};
  for(const q of quotes){
    if(!ids.has(q.watch_id)||q.currency!=='KRW'||!Number.isFinite(Number(q.price))||Number(q.price)<=0||!Number.isFinite(Date.parse(q.observed_at)))continue;
    const kind=q.provider===LIVE?'live':q.provider===HISTORY?'history':null;if(!kind)continue;
    const d=day(q.observed_at);if(d<start||d>end||Date.parse(q.observed_at)>new Date(now).getTime())continue;
    const old=groups[kind].get(d);if(!old||Number(q.price)<old.price)groups[kind].set(d,{day:d,price:Number(q.price)});
  }
  return {start,end,live:[...groups.live.values()].sort((a,b)=>a.day.localeCompare(b.day)),history:[...groups.history.values()].sort((a,b)=>a.day.localeCompare(b.day))};
}
function requestParams(r){return {engine:'google_flights',departure_id:r.origin,arrival_id:r.dest,outbound_date:r.depart_on,return_date:r.return_on,type:1,stops:1,adults:1,travel_class:1,currency:'KRW',hl:'ko',gl:'kr',sort_by:2};}
function parseResponse(data,r,phase='outbound',departureToken=null){
  const p=data.search_parameters||{};
  if(p.departure_id!==r.origin||p.arrival_id!==r.dest||p.outbound_date!==r.depart_on||p.return_date!==r.return_on||Number(p.type)!==1||Number(p.stops)!==1||p.currency!=='KRW'||Number(p.adults??1)!==1||Number(p.travel_class??1)!==1)throw new Error('검색 조건 불일치: 저장하지 않았습니다.');
  if(phase==='inbound'&&(!departureToken||p.departure_token!==departureToken))throw new Error('왕복 항공편 연결 불일치: 저장하지 않았습니다.');
  if(data.error){
    if(/^Google(?: Flights)? hasn['’]t returned any results for this query\.?$/i.test(String(data.error).trim()))return {price:null};
    throw new Error('Provider search error: '+String(data.error).slice(0,300));
  }
  const offers=[...(data.best_flights||[]),...(data.other_flights||[])].filter(o=>{
    if(o.type!=='Round trip'||!Array.isArray(o.flights)||o.flights.length!==1||(o.layovers||[]).length||!Number.isFinite(o.price)||o.price<=0)return false;
    const f=o.flights[0],origin=phase==='inbound'?r.dest:r.origin,dest=phase==='inbound'?r.origin:r.dest,date=phase==='inbound'?r.return_on:r.depart_on;
    return f.departure_airport?.id===origin&&f.arrival_airport?.id===dest&&String(f.departure_airport?.time||'').slice(0,10)===date&&!(Number(f.stops)||Number(f.number_of_stops));
  }).sort((a,b)=>a.price-b.price);
  if(!offers.length)return {price:null};
  if(phase==='outbound'&&typeof offers[0].departure_token!=='string')throw new Error('귀국편 확인 토큰이 없어 왕복 가격을 저장하지 않았습니다.');
  return {price:Math.round(offers[0].price),airline:offers[0].flights[0].airline||'',departureToken:offers[0].departure_token};
}
globalThis.BaliFlights={MARKER,LIVE,HISTORY,airports,day,key,routes,matches,series,requestParams,parseResponse};
})();
