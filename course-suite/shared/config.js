export const EVENTS = {
  gcrun: {
    id: 'gcrun',
    title: '과천마라톤',
    subtitle: '관문체육공원 출발 · GPX 기반 코스 안내',
    defaultGpxPath: '../../gcrun/files/과천마라톤.gpx',
    center: { lat: 37.441466, lng: 126.996461 },
    defaultMapApi: 'kakao',
    themeColor: '#5e6ad2',
    finishBranchDistanceKm: 0.68,
    waterIntervalKm: 2.5,
    courses: [
      { id: 'ALL', label: '전체', type: 'auto-half' },
      { id: '10K', label: '10km', turnDistanceKm: 5.6 },
      { id: 'HALF', label: '하프', turnDistanceKm: 10.65 }
    ],
    pois: [
      {
        id: 'start-finish',
        type: 'venue',
        name: '출발/도착 · 관문체육공원',
        lat: 37.441466,
        lng: 126.996461,
        visibility: 'public',
        description: '대회장, 출발 및 골인 지점'
      }
    ]
  }
};

export function getEventConfig(eventId = 'gcrun') {
  return EVENTS[eventId] || EVENTS.gcrun;
}
