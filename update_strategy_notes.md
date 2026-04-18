# Electron 자동업데이트 메모

- 공식 문서 기준으로 Electron 자동업데이트는 `electron-updater` 패키지를 사용한다.
- CI 파이프라인에서 릴리스 빌드를 만들고 배포 메타데이터를 업로드하는 구성이 권장된다.
- Windows의 기본 자동업데이트 대상은 `NSIS`이다.
- GitHub Releases를 배포 대상으로 사용할 수 있다.
- `latest.yml` 파일은 자동업데이트용 메타데이터로 생성 및 업로드되어야 한다.
- 앱 코드에서는 업데이트 서버(여기서는 GitHub Releases)를 조회하도록 구성해야 한다.
