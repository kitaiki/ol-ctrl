import { Map } from 'ol';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { Polygon } from 'ol/geom';
import { Style, Stroke, Fill } from 'ol/style';
import ImageLayer from 'ol/layer/Image';
import ImageCanvasSource from 'ol/source/ImageCanvas';
import type { AffineMatrix, GCPPoint, GeoImageParams } from './gcp-transform';
import { invertAffine, applyAffine, solveAffineTransform } from './gcp-transform';

let imageLayer: ImageLayer<ImageCanvasSource> | null = null;
let proxyFeature: Feature<Polygon> | null = null;
let originalImage: HTMLImageElement | null = null;
let currentAffine: AffineMatrix | null = null;

function validateImageFile(file: File): { valid: boolean; error?: string } {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: '지원하지 않는 파일 형식입니다. PNG 또는 JPG 파일을 선택하세요.'
    };
  }

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: '파일 크기가 너무 큽니다. 10MB 이하의 파일을 선택하세요.'
    };
  }

  return { valid: true };
}

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
    reader.onerror = () => reject(new Error('파일 읽기 중 오류 발생'));
    reader.readAsDataURL(file);
  });
}

export async function createImageElement(file: File): Promise<HTMLImageElement> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const imageUrl = await loadImageFile(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => {
      console.error('이미지 로드 실패:', error);
      reject(new Error('이미지 로드에 실패했습니다.'));
    };
    img.src = imageUrl;
  });
}

function createProxyFeature(polygon: Polygon): Feature<Polygon> {
  const feature = new Feature({ geometry: polygon });

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

  feature.set('isImageOverlay', true);
  return feature;
}

function addImageCanvasLayer(
  map: Map,
  source: ImageCanvasSource,
  opacity: number
): ImageLayer<ImageCanvasSource> {
  const layer = new ImageLayer({
    source,
    opacity
  });

  map.getLayers().insertAt(1, layer);
  return layer;
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  let inside = false;
  const [x, y] = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

function sampleBilinear(
  srcData: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  u: number,
  v: number
): [number, number, number, number] {
  const x = Math.max(0, Math.min(srcWidth - 1, u));
  const y = Math.max(0, Math.min(srcHeight - 1, v));

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, srcWidth - 1);
  const y1 = Math.min(y0 + 1, srcHeight - 1);

  const tx = x - x0;
  const ty = y - y0;

  const i00 = (y0 * srcWidth + x0) * 4;
  const i10 = (y0 * srcWidth + x1) * 4;
  const i01 = (y1 * srcWidth + x0) * 4;
  const i11 = (y1 * srcWidth + x1) * 4;

  const out: [number, number, number, number] = [0, 0, 0, 0];

  for (let c = 0; c < 4; c++) {
    const v00 = srcData[i00 + c];
    const v10 = srcData[i10 + c];
    const v01 = srcData[i01 + c];
    const v11 = srcData[i11 + c];

    const top = v00 * (1 - tx) + v10 * tx;
    const bottom = v01 * (1 - tx) + v11 * tx;
    out[c] = top * (1 - ty) + bottom * ty;
  }

  return out;
}

function createAffineCanvasSource(
  image: HTMLImageElement,
  affine: AffineMatrix,
  proxyPolygon: Polygon
): ImageCanvasSource {
  const inverse = invertAffine(affine);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = image.naturalWidth;
  srcCanvas.height = image.naturalHeight;

  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) {
    throw new Error('이미지 버퍼 초기화에 실패했습니다.');
  }

  srcCtx.drawImage(image, 0, 0);
  const srcImageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const srcData = srcImageData.data;

  const ring = proxyPolygon.getCoordinates()[0] as [number, number][];
  const polygon = ring.slice(0, -1);
  const polyExtent = proxyPolygon.getExtent();

  return new ImageCanvasSource({
    projection: 'EPSG:3857',
    ratio: 1,
    canvasFunction: (requestedExtent, _resolution, pixelRatio, size) => {
      void pixelRatio;
      const width = Math.max(1, Math.round(size[0]));
      const height = Math.max(1, Math.round(size[1]));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;

      const output = ctx.createImageData(width, height);
      const outData = output.data;

      const minX = requestedExtent[0];
      const minY = requestedExtent[1];
      const maxX = requestedExtent[2];
      const maxY = requestedExtent[3];

      for (let py = 0; py < height; py++) {
        const y = maxY - (py + 0.5) * ((maxY - minY) / height);

        for (let px = 0; px < width; px++) {
          const x = minX + (px + 0.5) * ((maxX - minX) / width);
          const outIdx = (py * width + px) * 4;

          if (x < polyExtent[0] || x > polyExtent[2] || y < polyExtent[1] || y > polyExtent[3]) {
            continue;
          }

          if (!pointInPolygon([x, y], polygon)) {
            continue;
          }

          const [u, v] = applyAffine(inverse, x, y);
          if (u < 0 || u >= image.naturalWidth || v < 0 || v >= image.naturalHeight) {
            continue;
          }

          const [r, g, b, a] = sampleBilinear(srcData, image.naturalWidth, image.naturalHeight, u, v);
          outData[outIdx] = Math.round(r);
          outData[outIdx + 1] = Math.round(g);
          outData[outIdx + 2] = Math.round(b);
          outData[outIdx + 3] = Math.round(a);
        }
      }

      ctx.putImageData(output, 0, 0);
      return canvas;
    }
  });
}

