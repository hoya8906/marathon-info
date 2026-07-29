# Course Suite Firebase 설정 가이드

이 문서는 `marathon-info/course-suite`에서 GPX와 POI를 공통 저장소로 관리하기 위한 Firebase 설정 절차입니다.

## 목표 구조

| Firebase 기능 | 용도 |
|---|---|
| Firestore | 대회, 코스, 활성 GPX, POI, 설치 작업 메타데이터 |
| Cloud Storage | GPX 원본, 현장 사진, 향후 PDF/CSV export 파일 |
| Authentication | 운영진/스탭/관리자 권한 구분 |
| Hosting | 필요 시 `course-suite` 정적 페이지 배포 |

## 1. Firebase 프로젝트 생성

1. Firebase Console 접속: <https://console.firebase.google.com/>
2. **Add project** 클릭
3. 프로젝트명 예시: `marathon-info-course-suite`
4. Google Analytics는 초기에는 꺼도 됩니다. 추후 방문/클릭 분석이 필요하면 켭니다.

## 2. Web App 등록

1. 프로젝트 대시보드에서 Web 아이콘 `</>` 클릭
2. 앱 이름 예시: `marathon-info-web`
3. Firebase Hosting 체크는 선택사항입니다.
4. 생성 후 표시되는 `firebaseConfig` 값을 복사합니다.
5. 이 저장소에서는 실제 값 대신 아래 예시 파일을 복사해 사용합니다.

```text
course-suite/shared/firebase-config.example.js
```

실제 운영 파일 후보:

```text
course-suite/shared/firebase-config.js
```

주의: Firebase Web `apiKey`는 브라우저에 노출되는 값입니다. 비밀번호처럼 숨기는 보안수단이 아니며, 실제 보안은 Firestore/Storage Rules로 처리해야 합니다.

## 3. Authentication 설정

1. Firebase Console → **Authentication**
2. **Get started**
3. Sign-in method에서 우선 Google provider 활성화
4. 운영진 Gmail 계정으로 로그인하도록 구성
5. 관리자 UID는 Firestore `admins/{uid}` 문서로 관리하는 방식을 권장합니다.

예시:

```text
admins/{uid}
  role: "admin"
  email: "operator@example.com"
```

권한 레벨 추천:

| role | 설명 |
|---|---|
| `viewer` | 공개 데이터 조회만 가능. 보통 Auth 없이 처리 |
| `staff` | 스탭 POI 조회, 설치/철수 체크, 사진 업로드 |
| `editor` | GPX/POI 수정 가능 |
| `admin` | 관리자/삭제/권한 관리 가능 |

## 4. Firestore 생성

1. Firebase Console → **Firestore Database**
2. **Create database**
3. Location은 국내 사용자 기준 `asia-northeast3` 또는 가까운 region 고려
4. 처음에는 production mode 권장
5. Rules는 `course-suite/docs/firebase-rules.md`를 참고해 적용

## 5. Cloud Storage 생성

1. Firebase Console → **Storage**
2. **Get started**
3. Firestore와 같은 region 권장
4. Rules는 `course-suite/docs/firebase-rules.md`의 Storage rules 참고

## 6. 권장 Firestore 데이터 모델

```text
events/{eventId}
  title
  subtitle
  date
  venue
  defaultMapApi
  activeCourseId
  visibility
  updatedAt

courseMaps/{courseId}
  eventId
  title
  activeGpxVersionId
  activeGpxPath
  activeGpxName
  defaultMapApi
  updatedAt

courseMaps/{courseId}/gpxVersions/{versionId}
  fileName
  storagePath
  pointCount
  distanceKm
  elevationMin
  elevationMax
  uploadedBy
  uploadedAt
  isActive

courseMaps/{courseId}/pois/{poiId}
  type
  name
  lat
  lng
  distanceKm
  side
  visibility
  quantity
  team
  assignee
  status
  installBy
  removeBy
  equipment[]
  description
  photoPaths[]
  updatedAt

courseMaps/{courseId}/tasks/{taskId}
  poiId
  type
  title
  status
  assignedTeam
  completedAt
  completedBy
  proofPhotoPath
```

## 7. 권장 Storage 경로

```text
gpx/{eventId}/{courseId}/{versionId}.gpx
assets/{eventId}/poi/{poiId}/{filename}.jpg
exports/{eventId}/{courseId}/installation-checklist.csv
exports/{eventId}/{courseId}/course-guide.pdf
```

## 8. 초기 gcrun 데이터 입력 예시

Firestore:

```text
events/gcrun
courseMaps/gcrun-2026
courseMaps/gcrun-2026/gpxVersions/v001
courseMaps/gcrun-2026/pois/start-finish
courseMaps/gcrun-2026/pois/water-2-5k
```

Storage:

```text
gpx/gcrun/gcrun-2026/v001.gpx
```

`v001.gpx`에는 현재 저장소의 다음 파일을 업로드하면 됩니다.

```text
gcrun/files/과천마라톤.gpx
```

## 9. 로컬 개발 순서

Firebase CLI가 있는 환경이면 다음 순서로 진행합니다.

```bash
npm install -g firebase-tools
firebase login
firebase init firestore storage hosting
firebase use --add
firebase deploy --only firestore:rules,storage
```

현재 Hermes 실행 환경에서는 `node`, `npm`, `firebase` CLI가 확인되지 않았습니다. 따라서 여기서는 실제 Firebase 프로젝트 생성/CLI 배포는 못 하고, 저장소에 설정 가이드와 rules/template scaffold를 준비하는 단계까지 진행합니다.

## 10. Viewer 연동 순서

1. `course-suite/shared/firebase-config.example.js`를 실제 config로 복사
2. `firebase-config.js`를 `.gitignore` 대상으로 둘지, 공개 config로 둘지 결정
3. `course-suite/shared/firebase.js` 생성
4. `course-suite/shared/course-repository.js` 생성
5. Viewer 로딩 순서 변경
   - Firebase `events/{eventId}` 조회
   - `courseMaps/{activeCourseId}` 조회
   - active GPX Storage URL 로드
   - POI 목록 Firestore 로드
   - 실패 시 `shared/config.js` 정적 fallback

## 11. 보안 체크리스트

- [ ] GitHub PAT, Firebase service account JSON은 절대 커밋하지 않기
- [ ] Firestore 공개 write 금지
- [ ] Storage 공개 write 금지
- [ ] GPX 파일 크기 제한
- [ ] 이미지 업로드 MIME/type 제한
- [ ] 관리자 UID allowlist 운영
- [ ] 카카오맵 JavaScript 키 도메인 제한

## 12. 다음 구현 단계

1. `firebase-config.example.js` 기반으로 실제 config 연결
2. `firebase.js` 초기화 모듈 작성
3. `course-repository.js`에서 Firestore/Storage 조회 추상화
4. Viewer는 repository에서 데이터 로드, 실패 시 static config fallback
5. Maker에서 Auth 로그인 + GPX/POI 저장 구현
