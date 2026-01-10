import Map from 'ol/Map';
import Draw from 'ol/interaction/Draw';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill } from 'ol/style';
import type { Type as GeometryType } from 'ol/geom/Geometry';

let currentDraw: Draw | null = null;

// 기본 스타일
const defaultStyle = new Style({
  stroke: new Stroke({
    color: '#ffcc33',
    width: 3,
  }),
  fill: new Fill({
    color: 'rgba(255, 204, 51, 0.2)',
  }),
});

export function startDrawing(
  map: Map,
  vectorSource: VectorSource,
  type: GeometryType
): void {
  // 기존 그리기 모드가 있으면 제거
  if (currentDraw) {
    map.removeInteraction(currentDraw);
    currentDraw = null;
  }

  // 새로운 그리기 인터랙션 생성
  currentDraw = new Draw({
    source: vectorSource,
    type: type,
    style: defaultStyle,
  });

  // 그리기 완료 이벤트
  currentDraw.on('drawend', (event) => {
    event.feature.setStyle(defaultStyle);
    console.log(`${type} 객체 그리기 완료`);
  });

  map.addInteraction(currentDraw);
  console.log(`${type} 그리기 모드 시작`);
}

export function stopDrawing(map: Map): void {
  if (currentDraw) {
    map.removeInteraction(currentDraw);
    currentDraw = null;
    console.log('그리기 모드 종료');
  }
}

export function isDrawing(): boolean {
  return currentDraw !== null;
}
