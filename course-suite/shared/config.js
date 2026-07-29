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
        distanceKm: 0,
        side: 'center',
        visibility: 'public',
        status: 'planned',
        description: '대회장, 출발 및 골인 지점'
      },
      {
        id: 'water-2-5k',
        type: 'water',
        name: '2.5km 급수대',
        lat: 37.4474,
        lng: 126.9872,
        distanceKm: 2.5,
        side: 'right',
        visibility: 'public',
        quantity: 1,
        team: '급수팀 A조',
        status: 'planned',
        installBy: '07:00',
        equipment: ['테이블 2', '생수', '이온음료', '쓰레기봉투'],
        description: '참가자 공개 급수 지점'
      },
      {
        id: 'turn-sign-10k',
        type: 'sign',
        name: '10km 반환점 입간판',
        lat: 37.4534,
        lng: 126.9821,
        distanceKm: 5.6,
        side: 'right',
        visibility: 'staff',
        quantity: 1,
        team: '코스팀 A조',
        status: 'planned',
        installBy: '06:40',
        equipment: ['반환점 입간판', '고정끈', '라바콘 6'],
        description: '10km 반환점 안내 및 유도 설치물'
      },
      {
        id: 'cone-finish-branch',
        type: 'cone',
        name: '대회장 진입 라바콘 구간',
        lat: 37.4423,
        lng: 126.9951,
        distanceKm: 0.68,
        side: 'center',
        visibility: 'staff',
        quantity: 20,
        team: '코스팀 B조',
        status: 'planned',
        installBy: '06:20',
        removeBy: '후미 통과 후',
        equipment: ['라바콘 20', '안전봉 4'],
        description: '복귀 주자 대회장 진입 유도 구간'
      },
      {
        id: 'medical-venue',
        type: 'medical',
        name: '대회장 의료부스',
        lat: 37.4419,
        lng: 126.9968,
        distanceKm: 0,
        side: 'center',
        visibility: 'public',
        quantity: 1,
        team: '의료팀',
        status: 'planned',
        description: '응급 처치 및 구급 대응'
      }
    ]
  }
};

export function getEventConfig(eventId = 'gcrun') {
  return EVENTS[eventId] || EVENTS.gcrun;
}
