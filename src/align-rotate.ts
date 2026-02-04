import Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import { Select } from 'ol/interaction';
import { click, platformModifierKeyOnly } from 'ol/events/condition';
import { Feature } from 'ol';
import { Polygon, LineString } from 'ol/geom';
import { Style, Stroke, Fill } from 'ol/style';
import type { Coordinate } from 'ol/coordinate';

// 상태 관리
let selectInteraction: Select | null = null;
let map: Map | null = null;
let vectorSource: VectorSource | null = null;

// 선택된 기준 객체 및 면
let referenceFeature: Feature | null = null;
let referenceEdge: [Coordinate, Coordinate] | null = null;

// 회전할 대상 객체들
let targetFeatures: Feature[] = [];
let targetEdges: globalThis.Map<Feature, [Coordinate, Coordinate]> = new globalThis.Map();

// 시각적 표시를 위한 Feature들
let referenceLineFeature: Feature | null = null;
let targetLineFeatures: Feature[] = [];

// 스타일 정의
const referenceLineStyle = new Style({
  stroke: new Stroke({
    color: '#ff0000', // 빨간색
    width: 3,
  }),
});

const targetLineStyle = new Style({
  stroke: new Stroke({
    color: '#00ff00', // 초록색
    width: 3,
  }),
});

const selectedStyle = new Style({
  stroke: new Stroke({
    color: '#3498db',
    width: 4,
  }),
  fill: new Fill({
    color: 'rgba(52, 152, 219, 0.3)',
  }),
});

/**
 * 초기화 함수
 */
export function initAlignRotate(mapInstance: Map, source: VectorSource): void {
  map = mapInstance;
  vectorSource = source;

  // Select 인터랙션 생성 (초기에는 추가하지 않음)
  // multi: true와 toggleCondition을 사용하여 다중 선택 지원
  selectInteraction = new Select({
    condition: click,
    style: selectedStyle,
    multi: true, // 다중 선택 활성화
    toggleCondition: click, // 클릭으로 선택/해제 토글
    filter: (feature) => {
      // 헬퍼 라인(빨간색/초록색)은 선택되지 않도록 필터링
      return !feature.get('isHelperLine');
    }
  });

  // 일반 클릭: 회전할 대상 선택
  selectInteraction.on('select', (e) => {
    // 새로 선택된 객체들 처리
    e.selected.forEach(feature => {
      // Polygon만 처리
      const geom = feature.getGeometry();
      if (!(geom instanceof Polygon)) {
        console.log('Polygon만 선택 가능합니다.');
        return;
      }

      // 이미 기준 객체로 선택된 경우
      if (feature === referenceFeature) {
        console.log('이미 기준 객체로 선택되었습니다.');
        return;
      }

      // 대상 객체로 추가
      if (!targetFeatures.includes(feature)) {
        targetFeatures.push(feature);

        // 가장 가까운 면 찾기
        if (referenceEdge) {
          const closestEdge = findClosestEdge(geom as Polygon, referenceEdge);
          targetEdges.set(feature, closestEdge);

          // 초록색 선 표시
          drawTargetLine(closestEdge);
          console.log(`회전 대상 ${targetFeatures.length}개 선택됨 (초록색 선 표시)`);
        } else {
          console.log('먼저 Ctrl+클릭으로 기준 면을 선택하세요.');
        }
      }
    });

    // 선택 해제된 객체들 처리
    e.deselected.forEach(feature => {
      const index = targetFeatures.indexOf(feature);
      if (index > -1) {
        targetFeatures.splice(index, 1);

        // 해당 객체의 초록색 선 제거
        const targetEdge = targetEdges.get(feature);
        if (targetEdge && vectorSource) {
          // 해당 초록색 선 찾아서 제거
          const lineToRemove = targetLineFeatures.find(lineFeature => {
            const lineGeom = lineFeature.getGeometry() as LineString;
            const lineCoords = lineGeom.getCoordinates();
            return lineCoords[0][0] === targetEdge[0][0] &&
                   lineCoords[0][1] === targetEdge[0][1] &&
                   lineCoords[1][0] === targetEdge[1][0] &&
                   lineCoords[1][1] === targetEdge[1][1];
          });

          if (lineToRemove) {
            vectorSource.removeFeature(lineToRemove);
            const lineIndex = targetLineFeatures.indexOf(lineToRemove);
            if (lineIndex > -1) {
              targetLineFeatures.splice(lineIndex, 1);
            }
          }
        }

        targetEdges.delete(feature);
        console.log(`회전 대상 선택 해제됨. 남은 대상: ${targetFeatures.length}개`);
      }
    });
  });

  console.log('Align Rotate 모듈 초기화 완료 (비활성 상태)');
}

