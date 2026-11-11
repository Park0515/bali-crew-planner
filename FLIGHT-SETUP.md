# 멤버 날짜별 직항 가격 추이

항공 · 숙소 시세 화면에서 멤버의 `starts_on`과 `ends_on`을 각각 중복 제거합니다. 각 날짜에 인천(ICN) ↔ 덴파사(DPS)를 조합하며 출국·귀국은 별도의 편도 검색입니다. 검색 기준은 일반석 성인 1명, KRW, 직항입니다. 표시되는 '해당 일정 인원'은 날짜를 공유하는 멤버 수이며 가격의 탑승 인원은 항상 1명입니다.

## 처음 한 번 설정

1. Supabase SQL Editor에서 `flight-tracking.sql` 전체를 실행합니다. 기존 여행 및 가격 데이터는 유지합니다.
2. GitHub 저장소 Settings → Secrets and variables → Actions → Secrets에 다음 세 값을 등록합니다.

| Secret 이름 | 값 |
| --- | --- |
| `SUPABASE_URL` | 기존 Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | Supabase의 서버 전용 Secret key (`sb_secret_…`) |
| `SERPAPI_API_KEY` | 사용자 SerpAPI 계정의 API key |

비밀키를 채팅, `config.js`, 일반 Repository variables, 소스코드에 넣지 않습니다.

3. Repository **Variables**에 `FLIGHT_MONITOR_ENABLED` = `true`를 등록합니다.
4. Actions → **Direct flight price trends** → Run workflow로 한 번 실행하고 결과를 확인합니다.
5. 이후 매일 한국 시간 09:31에 예약 실행됩니다. GitHub Actions 예약 시간은 지연될 수 있습니다.

## 무료 한도와 중복 방지

현재 안내된 SerpAPI Free는 월 250회입니다. 기본 4조건을 매일 한 번 조회하면 31일에 124회입니다. 다른 프로젝트의 호출·실험도 같은 계정 한도에 합산될 수 있으므로 전용 사용을 권장합니다. 서비스의 과금/한도 조건은 계정에서 확인합니다. 이 코드는 유료 플랜을 신청하지 않습니다.

`flight_price_checks`에 날짜별 시도 기록을 먼저 생성해 성공·검색 결과 없음·조회 실패 모두 같은 날 재호출하지 않습니다. 실패 직후 반복 수동 실행해도 해당 조건의 API를 다시 호출하지 않습니다. 기록을 수동 삭제하면 다시 호출될 수 있으므로 무료 한도를 확인해야 합니다. 멤버 날짜 변경으로 조건이 늘어 일일 8개를 넘으면 무료 한도 검토가 필요하므로 수집을 중단합니다.

## 데이터의 의미

수동 실행의 `retry_failed`를 선택하면 오늘 실패한 조건만 다시 시도합니다. 성공·결과 없음은 재조회하지 않습니다. 재시도는 추가 API 한도를 사용할 수 있으므로 기본값은 꺼져 있습니다. 청주 조건은 더 이상 생성하지 않으며 기존 청주 수집 항목은 비활성화하고 기록은 보존합니다.

- 그래프는 한국 날짜 기준 최근 30일의 수집된 일일 최저 제시가입니다. 실제 예약 가격을 보장하지 않습니다.
- 검색 요청에 `stops=1`(직항 전용), `type=2`(편도)를 설정하고 응답에서도 공항·출발 날짜·일반석·인원·통화와 단일 구간 여부를 확인합니다. 경유·기술적 경유 정보가 있거나 조건이 다르면 기록하지 않습니다.
- Google의 `price_history`에는 과거 개별 항공편 명세가 없습니다. 따라서 직항을 개별 검증할 수 없는 과거 이력은 저장하거나 그래프에 섞지 않습니다. 과거 30일 전체를 소급 생성하지 않습니다.
- 수집 시작 전·결과 없음·오류 날짜에 0원 또는 가상 가격을 채우지 않습니다. 중간 기록이 없는 날짜를 선으로 연결하지 않습니다.
- 직항 결과가 없더라도 미운항/매진을 확정하는 의미는 아닙니다. 아직 판매하지 않는 날짜, 공급자 커버리지, 일시적 오류도 원인이 될 수 있습니다.
- Google Flights 링크는 같은 공항·날짜의 검색을 돕는 링크입니다. 최종 필터와 수하물·취소 조건은 현지 예약 화면에서 확인합니다.
- 항공의 일일 수집 항목은 멤버 날짜가 바뀌면 갱신되며, 이전 날짜의 가격 기록은 삭제하지 않습니다. 기존 Amadeus 수집기는 이 자동 생성 항목을 건너뜁니다.

## 공식 및 공급자 문서

- Google Flights 제휴 안내: https://developers.google.com/travel/flights
- 네이버 공개 API 목록: https://developers.naver.com/products/intro/plan/plan.md
- SerpAPI Google Flights API: https://serpapi.com/google-flights-api
- SerpAPI 요금제: https://serpapi.com/pricing
- Skyscanner API 신청 조건: https://www.partners.skyscanner.net/contact/travel-api
