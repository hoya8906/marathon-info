# Firebase Rules 초안

이 문서는 `course-suite`의 Firestore/Cloud Storage 보안 규칙 초안입니다. 실제 프로젝트 ID와 관리자 UID 구조를 확정한 뒤 Firebase Console 또는 CLI로 적용합니다.

## Firestore Rules

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function adminDoc() {
      return get(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    function role() {
      return signedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
        ? adminDoc().data.role
        : 'public';
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
        allow write: if isEditor();
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

## Storage Rules

```js
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() {
      return request.auth != null;
    }

    function adminDoc() {
      return firestore.get(/databases/(default)/documents/admins/$(request.auth.uid));
    }

    function role() {
      return signedIn() && firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid))
        ? adminDoc().data.role
        : 'public';
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

- `allow read: if true`는 공개 코스뷰어 목적의 최소 공개 데이터에만 사용합니다.
- 담당자 연락처, 내부 메모, 보안상 민감한 설치 정보는 `visibility: staff/admin` 문서 또는 별도 컬렉션으로 분리합니다.
- 개인정보성 참가자 데이터는 이 rules와 별도 설계를 해야 합니다.
- Firebase Web config의 `apiKey`는 보안 키가 아니므로 rules가 실질 보안 경계입니다.
