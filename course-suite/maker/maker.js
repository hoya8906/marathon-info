import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirebaseAuth, getFirebaseOptions, signInWithGoogle, signOutFirebase } from '../shared/firebase.js';
import { deleteGpxVersion, deletePoi, loadCoursePois, loadGpxVersion, loadGpxVersions, renameGpxVersion, saveGpxVersionFromXml, savePoi, setActiveGpxVersion } from '../shared/course-repository.js';
import { findPointAtDistance, parseGpx, summarizeTrack } from '../shared/gpx-utils.js';
import { getPoiType } from '../shared/poi-icons.js';

const $ = (selector) => document.querySelector(selector);
const CENTER = { lat: 37.441466, lng: 126.994113 };
const LEAFLET_LAYERS = {
  osm: {
    label: 'OSM 일반',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  topo: {
    label: '지형',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap contributors'
  },
  light: {
    label: '라이트',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  },
  dark: {
    label: '다크',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }
};

const loginButton = $('#loginButton');
const logoutButton = $('#logoutButton');
const uploadButton = $('#uploadButton') || $('#explorerSaveCurrentGpxButton') || $('#saveCurrentGpxButton');
const gpxFileInput = $('#gpxFileInput');
const authStatus = $('#authStatus');
const uploadStatus = $('#uploadStatus');
const resultOutput = $('#resultOutput');
const adminEmail = $('#adminEmail');
const poiStatus = $('#poiStatus');
const poiList = $('#poiList');
const poiForm = $('#poiForm');
const deletePoiButton = $('#deletePoiButton');
const resetPoiButton = $('#resetPoiButton');
const downloadMapImageButton = $('#downloadMapImageButton');
const explorerFileList = $('#explorerFileList');
const refreshGpxListButton = $('#refreshGpxListButton');
const activeGpxSummary = $('#explorerStatusLine');
const connectedGpxPath = $('#explorerPathLine');
const importGpxButton = $('#explorerImportGpxButton') || $('#importGpxButton');
const saveCurrentGpxButton = $('#explorerSaveCurrentGpxButton') || $('#saveCurrentGpxButton');
const renameGpxButton = $('#renameGpxButton');
const toolbarStatus = $('#toolbarStatus');
const mapApiHint = $('#mapApiHint');
const layerToggleButton = $('#layerToggleButton');
const layerPopover = $('#layerPopover');
const poiContextMenu = $('#poiContextMenu');
const mapContextMenu = $('#mapContextMenu');
const currentAdminEmail = $('#currentAdminEmail');
const toggleExplorerButton = $('#toggleExplorerButton');
const appShell = $('.maker-app-shell');

let currentUser = null;
let selectedFile = null;
let selectedGpxXml = null;
let selectedSummary = null;
let selectedTrackPoints = [];
let kakaoCoursePolyline = null;
let leafletCoursePolyline = null;
let activeMapApi = 'kakao';
let kakaoMap = null;
let kakaoMarkers = [];
let pendingPoiMarker = null;
let pendingPoiCircle = null;
let activeKakaoOverlays = new Set();
let activeLeafletLayer = 'osm';
let leafletMap = null;
let leafletTileLayer = null;
let leafletMarkerLayer = null;
let poiItems = [];
let gpxVersions = [];
let selectedGpxVersionId = null;
let contextPoi = null;
let mapContextLatLng = null;
let editingPoiId = null;

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
}

function isAdmin(user) {
  const adminEmails = getFirebaseOptions().adminEmails || [];
  return Boolean(user?.email && adminEmails.includes(user.email));
}

function currentCourseId() {
  return $('#courseIdInput').value.trim() || 'gcrun-2026';
}

function gpxFirestorePath(courseId = currentCourseId(), versionId = selectedGpxVersionId || $('#versionIdInput').value.trim() || 'v001') {
  return `firestore://courseMaps/${courseId}/gpxVersions/${versionId}`;
}

function updateConnectedGpxPath(version = null) {
  const courseId = currentCourseId();
  const versionId = version?.id || selectedGpxVersionId || $('#versionIdInput').value.trim() || 'v001';
  const fileName = version?.fileName || gpxVersions.find(item => item.id === versionId)?.fileName || selectedFile?.name || '미저장 GPX';
  connectedGpxPath.textContent = `연결 GPX: ${gpxFirestorePath(courseId, versionId)} · ${fileName}`;
}

function updateUploadButton() {
  const canSave = Boolean(currentUser && isAdmin(currentUser) && selectedGpxXml && selectedSummary);
  uploadButton.disabled = !canSave;
  saveCurrentGpxButton.disabled = !canSave;
}

function renderResult(data) {
  resultOutput.textContent = JSON.stringify(data, null, 2);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('파일을 읽을 수 없습니다.'));
    reader.readAsText(file);
  });
}

