export const POI_TYPES = {
  venue: { label: '대회장', icon: '🏁', color: '#5e6ad2' },
  water: { label: '급수대', icon: '💧', color: '#38bdf8' },
  turn: { label: '반환점', icon: '🔁', color: '#a855f7' },
  staff: { label: '스탭배치', icon: '👷', color: '#f97316' },
  sign: { label: '입간판', icon: '🪧', color: '#f59e0b' },
  cone: { label: '라바콘', icon: '🔶', color: '#fb923c' },
  medical: { label: '의료', icon: '🚑', color: '#ef4444' },
  toilet: { label: '화장실', icon: '🚻', color: '#22c55e' },
  control: { label: '통제점', icon: '🚧', color: '#eab308' },
  shuttle: { label: '셔틀', icon: '🚌', color: '#06b6d4' },
  parking: { label: '주차장', icon: '🅿️', color: '#64748b' }
};

export function getPoiType(type) {
  return POI_TYPES[type] || { label: type || 'POI', icon: '📍', color: '#94a3b8' };
}
