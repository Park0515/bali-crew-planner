# ✺ BALI TOGETHER — 8인 발리 여행 공동 관리 웹사이트

**정적 GitHub Pages 웹사이트 + Supabase 인증/공동 편집 + 선택적 Amadeus 자동 가격 점검**

2027년 9월, 약 3주 여행을 **예시 기본값**으로 사용했습니다. 실제 항공권·숙소 예약 날짜는 여행 설정에서 변경하세요. 회원 8명 중 **6명 전체 참여 + 2명 부분 참여**라는 예시만 넣었습니다. 이름도 실제로 바꿔 주세요.

## 구현된 기능

| 기능 | 내용 |
| --- | --- |
| 대시보드 | 여행 기간, 참가 인원, 일정, 가격 추적, 공동 지출 요약 |
| 일정 | 21일 이상의 날짜별 일정 등록·수정·삭제, 지역, 분류, 예약 상태 |
| 멤버 | 8명 개인별 도착·귀국일 설정, 날짜별 참석자, 참여 타임라인 |
| 가격 추적 | 편도/왕복 항공, 직항, 숙소 후보, 목표 가격, 비교 링크, 가격 기록, 그래프 |
| 경비 | 결제자·금액·분담 대상, 당일 참가자 균등 분담, 숙박일별 차등 분담, 송금 금액 추천 |
| 팀 협업 | 미리 만든 한글 ID/PW로 로그인하면 이번 발리 여행에 바로 접속, Row Level Security, Realtime |
| 백업 | JSON 다운로드, 데모 모드에서 JSON 복원 |
| 자동 점검(선택) | GitHub Actions 매일 실행, Amadeus 공식 API로 KRW 가격 기록, 목표가 도달 시 Discord 알림(선택) |

### 꼭 알아두세요

- **기본값은 데모 모드**입니다. `config.js`에 Supabase 주소와 공개 키가 비어 있으면 브라우저마다 데이터가 따로 저장됩니다. 데모 화면에 미리 표시한 가격은 **전부 임의로 만든 가상 예시**입니다. 라이브 항공편/숙소 가격이 아닙니다.
- **8명이 같은 내용을 보는 기능은 Supabase 설정 이후에만 작동**합니다. GitHub Pages는 정적 파일 호스팅만 담당합니다.
- **API 자동 점검은 별도 Amadeus 계정 및 Production 사용 권한(해당될 경우), GitHub Secrets 설정 후에만 작동**합니다. 아무 설정 없이 실시간 가격을 수집하지는 않습니다.
- Amadeus는 **모든 항공사·저가항공사·에어비앤비/풀빌라 상품**을 제공하지 않습니다. Google Flights·Booking.com을 무단 스크래핑하지 않습니다. **실제 결제 가격은 항상 예약처에서 다시 확인**하세요.
- 호텔은 특정 `Amadeus hotelId`가 있어야 자동 조회합니다. 날짜·인원·객실 수가 같은 조건이어야 비교 가능합니다. API가 KRW로 제공하지 않는 금액은 통화가 다른 가격을 잘못 기록하지 않기 위해 건너뜁니다.
- **정산은 원화(KRW) 기준**입니다. IDR/USD 결제는 실제 원화 환산액을 입력하세요. 환율 자동 반영 기능은 없습니다.

---

## 1. 데모 화면 확인

압축을 풀고 `index.html`을 브라우저로 열면 기본 데모를 볼 수 있습니다. 더 안정적인 확인은 개발 서버가 권장됩니다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속합니다. 개발 환경에 따라 외부 Google Fonts와 Supabase CDN에 인터넷 연결이 필요할 수 있습니다.

## 2. 공동 작업 설정: Supabase

