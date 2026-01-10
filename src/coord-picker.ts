import { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { Point, Polygon } from 'ol/geom';
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style';
import { toLonLat, fromLonLat } from 'ol/proj';

// 상태 관리
let map: Map | null = null;
let vectorSource: VectorSource | null = null;
let isPickingActive: boolean = false;
let clickedPoints: [number, number][] = []; // WGS84 좌표 저장
let markerFeatures: Feature<Point>[] = []; // 시각적 마커
let bboxFeature: Feature<Polygon> | null = null; // BBox 프리뷰

// 입력 필드 참조
let inputRefs: {
  minLon: HTMLInputElement | null;
  minLat: HTMLInputElement | null;
  maxLon: HTMLInputElement | null;
  maxLat: HTMLInputElement | null;
} = {
  minLon: null,
  minLat: null,
  maxLon: null,
  maxLat: null,
};

// 지도 클릭 핸들러
function handleMapClick(event: any): void {
  if (!isPickingActive || !map || !vectorSource) return;

  const coordinate = event.coordinate; // EPSG:3857 (Web Mercator)
  const lonLat = toLonLat(coordinate) as [number, number];

  // 6자리 소수점으로 반올림
  const roundedLonLat: [number, number] = [
    Math.round(lonLat[0] * 1000000) / 1000000,
    Math.round(lonLat[1] * 1000000) / 1000000,
  ];

  clickedPoints.push(roundedLonLat);

  if (clickedPoints.length === 1) {
    // 첫 번째 클릭: 녹색 마커
    const marker = createMarker(roundedLonLat, 'first');
    markerFeatures.push(marker);
    vectorSource.addFeature(marker);

    console.log('첫 번째 좌표 선택:', roundedLonLat);
  } else if (clickedPoints.length === 2) {
    // 두 번째 클릭: 빨간색 마커 + BBox 프리뷰
    const marker = createMarker(roundedLonLat, 'second');
    markerFeatures.push(marker);
    vectorSource.addFeature(marker);

    // BBox 프리뷰 생성
    bboxFeature = createBBoxPreview(clickedPoints[0], clickedPoints[1]);
    vectorSource.addFeature(bboxFeature);

    // 좌표 자동 정렬 및 입력 필드 채우기
    fillCoordinateInputs();

    console.log('두 번째 좌표 선택:', roundedLonLat);
    console.log('좌표 입력 완료');

    // 2번 클릭 후 자동 비활성화
    // (사용자가 버튼으로 수동 종료하도록 변경 가능)
  }
}

// 마커 생성
function createMarker(coord: [number, number], type: 'first' | 'second'): Feature<Point> {
  const point = new Point(fromLonLat(coord));
  const feature = new Feature({ geometry: point });

  const color = type === 'first' ? 'rgba(46, 204, 113, 0.9)' : 'rgba(231, 76, 60, 0.9)';
  const textColor = type === 'first' ? '#2ecc71' : '#e74c3c';
  const label = type === 'first' ? 'Point 1' : 'Point 2';

  feature.setStyle(
    new Style({
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: 'white', width: 2 }),
      }),
      text: new Text({
        text: label,
        offsetY: -15,
        fill: new Fill({ color: textColor }),
        font: 'bold 12px sans-serif',
      }),
    })
  );

  return feature;
}

// BBox 프리뷰 생성
function createBBoxPreview(point1: [number, number], point2: [number, number]): Feature<Polygon> {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;

  // 좌표 정렬
  const minLon = Math.min(lon1, lon2);
  const maxLon = Math.max(lon1, lon2);
  const minLat = Math.min(lat1, lat2);
  const maxLat = Math.max(lat1, lat2);

  // Polygon 생성
  const coordinates = [
    fromLonLat([minLon, minLat]),
    fromLonLat([maxLon, minLat]),
    fromLonLat([maxLon, maxLat]),
    fromLonLat([minLon, maxLat]),
    fromLonLat([minLon, minLat]), // 폐곡선
  ];

  const polygon = new Polygon([coordinates]);
  const feature = new Feature({ geometry: polygon });

  feature.setStyle(
    new Style({
      stroke: new Stroke({
        color: 'rgba(241, 196, 15, 0.8)',
        width: 2,
        lineDash: [5, 5],
      }),
      fill: new Fill({
        color: 'rgba(241, 196, 15, 0.1)',
      }),
    })
  );

  return feature;
}

// 좌표 자동 정렬 및 입력 필드 채우기
function fillCoordinateInputs(): void {
  if (clickedPoints.length !== 2) return;

  const [lon1, lat1] = clickedPoints[0];
  const [lon2, lat2] = clickedPoints[1];

  // 좌표 정렬
  const minLon = Math.min(lon1, lon2);
  const maxLon = Math.max(lon1, lon2);
  const minLat = Math.min(lat1, lat2);
  const maxLat = Math.max(lat1, lat2);

  // 입력 필드 채우기
  if (inputRefs.minLon) inputRefs.minLon.value = minLon.toString();
  if (inputRefs.minLat) inputRefs.minLat.value = minLat.toString();
  if (inputRefs.maxLon) inputRefs.maxLon.value = maxLon.toString();
  if (inputRefs.maxLat) inputRefs.maxLat.value = maxLat.toString();

  console.log('좌표 입력 완료:', { minLon, minLat, maxLon, maxLat });
}

// 마커 및 BBox 제거
function clearMarkers(): void {
  if (!vectorSource) return;

  // 마커 제거
  markerFeatures.forEach((feature) => vectorSource!.removeFeature(feature));
  markerFeatures = [];

  // BBox 제거
  if (bboxFeature) {
    vectorSource.removeFeature(bboxFeature);
    bboxFeature = null;
  }

  // 클릭 좌표 초기화
  clickedPoints = [];

  console.log('마커 및 BBox 제거');
}

// 초기화
export function initCoordinatePicker(mapInstance: Map, source: VectorSource): void {
  map = mapInstance;
  vectorSource = source;

  // singleclick 이벤트 리스너 등록
  map.on('singleclick', handleMapClick);

  console.log('좌표 선택 기능 초기화 완료');
}

// 좌표 선택 모드 시작
export function startPickingCoordinates(
  minLonInput: HTMLInputElement,
  minLatInput: HTMLInputElement,
  maxLonInput: HTMLInputElement,
  maxLatInput: HTMLInputElement
): void {
  if (!map || !vectorSource) {
    console.error('지도가 초기화되지 않았습니다.');
    return;
  }

  // 입력 필드 참조 저장
  inputRefs.minLon = minLonInput;
  inputRefs.minLat = minLatInput;
  inputRefs.maxLon = maxLonInput;
  inputRefs.maxLat = maxLatInput;

  // 기존 마커 및 BBox 제거
  clearMarkers();

  // 선택 모드 활성화
  isPickingActive = true;

  console.log('좌표 선택 모드 시작');
}

// 좌표 선택 모드 종료
export function stopPickingCoordinates(): void {
  if (!map) return;

  // 선택 모드 비활성화
  isPickingActive = false;

  // 마커 및 BBox 제거
  clearMarkers();

  // 입력 필드 참조 초기화
  inputRefs = {
    minLon: null,
    minLat: null,
    maxLon: null,
    maxLat: null,
  };

  console.log('좌표 선택 모드 종료');
}

// 좌표 선택 모드 활성 상태 확인
export function isCoordinatePickingActive(): boolean {
  return isPickingActive;
}
