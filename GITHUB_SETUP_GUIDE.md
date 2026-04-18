# GitHub 기반 빌드 및 자동업데이트 설정 가이드

이 프로젝트는 **Electron 앱**이며, GitHub Releases를 배포 서버처럼 사용하여 **자동업데이트**를 구성하는 방식으로 정리했습니다. 현재 설정은 Windows용 설치 파일을 GitHub Actions에서 빌드하고, 배포된 릴리스를 앱이 확인하여 새 버전이 있으면 내려받도록 맞춰져 있습니다.

| 항목 | 현재 상태 | 사용자가 해야 할 일 |
|---|---|---|
| 저장소 배포 방식 | GitHub Releases 기준으로 구성됨 | GitHub 저장소 생성 |
| 자동 빌드 | 태그 푸시 시 Windows 빌드 실행 | 코드 푸시 후 `v1.0.1` 같은 태그 생성 |
| 자동업데이트 | `electron-updater` 기준 코드 추가 | `package.json`의 저장소 정보 치환 |
| 앱 아이콘 | `build/icon.ico` 경로로 설정됨 | 실제 아이콘 파일 추가 |

## 1. 바꿔야 하는 자리

현재 `package.json`에는 아래와 같이 자리표시자가 들어 있습니다.

- `__GITHUB_OWNER__`
- `__GITHUB_REPO__`

이 두 값은 실제 GitHub 사용자명과 저장소명으로 바꿔야 합니다.

예를 들어 계정이 `myname`이고 저장소가 `spoon-bot`이면 다음처럼 바꾸면 됩니다.

```json
"publish": [
  {
    "provider": "github",
    "owner": "myname",
    "repo": "spoon-bot",
    "releaseType": "release"
  }
]
```

## 2. 꼭 준비해야 하는 파일

현재 빌드 설정은 `build/icon.ico`를 사용하도록 되어 있습니다. 따라서 빌드 전에 반드시 다음 파일이 있어야 합니다.

| 파일 | 필요 여부 | 설명 |
|---|---|---|
| `build/icon.ico` | 필수 | 설치 프로그램과 앱 아이콘에 사용 |

## 3. GitHub 저장소 기본 절차

먼저 새 GitHub 저장소를 만든 뒤 이 프로젝트 파일을 올리면 됩니다. 그 다음 기본 브랜치에 코드를 푸시하고, 버전 번호를 올린 뒤 태그를 푸시하면 자동으로 릴리스가 생성됩니다.

예시는 다음 순서입니다.

```bash
npm install
git init
git branch -M main
git add .
git commit -m "Initial release setup"
git remote add origin https://github.com/사용자명/저장소명.git
git push -u origin main
```

버전 배포는 아래처럼 진행하면 됩니다.

```bash
# package.json 버전 수정 후
git add package.json
git commit -m "release: v1.0.1"
git tag v1.0.1
git push origin main --tags
```

## 4. 자동업데이트 동작 방식

앱이 설치형으로 배포된 상태에서 실행되면, 시작 후 몇 초 뒤 GitHub Releases의 최신 버전을 확인합니다. 새 버전이 있으면 다운로드를 진행하고, 다운로드가 끝나면 재시작 안내 창이 나타나도록 구성했습니다.

> 중요한 점은 **압축 파일 실행이 아니라 설치 파일로 설치된 앱**이어야 자동업데이트가 정상적으로 동작한다는 점입니다.

## 5. 권장 사항

자동업데이트는 일반적으로 **공개 저장소**에서 가장 간단하게 운영됩니다. 비공개 저장소도 가능하지만 추가 인증 처리가 필요해 복잡도가 올라갑니다. 따라서 처음에는 공개 저장소로 시작하는 편이 안전합니다.
