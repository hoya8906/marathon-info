# Course Suite Firebase 설정 가이드

이 문서는 `marathon-info/course-suite`에서 GPX와 POI를 공통 저장소로 관리하기 위한 Firebase 설정 절차입니다.

## 현재 권장: Firestore-first

사용자가 확인한 것처럼 새 Firebase 프로젝트에서 **Cloud Storage는 결제/Blaze 연결이 필요해 보일 수 있습니다.** 따라서 MVP는 다음 방식으로 갑니다.

| 데이터 | MVP 저장 위치 | 이유 |
|---|---|---|
| 대회/코스 메타데이터 | Firestore | 무료 티어로 시작 가능 |
| GPX XML | Firestore `gpxXml` 필드 | 현재 과천 GPX 약 587KB로 Firestore 문서 1MiB 제한 내 |
| POI/설치물 | Firestore subcollection | 필터/스탭 모드와 잘 맞음 |
| 현장 사진/대용량 GPX/PDF | Cloud Storage, 추후 | 용량/트래픽 커지면 Blaze 고려 |

즉, 지금은 **Firestore-first**로 진행하고, Cloud Storage는 사진/대용량 파일이 필요해질 때 붙입니다.

## 이미 반영한 Firebase Web config

실제 Web App config는 공개 브라우저 설정값이므로 다음 파일에 반영했습니다.

```text
course-suite/shared/firebase-config.public.js
```

관리자 이메일:

```text
a66452411@gmail.com
```

주의: Firebase Web `apiKey`는 브라우저에 노출되는 값입니다. 비밀번호처럼 숨기는 보안수단이 아니며, 실제 보안은 Firestore/Storage Rules로 처리해야 합니다.

## 1. Firebase 프로젝트 확인

프로젝트 ID:

```text
marathon-info-course-suite
```

Firebase Console:

```text
https://console.firebase.google.com/
```

## 2. Authentication 설정

1. Firebase Console → **Authentication**
2. **Get started**
3. Sign-in method에서 Google provider 활성화
4. 운영진 Gmail: `a66452411@gmail.com`

현재 rules 초안은 `request.auth.token.email == 'a66452411@gmail.com'`을 관리자 fallback으로 허용합니다. 나중에는 `admins/{uid}` 문서 기반으로 확장합니다.

## 3. Firestore 생성

1. Firebase Console → **Firestore Database**
2. **Create database**
3. Production mode 권장
4. Region은 가능하면 `asia-northeast3` 또는 가까운 region
5. Rules는 `course-suite/docs/firebase-rules.md`의 Firestore Rules 적용

## 4. Cloud Storage는 지금 안 해도 됨

Cloud Storage가 유료/Blaze로 보이면 일단 건너뛰어도 됩니다.

현재 코드와 데이터 모델은 Firestore `gpxXml` 필드로 GPX를 읽을 수 있게 구성합니다. Storage는 다음 경우에 다시 켭니다.

- 1MiB 넘는 큰 GPX
- 현장 사진 업로드
- PDF/CSV export 파일 저장
- 이미지/포스터 자산 관리

## 5. Firestore 데이터 모델

### events/gcrun

```json
{
  "title": "과천마라톤",
  "subtitle": "관문체육공원 출발 · Firebase 코스 안내",
  "activeCourseId": "gcrun-2026",
  "defaultMapApi": "kakao",
  "visibility": "public"
}
```

### courseMaps/gcrun-2026

```json
{
  "eventId": "gcrun",
  "title": "2026 과천마라톤 코스",
  "activeGpxVersionId": "v001",
  "defaultMapApi": "kakao"
}
```

### courseMaps/gcrun-2026/gpxVersions/v001

Firestore 문서 필드:

```json
{
  "fileName": "과천마라톤.gpx",
  "isActive": true,
  "gpxXml": "여기에 GPX XML 전체 텍스트",
  "pointCount": 5060,
  "distanceKm": 21.872,
  "uploadedBy": "a66452411@gmail.com"
}
```

참고: Firestore 문서 최대 크기는 1MiB입니다. 과천 GPX는 약 587KB라 MVP에는 들어갑니다.

### courseMaps/gcrun-2026/pois/{poiId}

```json
{
  "type": "water",
  "name": "2.5km 급수대",
  "lat": 37.4474,
  "lng": 126.9872,
  "distanceKm": 2.5,
  "side": "right",
  "visibility": "public",
  "quantity": 1,
  "team": "급수팀 A조",
  "status": "planned",
  "installBy": "07:00",
  "equipment": ["테이블 2", "생수", "이온음료", "쓰레기봉투"],
  "description": "참가자 공개 급수 지점"
}
```

## 6. 로컬/CLI 상황

현재 Hermes 실행 환경에서는 `node`, `npm`, `firebase` CLI가 확인되지 않았습니다. 따라서 CLI 배포는 여기서 바로 하지 않고, 저장소에 안전한 브라우저용 config/repository scaffold를 넣는 방식으로 진행합니다.

Firebase CLI가 있는 PC에서는 다음을 사용할 수 있습니다.

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

## 7. Viewer 연동 구조

현재 목표 로딩 순서:

1. `course-suite/shared/firebase-config.public.js`에서 Firebase config 로드
2. `course-suite/shared/firebase.js`에서 Firebase App/Firestore 초기화
3. `course-suite/shared/course-repository.js`에서 Firestore 조회
4. Viewer는 Firebase bundle 우선 적용
5. Firestore 실패/데이터 없음이면 `shared/config.js` 정적 fallback
6. Firebase GPX `gpxXml`이 있으면 그것 사용, 없으면 로컬 GPX 파일 fallback

## 8. 보안 체크리스트

- [x] GitHub PAT 미커밋
- [x] Firebase service account JSON 미사용/미커밋
- [x] `.gitignore`에 local config/service account 보호 항목 추가
- [x] Firestore-first로 Storage 결제 의존 낮춤
- [ ] Firestore Rules 실제 Console 적용
- [ ] Google Auth 활성화
- [ ] 관리자 이메일 로그인 테스트
- [ ] 카카오맵 JavaScript 키 도메인 제한 확인

## 9. 다음 작업

1. Firestore Database 생성
2. Authentication Google provider 활성화
3. Firestore Rules 적용
4. `events/gcrun`, `courseMaps/gcrun-2026` 입력
5. `gpxVersions/v001.gpxXml`에 과천 GPX 텍스트 입력
6. Viewer에서 Firebase 로드 확인
