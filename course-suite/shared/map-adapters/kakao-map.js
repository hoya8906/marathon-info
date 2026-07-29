export class KakaoMapAdapter {
  constructor({ mapElementId, center, appKey, onPoiClick }) {
    this.mapElementId = mapElementId;
    this.center = center;
    this.appKey = appKey;
    this.onPoiClick = onPoiClick;
    this.map = null;
    this.courseOverlays = [];
    this.poiOverlays = [];
    this.currentMarker = null;
    this.currentCircle = null;
  }

  loadSdk() {
    if (window.kakao?.maps) return Promise.resolve();
    if (window.__courseSuiteKakaoLoading) return window.__courseSuiteKakaoLoading;
    window.__courseSuiteKakaoLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(this.appKey)}&autoload=false`;
      script.onload = () => window.kakao?.maps ? kakao.maps.load(resolve) : reject(new Error('카카오맵 SDK maps 객체가 없습니다.'));
      script.onerror = () => reject(new Error('카카오맵 SDK를 불러오지 못했습니다. 도메인 등록과 JavaScript 키를 확인해 주세요.'));
      document.head.appendChild(script);
    });
    return window.__courseSuiteKakaoLoading;
  }

  async init() {
    await this.loadSdk();
    if (!this.map) {
      this.map = new kakao.maps.Map(document.getElementById(this.mapElementId), {
        center: new kakao.maps.LatLng(this.center.lat, this.center.lng),
        level: 5
      });
    }
    return this;
  }

  show() {
    if (this.map && window.kakao?.maps) kakao.maps.event.trigger(this.map, 'resize');
  }

  clearCourse() {
    this.courseOverlays.forEach(overlay => overlay.setMap(null));
    this.courseOverlays = [];
  }

  clearPois() {
    this.poiOverlays.forEach(overlay => overlay.setMap(null));
    this.poiOverlays = [];
  }

  addCourseOverlay(overlay) {
    overlay.setMap(this.map);
    this.courseOverlays.push(overlay);
  }

  addPoiOverlay(overlay) {
    overlay.setMap(this.map);
    this.poiOverlays.push(overlay);
  }

  drawCourse({ points, turnIndex, branchPoint }) {
    if (!this.map || !points.length) return;
    this.clearCourse();
    const outbound = points.slice(0, turnIndex + 1).map(p => new kakao.maps.LatLng(p.lat, p.lng));
    const inbound = points.slice(turnIndex).map(p => new kakao.maps.LatLng(p.lat, p.lng));
    this.addCourseOverlay(new kakao.maps.Polyline({ path: outbound, strokeWeight: 6, strokeColor: '#5e6ad2', strokeOpacity: .9 }));
    this.addCourseOverlay(new kakao.maps.Polyline({ path: inbound, strokeWeight: 4, strokeColor: '#ff7a1a', strokeOpacity: .95, strokeStyle: 'dash' }));
    [points[0], points[points.length - 1], points[turnIndex], branchPoint].filter(Boolean).forEach(point => {
      this.addCourseOverlay(new kakao.maps.Marker({ position: new kakao.maps.LatLng(point.lat, point.lng) }));
    });
    const bounds = new kakao.maps.LatLngBounds();
    outbound.concat(inbound).forEach(latlng => bounds.extend(latlng));
    this.map.setBounds(bounds);
  }

  drawPois(pois) {
    if (!this.map) return;
    this.clearPois();
    pois.forEach(poi => {
      const marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(poi.lat, poi.lng), title: poi.name });
      this.addPoiOverlay(marker);
      if (this.onPoiClick) kakao.maps.event.addListener(marker, 'click', () => this.onPoiClick(poi));
    });
  }

  setCurrentLocation({ lat, lng, accuracy }) {
    if (!this.map) return;
    const latlng = new kakao.maps.LatLng(lat, lng);
    if (!this.currentMarker) this.currentMarker = new kakao.maps.Marker({ position: latlng, map: this.map });
    else this.currentMarker.setPosition(latlng);
    if (!this.currentCircle) {
      this.currentCircle = new kakao.maps.Circle({ center: latlng, radius: accuracy, strokeWeight: 2, strokeColor: '#27a644', fillColor: '#27a644', fillOpacity: .12, map: this.map });
    } else {
      this.currentCircle.setPosition(latlng);
      this.currentCircle.setRadius(accuracy);
      this.currentCircle.setMap(this.map);
    }
    this.map.setCenter(latlng);
  }
}
