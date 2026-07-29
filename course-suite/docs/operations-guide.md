# Course Suite Operations Guide

`course-suite`는 대회별 코스 데이터를 재사용 가능한 뷰어/메이커로 분리하기 위한 서브프로젝트입니다.

## Viewer

참가자와 스탭은 다음 URL 형태로 코스를 확인합니다.

```text
course-suite/viewer/?event=gcrun
course-suite/viewer/?event=gcrun&mode=staff
```

현재 Phase 1 구현은 Firebase 없이 정적 설정(`shared/config.js`)과 기존 로컬 GPX fallback을 사용합니다.

## Event config

새 대회를 추가할 때는 `course-suite/shared/config.js`의 `EVENTS`에 대회 ID, 기본 GPX 경로, 중심 좌표, 종목, 기본 지도 API를 추가합니다.

## Next steps

1. Firebase active GPX 로드 추가
2. POI Firestore 로드 추가
3. `course-suite/maker`에서 GPX/POI 편집 기능 추가
4. staff mode 설치/철수 체크 기능 추가
