import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirebaseAuth, getFirebaseOptions, signInWithGoogle, signOutFirebase } from '../shared/firebase.js';
import { deleteGpxVersion, deletePoi, loadCoursePois, loadGpxVersion, loadGpxVersions, renameGpxVersion, saveGpxVersionFromXml, savePoi, setActiveGpxVersion } from '../shared/course-repository.js';
import { parseGpx, summarizeTrack } from '../shared/gpx-utils.js';
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
const gpxVersionTree = $('#gpxVersionTree');
const refreshGpxListButton = $('#refreshGpxListButton');
const activeGpxSummary = $('#activeGpxSummary');
const connectedGpxPath = $('#connectedGpxPath');
const importGpxButton = $('#explorerImportGpxButton') || $('#importGpxButton');
const saveCurrentGpxButton = $('#explorerSaveCurrentGpxButton') || $('#saveCurrentGpxButton');
const renameGpxButton = $('#renameGpxButton');
const toolbarStatus = $('#toolbarStatus');
const mapApiHint = $('#mapApiHint');
const layerToggleButton = $('#layerToggleButton');
const layerPopover = $('#layerPopover');
const poiContextMenu = $('#poiContextMenu');

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

function renderGpxVersionTree() {
  const active = gpxVersions.find(version => version.isActive);
  activeGpxSummary.textContent = active
    ? `활성 GPX: ${active.id} · ${active.fileName || '파일명 없음'} · ${Number(active.distanceKm || 0).toFixed(2)}km`
    : '활성 GPX가 없습니다. 파일을 업로드하거나 버전을 활성화하세요.';
  updateConnectedGpxPath(active);

  if (!gpxVersions.length) {
    gpxVersionTree.innerHTML = '<p class="status">저장된 GPX 버전이 없습니다.</p>';
    return;
  }

  gpxVersionTree.innerHTML = gpxVersions.map(version => `
    <article class="gpx-version-card ${version.isActive ? 'active' : ''}" data-version-id="${version.id}">
      <div>
        <strong>${version.isActive ? '✅ ' : ''}${version.id} · ${version.fileName || 'GPX'}</strong>
        <small>${Number(version.distanceKm || 0).toFixed(3)}km · ${Number(version.pointCount || 0).toLocaleString()}pt · ${version.uploadedBy || 'unknown'}</small>
      </div>
      <div class="gpx-actions">
        <button type="button" data-gpx-action="load" data-version-id="${version.id}">불러오기</button>
        <button type="button" class="active-button" data-gpx-action="activate" data-version-id="${version.id}">활성화</button>
        <button type="button" class="danger-button" data-gpx-action="delete" data-version-id="${version.id}">삭제</button>
      </div>
    </article>
  `).join('');

  gpxVersionTree.querySelectorAll('[data-gpx-action]').forEach(button => {
    const versionId = button.dataset.versionId;
    if (button.dataset.gpxAction === 'load') button.addEventListener('click', () => handleGpxVersionLoad(versionId));
    if (button.dataset.gpxAction === 'activate') button.addEventListener('click', () => handleGpxVersionActivate(versionId));
    if (button.dataset.gpxAction === 'delete') button.addEventListener('click', () => handleGpxVersionDelete(versionId));
  });
}

async function refreshGpxVersionBrowser() {
  try {
    gpxVersionTree.innerHTML = '<p class="status">GPX 목록을 불러오는 중...</p>';
    gpxVersions = await loadGpxVersions(currentCourseId());
    renderGpxVersionTree();
  } catch (error) {
    activeGpxSummary.textContent = `GPX 목록 로드 실패: ${error.message}`;
    gpxVersionTree.innerHTML = `<p class="status error">${error.message}</p>`;
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
  kakao.maps.event.addListener(kakaoMap, 'click', (mouseEvent) => {
    const latlng = mouseEvent.latLng;
    handleMapClick({ lat: latlng.getLat(), lng: latlng.getLng() });
  });
  setKakaoBaseMapType('hybrid');
}

function initLeafletEditorMap() {
  leafletMap = L.map('leafletMakerMap', { preferCanvas: true }).setView([CENTER.lat, CENTER.lng], 14);
  setLeafletLayer(activeLeafletLayer);
  leafletMarkerLayer = L.layerGroup().addTo(leafletMap);
  leafletMap.on('click', (event) => handleMapClick({ lat: event.latlng.lat, lng: event.latlng.lng }));
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
  setStatus(poiStatus, '저장 전 위치를 지도에 표시했습니다. 유형/이름을 확인 후 저장하세요.', 'ok');
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

function fillPoiForm(poi) {
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
  if (poi.lat && poi.lng) setMapCenter(Number(poi.lat), Number(poi.lng));
}

function openPoiContextMenu(event, poi) {
  event.preventDefault?.();
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
  setStatus(poiStatus, '새 지점을 입력할 수 있습니다. 지도를 클릭하면 저장 전 위치가 표시됩니다.');
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
    content.className = 'poi-marker-label';
    content.textContent = `${type.icon} ${poi.name || poi.id}`;
    content.addEventListener('click', () => fillPoiForm(poi));
    content.addEventListener('contextmenu', event => openPoiContextMenu(event, poi));
    const marker = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(Number(poi.lat), Number(poi.lng)),
      content,
      yAnchor: 1.1,
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
      html: `<div class="poi-marker-label">${type.icon} ${poi.name || poi.id}</div>`,
      iconSize: [1, 1]
    });
    L.marker([poi.lat, poi.lng], { icon, draggable: true })
      .on('click', () => fillPoiForm(poi))
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
    button.addEventListener('click', () => fillPoiForm(poiItems.find(poi => poi.id === button.dataset.poiId)));
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

async function downloadMapImage() {
  try {
    setStatus(poiStatus, '현재 지도 화면을 이미지로 생성 중...');
    const canvas = await html2canvas($('#makerMapFrame'), { useCORS: true, allowTaint: false, backgroundColor: '#111827' });
    const link = document.createElement('a');
    link.download = `course-map-${currentCourseId()}-${activeMapApi}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setStatus(poiStatus, '지도 이미지 다운로드를 시작했습니다.', 'ok');
  } catch (error) {
    setStatus(poiStatus, `이미지 생성 실패: 지도 타일 CORS 제한일 수 있습니다. ${error.message}`, 'error');
  }
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
poiContextMenu.querySelectorAll('[data-poi-context-action]').forEach(button => {
  button.addEventListener('click', () => handlePoiContextAction(button.dataset.poiContextAction));
});
document.addEventListener('click', event => {
  if (!poiContextMenu.contains(event.target)) closePoiContextMenu();
  if (!layerPopover.contains(event.target) && event.target !== layerToggleButton) closeLayerPopover();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closePoiContextMenu();
    closeLayerPopover();
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
  if (!user) {
    setStatus(authStatus, '로그인이 필요합니다.');
  } else if (allowed) {
    setStatus(authStatus, `${user.email} 관리자 로그인 완료`, 'ok');
    refreshPois();
  } else {
    setStatus(authStatus, `${user.email} 계정은 관리자 allowlist에 없습니다.`, 'error');
  }
  updateUploadButton();
});
