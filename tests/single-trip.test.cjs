const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const original=fs.readFileSync(path.join(root,'app.js'),'utf8');
function app({trips=[{id:'bali'}],listError=null,dataError=null,user=true}={}){
  const main={innerHTML:''},queries=[];
  const defaults={classList:{add(){},remove(){},toggle(){}}};
  const api={from(table){queries.push(table);return {select(fields){return {
    async limit(){return {data:trips,error:listError};},
    eq(){return this;},
    async single(){return {data:{id:'bali',title:'발리',start_date:'2027-09-01'},error:null};},
    async order(){return {data:[],error:table==='trip_events'?dataError:null};}
  };}};},channel(){return {on(){return this;},subscribe(){return {};}};}};
  const context=vm.createContext({
    window:{BALI_CONFIG:{SUPABASE_URL:'test',SUPABASE_ANON_KEY:'public'},supabase:{createClient:()=>api},scrollTo(){}},
    document:{querySelector:s=>s==='#main'?main:defaults},
    localStorage:{setItem(){},getItem(){return null;}},
    setTimeout:()=>0,clearTimeout(){},console:{error(){}}
  });
  let source=original.replace(/^function render\([^\n]*/m,'function render(){globalThis.didRender=true;}');
  source=source.replace(/init\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/,'globalThis.testApi={state,openBaliTrip,settingsView};\n})();');
  vm.runInContext(source,context);
  context.testApi.state.user=user?{id:'account'}:null;
  return {context,main,queries,testApi:context.testApi};
}

test('login opens the only trip directly and loads its shared data',async()=>{
  const a=app();await a.testApi.openBaliTrip();
  assert.equal(a.testApi.state.tripId,'bali');
  assert.equal(a.testApi.state.ready,true);
  assert.equal(a.context.didRender,true);
  assert.equal(a.queries.length,8);
  assert(!/초대 코드|새 여행|다른 여행/.test(a.testApi.settingsView()));
});

test('signed-out visitors see login without querying trip data',async()=>{
  const a=app({user:false});await a.testApi.openBaliTrip();
  assert.match(a.main.innerHTML,/name="username"/);
  assert.equal(a.queries.length,0);
});

test('missing or ambiguous trips fail closed without creating or selecting one',async()=>{
  for(const trips of [[],[{id:'a'},{id:'b'}]]){
    const a=app({trips});await a.testApi.openBaliTrip();
    assert.equal(a.testApi.state.ready,false);
    assert.equal(a.testApi.state.tripId,null);
    assert.match(a.main.innerHTML,/다시 시도/);
    assert.equal(a.queries.length,1);
    assert(!/createTripForm|joinTripForm/.test(a.main.innerHTML));
  }
});

test('data loading errors stop without recursively retrying',async()=>{
  const a=app({dataError:{message:'Permission denied'}});await a.testApi.openBaliTrip();
  assert.equal(a.testApi.state.ready,false);
  assert.match(a.main.innerHTML,/Permission denied/);
  assert.equal(a.queries.length,7);
});

test('multi-trip forms, API calls, selectors and invitation actions are removed',()=>{
  assert(!/chooseTrip|createTripForm|joinTripForm|copyInvite|switchTrip|create_crew_trip|join_crew_trip/.test(original));
});
