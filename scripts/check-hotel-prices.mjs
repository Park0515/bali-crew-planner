import '../stay-google.js';
import '../flight-trends.js';
const G=globalThis.BaliGoogleHotels,F=globalThis.BaliFlights;
for(const name of ['SUPABASE_URL','SUPABASE_SECRET_KEY','SERPAPI_API_KEY'])if(!process.env[name])throw new Error('Missing Secret: '+name);
const root=process.env.SUPABASE_URL.trim().replace(/\/$/,''),secret=process.env.SUPABASE_SECRET_KEY.trim();
if(!root.startsWith('https://')||secret.startsWith('sb_publishable_'))throw new Error('A server Supabase Secret key is required');
const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
async function db(path,{method='GET',body,prefer}={}){
  const headers={apikey:secret,'Content-Type':'application/json'};
  if(secret.startsWith('eyJ'))headers.Authorization='Bearer '+secret;
  if(prefer)headers.Prefer=prefer;
  const res=await fetch(root+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new Error('Supabase HTTP '+res.status);
  const text=await res.text();return text?JSON.parse(text):null;
}
async function search(c){
  const url=new URL('https://serpapi.com/search.json');
  for(const [k,v]of Object.entries(G.requestParams(c)))url.searchParams.set(k,String(v));
  url.searchParams.set('api_key',process.env.SERPAPI_API_KEY);
  const res=await fetch(url,{signal:AbortSignal.timeout(120000)});
  if(!res.ok){
    const body=await res.json().catch(()=>({})),message=String(body.error||'');
    const field=/adults/i.test(message)?'adults':/check_in|check_out|date/i.test(message)?'dates':/query|\bq\b/i.test(message)?'query':'other';
    const range=message.match(/between\s+(\d{1,2})\s+and\s+(\d{1,2})/i);
    let safe=message;
    for(const value of [root,secret,process.env.SERPAPI_API_KEY,c.name,...Object.values(G.requestParams(c)).filter(v=>typeof v==='string'&&v.length>2)])safe=safe.split(value).join('[redacted]');
    safe=safe.replace(/https?:\/\/\S+/g,'[URL]').replace(/api_key[=:]\s*[^&\s]+/gi,'api_key=[redacted]').replace(/[A-Za-z0-9_-]{30,}/g,'[token]').split('\n')[0].slice(0,250);
    throw new Error('SerpAPI HTTP '+res.status+' parameter='+field+(range?' allowed='+range[1]+'..'+range[2]:'')+' '+safe);
  }
  return G.parseResponse(await res.json(),c);
}
async function main(){
  await db('watch_items?select=price_basis&limit=0');await db('stay_price_checks?select=id&limit=0');
  const trips=await db('trips?select=id');if(trips.length!==1)throw new Error('Exactly one Bali trip is required');
  const trip=trips[0],watches=await db(`watch_items?trip_id=eq.${trip.id}&kind=eq.stay&select=*`);
  for(const w of watches.filter(w=>w.is_active&&w.provider==='Agoda URL')){
    const c=G.fromWatch({...w,adults:2,rooms:1}),patch={provider:G.PROVIDER,url:G.canonical(c),adults:2,rooms:1,price_basis:'nightly',target_price:null,amadeus_hotel_id:null};
    await db('watch_items?id=eq.'+w.id,{method:'PATCH',body:patch});Object.assign(w,patch);
  }
  for(const w of watches.filter(w=>w.is_active&&G.managed(w)&&w.adults>6)){
    await db('watch_items?id=eq.'+w.id,{method:'PATCH',body:{adults:2,rooms:1}});Object.assign(w,{adults:2,rooms:1});
  }
  const candidates=watches.filter(w=>w.is_active&&G.managed(w)&&w.checkin_on>=today);
  const members=await db(`trip_members?trip_id=eq.${trip.id}&select=starts_on,ends_on`);
  const flightCalls=F.routes(members).filter(r=>r.depart_on>=today).length*2;
  if(candidates.length>2||flightCalls+candidates.length>8)throw new Error('Daily SerpAPI free-plan budget exceeded: reduce active hotels or flight date combinations');
  let errors=0;
  for(const w of candidates){
    let c;try{c=G.fromWatch(w);}catch{console.log('Stay skipped: invalid conditions');continue;}
    const contextKey=G.key(c);
    let rows=await db('stay_price_checks?on_conflict=watch_id,context_key,checked_on',{method:'POST',prefer:'resolution=ignore-duplicates,return=representation',body:{trip_id:trip.id,watch_id:w.id,context_key:contextKey,checked_on:today}});
    if(!rows?.length&&process.env.RETRY_FAILED==='true'){
      const old=await db(`stay_price_checks?watch_id=eq.${w.id}&context_key=eq.${encodeURIComponent(contextKey)}&checked_on=eq.${today}&status=eq.error&select=id`);
      if(old.length)rows=await db(`stay_price_checks?id=eq.${old[0].id}&status=eq.error`,{method:'PATCH',prefer:'return=representation',body:{status:'pending'}});
    }
    if(!rows?.length){console.log('Stay already checked today');continue;}
    let status='error';
    try{
      const result=await search(c);status=result.status;
      if(status==='ok'){
        await db('price_quotes',{method:'POST',body:{trip_id:trip.id,watch_id:w.id,price:result.price,price_basis:'nightly',context_key:contextKey,currency:'KRW',provider:G.PROVIDER,observed_at:new Date().toISOString(),summary:`참고 시세 · Google Hotels 표시 1박 요금 · ${result.tax} · ${result.source} · ${c.checkin}~${c.checkout} · 조회 성인 ${c.adults}명 · 객실/빌라 1개 (8명 전체 예약 금액 아님). 예약 직전 공급처 최종 금액 확인.`}});
        if(c.token&&w.label==='Google Hotels 숙소'&&result.name)await db('watch_items?id=eq.'+w.id,{method:'PATCH',body:{label:result.name}});
      }
    }catch(error){errors++;console.error(/^(SerpAPI HTTP|Supabase HTTP|Google Hotels)/.test(error.message)?error.message:'Hotel collection failed');}
    await db('stay_price_checks?id=eq.'+rows[0].id,{method:'PATCH',body:{status,checked_at:new Date().toISOString()}});
    console.log('Google Hotels check: '+status+(status==='ok'?' (nightly observation saved)':''));
  }
  if(errors)process.exitCode=1;
}
export const completed=main().catch(error=>{console.error(error.message);process.exitCode=1;});
