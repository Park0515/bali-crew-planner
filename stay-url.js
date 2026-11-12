/* URL conditions and observed price parsing. No private credentials. */
(()=>{'use strict';
const BASIS='nightly',PROVIDER='Agoda URL · 세금포함 1박';
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
function integer(value,name,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(name+' 값을 확인해 주세요.');return n;}
function parse(value){
  const url=new URL(String(value).trim());
  if(url.protocol!=='https:'||!['www.agoda.com','agoda.com'].includes(url.hostname)||url.port||url.username||url.password)throw new Error('현재 자동 조회는 Agoda의 HTTPS 숙소 주소를 지원합니다.');
  if(!url.pathname.match(/^\/(?:[a-z]{2}-[a-z]{2}\/)?accom\/property\/?$/i))throw new Error('Agoda 숙소 상세 주소(accom/property)를 입력해 주세요.');
  const p=url.searchParams,propertyId=p.get('propertyId');if(!/^\d{1,12}$/.test(propertyId||''))throw new Error('숙소 ID가 포함된 Agoda 주소가 필요합니다.');
  const checkin=p.get('checkIn');if(!validDate(checkin))throw new Error('URL의 체크인 날짜를 확인해 주세요.');
  const nights=integer(p.get('los'),'숙박 수',1,92),adults=integer(p.get('adults'),'성인 인원',1,9),rooms=integer(p.get('rooms'),'객실 수 (현재 URL 자동 조회는 1개 지원)',1,1);
  if(Number(p.get('children')||0)!==0)throw new Error('현재 URL 자동 조회는 성인만 포함한 조건을 지원합니다.');
  if(p.get('currencyCode')&&p.get('currencyCode')!=='KRW')throw new Error('원화(KRW)로 설정한 주소를 입력해 주세요.');
  const checkout=new Date(Date.parse(checkin+'T00:00:00Z')+nights*86400000).toISOString().slice(0,10);
  return {propertyId,checkin,checkout,nights,adults,rooms,basis:BASIS};
}
function canonical(c){
  if(!validDate(c.checkin)||!validDate(c.checkout)||c.checkout<=c.checkin)throw new Error('체크인·체크아웃 날짜를 확인해 주세요.');
  const nights=(Date.parse(c.checkout)-Date.parse(c.checkin))/86400000;
  const url=new URL('https://www.agoda.com/ko-kr/accom/property');
  for(const [k,v] of Object.entries({propertyId:c.propertyId,checkIn:c.checkin,los:nights,adults:c.adults,children:0,rooms:c.rooms,currencyCode:'KRW',finalPriceView:1,isShowMobileAppPrice:false}))url.searchParams.set(k,String(v));
  parse(url.href);return url.href;
}
function fromWatch(w){const c=parse(w.url);if(w.checkin_on)c.checkin=w.checkin_on;if(w.checkout_on)c.checkout=w.checkout_on;if(w.adults)c.adults=Number(w.adults);if(w.rooms)c.rooms=Number(w.rooms);return parse(canonical(c));}
const key=c=>['agoda',c.propertyId,c.checkin,c.checkout,c.adults,c.rooms,'KRW',BASIS].join('|');
function extract(snapshot,c){
  const compact=s=>String(s||'').replace(/\s+/g,'');
  if(snapshot.blocked)return {status:'blocked'};
  if(snapshot.propertyId!==c.propertyId)return {status:'unverified'};
  if(!/한국\s*원|KRW/.test(snapshot.currencyText||''))return {status:'unverified'};
  const dateLabel=d=>{const [y,m,day]=d.split('-').map(Number);return `${y}년${m}월${day}일`;};
  if(!compact(snapshot.checkinText).includes(dateLabel(c.checkin))||!compact(snapshot.checkoutText).includes(dateLabel(c.checkout))||!compact(snapshot.occupancyText).includes(`성인${c.adults}명`)||!compact(snapshot.occupancyText).includes(`객실${c.rooms}개`))return {status:'unverified'};
  const prices=[];
  for(const text of snapshot.offers||[]){
    // Only the explicit tax-inclusive per-night amount; ignore base, crossed-out and coupon values.
    if(!/세금\s*및\s*수수료\s*포함/.test(text)||/세금\s*및\s*수수료\s*(?:별도|미포함|불포함)/.test(text))continue;
    const match=text.match(/1박당\s*총\s*금액\s*[₩￦]\s*([\d,]+)/);
    const amount=match?Number(match[1].replaceAll(',','')):NaN;
    if(Number.isSafeInteger(amount)&&amount>0)prices.push(amount);
  }
  if(!prices.length)return {status:snapshot.noOffer?'no_offer':'unverified'};
  return {status:'ok',price:Math.min(...prices),basis:BASIS,provider:PROVIDER};
}
globalThis.BaliStay={BASIS,PROVIDER,parse,canonical,fromWatch,key,extract};
})();
