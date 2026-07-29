import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirebaseAuth, getFirebaseOptions, signInWithGoogle, signOutFirebase } from '../shared/firebase.js';
import { deletePoi, loadCoursePois, saveGpxVersionFromXml, savePoi } from '../shared/course-repository.js';
import { parseGpx, summarizeTrack } from '../shared/gpx-utils.js';
import { getPoiType } from '../shared/poi-icons.js';

const $ = (selector) => document.querySelector(selector);

const loginButton = $('#loginButton');
const logoutButton = $('#logoutButton');
const uploadButton = $('#uploadButton');
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

let currentUser = null;
let selectedFile = null;
let selectedGpxXml = null;
let selectedSummary = null;
let makerMap = null;
let markerLayer = null;
let poiItems = [];
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

function updateUploadButton() {
  uploadButton.disabled = !(currentUser && isAdmin(currentUser) && selectedGpxXml && selectedSummary);
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
  } catch (error) {
    setStatus(uploadStatus, `Firestore 저장 실패: ${error.message}`, 'error');
    renderResult({ error: error.message });
  }
  updateUploadButton();
}

function initPoiEditorMap() {
  makerMap = L.map('makerMap', { preferCanvas: true }).setView([37.441466, 126.994113], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    crossOrigin: true,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(makerMap);
  markerLayer = L.layerGroup().addTo(makerMap);
  makerMap.on('click', handleMapClick);
}

function handleMapClick(event) {
  $('#poiLatInput').value = event.latlng.lat.toFixed(6);
  $('#poiLngInput').value = event.latlng.lng.toFixed(6);
  if (!$('#poiIdInput').value.trim()) $('#poiIdInput').value = `poi-${Date.now()}`;
  setStatus(poiStatus, '지도 클릭 좌표가 입력됐습니다. 이름/유형을 확인 후 저장하세요.', 'ok');
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

function fillPoiForm(poi) {
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
  if (makerMap && poi.lat && poi.lng) makerMap.setView([poi.lat, poi.lng], Math.max(makerMap.getZoom(), 16));
}

function resetPoiForm() {
  editingPoiId = null;
  poiForm.reset();
  $('#poiTypeInput').value = 'water';
  $('#poiVisibilityInput').value = 'public';
  $('#poiQuantityInput').value = 1;
  setStatus(poiStatus, '새 지점을 입력할 수 있습니다. 지도를 클릭해 좌표를 넣으세요.');
}

function renderPoiMarkers() {
  markerLayer.clearLayers();
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
      .on('dragend', event => {
        const next = event.target.getLatLng();
        fillPoiForm({ ...poi, lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) });
      })
      .addTo(markerLayer);
  });
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
    link.download = `course-map-${currentCourseId()}-${Date.now()}.png`;
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
gpxFileInput.addEventListener('change', handleFileSelected);
uploadButton.addEventListener('click', handleUpload);
poiForm.addEventListener('submit', handlePoiSave);
resetPoiButton.addEventListener('click', resetPoiForm);
deletePoiButton.addEventListener('click', handlePoiDelete);
downloadMapImageButton.addEventListener('click', downloadMapImage);
$('#courseIdInput').addEventListener('change', refreshPois);

adminEmail.textContent = (getFirebaseOptions().adminEmails || []).join(', ');
initPoiEditorMap();
refreshPois();
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
