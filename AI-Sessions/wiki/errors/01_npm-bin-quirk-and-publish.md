# Error: npm bin field quirk and publish authorization

## 발생 상황
`packages/cotext-mcp` 패키지를 npm에 퍼블리시(`cotext-mcp@0.1.1`)하는 과정에서 발생한 이슈 및 설정 방법.

## 1. npm `bin` 필드 버그 (Quirk)
- **증상**: `package.json`의 `bin` 필드 값으로 상대경로 접두사 `./`를 사용했을 때(`"bin": "./dist/index.js"`), npm이 빌드 및 인스톨 과정에서 이를 자동 치환/변형하여 의도치 않은 동작을 유발하는 문제.
- **해결 및 예방**: 객체 형태를 사용하여 명시적으로 매핑하고, 값에서 `./`를 생략해야 함.
  ```json
  // 오답
  "bin": "./dist/index.js"
  
  // 정답
  "bin": {
    "cotext-mcp": "dist/index.js"
  }
  ```

## 2. npm Publish Auth (2FA)
- **증상**: 사용자 계정에 2FA(Two-Factor Authentication)가 켜져 있어 일반적인 `npm publish` 명령 수행 시 추가 인증이 요구됨.
- **해결**: Granular Access Token을 생성하여 직접 인증 우회/명시적 배포를 수행함.
- **리스크 (Risk)**: 사용된 토큰이 CLI 커맨드라인 내역이나 터미널 로그에 평문으로 남을 수 있음. 향후 팀 단위 공유 시 이 토큰을 즉각 폐기(Revoke)하거나 시크릿 변수에 주입하는 자동 배포 환경(GitHub Actions 등)으로 전환해야 함.
