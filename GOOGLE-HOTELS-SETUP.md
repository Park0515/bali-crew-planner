# Google Hotels 숙소 가격 추적

숙소의 정확한 Google Hotels 이름, 체크인·체크아웃, 성인 수를 입력하고 가격 수집을 Google Hotels 자동 조회로 설정합니다. Google Hotels 숙소 주소는 선택 사항입니다. 이름을 꾸미거나 임의의 후보 이름을 쓰면 다른 숙소를 선택하는 대신 확인 불가 상태로 남습니다.

기존 Agoda 자동 후보는 Google Hotels로 전환됩니다. 기존 가격은 DB에 유지되지만 새 그래프에 섞이지 않습니다. Agoda 페이지 수집 workflow와 Playwright 의존성은 제거했습니다.

## 운영

- 기존 Repository secrets `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SERPAPI_API_KEY`를 사용합니다. 사이트에는 API 키를 넣지 않습니다.
- Repository variable `HOTEL_MONITOR_ENABLED=true`로 활성화합니다. `Google Hotels price monitor`가 매일 한국 시간 09:43에 실행됩니다. 예약 실행은 지연될 수 있습니다.
- 기존 `stay-url-tracking.sql`을 실행했다면 추가 SQL은 필요하지 않습니다.
- 활성 숙소 최대 2개, 각 조건당 하루 1회 API 조회. 항공 3개 왕복 조합 최대 6회/일과 합쳐 31일 최대 248회입니다. 수동 재시도·다른 서비스 사용량은 별도입니다. 날짜 조합 또는 숙소 수가 늘면 수집기는 한도 검토 전 호출을 중단합니다.
- 날짜와 인원, 통화가 응답과 일치하고 동일 이름 또는 지정한 Google 숙소 ID가 확인된 경우만 저장합니다. 광고·다른 숙소를 임의로 선택하지 않습니다.
- 성인 1~9명, 어린이 0명, 객실/빌라 1개 조건을 지원합니다. SerpAPI Google Hotels API에 다중 객실 수 매개변수가 없으므로 여러 객실 예약 총액으로 해석하지 않습니다.

## 요금과 추이

Google Hotels가 반환하는 **1박 표시 요금** (`extracted_display_price`, 없으면 `extracted_lowest`)을 기록합니다. 전체 숙박 총액이나 1인 요금으로 표시하지 않습니다. 세금 포함·별도·미확인 상태 및 예약처는 각 가격의 메모에 저장하고 화면에 표시합니다. 표시가가 다를 수 있으므로 회원·앱 가격이나 Agoda 페이지 가격과 같다고 보장하지 않습니다.

최근 30일의 실제 관측값을 그래프로 표시합니다. 수집 시작 전 가격을 소급 생성하지 않습니다. 이름/숙소 ID·날짜·인원·출처가 달라지면 별도 기록으로 분리합니다. Google에 없는 숙소, 판매 전 날짜, 8명 예약 불가 등은 가격 대신 조회 상태를 기록합니다.

문서: https://serpapi.com/google-hotels-api 및 https://serpapi.com/google-hotels-property-details