async function handleFileSelected() {
  selectedFile = gpxFileInput.files?.[0] || null;
  selectedGpxXml = null;
  selectedSummary = null;
  selectedTrackPoints = [];
  renderGpxCourse();
  updateUploadButton();

  if (!selectedFile) {
    setStatus(uploadStatus, 'GPX 파일을 선택하세요.');
    return;
  }
  if (!selectedFile.name.toLowerCase().endsWith('.gpx')) {
    setStatus(uploadStatus, '확장자가 .gpx인 파일을 선택하세요.', 'error');
    return;
  }

  try {
    const text = await readFileAsText(selectedFile);
    const trackPoints = parseGpx(text);
    const summary = summarizeTrack(trackPoints);
    selectedGpxXml = text;
    selectedSummary = summary;
    selectedTrackPoints = trackPoints;
    selectedGpxVersionId = null;
    renderGpxCourse();
    fitGpxBounds();
    toolbarStatus.textContent = `${selectedFile.name} 편집 중`;
    updateConnectedGpxPath({ id: $('#versionIdInput').value.trim() || 'v001', fileName: selectedFile.name });
    setStatus(uploadStatus, `${selectedFile.name} 파싱 완료 · ${summary.pointCount.toLocaleString()}개 포인트 · ${summary.distanceKm.toFixed(2)}km`, 'ok');
    renderResult({ fileName: selectedFile.name, summary });
  } catch (error) {
    setStatus(uploadStatus, `GPX 파싱 실패: ${error.message}`, 'error');
    renderResult({ error: error.message });
  }
  updateUploadButton();
}

async function handleUpload() {
  if (!currentUser || !isAdmin(currentUser)) {
    setStatus(uploadStatus, '관리자 이메일로 로그인해야 업로드할 수 있습니다.', 'error');
    return;
  }
  if (!selectedFile || !selectedGpxXml || !selectedSummary) {
    setStatus(uploadStatus, '먼저 GPX 파일을 선택하고 파싱하세요.', 'error');
    return;
  }

  const eventId = $('#eventIdInput').value.trim() || 'gcrun';
  const courseId = currentCourseId();
  const versionId = $('#versionIdInput').value.trim() || 'v001';

  try {
    uploadButton.disabled = true;
    setStatus(uploadStatus, 'Firestore에 GPX 원본 저장 중...');
    const result = await saveGpxVersionFromXml({
      eventId,
      courseId,
      versionId,
      fileName: selectedFile.name,
      gpxXml: selectedGpxXml,
      summary: selectedSummary,
      uploadedBy: currentUser.email
    });
    setStatus(uploadStatus, 'Firestore 저장 완료. 뷰어에서 새로고침해 확인하세요.', 'ok');
    renderResult({ saved: result, viewerUrl: `../viewer/?event=${encodeURIComponent(eventId)}` });
    await refreshGpxVersionBrowser();
  } catch (error) {
    setStatus(uploadStatus, `Firestore 저장 실패: ${error.message}`, 'error');
    renderResult({ error: error.message });
  }
  updateUploadButton();
}

function applyGpxVersionToMap(version) {
  if (!version?.gpxXml) throw new Error('이 버전에는 GPX XML이 없습니다.');
  const trackPoints = parseGpx(version.gpxXml);
  const summary = summarizeTrack(trackPoints);
  selectedFile = null;
  selectedGpxXml = version.gpxXml;
  selectedSummary = summary;
  selectedTrackPoints = trackPoints;
  selectedGpxVersionId = version.id || null;
  $('#versionIdInput').value = version.id || $('#versionIdInput').value;
  renderGpxCourse();
  fitGpxBounds();
  toolbarStatus.textContent = `${version.fileName || version.id} 불러옴`;
  updateConnectedGpxPath(version);
  setStatus(uploadStatus, `${version.fileName || version.id} 불러오기 완료 · ${summary.pointCount.toLocaleString()}개 포인트 · ${summary.distanceKm.toFixed(2)}km`, 'ok');
  renderResult({ loadedGpxVersion: { id: version.id, fileName: version.fileName, summary } });
  updateUploadButton();
}

function renderExplorerFileList() {
  const active = gpxVersions.find(version => version.isActive);
  activeGpxSummary.textContent = active
    ? `${active.id} · ${active.fileName || '파일명 없음'} · ${Number(active.distanceKm || 0).toFixed(2)}km`
    : '저장된 활성 GPX 없음';
  updateConnectedGpxPath(active);

  if (!gpxVersions.length) {
    explorerFileList.innerHTML = '<button type="button" class="explorer-file-row muted-row">저장된 GPX 파일 없음</button>';
    return;
  }

  explorerFileList.innerHTML = gpxVersions.map(version => `
    <div class="explorer-file-row ${version.isActive ? 'active' : ''}" data-version-id="${version.id}">
      <button type="button" class="explorer-file-main" data-gpx-action="load" data-version-id="${version.id}" title="불러오기">
        <span class="file-icon">${version.isActive ? '✅' : '📄'}</span>
        <span class="file-name">${version.id} · ${version.fileName || 'GPX'}</span>
        <small>${Number(version.distanceKm || 0).toFixed(3)}km · ${Number(version.pointCount || 0).toLocaleString()}pt</small>
      </button>
      <div class="explorer-file-actions">
        <button type="button" data-gpx-action="activate" data-version-id="${version.id}" title="활성화">●</button>
        <button type="button" data-gpx-action="delete" data-version-id="${version.id}" title="삭제">×</button>
      </div>
    </div>
  `).join('');

  explorerFileList.querySelectorAll('[data-gpx-action]').forEach(button => {
    const versionId = button.dataset.versionId;
    if (button.dataset.gpxAction === 'load') button.addEventListener('click', () => handleGpxVersionLoad(versionId));
    if (button.dataset.gpxAction === 'activate') button.addEventListener('click', () => handleGpxVersionActivate(versionId));
    if (button.dataset.gpxAction === 'delete') button.addEventListener('click', () => handleGpxVersionDelete(versionId));
  });
}

function renderGpxVersionTree() {
  renderExplorerFileList();
}

