/* Public username mapping. Passwords are handled only by Supabase Auth. */
(()=>{'use strict';
async function address(username){
  const id=String(username).trim().normalize('NFC').toLowerCase();
  // Keep previously created email and ASCII username accounts working.
  if(id.includes('@'))return id;
  if(!/^[a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ][a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ._-]{0,31}$/u.test(id)){
    throw new Error('아이디는 한글, 영문, 숫자, 점, 밑줄, 하이픈으로 1~32자 입력해 주세요.');
  }
  if(/^[a-z0-9._-]+$/.test(id))return id+'@bali-crew.example.com';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  // 41 characters cannot overlap with the legacy ASCII IDs (maximum 32).
  return 'u'+hex.slice(0,40)+'@bali-crew.example.com';
}
globalThis.BaliLogin={address};
})();
