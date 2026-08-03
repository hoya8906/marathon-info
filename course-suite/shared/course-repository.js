import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
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

export async function loadCoursePois(courseId = 'gcrun-2026') {
  if (!isFirebaseEnabled()) return [];
  const db = getFirebaseDb();
  const { collections } = getFirebaseOptions();
  const poisRef = collection(db, collections.courseMaps, courseId, collections.pois);
  const snap = await getDocs(poisRef);
  return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

async function loadPois(db, collections, courseId) {
  const poisRef = collection(db, collections.courseMaps, courseId, collections.pois);
  const snap = await getDocs(poisRef);
  return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function loadGpxVersions(courseId = 'gcrun-2026') {
  if (!isFirebaseEnabled()) return [];
  const db = getFirebaseDb();
  const { collections } = getFirebaseOptions();
  const versionsRef = collection(db, collections.courseMaps, courseId, collections.gpxVersions);
  const snap = await getDocs(versionsRef);
  return snap.docs
    .map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        fileName: data.fileName,
        isActive: data.isActive === true,
        pointCount: data.pointCount,
        distanceKm: data.distanceKm,
        uploadedBy: data.uploadedBy,
        uploadedAt: data.uploadedAt,
        hasGpxXml: Boolean(data.gpxXml)
      };
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || String(b.id).localeCompare(String(a.id)));
}

export async function loadGpxVersion({ courseId = 'gcrun-2026', versionId = 'v001' }) {
  if (!isFirebaseEnabled()) throw new Error('Firebase가 활성화되어 있지 않습니다.');
  const db = getFirebaseDb();
  const { collections } = getFirebaseOptions();
  const versionRef = doc(db, collections.courseMaps, courseId, collections.gpxVersions, versionId);
  const snap = await getDoc(versionRef);
  if (!snap.exists()) throw new Error(`${versionId} GPX 버전을 찾을 수 없습니다.`);
  return { id: snap.id, ...snap.data() };
}

export async function setActiveGpxVersion({ courseId = 'gcrun-2026', versionId }) {
  if (!isFirebaseEnabled()) throw new Error('Firebase가 활성화되어 있지 않습니다.');
  if (!versionId) throw new Error('활성화할 GPX versionId가 필요합니다.');
  const db = getFirebaseDb();
  const { collections } = getFirebaseOptions();
  const versionsRef = collection(db, collections.courseMaps, courseId, collections.gpxVersions);
  const snap = await getDocs(versionsRef);
  await Promise.all(snap.docs.map(docSnap => setDoc(docSnap.ref, { isActive: docSnap.id === versionId }, { merge: true })));
  await setDoc(doc(db, collections.courseMaps, courseId), { activeGpxVersionId: versionId, updatedAt: serverTimestamp() }, { merge: true });
  return { courseId, versionId };
}

export async function deleteGpxVersion({ courseId = 'gcrun-2026', versionId }) {
  if (!isFirebaseEnabled()) throw new Error('Firebase가 활성화되어 있지 않습니다.');
  if (!versionId) throw new Error('삭제할 GPX versionId가 필요합니다.');
  const db = getFirebaseDb();
  const { collections } = getFirebaseOptions();
  await deleteDoc(doc(db, collections.courseMaps, courseId, collections.gpxVersions, versionId));
  return { courseId, versionId };
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

export async function savePoi({ courseId = 'gcrun-2026', poi }) {
  if (!isFirebaseEnabled()) throw new Error('Firebase가 활성화되어 있지 않습니다.');
  if (!poi?.id) throw new Error('POI id가 필요합니다.');
  if (!Number.isFinite(Number(poi.lat)) || !Number.isFinite(Number(poi.lng))) throw new Error('POI 좌표가 필요합니다.');
  const db = getFirebaseDb();
  const { collections } = getFirebaseOptions();
  const poiRef = doc(db, collections.courseMaps, courseId, collections.pois, poi.id);
  await setDoc(poiRef, {
    ...poi,
    lat: Number(poi.lat),
    lng: Number(poi.lng),
    distanceKm: poi.distanceKm === '' || poi.distanceKm == null ? null : Number(poi.distanceKm),
    quantity: poi.quantity === '' || poi.quantity == null ? 1 : Number(poi.quantity),
    updatedAt: serverTimestamp()
  }, { merge: true });
  return { courseId, poiId: poi.id };
}

export async function deletePoi({ courseId = 'gcrun-2026', poiId }) {
  if (!isFirebaseEnabled()) throw new Error('Firebase가 활성화되어 있지 않습니다.');
  if (!poiId) throw new Error('POI id가 필요합니다.');
  const db = getFirebaseDb();
  const { collections } = getFirebaseOptions();
  await deleteDoc(doc(db, collections.courseMaps, courseId, collections.pois, poiId));
  return { courseId, poiId };
}