async function refreshGpxVersionBrowser() {
  try {
    explorerFileList.innerHTML = '<p class="status">GPX 목록을 불러오는 중...</p>';
    gpxVersions = await loadGpxVersions(currentCourseId());
    renderGpxVersionTree();
  } catch (error) {
    activeGpxSummary.textContent = `GPX 목록 로드 실패: ${error.message}`;
    explorerFileList.innerHTML = `<p class="status error">${error.message}</p>`;
  }
}

async function handleGpxVersionLoad(versionId) {
  try {
    const version = await loadGpxVersion({ courseId: currentCourseId(), versionId });
    applyGpxVersionToMap(version);
  } catch (error) {
    setStatus(uploadStatus, `GPX 불러오기 실패: ${error.message}`, 'error');
  }
}

async function handleGpxVersionActivate(versionId) {
  if (!currentUser || !isAdmin(currentUser)) {
    setStatus(uploadStatus, '관리자 이메일로 로그인해야 활성화할 수 있습니다.', 'error');
    return;
  }
  try {
    const result = await setActiveGpxVersion({ courseId: currentCourseId(), versionId });
    setStatus(uploadStatus, `${versionId} 활성화 완료. Viewer 기본 GPX로 사용됩니다.`, 'ok');
    renderResult({ activeGpxVersion: result });
    await refreshGpxVersionBrowser();
  } catch (error) {
    setStatus(uploadStatus, `GPX 활성화 실패: ${error.message}`, 'error');
  }
}

async function handleGpxVersionDelete(versionId) {
  if (!currentUser || !isAdmin(currentUser)) {
    setStatus(uploadStatus, '관리자 이메일로 로그인해야 삭제할 수 있습니다.', 'error');
    return;
  }
  if (!window.confirm(`${versionId} GPX 버전을 삭제할까요?`)) return;
  try {
    const result = await deleteGpxVersion({ courseId: currentCourseId(), versionId });
    setStatus(uploadStatus, `${versionId} 삭제 완료`, 'ok');
    renderResult({ deletedGpxVersion: result });
    await refreshGpxVersionBrowser();
  } catch (error) {
    setStatus(uploadStatus, `GPX 삭제 실패: ${error.message}`, 'error');
  }
}

function handleExplorerImport() {
  gpxFileInput.click();
}

async function handleGpxVersionRename() {
  const versionId = selectedGpxVersionId || $('#versionIdInput').value.trim();
  if (!versionId) {
    setStatus(uploadStatus, '수정할 GPX 버전을 먼저 불러오세요.', 'error');
    return;
  }
  if (!currentUser || !isAdmin(currentUser)) {
    setStatus(uploadStatus, '관리자 이메일로 로그인해야 수정할 수 있습니다.', 'error');
    return;
  }
  const nextName = window.prompt('새 GPX 표시 이름', gpxVersions.find(v => v.id === versionId)?.fileName || versionId);
  if (!nextName) return;
  try {
    const result = await renameGpxVersion({ courseId: currentCourseId(), versionId, fileName: nextName });
    setStatus(uploadStatus, `${versionId} 이름 수정 완료`, 'ok');
    renderResult({ renamedGpxVersion: result });
    await refreshGpxVersionBrowser();
  } catch (error) {
    setStatus(uploadStatus, `GPX 이름 수정 실패: ${error.message}`, 'error');
  }
}

function loadKakaoMaps() {
  return new Promise((resolve, reject) => {
    if (!window.kakao?.maps) return reject(new Error('Kakao Maps SDK를 찾을 수 없습니다.'));
    window.kakao.maps.load(resolve);
  });
}

async function initKakaoEditorMap() {
  await loadKakaoMaps();
  const center = new kakao.maps.LatLng(CENTER.lat, CENTER.lng);
  kakaoMap = new kakao.maps.Map($('#kakaoMakerMap'), { center, level: 5, mapTypeId: kakao.maps.MapTypeId.HYBRID });
  kakao.maps.event.addListener(kakaoMap, 'click', () => closeMapContextMenu());
  kakao.maps.event.addListener(kakaoMap, 'rightclick', (mouseEvent) => {
    const latlng = mouseEvent.latLng;
    openMapContextMenu(mouseEvent.domEvent || window.event || {}, { lat: latlng.getLat(), lng: latlng.getLng() });
  });
  setKakaoBaseMapType('hybrid');
}

function initLeafletEditorMap() {
  leafletMap = L.map('leafletMakerMap', { preferCanvas: true }).setView([CENTER.lat, CENTER.lng], 14);
  setLeafletLayer(activeLeafletLayer);
  leafletMarkerLayer = L.layerGroup().addTo(leafletMap);
  leafletMap.on('click', () => closeMapContextMenu());
  leafletMap.on('contextmenu', (event) => openMapContextMenu(event.originalEvent || event, { lat: event.latlng.lat, lng: event.latlng.lng }));
}

function setLeafletLayer(layerKey = 'osm') {
  activeLeafletLayer = LEAFLET_LAYERS[layerKey] ? layerKey : 'osm';
  if (!leafletMap) return;
  if (leafletTileLayer) leafletTileLayer.remove();
  const layer = LEAFLET_LAYERS[activeLeafletLayer];
  leafletTileLayer = L.tileLayer(layer.url, {
    maxZoom: activeLeafletLayer === 'topo' ? 17 : 20,
    crossOrigin: true,
    attribution: layer.attribution
  }).addTo(leafletMap);
  document.querySelectorAll('[data-leaflet-layer]').forEach(button => button.classList.toggle('active', button.dataset.leafletLayer === activeLeafletLayer));
  if (activeMapApi === 'leaflet') mapApiHint.textContent = `현재 API: Leaflet · ${layer.label} 레이어 표시 중`;
}

