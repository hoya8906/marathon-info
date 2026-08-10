export function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parseGpx(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  if (xmlDoc.getElementsByTagName('parsererror').length) {
    throw new Error('올바른 GPX/XML 형식이 아닙니다.');
  }

  const trkpts = Array.from(xmlDoc.getElementsByTagName('trkpt'));
  if (trkpts.length === 0) {
    throw new Error('GPX 트랙 포인트(trkpt)가 없습니다.');
  }

  const points = [];
  let accumDist = 0;
  trkpts.forEach((node, index) => {
    const lat = Number.parseFloat(node.getAttribute('lat'));
    const lng = Number.parseFloat(node.getAttribute('lon'));
    const eleNode = node.getElementsByTagName('ele')[0];
    const ele = eleNode ? Number.parseFloat(eleNode.textContent) : 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (index > 0 && points.length > 0) {
      const prev = points[points.length - 1];
      accumDist += getDistanceKm(prev.lat, prev.lng, lat, lng);
    }
    points.push({ lat, lng, ele, dist: accumDist });
  });

  if (points.length === 0) {
    throw new Error('유효한 GPX 좌표가 없습니다.');
  }
  return points;
}

export function findPointAtDistance(points, targetDist) {
  if (!points.length) return null;
  return points.reduce((closest, point) => {
    return Math.abs(point.dist - targetDist) < Math.abs(closest.dist - targetDist) ? point : closest;
  }, points[0]);
}

export function summarizeTrack(points) {
  if (!points.length) return { distanceKm: 0, pointCount: 0, elevationMin: 0, elevationMax: 0 };
  const elevations = points.map(p => p.ele).filter(Number.isFinite);
  return {
    distanceKm: points[points.length - 1].dist,
    pointCount: points.length,
    elevationMin: Math.min(...elevations),
    elevationMax: Math.max(...elevations),
    start: points[0],
    finish: points[points.length - 1]
  };
}
