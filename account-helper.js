'use strict';
document.querySelector('#helperForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const status=document.querySelector('#status');
  document.querySelector('#result').hidden=true;
  try{
    document.querySelector('#address').value=await BaliLogin.address(document.querySelector('#username').value);
    document.querySelector('#result').hidden=false;
    status.textContent='';
  }catch(error){status.textContent=error.message;}
});
document.querySelector('#copy').addEventListener('click',async()=>{
  try{
    await navigator.clipboard.writeText(document.querySelector('#address').value);
    document.querySelector('#status').textContent='등록 주소를 복사했습니다.';
  }catch{
    document.querySelector('#address').select();
    document.querySelector('#status').textContent='선택된 주소를 직접 복사해 주세요.';
  }
});