function renderGpxCourse() {
  if (kakaoCoursePolyline) {
    kakaoCoursePolyline.setMap(null);
    kakaoCoursePolyline = null;
  }
  if (leafletCoursePolyline) {
    leafletCoursePolyline.remove();
    leafletCoursePolyline = null;
  }
  if (!selectedTrackPoints.length) return;

  if (kakaoMap) {
    kakaoCoursePolyline = new kakao.maps.Polyline({
      path: selectedTrackPoints.map(point => new kakao.maps.LatLng(point.lat, point.lng)),
      strokeWeight: 6,
      strokeColor: '#5e6ad2',
      strokeOpacity: .92
    });
    kakaoCoursePolyline.setMap(kakaoMap);
  }
  if (leafletMap) {
    leafletCoursePolyline = L.polyline(selectedTrackPoints.map(point => [point.lat, point.lng]), {
      color: '#5e6ad2',
      weight: 5,
      opacity: .92
    }).addTo(leafletMap);
  }
}

function fitGpxBounds() {
  if (!selectedTrackPoints.length) return;
  if (kakaoMap) {
    const bounds = new kakao.maps.LatLngBounds();
    selectedTrackPoints.forEach(point => bounds.extend(new kakao.maps.LatLng(point.lat, point.lng)));
    kakaoMap.setBounds(bounds);
  }
  if (leafletMap && leafletCoursePolyline) leafletMap.fitBounds(leafletCoursePolyline.getBounds(), { padding: [24, 24] });
}

async function initPoiEditorMap() {
  initLeafletEditorMap();
  try {
    await initKakaoEditorMap();
    switchMapApi('kakao');
  } catch (error) {
    setStatus(poiStatus, `카카오맵 로드 실패, Leaflet 보조 지도로 전환합니다: ${error.message}`, 'error');
    switchMapApi('leaflet');
  }
}

function switchMapApi(nextApi) {
  activeMapApi = nextApi;
  $('#kakaoMakerMap').classList.toggle('active', activeMapApi === 'kakao');
  $('#leafletMakerMap').classList.toggle('active', activeMapApi === 'leaflet');
  document.querySelectorAll('[data-map-api]').forEach(button => button.classList.toggle('active', button.dataset.mapApi === activeMapApi));
  updateApiSpecificUi();
  if (activeMapApi === 'leaflet') setTimeout(() => leafletMap?.invalidateSize(), 30);
  if (activeMapApi === 'kakao' && kakaoMap) setTimeout(() => kakaoMap.relayout(), 30);
  renderGpxCourse();
  renderPoiMarkers();
}

function updateApiSpecificUi() {
  document.querySelectorAll('[data-api-panel]').forEach(panel => {
    panel.hidden = panel.dataset.apiPanel !== activeMapApi;
    panel.style.display = panel.dataset.apiPanel === activeMapApi ? 'block' : 'none';
  });
  mapApiHint.textContent = activeMapApi === 'kakao'
    ? '현재 API: 카카오맵 · 카카오 지도/레이어만 표시 중'
    : `현재 API: Leaflet · ${LEAFLET_LAYERS[activeLeafletLayer].label} 레이어 표시 중`;
}

function toggleLayerPopover() {
  const nextHidden = !layerPopover.hidden;
  layerPopover.hidden = nextHidden;
  layerToggleButton.setAttribute('aria-expanded', String(!nextHidden));
}

function closeLayerPopover() {
  layerPopover.hidden = true;
  layerToggleButton.setAttribute('aria-expanded', 'false');
}

function setKakaoBaseMapType(type) {
  if (!kakaoMap) return;
  const types = {
    roadmap: kakao.maps.MapTypeId.ROADMAP,
    hybrid: kakao.maps.MapTypeId.HYBRID
  };
  kakaoMap.setMapTypeId(types[type] || kakao.maps.MapTypeId.HYBRID);
  document.querySelectorAll('[data-kakao-map-type]').forEach(button => button.classList.toggle('active', button.dataset.kakaoMapType === type));
}

function toggleKakaoOverlay(overlayName, enabled) {
  if (!kakaoMap) return;
  const overlayTypes = {
    TRAFFIC: kakao.maps.MapTypeId.TRAFFIC,
    BICYCLE: kakao.maps.MapTypeId.BICYCLE,
    TERRAIN: kakao.maps.MapTypeId.TERRAIN
  };
  const overlay = overlayTypes[overlayName];
  if (!overlay) return;
  if (enabled && !activeKakaoOverlays.has(overlayName)) {
    kakaoMap.addOverlayMapTypeId(overlay);
    activeKakaoOverlays.add(overlayName);
  }
  if (!enabled && activeKakaoOverlays.has(overlayName)) {
    kakaoMap.removeOverlayMapTypeId(overlay);
    activeKakaoOverlays.delete(overlayName);
  }
}

function handleMapClick({ lat, lng }) {
  $('#poiLatInput').value = Number(lat).toFixed(6);
  $('#poiLngInput').value = Number(lng).toFixed(6);
  if (!$('#poiIdInput').value.trim()) $('#poiIdInput').value = `poi-${Date.now()}`;
  renderPendingPoiMarker(lat, lng);
  setStatus(poiStatus, '새 지점 위치를 준비했습니다. 유형/이름을 확인 후 저장하세요.', 'ok');
}

