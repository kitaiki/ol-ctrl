import { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { Style, Stroke } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import type { RenderFunction } from 'ol/style/Style';

// 상태 관리 (6개 → 2개로 축소)
let imageFeature: Feature<Polygon> | null = null;
let originalImage: HTMLImageElement | null = null;

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

// Canvas Pattern으로 이미지 렌더링
function createImageFillStyle(
  image: HTMLImageElement,
  polygon: Polygon,
  opacity: number
): Style {
  const renderer: RenderFunction = (coordinates, state) => {
    const ctx = state.context as CanvasRenderingContext2D;
    const pixelCoords = coordinates[0] as number[][];

    ctx.save();

    // Clipping Path 생성
    ctx.beginPath();
    ctx.moveTo(pixelCoords[0][0], pixelCoords[0][1]);
    for (let i = 1; i < pixelCoords.length; i++) {
      ctx.lineTo(pixelCoords[i][0], pixelCoords[i][1]);
    }
    ctx.closePath();

    // 픽셀 좌표에서 bounding box 계산
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const coord of pixelCoords) {
      minX = Math.min(minX, coord[0]);
      minY = Math.min(minY, coord[1]);
      maxX = Math.max(maxX, coord[0]);
      maxY = Math.max(maxY, coord[1]);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // Fill 배경
    ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
    ctx.fill();

    // Clipping 적용
    ctx.clip();

    // 이미지 그리기
    ctx.globalAlpha = opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, minX, minY, width, height);

    // 테두리 그리기
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();

    ctx.restore();
  };

  return new Style({ renderer });
}

// imageFeature 생성
function createImageFeature(
  extent: [number, number, number, number],
  image: HTMLImageElement,
  opacity: number
): Feature<Polygon> {
  const polygon = createPolygonFromExtent(extent);
  const feature = new Feature({ geometry: polygon });

  const style = createImageFillStyle(image, polygon, opacity);
  feature.setStyle(style);

  // 메타데이터 저장
  feature.set('isImageOverlay', true);
  feature.set('originalImage', image);
  feature.set('opacity', opacity);
  feature.set('extent', extent);

  return feature;
}

// Feature 변형 후 Canvas Pattern 재생성
export function refreshImageStyle(feature: Feature<Polygon>): void {
  const image = feature.get('originalImage') as HTMLImageElement;
  const opacity = feature.get('opacity') as number;
  const geometry = feature.getGeometry();

  if (!geometry || !image) return;

  // 새 Style 생성
  const newStyle = createImageFillStyle(image, geometry, opacity);
  feature.setStyle(newStyle);

  console.log('이미지 스타일 재생성 완료');
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
  if (imageFeature) {
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

  // 상태 저장
  originalImage = image;

  // imageFeature 생성 및 추가
  imageFeature = createImageFeature(extent, image, opacity);
  vectorSource.addFeature(imageFeature);

  console.log('이미지 로드 완료:', extent);
}

// 투명도 설정
export function setImageOpacity(opacity: number): void {
  if (imageFeature && originalImage) {
    // Feature 메타데이터 업데이트
    imageFeature.set('opacity', opacity);

    // Style 재생성
    refreshImageStyle(imageFeature);

    console.log('투명도 변경:', opacity);
  }
}

// 이미지 제거
export function clearImage(map: Map, vectorSource: VectorSource): void {
  if (imageFeature) {
    vectorSource.removeFeature(imageFeature);
    imageFeature = null;
    console.log('이미지 Feature 제거');
  }

  originalImage = null;
}

// 이미지 존재 여부
export function hasImage(): boolean {
  return imageFeature !== null;
}

// 현재 이미지 Extent
export function getImageExtent(): [number, number, number, number] | null {
  if (!imageFeature) return null;
  return imageFeature.get('extent') as [number, number, number, number];
}

// Bounding Polygon 반환 (coord-picker와의 호환성)
export function getBoundingPolygon(): Feature<Polygon> | null {
  return imageFeature;
}
