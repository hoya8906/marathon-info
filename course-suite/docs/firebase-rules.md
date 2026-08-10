# Firebase Rules 초안

이 문서는 `course-suite`의 Firestore/Cloud Storage 보안 규칙 초안입니다. 현재 MVP는 **Firestore-first** 방식입니다. Cloud Storage는 유료/Blaze가 필요해 보이면 나중에 켭니다.

## Firestore Rules

관리자 이메일 `a66452411@gmail.com`을 초기 allowlist로 포함했습니다. 나중에는 `admins/{uid}` 기반으로 확장할 수 있습니다.

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isBootstrapAdminEmail() {
      return signedIn() && request.auth.token.email == 'a66452411@gmail.com';
    }

    function adminDocExists() {
      return signedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    function adminDoc() {
      return get(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    function role() {
      return isBootstrapAdminEmail()
        ? 'admin'
        : (adminDocExists() ? adminDoc().data.role : 'public');
    }

    function isAdmin() {
      return role() == 'admin';
    }

    function isEditor() {
      return role() in ['admin', 'editor'];
    }

    function isStaff() {
      return role() in ['admin', 'editor', 'staff'];
    }

    function validGpxVersion() {
      return !('gpxXml' in request.resource.data)
        || request.resource.data.gpxXml is string
        && request.resource.data.gpxXml.size() < 900 * 1024;
    }

    match /admins/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
      allow write: if isAdmin();
    }

    match /events/{eventId} {
      allow read: if true;
      allow write: if isEditor();
    }

    match /courseMaps/{courseId} {
      allow read: if true;
      allow write: if isEditor();

      match /gpxVersions/{versionId} {
        allow read: if true;
        allow create, update: if isEditor() && validGpxVersion();
        allow delete: if isAdmin();
      }

      match /pois/{poiId} {
        allow read: if resource.data.visibility == 'public'
          || (resource.data.visibility == 'staff' && isStaff())
          || isEditor();
        allow create, update: if isEditor();
        allow delete: if isAdmin();
      }

      match /tasks/{taskId} {
        allow read: if isStaff();
        allow create, update: if isStaff();
        allow delete: if isEditor();
      }
    }
  }
}
```

## Cloud Storage Rules — 추후 사용

Cloud Storage는 현장 사진, 대용량 GPX, PDF/CSV export가 필요해질 때 활성화합니다.

```js
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() {
      return request.auth != null;
    }

    function isBootstrapAdminEmail() {
      return signedIn() && request.auth.token.email == 'a66452411@gmail.com';
    }

    function adminDocExists() {
      return signedIn() && firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid));
    }

    function adminDoc() {
      return firestore.get(/databases/(default)/documents/admins/$(request.auth.uid));
    }

    function role() {
      return isBootstrapAdminEmail()
        ? 'admin'
        : (adminDocExists() ? adminDoc().data.role : 'public');
    }

    function isAdmin() {
      return role() == 'admin';
    }

    function isEditor() {
      return role() in ['admin', 'editor'];
    }

    function isStaff() {
      return role() in ['admin', 'editor', 'staff'];
    }

    match /gpx/{eventId}/{courseId}/{fileName} {
      allow read: if true;
      allow write: if isEditor()
        && request.resource.size < 10 * 1024 * 1024
        && fileName.matches('.*\\.gpx$');
    }

    match /assets/{eventId}/poi/{poiId}/{fileName} {
      allow read: if true;
      allow write: if isStaff()
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }

    match /exports/{eventId}/{courseId}/{fileName} {
      allow read: if isStaff();
      allow write: if isEditor()
        && request.resource.size < 20 * 1024 * 1024;
    }
  }
}
```

## 운영 메모

- 현재 MVP는 Storage 없이 Firestore `gpxXml`을 사용합니다.
- `gpxXml`은 Firestore 문서 1MiB 제한 때문에 900KB 미만으로 제한했습니다.
- 과천 GPX는 약 587KB라 현재 방식에 들어갑니다.
- 공개 write는 금지합니다.
- 담당자 연락처, 내부 메모, 보안상 민감한 설치 정보는 `visibility: staff/admin` 또는 별도 컬렉션으로 분리합니다.
- 개인정보성 참가자 데이터는 이 rules와 별도 설계를 해야 합니다.