function beginPoiRegistrationAt(latLng) {
  resetPoiForm();
  handleMapClick(latLng);
  closeMapContextMenu();
}

function stopContextEvent(event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }
  event?.domEvent?.preventDefault?.();
  event?.domEvent?.stopPropagation?.();
  event?.originalEvent?.preventDefault?.();
  event?.originalEvent?.stopPropagation?.();
}

function openMapContextMenu(event, latLng) {
  stopContextEvent(event);
  const source = event?.domEvent || event?.originalEvent || event || {};
  if (source.target?.closest?.('.poi-marker-pin')) return;
  closePoiContextMenu();
  mapContextLatLng = latLng;
  mapContextMenu.hidden = false;
  const x = source.clientX ?? 24;
  const y = source.clientY ?? 24;
  mapContextMenu.style.left = `${Math.min(x, window.innerWidth - 210)}px`;
  mapContextMenu.style.top = `${Math.min(y, window.innerHeight - 120)}px`;
}

function closeMapContextMenu() {
  mapContextMenu.hidden = true;
  mapContextLatLng = null;
}

async function handleMapContextAction(action) {
  if (!mapContextLatLng) return;
  if (action === 'new-poi') beginPoiRegistrationAt(mapContextLatLng);
  if (action === 'copy-coordinates') {
    const text = `${Number(mapContextLatLng.lat).toFixed(6)}, ${Number(mapContextLatLng.lng).toFixed(6)}`;
    await navigator.clipboard?.writeText(text);
    setStatus(poiStatus, `좌표를 복사했습니다: ${text}`, 'ok');
    closeMapContextMenu();
  }
}

function applyDistanceKmToPoiCoordinates() {
  const value = $('#poiDistanceInput').value.trim();
  if (!value) return;
  const distanceKm = Number(value);
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    setStatus(poiStatus, '거리 km는 0 이상의 숫자로 입력하세요.', 'error');
    return;
  }
  if (!selectedTrackPoints.length) {
    setStatus(poiStatus, '먼저 GPX를 가져오거나 파일함에서 불러와야 km 기준 좌표를 계산할 수 있습니다.', 'error');
    return;
  }
  const point = findPointAtDistance(selectedTrackPoints, distanceKm);
  if (!point) return;
  $('#poiLatInput').value = Number(point.lat).toFixed(6);
  $('#poiLngInput').value = Number(point.lng).toFixed(6);
  if (!$('#poiIdInput').value.trim()) $('#poiIdInput').value = `km-${String(value).replace(/[^0-9a-z]+/gi, '-')}-${Date.now()}`;
  renderPendingPoiMarker(point.lat, point.lng);
  setStatus(poiStatus, `${distanceKm.toFixed(2)}km 거리 km 기준 좌표를 자동 입력했습니다.`, 'ok');
}

function formToPoi() {
  return {
    id: $('#poiIdInput').value.trim(),
    name: $('#poiNameInput').value.trim(),
    type: $('#poiTypeInput').value,
    visibility: $('#poiVisibilityInput').value,
    lat: Number($('#poiLatInput').value),
    lng: Number($('#poiLngInput').value),
    distanceKm: $('#poiDistanceInput').value,
    quantity: $('#poiQuantityInput').value || 1,
    team: $('#poiTeamInput').value.trim(),
    description: $('#poiDescriptionInput').value.trim(),
    status: 'planned'
  };
}

function setMapCenter(lat, lng, zoom = 16) {
  if (leafletMap) leafletMap.setView([lat, lng], Math.max(leafletMap.getZoom(), zoom));
  if (kakaoMap) {
    kakaoMap.setCenter(new kakao.maps.LatLng(lat, lng));
    kakaoMap.setLevel(Math.min(kakaoMap.getLevel(), 4));
  }
}

function clearPendingPoiMarker() {
  if (pendingPoiMarker?.setMap) pendingPoiMarker.setMap(null);
  if (pendingPoiCircle?.remove) pendingPoiCircle.remove();
  pendingPoiMarker = null;
  pendingPoiCircle = null;
}

function renderPendingPoiMarker(lat, lng) {
  clearPendingPoiMarker();
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return;
  if (kakaoMap) {
    const content = document.createElement('div');
    content.className = 'pending-poi-dot';
    pendingPoiMarker = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(safeLat, safeLng),
      content,
      yAnchor: .5,
      clickable: false
    });
    pendingPoiMarker.setMap(kakaoMap);
  }
  if (leafletMap) {
    pendingPoiCircle = L.marker([safeLat, safeLng], {
      interactive: false,
      icon: L.divIcon({ className: '', html: '<div class="pending-poi-dot"></div>', iconSize: [24, 24] })
    }).addTo(leafletMap);
  }
}

function setQuickPoiType(type) {
  $('#poiTypeInput').value = type;
  document.querySelectorAll('[data-quick-poi-type]').forEach(button => button.classList.toggle('active', button.dataset.quickPoiType === type));
}

