import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { getFirebaseDb, getFirebaseOptions, isFirebaseEnabled } from './firebase.js';
import { getEventConfig } from './config.js';

function mergeEventConfig(staticConfig, eventDoc = {}, courseDoc = {}, pois = []) {
  return {
    ...staticConfig,
    ...eventDoc,
    defaultMapApi: courseDoc.defaultMapApi || eventDoc.defaultMapApi || staticConfig.defaultMapApi,
    activeCourseId: eventDoc.activeCourseId || courseDoc.id || staticConfig.activeCourseId,
    defaultGpxPath: staticConfig.defaultGpxPath,
    courses: eventDoc.courses || staticConfig.courses,
    pois: pois.length ? pois : staticConfig.pois
  };
}

async function loadActiveGpxVersion(db, collections, courseId, activeGpxVersionId) {
  if (!activeGpxVersionId) return null;
  const versionRef = doc(db, collections.courseMaps, courseId, collections.gpxVersions, activeGpxVersionId);
  const versionSnap = await getDoc(versionRef);
  if (!versionSnap.exists()) return null;
  return { id: versionSnap.id, ...versionSnap.data() };
}

async function loadFirstActiveGpxVersion(db, collections, courseId) {
  const versionsRef = collection(db, collections.courseMaps, courseId, collections.gpxVersions);
  const activeQuery = query(versionsRef, where('isActive', '==', true), limit(1));
  const snap = await getDocs(activeQuery);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
}

async function loadPois(db, collections, courseId) {
  const poisRef = collection(db, collections.courseMaps, courseId, collections.pois);
  const snap = await getDocs(poisRef);
  return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function loadFirebaseCourseBundle(eventId = 'gcrun') {
  const staticConfig = getEventConfig(eventId);
  const fallback = { source: 'static', eventConfig: staticConfig, gpxXml: null, error: null };
  if (!isFirebaseEnabled()) return fallback;

  const options = getFirebaseOptions();
  const collections = options.collections;

  try {
    const db = getFirebaseDb();
    const eventRef = doc(db, collections.events, eventId);
    const eventSnap = await getDoc(eventRef);
    if (!eventSnap.exists()) return fallback;

    const eventDoc = { id: eventSnap.id, ...eventSnap.data() };
    const courseId = eventDoc.activeCourseId;
    if (!courseId) return { ...fallback, source: 'firebase', eventConfig: mergeEventConfig(staticConfig, eventDoc) };

    const courseRef = doc(db, collections.courseMaps, courseId);
    const courseSnap = await getDoc(courseRef);
    const courseDoc = courseSnap.exists() ? { id: courseSnap.id, ...courseSnap.data() } : { id: courseId };
    const pois = await loadPois(db, collections, courseId);
    const activeVersion = await loadActiveGpxVersion(db, collections, courseId, courseDoc.activeGpxVersionId)
      || await loadFirstActiveGpxVersion(db, collections, courseId);

    const gpxXml = courseDoc.gpxXml || activeVersion?.gpxXml || null;
    return {
      source: 'firebase',
      eventConfig: mergeEventConfig(staticConfig, eventDoc, courseDoc, pois),
      course: courseDoc,
      gpxVersion: activeVersion,
      gpxXml,
      fallback: !gpxXml,
      error: null
    };
  } catch (error) {
    console.warn('Firebase course load failed; falling back to static config.', error);
    return { ...fallback, error };
  }
}

export async function saveGpxVersionFromXml({
  eventId = 'gcrun',
  courseId = 'gcrun-2026',
  versionId = 'v001',
  fileName,
  gpxXml,
  summary,
  uploadedBy
}) {
  if (!isFirebaseEnabled()) throw new Error('Firebase가 활성화되어 있지 않습니다.');
  if (!gpxXml || !gpxXml.includes('<gpx')) throw new Error('GPX XML 원문이 필요합니다.');

  const db = getFirebaseDb();
  const { collections } = getFirebaseOptions();
  const staticConfig = getEventConfig(eventId);

  await setDoc(doc(db, collections.events, eventId), {
    title: staticConfig.title,
    subtitle: staticConfig.subtitle,
    activeCourseId: courseId,
    defaultMapApi: staticConfig.defaultMapApi || 'kakao',
    visibility: 'public',
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, collections.courseMaps, courseId), {
    eventId,
    title: `${staticConfig.title} 코스`,
    activeGpxVersionId: versionId,
    defaultMapApi: staticConfig.defaultMapApi || 'kakao',
    updatedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, collections.courseMaps, courseId, collections.gpxVersions, versionId), {
    fileName,
    isActive: true,
    gpxXml,
    pointCount: summary.pointCount,
    distanceKm: Number(summary.distanceKm.toFixed(3)),
    elevationMin: Number(summary.elevationMin.toFixed(1)),
    elevationMax: Number(summary.elevationMax.toFixed(1)),
    uploadedBy,
    uploadedAt: serverTimestamp()
  }, { merge: true });

  return { eventId, courseId, versionId, pointCount: summary.pointCount, distanceKm: summary.distanceKm };
}
