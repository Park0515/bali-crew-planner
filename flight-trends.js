/* Shared by the browser and scheduled collector. No API credentials here. */
(()=>{'use strict';
const MARKER='AUTO_DIRECT_FLIGHT_V1';
const LIVE='Google Flights live · SerpAPI',HISTORY='Google Flights history · SerpAPI';
const airports={ICN:'인천',DPS:'덴파사'};
const day=value=>new Date(new Date(value).getTime()+9*3600000).toISOString().slice(0,10);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const key=r=>`${r.origin}-${r.dest}-${r.depart_on}`;
function routes(members){
  const result=[];
  for(const [field,direction] of [['starts_on','outbound'],['ends_on','inbound']]){
    const dates=[...new Set(members.map(m=>m[field]).filter(validDate))].sort();
    for(const date of dates)for(const airport of ['ICN']){
      const r={origin:direction==='outbound'?airport:'DPS',dest:direction==='outbound'?'DPS':airport,depart_on:date,direction,people:members.filter(m=>m[field]===date).length};
      result.push({...r,key:key(r),label:`${direction==='outbound'?'출국':'귀국'} ${date} · ${airports[r.origin]} → ${airports[r.dest]}`});
    }
  }
  return result;
}
function matches(w,r){return w.kind==='flight'&&w.note===MARKER&&w.origin===r.origin&&w.dest===r.dest&&w.depart_on===r.depart_on&&!w.return_on&&w.nonstop===true&&Number(w.adults)===1;}
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
function requestParams(r){return {engine:'google_flights',departure_id:r.origin,arrival_id:r.dest,outbound_date:r.depart_on,type:2,stops:1,adults:1,travel_class:1,currency:'KRW',hl:'ko',gl:'kr',sort_by:2};}
function parseResponse(data,r,now=new Date()){
  const p=data.search_parameters||{};
  if(p.departure_id!==r.origin||p.arrival_id!==r.dest||p.outbound_date!==r.depart_on||Number(p.type)!==2||Number(p.stops)!==1||p.currency!=='KRW'||Number(p.adults??1)!==1||Number(p.travel_class??1)!==1)throw new Error('검색 조건 불일치: 저장하지 않았습니다.');
  if(data.error){
    if(/^Google hasn['’]t returned any results for this query\.?$/i.test(String(data.error).trim()))return {price:null,history:[]};
    throw new Error('Provider search error: '+String(data.error).slice(0,300));
  }
  const offers=[...(data.best_flights||[]),...(data.other_flights||[])].filter(o=>{
    if(!Array.isArray(o.flights)||o.flights.length!==1||(o.layovers||[]).length||!Number.isFinite(o.price)||o.price<=0)return false;
    const f=o.flights[0];return f.departure_airport?.id===r.origin&&f.arrival_airport?.id===r.dest&&String(f.departure_airport?.time||'').slice(0,10)===r.depart_on&&!(Number(f.stops)||Number(f.number_of_stops));
  }).sort((a,b)=>a.price-b.price);
  if(!offers.length)return {price:null,history:[]};
  const end=day(now),start=new Date(Date.parse(end+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);
  const history=[];
  for(const point of data.price_insights?.price_history||[]){
    if(!Array.isArray(point)||point.length!==2||!Number.isFinite(point[0])||!Number.isFinite(point[1])||point[1]<=0)continue;
    const timestamp=point[0]*1000;if(!Number.isFinite(timestamp)||timestamp>new Date(now).getTime())continue;
    const observed_at=new Date(timestamp).toISOString(),d=day(observed_at);
    if(d>=start&&d<=end)history.push({price:Math.round(point[1]),observed_at});
  }
  return {price:Math.round(offers[0].price),airline:offers[0].flights[0].airline||'',history};
}
globalThis.BaliFlights={MARKER,LIVE,HISTORY,airports,day,key,routes,matches,series,requestParams,parseResponse};
})();