function fillPoiForm(poi, { moveMap = false } = {}) {
  if (!poi) return;
  editingPoiId = poi.id;
  $('#poiIdInput').value = poi.id || '';
  $('#poiNameInput').value = poi.name || '';
  $('#poiTypeInput').value = poi.type || 'water';
  $('#poiVisibilityInput').value = poi.visibility || 'public';
  $('#poiLatInput').value = poi.lat ?? '';
  $('#poiLngInput').value = poi.lng ?? '';
  $('#poiDistanceInput').value = poi.distanceKm ?? '';
  $('#poiQuantityInput').value = poi.quantity ?? 1;
  $('#poiTeamInput').value = poi.team || '';
  $('#poiDescriptionInput').value = poi.description || '';
  toolbarStatus.textContent = `${poi.name || poi.id} 편집 중`;
  setQuickPoiType(poi.type || 'water');
  if (moveMap && poi.lat && poi.lng) setMapCenter(Number(poi.lat), Number(poi.lng));
}

function openPoiContextMenu(event, poi) {
  stopContextEvent(event);
  closeMapContextMenu();
  contextPoi = poi;
  poiContextMenu.hidden = false;
  const x = event.clientX ?? 24;
  const y = event.clientY ?? 24;
  poiContextMenu.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
  poiContextMenu.style.top = `${Math.min(y, window.innerHeight - 190)}px`;
}

function closePoiContextMenu() {
  poiContextMenu.hidden = true;
  contextPoi = null;
}

async function copyPoiCoordinates(poi = contextPoi) {
  if (!poi) return;
  const text = `${poi.lat}, ${poi.lng}`;
  await navigator.clipboard?.writeText(text);
  setStatus(poiStatus, `${poi.name || poi.id} 좌표를 복사했습니다: ${text}`, 'ok');
}

function duplicatePoi(poi = contextPoi) {
  if (!poi) return;
  const next = { ...poi, id: `${poi.id || 'poi'}-copy-${Date.now()}`, name: `${poi.name || poi.id} 복제` };
  fillPoiForm(next);
  setStatus(poiStatus, '복제된 지점을 확인 후 저장하세요.', 'ok');
}

async function handlePoiContextAction(action) {
  if (!contextPoi) return;
  if (action === 'edit') fillPoiForm(contextPoi);
  if (action === 'duplicate') duplicatePoi(contextPoi);
  if (action === 'copy-coordinates') await copyPoiCoordinates(contextPoi);
  if (action === 'delete') {
    fillPoiForm(contextPoi);
    await handlePoiDelete();
  }
  closePoiContextMenu();
}

function resetPoiForm() {
  editingPoiId = null;
  poiForm.reset();
  $('#poiTypeInput').value = 'water';
  $('#poiVisibilityInput').value = 'public';
  $('#poiQuantityInput').value = 1;
  setQuickPoiType('water');
  clearPendingPoiMarker();
  setStatus(poiStatus, '새 지점은 빈 지도에서 우클릭 후 위치를 선택하세요.');
}

function clearKakaoMarkers() {
  kakaoMarkers.forEach(marker => marker.setMap(null));
  kakaoMarkers = [];
}

function renderKakaoPoiMarkers() {
  if (!kakaoMap) return;
  clearKakaoMarkers();
  poiItems.forEach(poi => {
    if (!Number.isFinite(Number(poi.lat)) || !Number.isFinite(Number(poi.lng))) return;
    const type = getPoiType(poi.type);
    const content = document.createElement('button');
    content.type = 'button';
    content.className = 'poi-marker-pin';
    content.innerHTML = `<span class="poi-marker-dot"></span><span class="poi-marker-label">${type.icon} ${poi.name || poi.id}</span>`;
    content.addEventListener('click', event => openPoiContextMenu(event, poi));
    content.addEventListener('contextmenu', event => openPoiContextMenu(event, poi));
    const marker = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(Number(poi.lat), Number(poi.lng)),
      content,
      xAnchor: .5,
      yAnchor: .5,
      clickable: true
    });
    marker.setMap(kakaoMap);
    kakaoMarkers.push(marker);
  });
}

