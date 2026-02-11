import { Map, Feature } from 'ol';
import VectorSource from 'ol/source/Vector';
import { Point } from 'ol/geom';
import { Style, Circle as CircleStyle, Fill, Stroke, Text as TextStyle } from 'ol/style';
import { toLonLat } from 'ol/proj';
import type { GCPPoint } from './gcp-transform';

// ===== 상태 =====

type PickerState = 'idle' | 'awaiting_pixel' | 'awaiting_map';

let state: PickerState = 'idle';
let mapRef: Map | null = null;
let vectorSourceRef: VectorSource | null = null;
let gcpList: GCPPoint[] = [];
let gcpMarkers: Feature[] = [];
let gcpCounter = 0;

// Canvas 관련
let canvasEl: HTMLCanvasElement | null = null;
let currentImage: HTMLImageElement | null = null;
let canvasScale = 1;

// 현재 피킹 중인 GCP의 임시 픽셀 좌표
let pendingPixel: [number, number] | null = null;

// 콜백
let onGCPListChanged: ((gcps: GCPPoint[]) => void) | null = null;
let onStateChanged: ((state: PickerState) => void) | null = null;

// 지도 클릭 핸들러 참조
let mapClickHandler: ((evt: any) => void) | null = null;

// ===== 초기화 =====

export function initGCPPicker(
  map: Map,
  vectorSource: VectorSource,
  callbacks?: {
    onGCPListChanged?: (gcps: GCPPoint[]) => void;
    onStateChanged?: (state: PickerState) => void;
  }
): void {
  mapRef = map;
  vectorSourceRef = vectorSource;
  onGCPListChanged = callbacks?.onGCPListChanged || null;
  onStateChanged = callbacks?.onStateChanged || null;

  canvasEl = document.getElementById('gcpPreviewCanvas') as HTMLCanvasElement | null;

  if (canvasEl) {
    canvasEl.addEventListener('click', handleCanvasClick);
  }
}

// ===== 이미지 미리보기 =====

export function updateImagePreview(image: HTMLImageElement): void {
  currentImage = image;
  if (!canvasEl) return;

  const container = canvasEl.parentElement;
  if (!container) return;

  const maxWidth = container.clientWidth || 300;
  const maxHeight = 200;

  // 이미지를 컨테이너에 맞게 축소
  const widthRatio = maxWidth / image.naturalWidth;
  const heightRatio = maxHeight / image.naturalHeight;
  canvasScale = Math.min(widthRatio, heightRatio, 1);

  canvasEl.width = image.naturalWidth * canvasScale;
  canvasEl.height = image.naturalHeight * canvasScale;

  redrawCanvas();
}

function redrawCanvas(): void {
  if (!canvasEl || !currentImage) return;

  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;

  // 이미지 그리기
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.drawImage(currentImage, 0, 0, canvasEl.width, canvasEl.height);

  // GCP 마커 그리기
  gcpList.forEach((gcp, index) => {
    const cx = gcp.pixel[0] * canvasScale;
    const cy = gcp.pixel[1] * canvasScale;

    // 원
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 번호
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), cx, cy);
  });

  // 피킹 상태 표시
  if (state === 'awaiting_pixel') {
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.setLineDash([]);
  }
}

// ===== Canvas 클릭 핸들러 =====

function handleCanvasClick(evt: MouseEvent): void {
  if (state !== 'awaiting_pixel' || !canvasEl || !currentImage) return;

  const rect = canvasEl.getBoundingClientRect();
  const canvasX = evt.clientX - rect.left;
  const canvasY = evt.clientY - rect.top;

  // canvas 좌표 → 원본 이미지 픽셀 좌표
  const pixelX = Math.round(canvasX / canvasScale);
  const pixelY = Math.round(canvasY / canvasScale);

  // 범위 체크
  if (pixelX < 0 || pixelX > currentImage.naturalWidth ||
      pixelY < 0 || pixelY > currentImage.naturalHeight) {
    return;
  }

  pendingPixel = [pixelX, pixelY];
  setState('awaiting_map');

  // 미리보기 업데이트 (임시 마커)
  redrawCanvas();

  // 임시 마커 그리기 (파란색)
  const ctx = canvasEl.getContext('2d');
  if (ctx) {
    const cx = pixelX * canvasScale;
    const cy = pixelY * canvasScale;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 100, 255, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy);
  }

  console.log(`GCP 픽셀 좌표 선택: [${pixelX}, ${pixelY}] → 지도에서 대응 좌표를 클릭하세요.`);
}

