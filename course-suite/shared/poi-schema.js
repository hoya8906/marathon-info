export const POI_VISIBILITY = Object.freeze({
  PUBLIC: 'public',
  STAFF: 'staff',
  ADMIN: 'admin'
});

export const POI_STATUS = Object.freeze({
  PLANNED: 'planned',
  INSTALLED: 'installed',
  REMOVED: 'removed',
  NEEDS_CHECK: 'needs-check'
});

export const POI_SIDES = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  CENTER: 'center',
  UNKNOWN: 'unknown'
});

export function normalizePoi(poi, index = 0) {
  return {
    id: poi.id || `poi-${index + 1}`,
    type: poi.type || 'venue',
    name: poi.name || '이름 없는 POI',
    lat: Number(poi.lat),
    lng: Number(poi.lng),
    distanceKm: Number.isFinite(Number(poi.distanceKm)) ? Number(poi.distanceKm) : null,
    side: poi.side || POI_SIDES.UNKNOWN,
    visibility: poi.visibility || POI_VISIBILITY.PUBLIC,
    quantity: Number.isFinite(Number(poi.quantity)) ? Number(poi.quantity) : 1,
    team: poi.team || '',
    assignee: poi.assignee || '',
    status: poi.status || POI_STATUS.PLANNED,
    installBy: poi.installBy || '',
    removeBy: poi.removeBy || '',
    equipment: Array.isArray(poi.equipment) ? poi.equipment : [],
    description: poi.description || '',
    photoPaths: Array.isArray(poi.photoPaths) ? poi.photoPaths : []
  };
}

export function normalizePois(pois = []) {
  return pois.map(normalizePoi).filter(poi => Number.isFinite(poi.lat) && Number.isFinite(poi.lng));
}

export function groupPoisByType(pois = []) {
  return pois.reduce((groups, poi) => {
    const type = poi.type || 'other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(poi);
    return groups;
  }, {});
}

export function sortPoisForFieldWork(pois = []) {
  return [...pois].sort((a, b) => {
    const ad = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const bd = b.distanceKm ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return String(a.name).localeCompare(String(b.name), 'ko');
  });
}

export function filterPoisByType(pois = [], selectedTypes = new Set()) {
  if (!selectedTypes || selectedTypes.size === 0) return pois;
  return pois.filter(poi => selectedTypes.has(poi.type));
}