/**
 * 선택 모드 시작
 */
export function startSelectMode(): void {
  if (!selectInteraction || !map || !vectorSource) return;

  // 상태 초기화
  resetState();

  // Select 인터랙션 추가
  map.addInteraction(selectInteraction);

  // Ctrl+클릭: 기준 객체 및 면 선택
  map.on('click', handleCtrlClick);

  console.log('선택 모드 시작 - 기준 객체는 Ctrl+클릭, 회전 대상은 일반 클릭');
}

/**
 * 선택 모드 종료
 */
export function stopSelectMode(): void {
  if (!selectInteraction || !map) return;

  map.removeInteraction(selectInteraction);
  map.un('click', handleCtrlClick);

  console.log('선택 모드 종료');
}

/**
 * 선택 모드 활성화 여부
 */
export function isSelectModeActive(): boolean {
  return selectInteraction !== null && map !== null &&
         map.getInteractions().getArray().includes(selectInteraction);
}

/**
 * Ctrl+클릭 핸들러 (기준 객체 및 면 선택)
 */
function handleCtrlClick(evt: any): void {
  if (!evt.originalEvent.ctrlKey) return;
  if (!map || !vectorSource) return;

  const pixel = map.getEventPixel(evt.originalEvent);
  const features = map.getFeaturesAtPixel(pixel);

  if (features.length === 0) return;

  const feature = features[0] as Feature;
  const geom = feature.getGeometry();

  if (!(geom instanceof Polygon)) {
    console.log('Polygon만 선택 가능합니다.');
    return;
  }

  // 기준 객체 설정
  referenceFeature = feature;

  // 클릭 지점에서 가장 가까운 면 찾기
  const clickCoord = map.getCoordinateFromPixel(pixel);
  const closestEdge = findClosestEdgeToPoint(geom as Polygon, clickCoord);

  referenceEdge = closestEdge;

  // 빨간색 선 표시
  drawReferenceLine(closestEdge);

  console.log('기준 객체 및 면 선택됨 (빨간색 선)');
}

/**
 * 회전 실행
 */
export function executeRotation(): void {
  if (!referenceEdge || targetFeatures.length === 0) {
    alert('기준 면과 회전할 대상을 먼저 선택하세요.');
    return;
  }

  // 기준 각도 계산
  const refAngle = calculateEdgeAngle(referenceEdge);
  console.log(`기준 면 각도: ${(refAngle * 180 / Math.PI).toFixed(2)}도`);

  // 각 대상 객체 회전
  targetFeatures.forEach((feature, index) => {
    const targetEdge = targetEdges.get(feature);
    if (!targetEdge) return;

    // 각 객체의 선택된 면의 각도 계산
    const targetAngle = calculateEdgeAngle(targetEdge);

    // 회전 각도 계산 (기준 각도와 평행하도록)
    const rotationAngle = refAngle - targetAngle;

    console.log(`객체 ${index + 1}: 대상 면 각도 ${(targetAngle * 180 / Math.PI).toFixed(2)}도 → 회전 ${(rotationAngle * 180 / Math.PI).toFixed(2)}도`);

    // 폴리곤 중심 계산
    const geom = feature.getGeometry() as Polygon;
    const center = getCentroid(geom);

    // 회전 적용
    geom.rotate(rotationAngle, center);
  });

  console.log(`✅ ${targetFeatures.length}개 객체 회전 완료 - 모두 기준 면과 평행`);

  // 상태 초기화
  resetState();
}

/**
 * 상태 초기화
 */
function resetState(): void {
  referenceFeature = null;
  referenceEdge = null;
  targetFeatures = [];
  targetEdges.clear();

  // 시각적 표시 제거
  if (referenceLineFeature && vectorSource) {
    vectorSource.removeFeature(referenceLineFeature);
    referenceLineFeature = null;
  }

  targetLineFeatures.forEach(f => {
    if (vectorSource) vectorSource.removeFeature(f);
  });
  targetLineFeatures = [];
}

/**
 * 폴리곤의 중심점 계산
 */
function getCentroid(polygon: Polygon): Coordinate {
  const extent = polygon.getExtent();
  return [
    (extent[0] + extent[2]) / 2,
    (extent[1] + extent[3]) / 2,
  ];
}

/**
 * 클릭 지점에서 가장 가까운 면 찾기
 */
