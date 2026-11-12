import {chromium} from 'playwright';
import '../stay-url.js';
const S=globalThis.BaliStay;
const root=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,''),secret=String(process.env.SUPABASE_SECRET_KEY||'').trim();
if(!root.startsWith('https://')||!secret)throw new Error('Configure SUPABASE_URL and server SUPABASE_SECRET_KEY');
if(secret.startsWith('sb_publishable_'))throw new Error('A server Secret key is required');
const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
async function db(path,{method='GET',body,prefer}={}){
  const headers={apikey:secret,'Content-Type':'application/json'};
  if(secret.startsWith('eyJ'))headers.Authorization=`Bearer ${secret}`;
  if(prefer)headers.Prefer=prefer;
  const response=await fetch(root+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Supabase HTTP ${response.status}: ${path.split('?')[0]}`);
  const text=await response.text();return text?JSON.parse(text):null;
}
async function readPage(browser,c){
  // A clean, signed-out browser; no cookies, account credentials, proxies or challenge bypass.
  const context=await browser.newContext({locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1440,height:1000}});
  try{
    const page=await context.newPage();
    const response=await page.goto(S.canonical(c),{waitUntil:'domcontentloaded',timeout:60000});
    if([401,403,429].includes(response?.status()))return {status:'blocked'};
    if(!response?.ok())return {status:'error'};
    // Agoda can override URL currency with the visitor region. Use its public
    // currency picker, then still require KRW and explicit tax-inclusive prices.
    const currency=page.getByRole('button',{name:/요금 표시/}).first();
    await currency.waitFor({state:'visible',timeout:30000}).catch(()=>{});
    if(await currency.count()&&!/한국\s*원/.test(await currency.getAttribute('aria-label')||'')){
      await currency.click();
      await page.getByRole('dialog',{name:'가격 및 통화 선택'}).getByRole('option',{name:'₩ 한국 원',exact:true}).first().click();
      await page.getByRole('button',{name:'요금 표시(한국 원)',exact:true}).waitFor({state:'visible',timeout:30000});
    }
    await currency.click();
    const picker=page.getByRole('dialog',{name:'가격 및 통화 선택'});
    const inclusive=picker.getByRole('checkbox',{name:'1박당 요금(세금 및 봉사료 포함)',exact:true});
    if(await inclusive.getAttribute('aria-checked')!=='true')await inclusive.click();
    else await picker.getByRole('button',{name:'close',exact:true}).click();
    // The rate preference reloads the page. The Rooms tab activates its lazy
    // rate grid; scrolling an empty placeholder alone does not always do so.
    await page.getByRole('link',{name:'객실',exact:true}).first().click({timeout:30000});
    await page.locator('#property-room-grid-root').waitFor({state:'attached',timeout:45000}).catch(()=>{});
    if(await page.locator('#property-room-grid-root').count())await page.locator('#property-room-grid-root').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{
      const text=document.body.innerText;
      return [...document.querySelectorAll('[data-testid="offer-price"]')].some(el=>/1박당\s*(?:총\s*금액|세금\s*및\s*제반요금\s*포함)/.test(el.innerText))||/선택하신 날짜에 이용 가능한 객실이 없습니다|선택하신 날짜에는 예약 가능한 객실이 없습니다|verify you are human|access denied|로봇이 아님을|보안 확인/i.test(text);
    },null,{timeout:45000}).catch(()=>{});
    const body=await page.locator('body').innerText();
    const blocked=/verify you are human|access denied|로봇이 아님을|보안 확인/i.test(body)||/captcha|challenge/i.test(new URL(page.url()).pathname);
    if(blocked)return {status:'blocked'};
    const finalUrl=new URL(page.url());
    const text=async selector=>{const el=page.locator(selector).first();return await el.count()?await el.getAttribute('aria-label')||await el.innerText():'';};
    const snapshot={
      propertyId:finalUrl.searchParams.get('propertyId'),
      checkinText:await text('#check-in-box'),checkoutText:await text('#check-out-box'),occupancyText:await text('#occupancy-box'),
      currencyText:await page.getByRole('button',{name:/요금 표시/}).first().getAttribute('aria-label').catch(()=>''),
      offers:await page.locator('#property-room-grid-root [data-testid="room-offer"] [data-testid="offer-price"]').evaluateAll(nodes=>nodes.map(el=>({text:el.innerText,finalPrice:el.querySelector('[data-testid="room-offer-final-price"]')?.innerText||''}))),
      noOffer:/선택하신 날짜에 이용 가능한 객실이 없습니다|선택하신 날짜에는 예약 가능한 객실이 없습니다/.test(body)
    };
    const result=S.extract(snapshot,c);
    if(result.status==='unverified')console.log('Public offer labels: '+JSON.stringify(snapshot.offers.slice(0,2)));
    const diagnostics=result.status==='unverified'?{reason:result.reason,offerBlocks:snapshot.offers.length,currencyLabel:snapshot.currencyText,checkinPresent:!!snapshot.checkinText,checkoutPresent:!!snapshot.checkoutText,occupancyPresent:!!snapshot.occupancyText,nightlyLabelPresent:/1박당\s*총\s*금액/.test(body),priceSelectors:await page.locator('[data-testid],[data-selenium]').evaluateAll(nodes=>[...new Set(nodes.flatMap(el=>[el.getAttribute('data-testid'),el.getAttribute('data-selenium')]).filter(v=>v&&/price|room-offer/i.test(v)))].slice(0,20))}:null;
    return {...result,diagnostics,title:await page.locator('h1').first().innerText().catch(()=>'')};
  }finally{await context.close();}
}
async function main(){
  // Check setup before visiting any booking page.
  await db('watch_items?select=price_basis&limit=0');
  await db('stay_price_checks?select=id&limit=0');
  await db('price_quotes?select=price_basis,context_key&limit=0');
  const trips=await db('trips?select=id');if(trips.length!==1)throw new Error('Exactly one Bali trip is required');
  const trip=trips[0];
  let watches=await db(`watch_items?trip_id=eq.${trip.id}&kind=eq.stay&select=*`);
  if(process.env.STAY_URL_TO_REGISTER){
    const c=S.parse(process.env.STAY_URL_TO_REGISTER);
    const existing=watches.find(w=>{try{return w.price_basis===S.BASIS&&S.key(S.fromWatch(w))===S.key(c);}catch{return false;}});
    if(!existing){
      await db('watch_items',{method:'POST',body:{trip_id:trip.id,kind:'stay',label:'Agoda 숙소 '+c.propertyId,provider:'Agoda URL',url:S.canonical(c),checkin_on:c.checkin,checkout_on:c.checkout,adults:c.adults,rooms:c.rooms,price_basis:S.BASIS,currency:'KRW',is_active:true}});
      watches=await db(`watch_items?trip_id=eq.${trip.id}&kind=eq.stay&select=*`);
    }else if(existing.url!==S.canonical(c))await db('watch_items?id=eq.'+existing.id,{method:'PATCH',body:{url:S.canonical(c)}});
    watches=await db(`watch_items?trip_id=eq.${trip.id}&kind=eq.stay&select=*`);
  }
  const candidates=watches.filter(w=>w.is_active&&w.price_basis===S.BASIS&&w.checkin_on>=today&&w.url);
  if(candidates.length>10)throw new Error('More than 10 stay pages: review collection scope');
  if(!candidates.length){console.log('No registered URL stay candidates');return;}
  const browser=await chromium.launch({headless:true});let failures=0;
  try{for(const w of candidates){
    let c;try{c=S.fromWatch(w);}catch{continue;}
    const contextKey=S.key(c);
    let rows=await db('stay_price_checks?on_conflict=watch_id,context_key,checked_on',{method:'POST',prefer:'resolution=ignore-duplicates,return=representation',body:{trip_id:trip.id,watch_id:w.id,context_key:contextKey,checked_on:today}});
    if(!rows?.length&&process.env.RETRY_FAILED==='true'){
      const previous=await db(`stay_price_checks?watch_id=eq.${w.id}&context_key=eq.${encodeURIComponent(contextKey)}&checked_on=eq.${today}&status=in.(error,unverified)&select=id`);
      if(previous.length)rows=await db(`stay_price_checks?id=eq.${previous[0].id}&status=in.(error,unverified)`,{method:'PATCH',prefer:'return=representation',body:{status:'pending'}});
    }
    if(!rows?.length){console.log(`stay ${w.id}: already checked today`);continue;}
    let result;
    try{result=await readPage(browser,c);}catch(error){result={status:'error'};console.log('Page read error: '+String(error.message||'').split('\n')[0].replace(/https?:\/\/\S+/g,'[page]'));}
    if(result.status==='ok'){
      await db('price_quotes',{method:'POST',body:{trip_id:trip.id,watch_id:w.id,price:result.price,price_basis:S.BASIS,context_key:contextKey,currency:'KRW',provider:S.PROVIDER,observed_at:new Date().toISOString(),summary:`${c.checkin}~${c.checkout} ${c.nights}박 · 성인 ${c.adults}명 · 객실 ${c.rooms}개 · 비로그인 공개 페이지의 세금·수수료 포함 1박 표시 요금. 객실·취소·쿠폰 조건은 예약처 확인.`}});
      if(w.label==='Agoda 숙소 '+c.propertyId&&result.title)await db('watch_items?id=eq.'+w.id,{method:'PATCH',body:{label:result.title.slice(0,100)}});
    }
    await db('stay_price_checks?id=eq.'+rows[0].id,{method:'PATCH',body:{status:result.status,checked_at:new Date().toISOString()}});
    console.log(`stay ${w.id}: ${result.status}${result.status==='ok'?' (tax-inclusive nightly KRW saved)':''}`);
    if(result.diagnostics)console.log('Visible page checks: '+JSON.stringify(result.diagnostics));
    if(result.status==='error')failures++;
  }}finally{await browser.close();}
  if(failures)process.exitCode=1;
}
main().catch(error=>{console.error(error.message?.startsWith('Supabase HTTP')?error.message:'Stay URL collection failed; review setup and registered conditions');process.exitCode=1;});
