import '../flight-trends.js';
const F=globalThis.BaliFlights;
const required=['SUPABASE_URL','SUPABASE_SECRET_KEY','SERPAPI_API_KEY'];
for(const name of required)if(!process.env[name])throw new Error(`Missing GitHub Secret: ${name}`);
const root=process.env.SUPABASE_URL.trim().replace(/\/$/,''),secret=process.env.SUPABASE_SECRET_KEY.trim();
if(!root.startsWith('https://'))throw new Error('SUPABASE_URL must use HTTPS');
if(secret.startsWith('sb_publishable_'))throw new Error('SUPABASE_SECRET_KEY contains a publishable key. Replace it with the project server Secret key (sb_secret_...).');
if(secret.startsWith('eyJ')){
  let role;try{role=JSON.parse(Buffer.from(secret.split('.')[1],'base64url').toString()).role;}catch{}
  if(role!=='service_role')throw new Error('SUPABASE_SECRET_KEY is not a service_role key. Use the project server Secret key (sb_secret_...).');
}else if(!secret.startsWith('sb_secret_'))throw new Error('SUPABASE_SECRET_KEY has an unexpected format. Copy only the project server Secret key value (sb_secret_...).');
const now=new Date(),today=F.day(now);
async function db(path,{method='GET',body,prefer}={}){
  const headers={apikey:secret,'Content-Type':'application/json'};
  if(secret.startsWith('eyJ'))headers.Authorization=`Bearer ${secret}`;
  if(prefer)headers.Prefer=prefer;
  const res=await fetch(root+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!res.ok){
    if(res.status===401)throw new Error('Supabase HTTP 401: server key was rejected. Replace SUPABASE_SECRET_KEY with an active Secret key from the same project as SUPABASE_URL.');
    if(res.status===403)throw new Error(`Supabase HTTP 403: server role has no access to ${path.split('?')[0]}. Confirm the SQL setup and grants.`);
    throw new Error(`Supabase HTTP ${res.status}: ${path.split('?')[0]}`);
  }
  const text=await res.text();return text?JSON.parse(text):null;
}
async function collect(trip,r,w){
  // Claim before the external request, including failed/empty searches. No same-day retry.
  let claimed=await db('flight_price_checks?on_conflict=watch_id,checked_on',{method:'POST',body:{trip_id:trip.id,watch_id:w.id,checked_on:today},prefer:'resolution=ignore-duplicates,return=representation'});
  if(!claimed?.length&&process.env.RETRY_FAILED==='true'){
    const failed=await db(`flight_price_checks?watch_id=eq.${w.id}&checked_on=eq.${today}&status=eq.error&select=id`);
    if(failed.length)claimed=await db(`flight_price_checks?id=eq.${failed[0].id}&status=eq.error`,{method:'PATCH',body:{status:'pending'},prefer:'return=representation'});
  }
  if(!claimed?.length){console.log(`${r.key}: already attempted today`);return;}
  const finish=status=>db('flight_price_checks?id=eq.'+encodeURIComponent(claimed[0].id),{method:'PATCH',body:{status,checked_at:new Date().toISOString()}});
  try{
    async function search(params){
    const url=new URL('https://serpapi.com/search.json');
    for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
    url.searchParams.set('api_key',process.env.SERPAPI_API_KEY);
    // Do not log this URL or raw provider error bodies: they can contain credentials.
    const res=await fetch(url,{signal:AbortSignal.timeout(120000)});
    if(!res.ok)throw new Error(`SerpAPI HTTP ${res.status}`);
    return res.json();
    }
    const params=F.requestParams(r);
    const outbound=F.parseResponse(await search(params),r);
    if(outbound.price===null){await finish('no_direct');console.log(`${r.key}: no matching nonstop round-trip offer`);return;}
    const result=F.parseResponse(await search({...params,departure_token:outbound.departureToken}),r,'inbound',outbound.departureToken);
    if(result.price===null){await finish('no_direct');console.log(`${r.key}: no matching nonstop return for selected round-trip offer`);return;}
    const existing=await db(`price_quotes?watch_id=eq.${encodeURIComponent(w.id)}&observed_at=gte.${encodeURIComponent(new Date(now.getTime()-31*86400000).toISOString())}&select=provider,observed_at`);
    const seen=new Set(existing.map(q=>q.provider+'|'+F.day(q.observed_at)));
    const quotes=[];
    const add=(provider,price,observed_at,summary)=>{const key=provider+'|'+F.day(observed_at);if(seen.has(key))return;seen.add(key);quotes.push({trip_id:trip.id,watch_id:w.id,provider,price,currency:'KRW',observed_at,summary});};
    add(F.LIVE,result.price,new Date().toISOString(),`왕복 총액 · 양방향 직항 · 일반석 성인 1명 · ${r.origin}↔${r.dest} ${r.depart_on}~${r.return_on} · 출국 ${outbound.airline} / 귀국 ${result.airline} · 수하물/취소 조건은 예약처 확인`);
    // Do not backfill provider history: historical flight segments cannot be verified as nonstop.
    if(quotes.length)await db('price_quotes',{method:'POST',body:quotes});
    await finish('ok');console.log(`${r.key}: saved ${quotes.length} observations`);
  }catch(error){
    await finish('error');
    let message=String(error.message||'Unknown error');
    for(const name of required)message=message.split(process.env[name]).join('[redacted]');
    message=message.replace(/api_key=[^&\s]+/gi,'api_key=[redacted]').replace(/https?:\/\/\S+/g,'[URL redacted]');
    console.error(`${r.key}: collection failed (${message.slice(0,300)})`);
    throw new Error('Flight collection failed');
  }
}
async function main(){
  const trips=await db('trips?select=id');if(trips.length!==1)throw new Error('Exactly one Bali trip is required');
  const trip=trips[0],members=await db(`trip_members?trip_id=eq.${trip.id}&select=starts_on,ends_on`);
  const routes=F.routes(members).filter(r=>r.depart_on>=today);
  if(routes.length*2>8)throw new Error('Round-trip verification would exceed 8 daily API requests: review free-tier budget before enabling');
  if(!routes.length){console.log('No upcoming member dates configured');return;}
  // Check migration before making any external paid/quota-limited request.
  await db('flight_price_checks?select=id&limit=1');
  const watches=await db(`watch_items?trip_id=eq.${trip.id}&select=*`);
  const keys=new Set(routes.map(F.key));
  for(const w of watches.filter(w=>String(w.note||'').startsWith('AUTO_DIRECT_FLIGHT_')&&(w.note!==F.MARKER||!keys.has(F.key(w)))))await db('watch_items?id=eq.'+w.id,{method:'PATCH',body:{is_active:false}});
  let errors=0;
  for(const r of routes){
    const matches=watches.filter(w=>F.matches(w,r));if(matches.length>1)throw new Error('Duplicate managed watch items');
    let w=matches[0];
    if(!w){[w]=await db('watch_items',{method:'POST',prefer:'return=representation',body:{trip_id:trip.id,kind:'flight',label:r.label,provider:'Google Flights · SerpAPI',origin:r.origin,dest:r.dest,depart_on:r.depart_on,return_on:r.return_on,nonstop:true,adults:1,rooms:1,currency:'KRW',is_active:true,note:F.MARKER}});}
    else if(!w.is_active)await db('watch_items?id=eq.'+w.id,{method:'PATCH',body:{is_active:true}});
    try{await collect(trip,r,w);}catch{errors++;}
  }
  if(errors)process.exitCode=1;
}
export const completed=main().catch(error=>{console.error(error.message);process.exitCode=1;});
