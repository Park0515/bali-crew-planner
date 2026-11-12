const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({URL,Date});
vm.runInContext(fs.readFileSync(path.join(root,'stay-url.js'),'utf8'),context);
const S=context.BaliStay;
const link='https://www.agoda.com/ko-kr/accom/property?propertyId=123456&checkIn=2027-09-22&los=6&adults=8&children=0&rooms=1&currencyCode=KRW&cid=tracking&ds=session&tag=campaign';
const c=S.parse(link);
const snapshot=()=>({propertyId:'123456',checkinText:'체크인 2027년 9월 22일 수요일',checkoutText:'체크아웃 2027년 9월 28일 화요일',occupancyText:'성인 8명 객실 1개',currencyText:'요금 표시(한국 원)',offers:['원래 요금: ₩ 326,452\n쿠폰 할인 ₩183,786\n₩295,821\n1박당 총 금액 ₩ 338,261\n세금 및 수수료 포함 요금']});

test('URL imports dates, eight adults and one room while removing tracking/session parameters',()=>{
  assert.equal(c.checkout,'2027-09-28');assert.equal(c.nights,6);assert.equal(c.adults,8);assert.equal(c.rooms,1);
  const clean=S.canonical(c);assert(!/tracking|session|campaign|cid=|ds=|tag=/.test(clean));
  assert.equal(S.key(S.parse(clean)),S.key(c));
});

test('only explicit tax-inclusive nightly amounts are extracted, never a base price or coupon',()=>{
  const result=S.extract(snapshot(),c);assert.equal(result.status,'ok');assert.equal(result.price,338261);assert.equal(result.basis,'nightly');
  assert.notEqual(result.price,295821);assert.notEqual(result.price,183786);assert.notEqual(result.price,338261*6);
  const missing=snapshot();missing.offers=['시작가 ₩295,821'];assert.equal(S.extract(missing,c).status,'unverified');
  const inclusive=snapshot();inclusive.offers=[{text:'원래 요금: ₩368,892 쿠폰 ₩183,786 적용됨 ₩338,261 ‎1박당 세금 및 제반요금 포함',finalPrice:'₩338,261'}];
  assert.equal(S.extract(inclusive,c).price,338261);
  inclusive.offers[0].text='₩338,261 1박당 세금 및 제반요금 불포함';assert.equal(S.extract(inclusive,c).status,'unverified');
});

test('wrong property, dates, occupancy or currency cannot become price records',()=>{
  for(const change of [s=>s.propertyId='999',s=>s.checkinText='2027년 9월 23일',s=>s.checkoutText='2027년 9월 27일',s=>s.occupancyText='성인 2명 객실 1개',s=>s.occupancyText='성인 8명 객실 2개',s=>s.currencyText='USD']){
    const value=snapshot();change(value);assert.equal(S.extract(value,c).status,'unverified');
  }
  assert.equal(S.extract({...snapshot(),blocked:true},c).status,'blocked');
  assert.equal(S.extract({...snapshot(),offers:[],noOffer:true},c).status,'no_offer');
});

test('URL safety and supported conditions are enforced before loading a page',()=>{
  for(const value of [link.replace('https:','http:'),link.replace('www.agoda.com','127.0.0.1'),link.replace('www.agoda.com','www.agoda.com.evil.example'),link.replace('www.agoda.com','user:password@www.agoda.com'),link.replace('rooms=1','rooms=2'),link.replace('children=0','children=1'),link.replace('currencyCode=KRW','currencyCode=USD'),link.replace('2027-09-22','2027-02-31')])assert.throws(()=>S.parse(value));
});

test('a changed date or occupancy creates a different history context',()=>{
  const original=S.fromWatch({url:link,checkin_on:'2027-09-22',checkout_on:'2027-09-28',adults:8,rooms:1});
  const changed=S.fromWatch({url:link,checkin_on:'2027-09-22',checkout_on:'2027-09-29',adults:8,rooms:1});
  assert.notEqual(S.key(original),S.key(changed));
});

test('URL import, quote unit isolation and existing flight forms work in the app',()=>{
  const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',innerHTML:'',textContent:'',classList:{toggle(){}}});return nodes.get(s);};
  const form={querySelector:selector=>node(selector)};
  const app=vm.createContext({URL,Date,window:{BALI_CONFIG:{},BaliStay:S},document:{querySelector:s=>s==='#watchForm'?form:node(s),querySelectorAll:()=>[]},localStorage:{getItem(){return null;}},console});
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/init\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/,'globalThis.testApi={state,fillStayFromUrl,quotesOf};\n})();');
  vm.runInContext(source,app);
  node('[name=kind]').value='stay';node('[name=url]').value=link;
  app.testApi.fillStayFromUrl(true);
  assert.equal(node('[name=checkin_on]').value,'2027-09-22');assert.equal(node('[name=checkout_on]').value,'2027-09-28');assert.equal(node('[name=adults]').value,8);assert.equal(node('[name=price_basis]').value,'nightly');
  app.testApi.state.data={watches:[{id:'w',url:link,kind:'stay',price_basis:'nightly'}],quotes:[
    {id:'total',watch_id:'w',price:2000000,price_basis:'total'},
    {id:'nightly',watch_id:'w',price:338261,price_basis:'nightly',context_key:S.key(c)},
    {id:'different-dates',watch_id:'w',price:300000,price_basis:'nightly',context_key:'other'}]};
  assert.equal(app.testApi.quotesOf('w').length,1);assert.equal(app.testApi.quotesOf('w')[0].id,'nightly');
});
