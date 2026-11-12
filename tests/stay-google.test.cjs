const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),context=vm.createContext({URL,Date,atob});
vm.runInContext(fs.readFileSync(path.join(root,'stay-google.js'),'utf8'),context);
const G=context.BaliGoogleHotels;
const watch={id:'hotel',kind:'stay',label:'Fixture Villa',provider:G.PROVIDER,checkin_on:'2027-09-22',checkout_on:'2027-09-28',adults:2,rooms:1,price_basis:'nightly'};
const c=G.fromWatch(watch);
function response(){return {search_parameters:G.requestParams(c),properties:[{name:'Fixture Villa',property_token:'token_fixture',rate_per_night:{extracted_display_price:290000,extracted_before_taxes_fees:290000,extracted_after_taxes_fees:330000},total_rate:{extracted_lowest:1980000}}]};}
test('Google Hotels requests exact dates, two reference adults and KRW, and keeps display price separate from total and tax',()=>{
  const p=G.requestParams(c);assert.equal(p.adults,2);assert.equal(p.currency,'KRW');assert.equal(p.check_out_date,'2027-09-28');assert(!('rooms'in p));
  const r=G.parseResponse(response(),c);assert.equal(r.price,290000);assert.equal(r.tax,'세금·수수료 별도');assert.equal(r.basis,'nightly');
});
test('other hotels, ambiguous names, mismatched guests or response conditions cannot become a price',()=>{
  let data=response();data.properties[0].name='Other Villa';assert.equal(G.parseResponse(data,c).status,'unverified');
  data=response();data.properties.push(data.properties[0]);assert.equal(G.parseResponse(data,c).status,'unverified');
  data=response();data.search_parameters.adults=6;assert.throws(()=>G.parseResponse(data,c));
  data=response();data.properties[0].prices=[{num_guests:1,rate_per_night:{extracted_lowest:10000}}];assert.equal(G.parseResponse(data,c).status,'no_offer');
  data=response();data.properties[0].rate_per_night={};assert.equal(G.parseResponse(data,c).status,'no_offer');
  assert.throws(()=>G.fromWatch({...watch,rooms:4}));assert.throws(()=>G.fromWatch({...watch,adults:8}));
});
test('Google identity, dates and people isolate histories from Agoda and other properties',()=>{
  assert.match(G.key(c),/^google_hotels_v1\|/);
  assert.notEqual(G.key(c),G.key({...c,adults:7}));assert.notEqual(G.key(c),G.key({...c,checkout:'2027-09-29'}));
  assert.notEqual(G.key({...c,token:'token_one'}),G.key({...c,token:'token_two'}));
  assert.equal(G.fromWatch({...watch,url:G.canonical(c)}).name,c.name);
  assert.equal(G.nameOf('숙소 이름 (Fixture Villa)'),'Fixture Villa');
});
test('a Google Hotels link supplies the property key and embedded dates without a typed hotel name',()=>{
  const imported=G.fromLink('https://www.google.com/travel/hotels/entity/fixture_token/prices?check_in_date=2027-09-22&check_out_date=2027-09-28');
  assert.equal(imported.token,'fixture_token');assert.equal(imported.adults,2);assert.equal(imported.name,'Google Hotels 숙소');
  const p=G.requestParams(imported);assert.equal(p.property_token,'fixture_token');assert(!('q'in p));
  assert.equal(G.parseResponse({search_parameters:p,name:'Actual hotel name',property_token:'fixture_token',rate_per_night:{extracted_lowest:123000}},imported).price,123000);
  const other=G.parseResponse({search_parameters:p,name:'Other hotel',property_token:'other_token'},imported);assert.equal(other.status,'unverified');
  const dates=G.decodeDates('CAEaIAoCGgASGhIUCgcI6g8QBxgMEgcI6g8QBxgOGAIyAggBKgkKBToDSU5SGgA');
  assert.equal(dates.checkin,'2026-07-12');assert.equal(dates.checkout,'2026-07-14');
  assert.equal(Object.keys(G.decodeDates('malformed')).length,0);
  assert.throws(()=>G.fromLink('https://google.com.evil.example/travel/hotels/entity/fixture_token'));
});
test('Google Hotels UI filters old Agoda quotes and displays the current quote tax basis',()=>{
  const app=vm.createContext({URL,Date,window:{BALI_CONFIG:{},BaliGoogleHotels:G},document:{},localStorage:{getItem(){return null;}},console});
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/init\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/,'globalThis.testApi={state,quotesOf,watchCard};\n})();');vm.runInContext(source,app);
  app.testApi.state.data={watches:[watch],quotes:[{watch_id:'hotel',price:390000,price_basis:'nightly',context_key:'agoda|old'}, {watch_id:'hotel',price:290000,price_basis:'nightly',context_key:G.key(c),summary:'세금·수수료 별도',observed_at:new Date().toISOString()}]};
  assert.equal(app.testApi.quotesOf('hotel').length,1);const html=app.testApi.watchCard(watch);assert(html.includes('Google 표시 1박'));assert(html.includes('세금·수수료 별도'));assert(!html.includes('390,000'));
});
test('collector migrates Agoda, makes one API request, saves one quote and skips a same-day rerun',()=>{
  const url=require('node:url').pathToFileURL(path.join(root,'scripts/check-hotel-prices.mjs')).href;
  const code=`
    import assert from 'node:assert/strict';
    process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_fixture';process.env.SERPAPI_API_KEY='fixture_key';
    const watches=[${JSON.stringify({...watch,provider:'Agoda URL',is_active:true,url:'https://www.agoda.com/ko-kr/accom/property?propertyId=123'})}],ledger=[],quotes=[];let searches=0;
    globalThis.fetch=async(input,options={})=>{
      const u=new URL(input),method=options.method||'GET',body=options.body?JSON.parse(options.body):null,json=x=>new Response(JSON.stringify(x));
      if(u.hostname==='serpapi.com'){searches++;const p=Object.fromEntries(u.searchParams);delete p.api_key;return json({search_parameters:p,properties:[{name:'Fixture Villa',property_token:'fixture_token',rate_per_night:{extracted_display_price:290000}}]});}
      const table=u.pathname.split('/').at(-1);
      if(table==='trips')return json([{id:'trip'}]);if(table==='trip_members')return json([]);
      if(table==='watch_items'){if(method==='GET')return json(u.searchParams.get('limit')==='0'?[]:watches);Object.assign(watches[0],body);return json(null);}
      if(table==='stay_price_checks'){
        if(method==='GET')return json([]);
        if(method==='POST'){if(ledger.some(x=>x.context_key===body.context_key))return json([]);const row={...body,id:'check'};ledger.push(row);return json([row]);}
        Object.assign(ledger[0],body);return json(null);
      }
      if(table==='price_quotes'){assert.equal(method,'POST');quotes.push(body);return json(null);}
      throw Error('Unexpected table '+table);
    };
    await(await import(${JSON.stringify(url+'?one')})).completed;
    assert.equal(watches[0].provider,'Google Hotels · SerpAPI');assert.equal(searches,1);assert.equal(quotes.length,1);assert.equal(quotes[0].price,290000);assert.match(quotes[0].context_key,/^google_hotels_v1/);
    await(await import(${JSON.stringify(url+'?two')})).completed;assert.equal(searches,1);assert.equal(quotes.length,1);
    watches.push({...watches[0],id:'second'},{...watches[0],id:'third'});
    await(await import(${JSON.stringify(url+'?three')})).completed;assert.equal(searches,1);assert.equal(process.exitCode,1);process.exitCode=0;
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
});
