# 공개 저장소 + 무료 GitHub Pages

## 준비된 배포 방식

- 소스 저장소: https://github.com/Park0515/bali-crew-planner (Public)
- 공개 저장소의 GitHub Pages를 사용하므로 GitHub Pro가 필요하지 않습니다.
- 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정합니다.
- `main`에 푸시하면 `.github/workflows/pages.yml`이 자동 배포합니다.
- 공개 산출물은 `index.html`, `styles.css`, `app.js`, `config.js`, `.nojekyll`만 포함합니다.
- 사이트 주소: https://park0515.github.io/bali-crew-planner/

## 데이터 공유와 가격 수집

현재 `config.js`는 비어 있으므로 브라우저별 데모 모드입니다. 공용 데이터베이스나 실시간 가격 수집이 활성화된 상태가 아닙니다.

공동 관리는 README의 Supabase 설정을 완료해야 합니다. URL과 공개 publishable 키만 `config.js`에 넣고, 서비스 비밀키는 GitHub Secrets에 저장합니다. 배포 주소를 Supabase 인증의 Site URL과 Redirect URLs에 등록해야 합니다.

가격 자동 수집은 README의 Amadeus 및 GitHub Secrets 설정을 완료한 뒤 수동 실행으로 확인합니다. 이후 Repository variable `PRICE_MONITOR_ENABLED`를 `true`로 설정하면 기존 매일 예약이 활성화됩니다. 설정 전에는 예약 실행의 수집 작업을 건너뜁니다.

저장소의 전체 소스와 커밋 기록 및 배포된 HTML, CSS, JavaScript, config.js는 누구나 열람할 수 있습니다. 비밀키는 GitHub Secrets에만 보관합니다.

공식 안내: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
