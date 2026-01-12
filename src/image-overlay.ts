import { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { Style, Stroke, Fill } from 'ol/style';
import { fromLonLat } from 'ol/proj';
// @ts-ignore - ol-ext does not have TypeScript declarations
import GeoImage from 'ol-ext/source/GeoImage';
import ImageLayer from 'ol/layer/Image';

// 상태 관리 (GeoImage 방식)
let geoImageLayer: ImageLayer<GeoImage> | null = null;
let proxyFeature: Feature<Polygon> | null = null;
let originalImage: HTMLImageElement | null = null;
let currentExtent: [number, number, number, number] | null = null;

// Extent에서 Polygon 생성
function createPolygonFromExtent(extent: [number, number, number, number]): Polygon {
  const [minLon, minLat, maxLon, maxLat] = extent;
  const coordinates = [
    fromLonLat([minLon, minLat]),
    fromLonLat([maxLon, minLat]),
    fromLonLat([maxLon, maxLat]),
    fromLonLat([minLon, maxLat]),
    fromLonLat([minLon, minLat]) // 폐곡선
  ];
  return new Polygon([coordinates]);
}

// Extent → Center + Scale 변환
function extentToCenterAndScale(
  extent: [number, number, number, number],
  imageWidth: number,
  imageHeight: number
): { center: [number, number], scale: [number, number] } {
  // WGS84 center → Web Mercator
  const centerLon = (extent[0] + extent[2]) / 2;
  const centerLat = (extent[1] + extent[3]) / 2;
  const center = fromLonLat([centerLon, centerLat]) as [number, number];

  // Polygon 생성하여 실제 미터 크기 계산
  const polygon = createPolygonFromExtent(extent);
  const coords = polygon.getCoordinates()[0];

  const [x1, y1] = coords[0];
  const [x2, y2] = coords[1];
  const [x3, y3] = coords[2];

  const width = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
  const height = Math.sqrt((x3-x2)**2 + (y3-y2)**2);

  return { center, scale: [width/imageWidth, height/imageHeight] };
}

// GeoImage Source 생성
function createGeoImageSource(
  image: HTMLImageElement,
  extent: [number, number, number, number]
): GeoImage {
  const { center, scale } = extentToCenterAndScale(
    extent,
    image.naturalWidth,
    image.naturalHeight
  );

  return new GeoImage({
    image: image,
    imageCenter: center,
    imageScale: scale,
    imageRotate: 0,
    projection: 'EPSG:3857'
  });
}

// Proxy Polygon 생성 (Transform용)
function createProxyPolygon(
  extent: [number, number, number, number],
  geoImageSource: GeoImage
): Feature<Polygon> {
  const polygon = createPolygonFromExtent(extent);
  const feature = new Feature({ geometry: polygon });

  // 반투명 노란색 스타일
  feature.setStyle(new Style({
    stroke: new Stroke({
      color: 'rgba(255, 255, 0, 0.8)',
      width: 2,
      lineDash: [5, 5]
    }),
    fill: new Fill({
      color: 'rgba(255, 255, 0, 0.1)'
    })
  }));

  // 메타데이터 저장
  feature.set('isImageOverlay', true);
  feature.set('geoImageSource', geoImageSource);

  return feature;
}

// Polygon 중심점 계산
function calculatePolygonCenter(coords: number[][]): [number, number] {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  coords.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

// Polygon 크기 계산
function calculatePolygonDimensions(coords: number[][]): { width: number; height: number } {
  const [x1, y1] = coords[0];
  const [x2, y2] = coords[1];
  const [x3, y3] = coords[2];

  const width = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const height = Math.sqrt((x3 - x2) ** 2 + (y3 - y2) ** 2);

  return { width, height };
}

// Polygon 회전 각도 계산
function calculateRotation(coords: number[][]): number {
  const [x1, y1] = coords[0];
  const [x2, y2] = coords[1];
  return Math.atan2(y2 - y1, x2 - x1);
}

// Polygon 변형을 GeoImage에 동기화
export function syncGeoImageFromPolygon(
  polygon: Polygon,
  geoImageSource: GeoImage
): void {
  if (!originalImage || !geoImageLayer) return;

  const coords = polygon.getCoordinates()[0];

  // 중심점
  const center = calculatePolygonCenter(coords);

  // 크기
  const { width, height } = calculatePolygonDimensions(coords);

  // 회전
  const rotation = calculateRotation(coords);

  // 스케일 (현재 크기 / 원본 크기)
  const scale: [number, number] = [
    width / originalImage.naturalWidth,
    height / originalImage.naturalHeight
  ];

  // 새로운 GeoImage Source 생성 (재생성 방식)
  const newGeoImageSource = new GeoImage({
    image: originalImage,
    imageCenter: center,
    imageScale: scale,
    imageRotate: rotation,
    projection: 'EPSG:3857'
  });

  // Layer의 Source 교체
  geoImageLayer.setSource(newGeoImageSource);

  // Proxy Feature의 메타데이터도 업데이트 (다음 변형을 위해)
  if (proxyFeature) {
    proxyFeature.set('geoImageSource', newGeoImageSource);
  }

  console.log('GeoImage 재생성 및 동기화:', { center, scale, rotation });
}

// 파일 검증
function validateImageFile(file: File): { valid: boolean; error?: string } {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: '지원하지 않는 파일 형식입니다. PNG 또는 JPG 파일을 선택하세요.'
    };
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: '파일 크기가 너무 큽니다. 10MB 이하의 파일을 선택하세요.'
    };
  }

  return { valid: true };
}

