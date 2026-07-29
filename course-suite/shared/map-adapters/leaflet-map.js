export class LeafletMapAdapter {
  constructor({ mapElementId, center, onPoiClick }) {
    this.center = center;
    this.onPoiClick = onPoiClick;
    this.map = L.map(mapElementId, {
      center: [center.lat, center.lng],
      zoom: 14,
      layers: [L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' })]
    });
    this.markers = L.layerGroup().addTo(this.map);
    this.poiMarkers = L.layerGroup().addTo(this.map);
    this.currentMarker = null;
    this.currentCircle = null;
    this.polylines = [];
  }

  show() {
    setTimeout(() => this.map.invalidateSize(), 0);
  }

  clearCourse() {
    this.polylines.forEach(line => this.map.removeLayer(line));
    this.polylines = [];
    this.markers.clearLayers();
  }

  drawCourse({ points, turnIndex, branchPoint }) {
    if (!points.length) return;
    this.clearCourse();
    const outbound = points.slice(0, turnIndex + 1).map(p => [p.lat, p.lng]);
    const inbound = points.slice(turnIndex).map(p => [p.lat, p.lng]);
    const outboundLine = L.polyline(outbound, { color: '#5e6ad2', weight: 6, opacity: .88 }).addTo(this.map);
    const inboundLine = L.polyline(inbound, { color: '#ff7a1a', weight: 4, opacity: .95, dashArray: '8,4' }).addTo(this.map);
    this.polylines.push(outboundLine, inboundLine);

    const tooltipOptions = { permanent: false, direction: 'top', className: 'custom-tooltip' };
    L.marker([points[0].lat, points[0].lng]).addTo(this.markers).bindTooltip('🏁 START', tooltipOptions);
    L.marker([points[points.length - 1].lat, points[points.length - 1].lng]).addTo(this.markers).bindTooltip('🎯 FINISH', tooltipOptions);
    L.marker([points[turnIndex].lat, points[turnIndex].lng]).addTo(this.markers).bindTooltip('🔄 반환점', tooltipOptions);
    if (branchPoint) {
      L.circleMarker([branchPoint.lat, branchPoint.lng], { color: '#ef4444', fillColor: '#ef4444', fillOpacity: .85, radius: 8 })
        .addTo(this.markers).bindTooltip('🚩 대회장 진입 분기점', tooltipOptions);
    }
    this.map.fitBounds(outboundLine.getBounds());
  }

  drawPois(pois, getPoiType) {
    this.poiMarkers.clearLayers();
    pois.forEach(poi => {
      const type = getPoiType(poi.type);
      const marker = L.circleMarker([poi.lat, poi.lng], {
        radius: 9,
        color: type.color,
        fillColor: type.color,
        fillOpacity: .92,
        weight: 2
      }).addTo(this.poiMarkers);
      marker.bindTooltip(`${type.icon} ${poi.name}`, { permanent: false, direction: 'top', className: 'custom-tooltip' });
      marker.on('click', () => this.onPoiClick?.(poi));
    });
  }

  setCurrentLocation({ lat, lng, accuracy }) {
    const latlng = [lat, lng];
    if (!this.currentMarker) this.currentMarker = L.marker(latlng).addTo(this.map);
    else this.currentMarker.setLatLng(latlng);
    if (!this.currentCircle) this.currentCircle = L.circle(latlng, { radius: accuracy, color: '#27a644', fillColor: '#27a644', fillOpacity: .12 }).addTo(this.map);
    else this.currentCircle.setLatLng(latlng).setRadius(accuracy);
    this.map.panTo(latlng);
  }
}
