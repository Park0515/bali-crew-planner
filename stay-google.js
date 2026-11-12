/* Google Hotels conditions shared by the static site and SerpAPI collector. */
(()=>{'use strict';
const PROVIDER='Google Hotels · SerpAPI';
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function nameOf(label){return (String(label||'').match(/\(([^()]*[A-Za-z][^()]*)\)\s*$/)?.[1]||String(label||'')).trim();}
function fromWatch(w){
  let url;try{url=new URL(w.url);}catch{}
  const google=url&&url.protocol==='https:'&&['www.google.com','google.com','www.google.co.kr','google.co.kr'].includes(url.hostname)&&url.pathname.startsWith('/travel/');
  const name=(google?url.searchParams.get('q'):null)||nameOf(w.label);
  const token=google?(url.searchParams.get('property_token')||url.pathname.match(/\/entity\/([^/]+)/)?.[1]||''):'';
  if(!name||name.length>200)throw new Error('Google Hotels에 표시된 정확한 숙소명을 입력해 주세요.');
  if(token&&!/^[A-Za-z0-9_-]{5,500}$/.test(token))throw new Error('Google Hotels 숙소 주소를 확인해 주세요.');
  const checkin=w.checkin_on,checkout=w.checkout_on,adults=Number(w.adults||1),rooms=Number(w.rooms||1);
  if(!validDate(checkin)||!validDate(checkout)||checkout<=checkin)throw new Error('체크인·체크아웃 날짜를 확인해 주세요.');
  if(!Number.isInteger(adults)||adults<1||adults>9||rooms!==1)throw new Error('Google Hotels 자동 조회는 성인 1~9명, 객실 또는 빌라 1개를 지원합니다.');
  return {name,token,checkin,checkout,adults,rooms,nights:(Date.parse(checkout)-Date.parse(checkin))/86400000};
}
function canonical(c){
  const u=new URL('https://www.google.com/travel/hotels');
  u.searchParams.set('q',c.name);u.searchParams.set('hl','ko');u.searchParams.set('gl','kr');u.searchParams.set('curr','KRW');
  if(c.token)u.searchParams.set('property_token',c.token);
  return u.href;
}
const managed=w=>w.kind==='stay'&&String(w.provider||'').startsWith('Google Hotels');
const key=c=>['google_hotels_v1',c.token||normalize(c.name),c.checkin,c.checkout,c.adults,c.rooms,'KRW','nightly_display'].join('|');
function requestParams(c){return {engine:'google_hotels',...(c.token?{property_token:c.token}:{q:c.name+' Bali'}),check_in_date:c.checkin,check_out_date:c.checkout,adults:c.adults,children:0,currency:'KRW',gl:'kr',hl:'en'};}
function parseResponse(data,c){
  const p=data.search_parameters||{};
  for(const [k,v]of Object.entries(requestParams(c)))if(String(p[k])!==String(v))throw new Error('Google Hotels response conditions do not match');
  if(data.search_metadata?.status==='Error'||data.error){
    if(/hasn't returned any results|no results|no matching results/i.test(data.error||''))return {status:'no_offer'};
    throw new Error('Google Hotels provider error');
  }
  let property;
  if(data.property_token&&data.name){
    if(c.token?data.property_token!==c.token:normalize(data.name)!==normalize(c.name))return {status:'unverified'};
    property=data;
  }else{
    const matches=(data.properties||[]).filter(x=>c.token?x.property_token===c.token:normalize(x.name)===normalize(c.name));
    if(matches.length!==1)return {status:(data.properties||[]).length?'unverified':'no_offer'};
    property=matches[0];
  }
  const eligible=x=>x.num_guests==null||Number(x.num_guests)===c.adults;
  const candidates=property.prices?.length?property.prices:[property];
  const rates=candidates.filter(eligible).map(x=>{
    const r=x.rate_per_night||{},raw=r.extracted_display_price??r.extracted_lowest;
    if(typeof raw!=='number'||!Number.isFinite(raw)||raw<=0)return null;
    const tax=r.extracted_after_taxes_fees===raw?'세금·수수료 포함':r.extracted_before_taxes_fees===raw?'세금·수수료 별도':'세금 포함 여부 미확인';
    return {price:Math.round(raw),tax,source:String(x.source||'Google Hotels 최저 표시가').slice(0,80)};
  }).filter(Boolean).sort((a,b)=>a.price-b.price);
  if(!rates.length)return {status:'no_offer',token:property.property_token};
  return {status:'ok',...rates[0],token:property.property_token,basis:'nightly'};
}
globalThis.BaliGoogleHotels={PROVIDER,normalize,nameOf,fromWatch,canonical,managed,key,requestParams,parseResponse};
})();