// 좌표 검증
export function validateCoordinates(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number
): boolean {
  // 범위 검증
  if (minLon < -180 || minLon > 180) return false;
  if (maxLon < -180 || maxLon > 180) return false;
  if (minLat < -90 || minLat > 90) return false;
  if (maxLat < -90 || maxLat > 90) return false;

  // 논리적 순서 검증
  if (minLon >= maxLon) return false;
  if (minLat >= maxLat) return false;

  return true;
}

// 파일 로딩
function loadImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error('파일 읽기 실패'));
      }
    };

    reader.onerror = () => {
      reject(new Error('파일 읽기 중 오류 발생'));
    };

    reader.readAsDataURL(file);
  });
}

// 이미지 로드
export async function loadImage(
  map: Map,
  vectorSource: VectorSource,
  file: File,
  extent: [number, number, number, number],
  opacity: number = 1.0
): Promise<void> {
  // 파일 검증
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 좌표 검증
  if (!validateCoordinates(...extent)) {
    throw new Error('유효하지 않은 좌표입니다. 좌표 범위를 확인하세요.');
  }

  // 기존 이미지 제거
  if (geoImageLayer) {
    clearImage(map, vectorSource);
  }

  // 파일 로드
  const imageUrl = await loadImageFile(file);

  // HTMLImageElement 생성
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => {
      console.error('이미지 로드 실패:', error);
      reject(error);
    };
    img.src = imageUrl;
  });

  // GeoImage Source 생성
  const geoImageSource = createGeoImageSource(image, extent);

  // GeoImage Layer 생성
  geoImageLayer = new ImageLayer({
    source: geoImageSource,
    opacity: opacity
  });

  // 지도에 추가 (Vector Layer 아래, index 1)
  map.getLayers().insertAt(1, geoImageLayer);

  // Proxy Polygon 생성 및 추가
  proxyFeature = createProxyPolygon(extent, geoImageSource);
  vectorSource.addFeature(proxyFeature);

  // 상태 저장
  originalImage = image;
  currentExtent = extent;

  console.log('GeoImage 로드 완료:', extent);
  console.log('Proxy Polygon 추가 완료');
}

// 투명도 설정
export function setImageOpacity(opacity: number): void {
  if (geoImageLayer) {
    geoImageLayer.setOpacity(opacity);
    console.log('투명도 변경:', opacity);
  }
}

// 이미지 제거
export function clearImage(map: Map, vectorSource: VectorSource): void {
  // GeoImage Layer 제거
  if (geoImageLayer) {
    map.removeLayer(geoImageLayer);
    geoImageLayer = null;
    console.log('GeoImage Layer 제거');
  }

  // Proxy Polygon 제거 (Phase 2에서 추가 예정)
  if (proxyFeature) {
    vectorSource.removeFeature(proxyFeature);
    proxyFeature = null;
    console.log('Proxy Polygon 제거');
  }

  originalImage = null;
  currentExtent = null;
}

// 이미지 존재 여부
export function hasImage(): boolean {
  return geoImageLayer !== null;
}

// 현재 이미지 Extent
export function getImageExtent(): [number, number, number, number] | null {
  return currentExtent;
}

// Bounding Polygon 반환 (coord-picker와의 호환성)
export function getBoundingPolygon(): Feature<Polygon> | null {
  return proxyFeature;
}
