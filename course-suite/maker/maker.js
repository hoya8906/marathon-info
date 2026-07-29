import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirebaseAuth, getFirebaseOptions, signInWithGoogle, signOutFirebase } from '../shared/firebase.js';
import { saveGpxVersionFromXml } from '../shared/course-repository.js';
import { parseGpx, summarizeTrack } from '../shared/gpx-utils.js';

const $ = (selector) => document.querySelector(selector);

const loginButton = $('#loginButton');
const logoutButton = $('#logoutButton');
const uploadButton = $('#uploadButton');
const gpxFileInput = $('#gpxFileInput');
const authStatus = $('#authStatus');
const uploadStatus = $('#uploadStatus');
const resultOutput = $('#resultOutput');
const adminEmail = $('#adminEmail');

let currentUser = null;
let selectedFile = null;
let selectedGpxXml = null;
let selectedSummary = null;

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
}

function isAdmin(user) {
  const adminEmails = getFirebaseOptions().adminEmails || [];
  return Boolean(user?.email && adminEmails.includes(user.email));
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
  const courseId = $('#courseIdInput').value.trim() || `${eventId}-2026`;
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

loginButton.addEventListener('click', () => signInWithGoogle().catch(error => {
  setStatus(authStatus, `로그인 실패: ${error.message}`, 'error');
}));
logoutButton.addEventListener('click', () => signOutFirebase());
gpxFileInput.addEventListener('change', handleFileSelected);
uploadButton.addEventListener('click', handleUpload);

adminEmail.textContent = (getFirebaseOptions().adminEmails || []).join(', ');
onAuthStateChanged(getFirebaseAuth(), user => {
  currentUser = user;
  const allowed = isAdmin(user);
  loginButton.hidden = Boolean(user);
  logoutButton.hidden = !user;
  if (!user) {
    setStatus(authStatus, '로그인이 필요합니다.');
  } else if (allowed) {
    setStatus(authStatus, `${user.email} 관리자 로그인 완료`, 'ok');
  } else {
    setStatus(authStatus, `${user.email} 계정은 관리자 allowlist에 없습니다.`, 'error');
  }
  updateUploadButton();
});
