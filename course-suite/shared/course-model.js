import { findPointAtDistance, getDistanceKm, summarizeTrack } from './gpx-utils.js';

export const TURN_HALF_DIST = 10.65;
export const FINISH_BRANCH_DIST = 0.68;

export function resolveCourseTurnDistance(course, allTrackPoints) {
  if (course?.turnDistanceKm) return course.turnDistanceKm;
  if (course?.type === 'auto-half' && allTrackPoints.length) {
    return allTrackPoints[allTrackPoints.length - 1].dist / 2;
  }
  return TURN_HALF_DIST;
}

export function buildCourseDisplay(allTrackPoints, course, options = {}) {
  if (!allTrackPoints.length) {
    return { points: [], turnIndex: 0, summary: summarizeTrack([]) };
  }

  const finishBranchDistanceKm = options.finishBranchDistanceKm ?? FINISH_BRANCH_DIST;
  const targetTurnDist = resolveCourseTurnDistance(course, allTrackPoints);
  const outbound = allTrackPoints.filter(point => point.dist <= targetTurnDist);
  const turnPt = findPointAtDistance(allTrackPoints, targetTurnDist) || outbound[outbound.length - 1];
  const finishPt = allTrackPoints[allTrackPoints.length - 1];
  const branchPt = findPointAtDistance(allTrackPoints, finishBranchDistanceKm) || allTrackPoints[0];
  const inboundPart = outbound.filter(point => point.dist >= finishBranchDistanceKm).reverse();

  let currentAccumDist = turnPt.dist;
  const reconstructedInbound = inboundPart.map((point, index) => {
    if (index > 0) {
      const prev = inboundPart[index - 1];
      currentAccumDist += getDistanceKm(prev.lat, prev.lng, point.lat, point.lng);
    }
    return { ...point, dist: currentAccumDist };
  });

  currentAccumDist += getDistanceKm(branchPt.lat, branchPt.lng, finishPt.lat, finishPt.lng);
  reconstructedInbound.push({ ...finishPt, dist: currentAccumDist });

  const points = [...outbound, ...reconstructedInbound];
  return {
    points,
    turnIndex: Math.max(0, outbound.length - 1),
    turnPoint: points[Math.max(0, outbound.length - 1)],
    branchPoint: branchPt,
    summary: summarizeTrack(points)
  };
}

export function filterPoisForMode(pois = [], mode = 'public') {
  const rank = { public: 1, staff: 2, admin: 3 };
  const currentRank = rank[mode] || rank.public;
  return pois.filter(poi => (rank[poi.visibility || 'public'] || rank.public) <= currentRank);
}