export async function loadImageFromAffineParams(
  map: Map,
  vectorSource: VectorSource,
  file: File,
  affine: AffineMatrix,
  proxyPolygon: Polygon,
  opacity: number = 1.0
): Promise<void> {
  if (imageLayer) {
    clearImage(map, vectorSource);
  }

  const image = await createImageElement(file);
  const source = createAffineCanvasSource(image, affine, proxyPolygon);
  const layer = addImageCanvasLayer(map, source, opacity);

  imageLayer = layer;
  proxyFeature = createProxyFeature(proxyPolygon);
  vectorSource.addFeature(proxyFeature);

  originalImage = image;
  currentAffine = affine;

  console.log('Affine Warp 이미지 로드 완료');
}

// 호환 래퍼 (기존 호출부가 남아 있을 때를 대비)
export async function loadImageFromGCPParams(
  map: Map,
  vectorSource: VectorSource,
  file: File,
  geoImageParams: GeoImageParams,
  proxyPolygon: Polygon,
  opacity: number = 1.0
): Promise<void> {
  const ring = proxyPolygon.getCoordinates()[0] as [number, number][];
  if (ring.length < 4) {
    throw new Error('유효한 Polygon 좌표가 필요합니다.');
  }

  void geoImageParams;

  // 사각형 코너 기반으로 affine 재구성
  const img = await createImageElement(file);
  const gcps: GCPPoint[] = [
    { id: 'compat-1', pixel: [0, 0], map: ring[0], mapLonLat: [0, 0] },
    { id: 'compat-2', pixel: [img.naturalWidth, 0], map: ring[1], mapLonLat: [0, 0] },
    { id: 'compat-3', pixel: [img.naturalWidth, img.naturalHeight], map: ring[2], mapLonLat: [0, 0] },
    { id: 'compat-4', pixel: [0, img.naturalHeight], map: ring[3], mapLonLat: [0, 0] }
  ];

  const affine = solveAffineTransform(gcps);

  if (imageLayer) {
    clearImage(map, vectorSource);
  }

  const source = createAffineCanvasSource(img, affine, proxyPolygon);
  const layer = addImageCanvasLayer(map, source, opacity);

  imageLayer = layer;
  proxyFeature = createProxyFeature(proxyPolygon);
  vectorSource.addFeature(proxyFeature);
  originalImage = img;
  currentAffine = affine;
}

function isParallelogram(corners: [number, number][], tolerance = 1e-4): boolean {
  if (corners.length < 4) return false;

  const [p0, p1, p2, p3] = corners;
  const dx = (p0[0] + p2[0]) - (p1[0] + p3[0]);
  const dy = (p0[1] + p2[1]) - (p1[1] + p3[1]);
  const diag = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) + Math.hypot(p3[0] - p1[0], p3[1] - p1[1]);
  const scale = Math.max(1, diag);

  return Math.hypot(dx, dy) / scale < tolerance;
}

export function syncImageFromPolygon(polygon: Polygon): void {
  if (!originalImage || !imageLayer) return;

  const ring = polygon.getCoordinates()[0] as [number, number][];
  if (ring.length < 5) return;

  const corners = [ring[0], ring[1], ring[2], ring[3]];

  if (!isParallelogram(corners)) {
    console.warn('변형 결과가 평행사변형이 아니어서 affine 동기화를 건너뜁니다.');
    return;
  }

  const gcps: GCPPoint[] = [
    { id: 'sync-1', pixel: [0, 0], map: corners[0], mapLonLat: [0, 0] },
    { id: 'sync-2', pixel: [originalImage.naturalWidth, 0], map: corners[1], mapLonLat: [0, 0] },
    { id: 'sync-3', pixel: [originalImage.naturalWidth, originalImage.naturalHeight], map: corners[2], mapLonLat: [0, 0] },
    { id: 'sync-4', pixel: [0, originalImage.naturalHeight], map: corners[3], mapLonLat: [0, 0] }
  ];

  try {
    const affine = solveAffineTransform(gcps);
    const source = createAffineCanvasSource(originalImage, affine, polygon);
    imageLayer.setSource(source);
    currentAffine = affine;
  } catch (error) {
    console.warn('Affine Warp 동기화 실패:', error);
  }
}

export function setImageOpacity(opacity: number): void {
  if (imageLayer) {
    imageLayer.setOpacity(opacity);
    console.log('투명도 변경:', opacity);
  }
}

export function clearImage(map: Map, vectorSource: VectorSource): void {
  if (imageLayer) {
    map.removeLayer(imageLayer);
    imageLayer = null;
    console.log('이미지 레이어 제거');
  }

  if (proxyFeature) {
    vectorSource.removeFeature(proxyFeature);
    proxyFeature = null;
    console.log('Proxy Polygon 제거');
  }

  originalImage = null;
  currentAffine = null;
}

export function hasImage(): boolean {
  return imageLayer !== null;
}

export function getBoundingPolygon(): Feature<Polygon> | null {
  return proxyFeature;
}

export function getCurrentAffine(): AffineMatrix | null {
  return currentAffine;
}
