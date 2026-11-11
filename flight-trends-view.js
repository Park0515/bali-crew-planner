(()=>{'use strict';
const F=globalThis.BaliFlights;
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>'₩'+Math.round(n).toLocaleString('ko-KR');
function chart(s,label){
  const points=s.live;
  if(!points.length)return '<div class="flight-chart-empty">아직 저장된 가격이 없습니다.<br/><small>조회 가능한 가격부터 기록합니다.</small></div>';
  const W=560,H=205,L=70,R=18,T=20,B=36;
  let lo=Math.min(...points.map(p=>p.price)),hi=Math.max(...points.map(p=>p.price));
  const margin=Math.max((hi-lo)*.12,10000);lo=Math.max(0,lo-margin);hi+=margin;
  const x=d=>L+(Date.parse(d)-Date.parse(s.start))/(29*86400000)*(W-L-R);
  const y=p=>T+(hi-p)/(hi-lo)*(H-T-B);
  const grid=[0,.5,1].map(t=>{const price=lo+(hi-lo)*t,yy=y(price);return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e4ece7"/><text x="${L-9}" y="${yy+4}" text-anchor="end">${E(won(price))}</text>`;}).join('');
  function line(list,color,dashed,source){
    let out='';for(let i=1;i<list.length;i++)if(Date.parse(list[i].day)-Date.parse(list[i-1].day)===86400000)out+=`<line x1="${x(list[i-1].day)}" y1="${y(list[i-1].price)}" x2="${x(list[i].day)}" y2="${y(list[i].price)}" stroke="${color}" stroke-width="2" ${dashed?'stroke-dasharray="4 4"':''}/>`;
    return out+list.map(p=>`<circle cx="${x(p.day)}" cy="${y(p.price)}" r="3" fill="${color}"><title>${E(p.day+' · '+won(p.price)+' · '+source)}</title></circle>`).join('');
  }
  return `<svg class="flight-trend-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${E(label+' 최근 30일 가격 추이')}"><title>${E(label)} 가격 추이. 기록이 없는 날짜는 연결하지 않습니다.</title>${grid}${line(s.live,'#168c78',false,'양방향 직항 확인 왕복 총액')}<text x="${L}" y="${H-10}">${s.start.slice(5)}</text><text x="${W-R}" y="${H-10}" text-anchor="end">${s.end.slice(5)}</text></svg>`;
}
function render(data,checks=[],now=new Date()){
  const routes=F.routes(data.members||[]);
  const cards=routes.map(r=>{
    const watches=(data.watches||[]).filter(w=>F.matches(w,r)),ids=watches.map(w=>w.id);
    const s=F.series(data.quotes||[],ids,now),latest=s.live.at(-1),first=s.live[0];
    const check=checks.filter(c=>ids.includes(c.watch_id)).sort((a,b)=>String(b.checked_at).localeCompare(String(a.checked_at)))[0];
    const status=check?({ok:'직항 가격 저장 완료',no_direct:'조회 조건에 맞는 직항 결과 없음',error:'조회 실패',pending:'조회 처리 중'}[check.status]||'수집 대기'):'수집 대기';
    const change=latest&&s.live.length>1?latest.price-first.price:null;
    const q=`${r.origin} to ${r.dest} departing ${r.depart_on} returning ${r.return_on} round trip nonstop economy 1 adult`;
    const link='https://www.google.com/travel/flights?hl=ko&curr=KRW&q='+encodeURIComponent(q);
    return `<article class="card flight-trend-card"><div class="flight-route-head"><div><span class="pill flight">왕복 · 양방향 직항</span><h3>${F.airports[r.origin]} ↔ ${F.airports[r.dest]}</h3><p>출국 ${r.depart_on}<br/>귀국 ${r.return_on} · 해당 일정 ${r.people}명</p></div><div class="flight-route-price"><strong>${latest?won(latest.price):'—'}</strong><small>일반석 · 성인 1명 · 왕복 총액</small></div></div>${chart(s,r.label)}<div class="flight-chart-legend"><span><i class="flight-dot"></i>직항 확인 왕복 가격</span></div><div class="flight-route-foot"><span>${E(check?check.checked_on+' · '+status:status)}${change!==null?`<br/>기록 첫날 대비 ${change>0?'+':''}${won(change)} (${s.live.length}일 기록)`:''}</span><a class="btn btn-light btn-small" href="${E(link)}" target="_blank" rel="noopener noreferrer">Google Flights ↗</a></div></article>`;
  }).join('');
  return `<section class="flight-trends"><div class="card-head"><div><h2 class="card-title">✈ 직항 왕복 항공권 · 최근 1개월</h2><p class="help">멤버별 출국일·귀국일 조합을 중복 제거 · 인천 ↔ 덴파사 · ${routes.length}개 검색 조건</p></div><span class="pill good">KRW · 왕복</span></div><div class="notice" style="margin-bottom:18px">매일 확인한 일반석 성인 1명의 실제 왕복 총액을 최근 30일 기준으로 비교합니다. 출국편과 귀국편 모두 직항으로 확인한 수집 기록만 표시합니다. Google의 과거 가격 이력은 개별 항공편의 직항 여부를 확인할 수 없어 제외합니다. 수집 시작 전이나 조회 기록이 없는 날은 비워 둡니다.</div>${routes.length?`<div class="flight-trends-grid">${cards}</div>`:'<div class="card flight-chart-empty">참여 멤버의 출국일과 귀국일을 먼저 입력해 주세요.</div>'}<p class="help">직항 결과 없음은 조회 시점의 검색 결과입니다. 노선 운항 여부나 매진을 확정하지 않습니다. 수하물·취소 조건과 최종 결제 금액은 예약처에서 확인하세요.</p></section>`;
}
globalThis.BaliFlightView={render,chart};
})();
