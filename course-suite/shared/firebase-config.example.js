// Copy this file to firebase-config.js and replace TODO_REPLACE_* values with
// the Web App config from Firebase Console. Do not put service account JSON or
// private keys in browser code.

export const firebaseConfig = {
  apiKey: 'TODO_REPLACE_FIREBASE_API_KEY',
  authDomain: 'TODO_REPLACE_PROJECT_ID.firebaseapp.com',
  projectId: 'TODO_REPLACE_PROJECT_ID',
  storageBucket: 'TODO_REPLACE_PROJECT_ID.appspot.com',
  messagingSenderId: 'TODO_REPLACE_MESSAGING_SENDER_ID',
  appId: 'TODO_REPLACE_APP_ID'
};

export const firebaseCourseSuiteOptions = {
  enabled: false,
  fallbackToStaticConfig: true,
  collections: {
    events: 'events',
    courseMaps: 'courseMaps',
    gpxVersions: 'gpxVersions',
    pois: 'pois',
    tasks: 'tasks'
  },
  storage: {
    gpxPrefix: 'gpx',
    poiAssetsPrefix: 'assets'
  }
};
