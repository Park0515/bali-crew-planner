const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const mappingSource=fs.readFileSync(path.join(root,'login-id.js'),'utf8');
function mapping(){const context=vm.createContext({crypto:webcrypto,TextEncoder});vm.runInContext(mappingSource,context);return context.BaliLogin;}

test('Korean names map consistently to valid ASCII registration addresses',async()=>{
  const login=mapping();
  const expected='u'+createHash('sha256').update('성호').digest('hex').slice(0,40)+'@bali-crew.example.com';
  assert.equal(await login.address('성호'),expected);
  assert.equal(await login.address(' 성호 '),expected);
  assert.equal(await login.address('성호'.normalize('NFD')),expected);
  assert.notEqual(await login.address('민수'),expected);
  assert.match(await login.address('한'.repeat(32)),/^u[0-9a-f]{40}@bali-crew\.example\.com$/);
  assert.equal(await login.address('성호BALI'),await login.address('성호bali'));
});

test('existing accounts remain compatible and invalid names are rejected',async()=>{
  const login=mapping();
  assert.equal(await login.address(' BALI01 '),'bali01@bali-crew.example.com');
  assert.equal(await login.address('old@example.com'),'old@example.com');
  for(const name of ['', '성 호','성호<script>','한'.repeat(33),'.성호','😀']){
    await assert.rejects(()=>login.address(name));
  }
});

test('password login waits for Korean mapping and preserves the exact password',async()=>{
  const main={innerHTML:''},button={disabled:false};
  const toast={classList:{add(){},remove(){}}};
  const calls=[],saved=new Map();
  const api={auth:{async signInWithPassword(args){calls.push(args);return {error:null};}}};
  const context=vm.createContext({crypto:webcrypto,TextEncoder,
    window:{BALI_CONFIG:{SUPABASE_URL:'test',SUPABASE_ANON_KEY:'public'},supabase:{createClient:()=>api}},
    document:{querySelector:s=>s==='#main'?main:s==='#toast'?toast:s==='#authForm button[type="submit"]'?button:null},
    localStorage:{setItem:(k,v)=>saved.set(k,v)},setTimeout:()=>0,clearTimeout(){},console});
  vm.runInContext(mappingSource,context);
  context.window.BaliLogin=context.BaliLogin;
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/init\(\)\.catch\([\s\S]*?\n\}\)\(\);\s*$/,'globalThis.testApi={authPage,login};\n})();');
  vm.runInContext(source,context);
  context.testApi.authPage();
  assert.match(main.innerHTML,/name="username"/);
  assert.match(main.innerHTML,/성호/);
  await context.testApi.login('성호',' password with spaces ');
  assert.equal(calls[0].email,await context.BaliLogin.address('성호'));
  assert.equal(calls[0].password,' password with spaces ');
  assert.equal(saved.get('bali-login-id'),'성호');
  assert.equal(button.disabled,false);
  await context.testApi.login('성 호','wrong');
  assert.equal(calls.length,1);
  assert.equal(button.disabled,false);
});

test('account helper uses the same mapping and clears stale results on errors',async()=>{
  const elements={
    '#helperForm':{addEventListener(_event,callback){this.submit=callback;}},
    '#copy':{addEventListener(){}},'#username':{value:'성호'},
    '#address':{value:''},'#result':{hidden:true},'#status':{textContent:''}
  };
  const context=vm.createContext({crypto:webcrypto,TextEncoder,document:{querySelector:s=>elements[s]}});
  vm.runInContext(mappingSource,context);
  vm.runInContext(fs.readFileSync(path.join(root,'account-helper.js'),'utf8'),context);
  await elements['#helperForm'].submit({preventDefault(){}});
  assert.equal(elements['#address'].value,await context.BaliLogin.address('성호'));
  assert.equal(elements['#result'].hidden,false);
  elements['#username'].value='bad name';
  await elements['#helperForm'].submit({preventDefault(){}});
  assert.equal(elements['#result'].hidden,true);
  assert.match(elements['#status'].textContent,/아이디/);
});
