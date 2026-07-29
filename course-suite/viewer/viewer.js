import { getEventConfig } from '../shared/config.js';
import { parseGpx } from '../shared/gpx-utils.js';
import { buildCourseDisplay, filterPoisForMode } from '../shared/course-model.js';
import { getPoiType } from '../shared/poi-icons.js';
import { LeafletMapAdapter } from '../shared/map-adapters/leaflet-map.js';
import { KakaoMapAdapter } from '../shared/map-adapters/kakao-map.js';

const KAKAO_MAP_APP_KEY = 'c45e1e08eea53db5a726efa6edae142b';
const params = new URLSearchParams(window.location.search);
const eventId = params.get('event') || 'gcrun'; // event=gcrun fallback
let mode = params.get('mode') || 'public';
let eventConfig = getEventConfig(eventId);
let allTrackPoints = [];
let currentCourse = eventConfig.courses[0];
let currentDisplay = null;
let activeMapApi = 'leaflet';
let leafletAdapter = null;
let kakaoAdapter = null;
let elevationChart = null;

const $ = (selector) => document.querySelector(selector);

function setStatus(message, isError = false) {
  const el = $('#status');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.style.display = 'block';
}

function setActiveButton(selector, predicate) {
  document.querySelectorAll(selector).forEach(button => button.classList.toggle('active', predicate(button)));
}

function renderEventHeader() {
  $('#eventTitle').textContent = eventConfig.title;
  $('#eventSubtitle').textContent = eventConfig.subtitle || '코스 정보를 확인하세요.';
}

function renderCourseButtons() {
  const container = $('#courseButtons');
  container.innerHTML = '';
  eventConfig.courses.forEach(course => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pill ${course.id === currentCourse.id ? 'active' : ''}`;
    button.textContent = course.label;
    button.dataset.course = course.id;
    button.addEventListener('click', () => {
      currentCourse = course;
      setActiveButton('#courseButtons .pill', btn => btn.dataset.course === course.id);
      rebuildCourse();
    });
    container.appendChild(button);
  });
}

function renderModeButtons() {
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === mode);
    button.addEventListener('click', () => {
      mode = button.dataset.mode;
      setActiveButton('[data-mode]', btn => btn.dataset.mode === mode);
      renderPois();
    });
  });
}

function initMaps() {
  leafletAdapter = new LeafletMapAdapter({ mapElementId: 'leafletMap', center: eventConfig.center, onPoiClick: showPoi });
  kakaoAdapter = new KakaoMapAdapter({ mapElementId: 'kakaoMap', center: eventConfig.center, appKey: KAKAO_MAP_APP_KEY, onPoiClick: showPoi });
}

async function switchMapApi(api) {
  activeMapApi = api;
  $('#leafletMap').style.display = api === 'leaflet' ? 'block' : 'none';
  $('#kakaoMap').style.display = api === 'kakao' ? 'block' : 'none';
  setActiveButton('.top-actions .pill', btn => (api === 'kakao' ? btn.id === 'kakaoButton' : btn.id === 'leafletButton'));

  if (api === 'kakao') {
    try {
      await kakaoAdapter.init();
      kakaoAdapter.show();
    } catch (err) {
      setStatus(err.message, true);
      return switchMapApi('leaflet');
    }
  } else {
    leafletAdapter.show();
  }
  redrawActiveMap();
}

function redrawActiveMap() {
  if (!currentDisplay) return;
  if (activeMapApi === 'kakao') kakaoAdapter.drawCourse(currentDisplay);
  else leafletAdapter.drawCourse(currentDisplay);
  renderPois();
}

function rebuildCourse() {
  currentDisplay = buildCourseDisplay(allTrackPoints, currentCourse, {
    finishBranchDistanceKm: eventConfig.finishBranchDistanceKm
  });
  const summary = currentDisplay.summary;
  $('#distanceInfo').textContent = `${summary.distanceKm.toFixed(2)} km`;
  $('#elevationInfo').textContent = `${summary.elevationMin.toFixed(1)}m ~ ${summary.elevationMax.toFixed(1)}m`;
  redrawActiveMap();
  renderElevationChart(currentDisplay.points);
}

function renderPois() {
  const pois = filterPoisForMode(eventConfig.pois || [], mode);
  $('#poiInfo').textContent = `${pois.length}개`;
  if (leafletAdapter) leafletAdapter.drawPois(pois, getPoiType);
  if (kakaoAdapter?.map) kakaoAdapter.drawPois(pois, getPoiType);
}

function showPoi(poi) {
  const type = getPoiType(poi.type);
  const sheet = $('#poiSheet');
  sheet.hidden = false;
  sheet.innerHTML = `
    <p class="eyebrow">${type.label}</p>
    <h3>${type.icon} ${poi.name}</h3>
    <p>${poi.description || ''}</p>
    <p>좌표: ${poi.lat.toFixed(6)}, ${poi.lng.toFixed(6)}</p>
  `;
}

function renderElevationChart(points) {
  const ctx = $('#elevationChart').getContext('2d');
  if (elevationChart) elevationChart.destroy();
  elevationChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: points.map(point => point.dist.toFixed(2)),
      datasets: [{
        label: '고도 (m)',
        data: points.map(point => point.ele.toFixed(1)),
        borderColor: '#7170ff',
        backgroundColor: 'rgba(113,112,255,.18)',
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
        tension: .12
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 8 } } } }
  });
}

function showCurrentLocation() {
  if (!navigator.geolocation) return setStatus('이 브라우저에서는 현재 위치 기능을 지원하지 않습니다.', true);
  setStatus('현재 위치를 확인하는 중입니다.');
  navigator.geolocation.getCurrentPosition(position => {
    const current = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
    $('#gpsButton').classList.add('active');
    leafletAdapter.setCurrentLocation(current);
    if (kakaoAdapter?.map) kakaoAdapter.setCurrentLocation(current);
    setStatus(`내 위치 표시 완료 · 오차 범위 약 ${Math.round(current.accuracy)}m`);
  }, () => setStatus('현재 위치를 확인하지 못했습니다. 브라우저 위치 권한을 확인해 주세요.', true), {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 10000
  });
}

async function loadDefaultGpx() {
  const response = await fetch(eventConfig.defaultGpxPath);
  if (!response.ok) throw new Error(`GPX 파일 로드 실패: ${eventConfig.defaultGpxPath}`);
  allTrackPoints = parseGpx(await response.text());
  rebuildCourse();
  setStatus(`${eventConfig.title} GPX 적용 완료 · ${allTrackPoints.length.toLocaleString()}개 포인트`);
}

async function boot() {
  renderEventHeader();
  renderCourseButtons();
  renderModeButtons();
  initMaps();
  $('#kakaoButton').addEventListener('click', () => switchMapApi('kakao'));
  $('#leafletButton').addEventListener('click', () => switchMapApi('leaflet'));
  $('#gpsButton').addEventListener('click', showCurrentLocation);
  await switchMapApi(eventConfig.defaultMapApi || 'kakao');
  await loadDefaultGpx();
}

boot().catch(err => setStatus(err.message, true));