function renderLeafletPoiMarkers() {
  if (!leafletMarkerLayer) return;
  leafletMarkerLayer.clearLayers();
  poiItems.forEach(poi => {
    if (!Number.isFinite(Number(poi.lat)) || !Number.isFinite(Number(poi.lng))) return;
    const type = getPoiType(poi.type);
    const icon = L.divIcon({
      className: '',
      html: `<button type="button" class="poi-marker-pin"><span class="poi-marker-dot"></span><span class="poi-marker-label">${type.icon} ${poi.name || poi.id}</span></button>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    L.marker([poi.lat, poi.lng], { icon, draggable: true })
      .on('click', event => openPoiContextMenu(event.originalEvent || event, poi))
      .on('contextmenu', event => openPoiContextMenu(event.originalEvent || event, poi))
      .on('dragend', event => {
        const next = event.target.getLatLng();
        fillPoiForm({ ...poi, lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) });
      })
      .addTo(leafletMarkerLayer);
  });
}

function renderPoiMarkers() {
  renderKakaoPoiMarkers();
  renderLeafletPoiMarkers();
}

function renderPoiList() {
  if (!poiItems.length) {
    poiList.innerHTML = '<p class="status">저장된 지점이 없습니다.</p>';
    renderPoiMarkers();
    return;
  }
  poiList.innerHTML = poiItems.map(poi => {
    const type = getPoiType(poi.type);
    return `<button type="button" data-poi-id="${poi.id}"><strong>${type.icon} ${poi.name || poi.id}</strong><small>${poi.type} · ${poi.visibility} · ${poi.lat?.toFixed?.(5) || poi.lat}, ${poi.lng?.toFixed?.(5) || poi.lng}</small></button>`;
  }).join('');
  poiList.querySelectorAll('[data-poi-id]').forEach(button => {
    button.addEventListener('click', event => openPoiContextMenu(event, poiItems.find(poi => poi.id === button.dataset.poiId)));
    button.addEventListener('contextmenu', event => openPoiContextMenu(event, poiItems.find(poi => poi.id === button.dataset.poiId)));
  });
  renderPoiMarkers();
}

async function refreshPois() {
  try {
    poiItems = await loadCoursePois(currentCourseId());
    renderPoiList();
    setStatus(poiStatus, `${poiItems.length}개 지점을 불러왔습니다.`, 'ok');
  } catch (error) {
    setStatus(poiStatus, `지점 목록 로드 실패: ${error.message}`, 'error');
  }
}

async function handlePoiSave(event) {
  event.preventDefault();
  if (!currentUser || !isAdmin(currentUser)) {
    setStatus(poiStatus, '관리자 이메일로 로그인해야 저장할 수 있습니다.', 'error');
    return;
  }
  const poi = formToPoi();
  if (!poi.id || !poi.name || !Number.isFinite(poi.lat) || !Number.isFinite(poi.lng)) {
    setStatus(poiStatus, 'id, 이름, 좌표는 필수입니다.', 'error');
    return;
  }
  try {
    const result = await savePoi({ courseId: currentCourseId(), poi });
    setStatus(poiStatus, `${poi.name} 저장 완료`, 'ok');
    clearPendingPoiMarker();
    renderResult({ poiSaved: result });
    await refreshPois();
  } catch (error) {
    setStatus(poiStatus, `지점 저장 실패: ${error.message}`, 'error');
  }
}

async function handlePoiDelete() {
  const poiId = editingPoiId || $('#poiIdInput').value.trim();
  if (!poiId) return;
  if (!currentUser || !isAdmin(currentUser)) {
    setStatus(poiStatus, '관리자 이메일로 로그인해야 삭제할 수 있습니다.', 'error');
    return;
  }
  try {
    const result = await deletePoi({ courseId: currentCourseId(), poiId });
    setStatus(poiStatus, `${poiId} 삭제 완료`, 'ok');
    clearPendingPoiMarker();
    renderResult({ poiDeleted: result });
    resetPoiForm();
    await refreshPois();
  } catch (error) {
    setStatus(poiStatus, `지점 삭제 실패: ${error.message}`, 'error');
  }
}

function projectLatLngToCanvas(point, bounds, width, height, padding = 56) {
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.00001);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.00001);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  return {
    x: padding + ((Number(point.lng) - bounds.minLng) / lngSpan) * usableWidth,
    y: padding + ((bounds.maxLat - Number(point.lat)) / latSpan) * usableHeight
  };
}

function getExportBounds() {
  const points = [
    ...selectedTrackPoints,
    ...poiItems.filter(poi => Number.isFinite(Number(poi.lat)) && Number.isFinite(Number(poi.lng)))
  ];
  if (!points.length) points.push(CENTER);
  const lats = points.map(point => Number(point.lat));
  const lngs = points.map(point => Number(point.lng));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return { minLat, maxLat, minLng, maxLng };
}

function drawExportCourse(ctx, bounds, width, height) {
  if (!selectedTrackPoints.length) return;
  ctx.save();
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5e6ad2';
  selectedTrackPoints.forEach((point, index) => {
    const projected = projectLatLngToCanvas(point, bounds, width, height);
    if (index === 0) ctx.beginPath(), ctx.moveTo(projected.x, projected.y);
    else ctx.lineTo(projected.x, projected.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawExportPois(ctx, bounds, width, height) {
  poiItems.forEach(poi => {
    if (!Number.isFinite(Number(poi.lat)) || !Number.isFinite(Number(poi.lng))) return;
    const type = getPoiType(poi.type);
    const point = projectLatLngToCanvas(poi, bounds, width, height);
    ctx.save();
    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '700 13px sans-serif';
    const label = `${type.icon} ${poi.name || poi.id}`;
    const labelWidth = ctx.measureText(label).width + 18;
    ctx.fillStyle = 'rgba(8,9,10,.78)';
    ctx.beginPath();
    ctx.roundRect(point.x + 12, point.y - 24, labelWidth, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, point.x + 21, point.y - 7);
    ctx.restore();
  });
}

async function downloadVectorMapImage() {
  const width = 1600;
  const height = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const bounds = getExportBounds();
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  for (let x = 0; x < width; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  drawExportCourse(ctx, bounds, width, height);
  drawExportPois(ctx, bounds, width, height);
  ctx.fillStyle = '#f7f8fb';
  ctx.font = '800 28px sans-serif';
  ctx.fillText(`Course Maker · ${currentCourseId()}`, 56, 44);
  const link = document.createElement('a');
  link.download = `course-map-${currentCourseId()}-vector-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function downloadMapImage() {
  try {
    setStatus(poiStatus, '지도 이미지 생성 중...');
    await downloadVectorMapImage();
    setStatus(poiStatus, '지도 이미지 다운로드를 시작했습니다.', 'ok');
  } catch (error) {
    setStatus(poiStatus, `이미지 생성 실패: ${error.message}`, 'error');
  }
}

function toggleExplorerCollapsed() {
  appShell.classList.toggle('explorer-collapsed');
  setTimeout(() => {
    leafletMap?.invalidateSize();
    kakaoMap?.relayout?.();
  }, 80);
}

function closeTopMenus() {
  document.querySelectorAll('.menu-item[open]').forEach(item => { item.open = false; });
}

function closeOtherTopMenus(activeMenu) {
  document.querySelectorAll('.menu-item').forEach(menu => {
    if (menu !== activeMenu) menu.open = false;
  });
}

function handleMenuAction(action) {
  closeTopMenus();
  if (action === 'import-gpx') handleExplorerImport();
  if (action === 'save-gpx') handleUpload();
  if (action === 'refresh-gpx') refreshGpxVersionBrowser();
  if (action === 'new-poi') {
    resetPoiForm();
    setStatus(poiStatus, '지도에서 우클릭 후 “이 위치에 지점 등록”을 선택하세요.', 'ok');
  }
  if (action === 'manage-poi') setStatus(poiStatus, '지점 또는 목록 항목을 클릭/우클릭하면 팝메뉴가 열립니다.', 'ok');
  if (action === 'download-map') downloadMapImage();
  if (action === 'toggle-layers') toggleLayerPopover();
}

loginButton.addEventListener('click', () => signInWithGoogle().catch(error => {
  setStatus(authStatus, `로그인 실패: ${error.message}`, 'error');
}));
logoutButton.addEventListener('click', () => signOutFirebase());
importGpxButton.addEventListener('click', handleExplorerImport);
gpxFileInput.addEventListener('change', handleFileSelected);
saveCurrentGpxButton.addEventListener('click', handleUpload);
if (uploadButton !== saveCurrentGpxButton) uploadButton.addEventListener('click', handleUpload);
renameGpxButton.addEventListener('click', handleGpxVersionRename);
poiForm.addEventListener('submit', handlePoiSave);
resetPoiButton.addEventListener('click', resetPoiForm);
deletePoiButton.addEventListener('click', handlePoiDelete);
downloadMapImageButton.addEventListener('click', downloadMapImage);
toggleExplorerButton.addEventListener('click', toggleExplorerCollapsed);
document.querySelectorAll('[data-menu-action]').forEach(button => button.addEventListener('click', () => handleMenuAction(button.dataset.menuAction)));
document.querySelectorAll('.menu-item').forEach(menu => {
  menu.addEventListener('toggle', () => {
    if (menu.open) closeOtherTopMenus(menu);
  });
});
mapContextMenu.querySelectorAll('[data-map-context-action]').forEach(button => {
  button.addEventListener('click', () => handleMapContextAction(button.dataset.mapContextAction));
});
$('#courseIdInput').addEventListener('change', () => {
  updateConnectedGpxPath();
  refreshPois();
  refreshGpxVersionBrowser();
});
$('#versionIdInput').addEventListener('change', () => updateConnectedGpxPath());
refreshGpxListButton.addEventListener('click', refreshGpxVersionBrowser);
document.querySelectorAll('[data-map-api]').forEach(button => button.addEventListener('click', () => switchMapApi(button.dataset.mapApi)));
document.querySelectorAll('[data-kakao-map-type]').forEach(button => button.addEventListener('click', () => setKakaoBaseMapType(button.dataset.kakaoMapType)));
document.querySelectorAll('[data-kakao-overlay]').forEach(input => input.addEventListener('change', () => toggleKakaoOverlay(input.dataset.kakaoOverlay, input.checked)));
document.querySelectorAll('[data-leaflet-layer]').forEach(button => button.addEventListener('click', () => setLeafletLayer(button.dataset.leafletLayer)));
layerToggleButton.addEventListener('click', event => {
  event.stopPropagation();
  toggleLayerPopover();
});
layerPopover.addEventListener('click', event => event.stopPropagation());
document.querySelectorAll('[data-quick-poi-type]').forEach(button => button.addEventListener('click', () => setQuickPoiType(button.dataset.quickPoiType)));
$('#poiTypeInput').addEventListener('change', event => setQuickPoiType(event.target.value));
$('#poiDistanceInput').addEventListener('change', applyDistanceKmToPoiCoordinates);
$('#poiDistanceInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    applyDistanceKmToPoiCoordinates();
  }
});
poiContextMenu.querySelectorAll('[data-poi-context-action]').forEach(button => {
  button.addEventListener('click', () => handlePoiContextAction(button.dataset.poiContextAction));
});
document.addEventListener('click', event => {
  if (!poiContextMenu.contains(event.target)) closePoiContextMenu();
  if (!mapContextMenu.contains(event.target)) closeMapContextMenu();
  if (!layerPopover.contains(event.target) && event.target !== layerToggleButton) closeLayerPopover();
  if (!event.target.closest('.menu-item')) closeTopMenus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closePoiContextMenu();
    closeMapContextMenu();
    closeLayerPopover();
    closeTopMenus();
  }
});

adminEmail.textContent = (getFirebaseOptions().adminEmails || []).join(', ');
updateConnectedGpxPath();
initPoiEditorMap().then(() => {
  refreshPois();
  refreshGpxVersionBrowser();
});
onAuthStateChanged(getFirebaseAuth(), user => {
  currentUser = user;
  const allowed = isAdmin(user);
  loginButton.hidden = Boolean(user);
  logoutButton.hidden = !user;
  currentAdminEmail.hidden = !user;
  currentAdminEmail.textContent = user?.email || '';
  if (!user) {
    setStatus(authStatus, '');
  } else if (allowed) {
    setStatus(authStatus, '');
    refreshPois();
  } else {
    setStatus(authStatus, `${user.email} 계정은 관리자 allowlist에 없습니다.`, 'error');
  }
  updateUploadButton();
});