function findClosestEdgeToPoint(polygon: Polygon, point: Coordinate): [Coordinate, Coordinate] {
  const coords = polygon.getCoordinates()[0];
  let minDist = Infinity;
  let closestEdge: [Coordinate, Coordinate] = [coords[0], coords[1]];

  for (let i = 0; i < coords.length - 1; i++) {
    const edge: [Coordinate, Coordinate] = [coords[i], coords[i + 1]];
    const dist = distancePointToSegment(point, edge);

    if (dist < minDist) {
      minDist = dist;
      closestEdge = edge;
    }
  }

  return closestEdge;
}

/**
 * 두 폴리곤 간 가장 가까우면서 평행한 면 찾기
 * 거리와 각도 차이를 종합적으로 고려
 */
function findClosestEdge(polygon: Polygon, referenceEdge: [Coordinate, Coordinate]): [Coordinate, Coordinate] {
  const coords = polygon.getCoordinates()[0];
  let bestScore = Infinity;
  let closestEdge: [Coordinate, Coordinate] = [coords[0], coords[1]];

  const refMidPoint = midpoint(referenceEdge[0], referenceEdge[1]);
  const refAngle = calculateEdgeAngle(referenceEdge);

  for (let i = 0; i < coords.length - 1; i++) {
    const edge: [Coordinate, Coordinate] = [coords[i], coords[i + 1]];
    const edgeMidPoint = midpoint(edge[0], edge[1]);
    const edgeAngle = calculateEdgeAngle(edge);

    // 거리 계산
    const dist = distance(refMidPoint, edgeMidPoint);

    // 각도 차이 계산 (0~π 범위로 정규화)
    let angleDiff = Math.abs(refAngle - edgeAngle);
    // 평행한 면은 각도가 0도 또는 180도(π) 차이
    // 180도 차이도 평행으로 간주
    if (angleDiff > Math.PI) {
      angleDiff = 2 * Math.PI - angleDiff;
    }
    // 0도와 180도 차이를 모두 평행으로 처리
    const parallelAngleDiff = Math.min(angleDiff, Math.abs(Math.PI - angleDiff));

    // 거리와 각도를 종합한 스코어
    // 각도 차이를 더 중요하게 가중치 부여 (각도: 70%, 거리: 30%)
    const normalizedAngle = parallelAngleDiff / (Math.PI / 2); // 0~1 범위로 정규화
    const normalizedDist = dist / 1000; // 거리 정규화 (임의의 스케일)
    const score = normalizedAngle * 0.7 + normalizedDist * 0.3;

    if (score < bestScore) {
      bestScore = score;
      closestEdge = edge;
    }
  }

  return closestEdge;
}

/**
 * 점과 선분 사이의 거리
 */
function distancePointToSegment(point: Coordinate, segment: [Coordinate, Coordinate]): number {
  const [x0, y0] = point;
  const [x1, y1] = segment[0];
  const [x2, y2] = segment[1];

  const A = x0 - x1;
  const B = y0 - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x0 - xx;
  const dy = y0 - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 두 점 사이의 거리
 */
function distance(p1: Coordinate, p2: Coordinate): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 중점 계산
 */
function midpoint(p1: Coordinate, p2: Coordinate): Coordinate {
  return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
}

/**
 * 면의 각도 계산 (라디안)
 */
function calculateEdgeAngle(edge: [Coordinate, Coordinate]): number {
  const dx = edge[1][0] - edge[0][0];
  const dy = edge[1][1] - edge[0][1];
  return Math.atan2(dy, dx);
}

/**
 * 기준선 그리기 (빨간색)
 */
function drawReferenceLine(edge: [Coordinate, Coordinate]): void {
  if (!vectorSource) return;

  // 기존 선 제거
  if (referenceLineFeature) {
    vectorSource.removeFeature(referenceLineFeature);
  }

  // 새 선 생성
  const line = new LineString([edge[0], edge[1]]);
  referenceLineFeature = new Feature({ geometry: line });
  referenceLineFeature.setStyle(referenceLineStyle);
  referenceLineFeature.set('isHelperLine', true);

  vectorSource.addFeature(referenceLineFeature);
}

/**
 * 대상선 그리기 (초록색)
 */
function drawTargetLine(edge: [Coordinate, Coordinate]): void {
  if (!vectorSource) return;

  const line = new LineString([edge[0], edge[1]]);
  const lineFeature = new Feature({ geometry: line });
  lineFeature.setStyle(targetLineStyle);
  lineFeature.set('isHelperLine', true);

  targetLineFeatures.push(lineFeature);
  vectorSource.addFeature(lineFeature);
}
