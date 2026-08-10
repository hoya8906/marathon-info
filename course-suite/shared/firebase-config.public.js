// Firebase Web config is public browser configuration, not a private key.
// Security must be enforced by Firestore/Storage rules.

export const firebaseConfig = {
  apiKey: 'AIzaSyC1Lq4gxvpb3pnuDfT5G4opqYc4uBG1mDA',
  authDomain: 'marathon-info-course-suite.firebaseapp.com',
  projectId: 'marathon-info-course-suite',
  storageBucket: 'marathon-info-course-suite.firebasestorage.app',
  messagingSenderId: '349116373719',
  appId: '1:349116373719:web:3fa4e8406a332335c36e92',
  measurementId: 'G-Q7MVDX3FRY'
};

export const firebaseCourseSuiteOptions = {
  enabled: true,
  // Storage can require billing on new projects. Use Firestore-first GPX XML
  // storage for the MVP; add Cloud Storage later for large GPX/photos/exports.
  storageMode: 'firestore',
  fallbackToStaticConfig: true,
  adminEmails: ['a66452411@gmail.com'],
  collections: {
    events: 'events',
    courseMaps: 'courseMaps',
    gpxVersions: 'gpxVersions',
    pois: 'pois',
    tasks: 'tasks'
  }
};