1. [Supabase](https://supabase.com/)에 로그인해 **새 프로젝트**를 만듭니다.
2. **SQL Editor**에서 `supabase.sql` 파일을 **새 프로젝트에 한 번 실행**합니다. 기존 프로젝트에서는 다시 실행하지 않습니다. 이후 계정을 등록하고 아래 7번의 `single-trip.sql`을 실행하면 이번 발리 여행 한 개만 사용하는 구성이 됩니다.
3. **Project Settings / API Keys** 또는 **Connect**에서 다음 값을 확인합니다.
   - Project URL: `https://xxxx.supabase.co`
   - **Publishable key**: `sb_publishable_...` (과거 프로젝트는 `anon` 키도 가능)
4. 프로젝트의 `config.js`를 열어 두 값만 입력합니다.

```javascript
window.BALI_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_XXXXXXXXXXXXXXXX'
};
```

5. [계정 등록 도우미](https://park0515.github.io/bali-crew-planner/account-helper.html)에 사용할 아이디를 입력해 Supabase 등록 주소를 복사합니다. **Authentication → Users → Add user → Create new user**의 Email에 해당 주소를 붙여 넣고 비밀번호를 지정한 뒤 **Auto Confirm User**를 선택합니다. 사이트에서는 `성호` 등 원래 아이디와 비밀번호만 입력합니다. 아이디는 한글·영문·숫자로 시작하는 1~32자의 한글·영문·숫자·점·밑줄·하이픈이며, 영문 대문자는 소문자로 변환합니다. 기존 영문 아이디와 전체 이메일 로그인도 유지됩니다. 등록 주소는 내부 식별용이며 메일을 발송하지 않습니다. Invite user는 사용하지 않습니다. 인증용 계정을 일반 테이블에 직접 INSERT하지 않습니다.
6. **Authentication → Sign In / Providers**의 **Allow new users to sign up**을 끄고 저장합니다. Email 공급자는 켜 두고 Anonymous는 꺼 두어도 됩니다. 이 사이트는 비밀번호 로그인만 사용하며 SMTP나 메일 인증이 필요하지 않습니다.
7. **SQL Editor**에서 `single-trip.sql` 전체를 한 번 실행합니다. 기존 여행이 한 개 있으면 데이터와 권한 관리자를 유지합니다. 여행이 없으면 최초 등록된 확인 완료 계정을 관리자로 하여 발리 여행을 한 개 준비합니다. 초기 날짜는 기존 예시인 2027-09-01~2027-09-21이며 여행 설정에서 변경할 수 있습니다. 여행이 여러 개면 데이터 변경 없이 중단하므로 사용할 여행을 먼저 정해야 합니다. 이후 모든 등록 계정은 로그인하면 바로 같은 여행에 들어갑니다. 새 여행 생성·여행 선택·초대 기능은 없습니다. 참가자 이름과 참여 날짜는 참여 멤버에서 관리합니다. 비밀번호를 잊으면 관리자가 대시보드에서 변경합니다. 비밀번호는 소스나 config.js에 넣지 않습니다.

**보안:** 공개 웹사이트에 넣어도 되는 값은 URL과 `sb_publishable_...` 키뿐입니다. `sb_secret_...` 키는 절대로 `config.js`, HTML, JavaScript, GitHub 커밋에 넣지 마세요. 확인 완료된 일반 계정만 이번 여행 데이터를 읽고 수정할 수 있습니다. 미리 만든 계정만 허용하려면 신규 가입을 반드시 비활성화해야 합니다. 공개 키만 가지고 있거나 익명 로그인한 방문자는 접근할 수 없습니다. 기존 여행 생성·초대 RPC도 `single-trip.sql`에서 실행 권한을 회수합니다.

## 3. GitHub Pages에서 웹사이트 공개

1. `Park0515/bali-crew-planner`는 무료 GitHub Pages를 사용하는 **Public** 리포지토리입니다. 소스와 커밋 기록이 공개되므로 실제 비밀키와 개인 데이터를 커밋하지 마세요.
2. 압축 해제한 폴더 안의 **모든 파일과 숨김 폴더 `.github`까지** 리포지토리에 업로드합니다. `config.js`에는 **공개 키만** 들어 있어야 합니다.
3. 리포지토리 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다. `main`에 푸시하면 `.github/workflows/pages.yml`이 웹사이트 파일만 배포합니다. 필요하면 Actions에서 배포 워크플로를 수동 실행합니다.
4. 발행된 사이트 주소(보통 `https://USERNAME.github.io/bali-crew-planner/`)를 Supabase Authentication URL Configuration에 추가합니다.
5. 이 주소를 팀원에게 공유합니다.

터미널을 사용한다면 새 리포지토리 생성 후 아래 방식도 가능합니다.

```bash
git init
git add .
git commit -m "Launch Bali crew planner"
git branch -M main
git remote add origin https://github.com/USERNAME/bali-crew-planner.git
git push -u origin main
```

공개 리포지토리에는 모든 사용자가 웹 코드와 `config.js`의 **공개 키**를 볼 수 있습니다. 개인 정보·여권 번호·티켓 예약번호·결제 정보·서비스 비밀키는 소스코드나 공개 이슈에 올리지 않는 것을 권장합니다.

## 4. 선택 사항: 항공·숙소 가격 자동 점검

**숙소 URL 등록 → 공개 페이지의 1박 요금 자동 기록**은 [STAY-URL-SETUP.md](STAY-URL-SETUP.md)를 따릅니다. 현재 Agoda 숙소 상세 주소를 지원하며, Amadeus 키 없이 페이지를 확인합니다. 숙박 총액과 1박 요금을 구분하고, 확인 가능한 세금·수수료 포함 1박 표시 금액만 기록합니다.

멤버 날짜별 **인천 ↔ 덴파사 직항 왕복 가격 추이**는 [FLIGHT-SETUP.md](FLIGHT-SETUP.md)를 따릅니다. SerpAPI Free의 Google Flights 연동을 사용하며, 별도의 Secrets·`flight-tracking.sql`·`FLIGHT_MONITOR_ENABLED` 설정이 필요합니다. API가 연결되기 전에는 그래프에 실제 가격이 표시되지 않습니다. 아래 Amadeus 설정은 기존 수동 항공 추적 및 호텔 수집용입니다.

GitHub Actions는 `.github/workflows/price-monitor.yml`에서 **매일 09:17(Asia/Seoul)** 예약 실행하도록 작성했습니다. 수집 작업은 Repository variable `PRICE_MONITOR_ENABLED`가 `true`일 때만 예약 실행되며, 수동 실행은 이 값과 관계없이 가능합니다. 설정을 마친 뒤 활성화하세요. 실행 시 공식 [Amadeus Self-Service API](https://developers.amadeus.com/)로 조회를 시도합니다.

### 설정

1. Amadeus for Developers 계정을 만들고 애플리케이션의 **API Key(= Client ID)** 및 **API Secret(= Client Secret)**을 발급받습니다.
2. 실제 가격은 Amadeus의 **Production** 환경 설정이 필요합니다. Test 환경의 가격은 제한된 캐시/테스트 데이터이므로 실제 최저가로 사용하지 마세요. Production 사용 가능 여부와 호출 요금을 미리 확인하세요.
3. GitHub 리포지토리의 **Settings → Secrets and variables → Actions → Repository secrets**에서 다음 항목을 설정합니다.

| GitHub Secret | 값 |
| --- | --- |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` (**서버 전용**, 공개 금지) |
| `AMADEUS_CLIENT_ID` | Amadeus API Key |
| `AMADEUS_CLIENT_SECRET` | Amadeus API Secret |
| `DISCORD_WEBHOOK_URL` | 선택: Discord 채널의 Webhook URL. 목표가 도달 시에만 알림을 보냅니다 |

4. **Repository variables** (Secrets 아님)에 설정합니다.

| GitHub Variable | 값 |
| --- | --- |
| `AMADEUS_ENV` | `production` (기본은 `test`, 테스트용 데이터) |
| `SITE_URL` | 선택: 배포한 GitHub Pages 전체 주소 (Discord 알림에 표시) |

5. GitHub **Actions → Bali crew price monitor → Run workflow**로 수동 실행하고 결과를 확인합니다.

### 어떤 항목이 자동 수집되나요?

- **항공:** `ICN → DPS` 등 공항코드, 출발일, 귀국일(옵션), 직항 여부, 탑승 인원을 지정한 활성 항목. `Flight Offers Search`에서 KRW 응답 가격 중 가장 낮은 제시가를 기록합니다.
- **호텔:** **Amadeus 호텔 ID**, 체크인·체크아웃, 객실당 성인 인원, 객실 수를 설정한 활성 항목. `Hotel Search v3`에서 **KRW로 반환된** 유효한 최저 제시가를 기록합니다.
- **제외:** API에서 결과를 제공하지 않거나 날짜가 조회 가능 범위를 벗어나는 항목, KRW로 반환되지 않는 호텔, API에 없는 숙소/항공사. **0원/가짜 값은 기록하지 않습니다**.
- **Discord 알림:** 이전 기록에서는 목표가 초과였는데 이번에 목표가 이하가 된 경우, 또는 첫 기록부터 목표가 이하인 경우에 1회 알림을 보냅니다. 계속 목표가 이하면 매일 중복 알림을 보내지 않습니다. 다만 중간에 다른 팀원이 수동 가격 기록을 넣으면 비교 기준이 달라질 수 있습니다.

GitHub는 예약 작업의 정확한 실행 시간을 보장하지 않고, 공개 리포지토리가 **60일간 활동이 없으면 scheduled workflows를 비활성화**할 수 있습니다. API 비용·호출 한도 및 공급자 이용약관을 확인하세요.

## 파일 구조

```text
bali-crew-planner/
├── index.html                  # 화면
├── styles.css                  # 데스크톱/모바일 디자인
├── app.js                      # 일정, 인원, 가격, 정산, 공동 저장
├── config.js                   # 공개 가능한 Supabase URL + publishable 키
├── supabase.sql                # 데이터베이스/RLS/초대 및 실시간 설정
├── scripts/check-prices.mjs    # 공식 Amadeus 가격 자동 조회 (Node.js)
├── .github/workflows/
│   └── price-monitor.yml      # 매일 가격 확인 + 선택적 Discord 알림
├── preview-desktop.png        # 데모 스크린샷
├── preview-mobile.png         # 모바일 스크린샷
└── README.md
```

## 경비 분담 규칙

- **당일 참가자:** 결제일에 참여 중인 참가자에게 균등 분배
- **지정 인원:** 체크한 사람에게 균등 분배(체크하지 않으면 등록된 전원)
- **숙박일 기준:** 전체 숙박비를 숙박 날짜별로 분해하여, 매일 **그 밤에 숙박하는 사람들**에게 균등 분배. 귀국 날짜 그날 밤은 숙박 대상에서 제외. 한밤에 해당하는 사람이 아무도 없으면 전체 지정 인원에게 그날 숙박비를 나눔.
- 합계는 1원 단위까지 맞추기 위해 나머지 원화를 분담자에게 배분합니다.

**주의:** 실제 숙박비를 예약할 때 이미 결제한 지출만 '공동 경비'에 추가하세요. 가격 추적에 기록한 후보 금액은 자동으로 지출이 되지 않습니다.

## 테스트

데모 모드에서 Chromium을 사용해 대시보드와 모바일 렌더링, 일정 추가, 가격 기록 추가, 숙박비(숙박일 기준) 지출 추가, 참가자 타임라인을 확인했습니다. 실제 Supabase 계정·Amadeus API 자격 증명이 제공되지 않았으므로 **외부 서비스와의 종단 간 연동까지 실측 검증한 것은 아닙니다.**

## 참고 공식 문서

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- GitHub Actions Schedule: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Supabase JavaScript: https://supabase.com/docs/reference/javascript/installing
- Supabase Auth + RLS: https://supabase.com/docs/guides/auth
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Amadeus hotel/flight guides: https://amadeus4dev.github.io/developer-guides/