// ===== 지도 클릭 핸들러 =====

function handleMapClick(evt: any): void {
  if (state !== 'awaiting_map' || !pendingPixel || !mapRef || !vectorSourceRef) return;

  const coordinate = evt.coordinate as [number, number];
  const lonLat = toLonLat(coordinate) as [number, number];

  gcpCounter++;
  const gcp: GCPPoint = {
    id: `gcp-${gcpCounter}`,
    pixel: pendingPixel,
    map: coordinate,
    mapLonLat: lonLat
  };

  gcpList.push(gcp);

  // 지도에 마커 추가
  addMapMarker(gcp, gcpList.length);

  pendingPixel = null;
  setState('idle');
  redrawCanvas();

  onGCPListChanged?.(gcpList);

  console.log(`GCP ${gcpList.length} 추가 완료: pixel=[${gcp.pixel}], map=[${lonLat[0].toFixed(6)}, ${lonLat[1].toFixed(6)}]`);
}

// ===== 지도 마커 =====

function addMapMarker(gcp: GCPPoint, index: number): void {
  if (!vectorSourceRef) return;

  const marker = new Feature({
    geometry: new Point(gcp.map)
  });

  marker.setStyle(new Style({
    image: new CircleStyle({
      radius: 10,
      fill: new Fill({ color: 'rgba(255, 0, 0, 0.8)' }),
      stroke: new Stroke({ color: 'white', width: 2 })
    }),
    text: new TextStyle({
      text: String(index),
      fill: new Fill({ color: 'white' }),
      font: 'bold 11px sans-serif',
      offsetY: 0
    })
  }));

  marker.set('isGCPMarker', true);
  marker.set('gcpId', gcp.id);

  vectorSourceRef.addFeature(marker);
  gcpMarkers.push(marker);
}

function clearMapMarkers(): void {
  if (!vectorSourceRef) return;

  for (const marker of gcpMarkers) {
    vectorSourceRef.removeFeature(marker);
  }
  gcpMarkers = [];
}

function refreshMapMarkers(): void {
  clearMapMarkers();
  gcpList.forEach((gcp, index) => {
    addMapMarker(gcp, index + 1);
  });
}

// ===== 상태 관리 =====

function setState(newState: PickerState): void {
  const oldState = state;
  state = newState;

  // 지도 클릭 핸들러 관리
  if (newState === 'awaiting_map' && mapRef && !mapClickHandler) {
    mapClickHandler = handleMapClick;
    mapRef.on('singleclick', mapClickHandler);

    // 커서 변경
    const mapEl = mapRef.getTargetElement();
    if (mapEl) mapEl.classList.add('coordinate-picking');
  }

  if (newState !== 'awaiting_map' && mapRef && mapClickHandler) {
    mapRef.un('singleclick', mapClickHandler);
    mapClickHandler = null;

    const mapEl = mapRef.getTargetElement();
    if (mapEl) mapEl.classList.remove('coordinate-picking');
  }

  // Canvas 커서
  if (canvasEl) {
    canvasEl.style.cursor = newState === 'awaiting_pixel' ? 'crosshair' : 'default';
  }

  onStateChanged?.(newState);
  console.log(`GCP Picker 상태 변경: ${oldState} → ${newState}`);
}

// ===== 외부 API =====

export function startGCPPicking(): void {
  if (!currentImage) {
    console.warn('이미지를 먼저 선택하세요.');
    return;
  }
  setState('awaiting_pixel');
}

export function cancelGCPPicking(): void {
  pendingPixel = null;
  setState('idle');
  redrawCanvas();
}

export function isGCPPickingActive(): boolean {
  return state !== 'idle';
}

export function getGCPPickerState(): PickerState {
  return state;
}

export function getGCPList(): GCPPoint[] {
  return [...gcpList];
}

export function removeGCP(index: number): void {
  if (index < 0 || index >= gcpList.length) return;

  gcpList.splice(index, 1);
  refreshMapMarkers();
  redrawCanvas();
  onGCPListChanged?.(gcpList);
}

export function clearGCPs(): void {
  gcpList = [];
  gcpCounter = 0;
  pendingPixel = null;
  clearMapMarkers();
  setState('idle');
  redrawCanvas();
  onGCPListChanged?.(gcpList);
}

export function getCurrentImage(): HTMLImageElement | null {
  return currentImage;
}
