import Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';
// @ts-ignore - ol-ext does not have TypeScript declarations
import Transform from 'ol-ext/interaction/Transform';
import { Style, Stroke, Fill, Icon } from 'ol/style';
import { refreshImageCache } from './image-overlay';

let transformInteraction: Transform | null = null;
let map: Map | null = null;

// 선택된 객체 스타일
const selectedStyle = new Style({
  stroke: new Stroke({
    color: '#ff3333',
    width: 3,
  }),
  fill: new Fill({
    color: 'rgba(255, 51, 51, 0.2)',
  }),
});

export function initTransform(mapInstance: Map, vectorSource: VectorSource): void {
  map = mapInstance;

  // Transform 인터랙션 생성 (초기에는 추가하지 않음)
  transformInteraction = new Transform({
    enableRotatedTransform: true,
    keepAspectRatio: undefined,
    translate: true,
    stretch: true,
    scale: true,
    rotate: true,
  });

  // 선택 이벤트
  transformInteraction.on('select', (event: any) => {
    if (event.feature) {
      console.log('객체 선택됨');
    }
  });

  // 변형 완료 이벤트 (회전, 이동, 크기 조정 모두 처리)
  transformInteraction.on('transformend', (event: any) => {
    console.log('객체 변형 완료');

    // 이미지 오버레이 Feature인 경우 Canvas 캐시 재생성
    const features = event.features.getArray();
    features.forEach((feature: any) => {
      if (feature.get('isImageOverlay')) {
        refreshImageCache(feature);
      }
    });
  });

  console.log('Transform 인터랙션 초기화 완료 (비활성 상태)');
}

export function startTransform(): void {
  if (transformInteraction && map) {
    map.addInteraction(transformInteraction);

    // 맵에 추가 후 회전 핸들 스타일 설정
    const rotateStyle = new Style({
      image: new Icon({
        src: '/rotate-icon.svg',
        scale: 1.2,
        anchor: [0.5, 0.5],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        displacement: [20, 0], // 대각선 하단 방향으로 20px 이동
      }),
    });

    // 회전 핸들 스타일 설정
    (transformInteraction as any).style.rotate = [rotateStyle];

    // 지도 컨테이너에 편집 모드 커서 클래스 추가
    const mapElement = map.getTargetElement();
    if (mapElement) {
      mapElement.classList.add('edit-mode');
    }

    console.log('객체 편집 모드 시작');
  }
}

export function stopTransform(): void {
  if (transformInteraction && map) {
    map.removeInteraction(transformInteraction);

    // 지도 컨테이너에서 편집 모드 커서 클래스 제거
    const mapElement = map.getTargetElement();
    if (mapElement) {
      mapElement.classList.remove('edit-mode');
    }

    console.log('객체 편집 모드 종료');
  }
}

export function isTransformActive(): boolean {
  return transformInteraction !== null && map !== null &&
         map.getInteractions().getArray().includes(transformInteraction);
}
