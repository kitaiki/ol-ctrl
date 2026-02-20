import { Map, Feature } from 'ol';
import VectorSource from 'ol/source/Vector';
import { Point } from 'ol/geom';
import { Style, Circle as CircleStyle, Fill, Stroke, Text as TextStyle } from 'ol/style';
import { toLonLat } from 'ol/proj';
import type { GCPPoint } from './gcp-transform';

type PickerState = 'idle' | 'awaiting_pixel' | 'awaiting_map';

let state: PickerState = 'idle';
let mapRef: Map | null = null;
let vectorSourceRef: VectorSource | null = null;
let gcpList: GCPPoint[] = [];
let gcpMarkers: Feature[] = [];
let gcpCounter = 0;

let canvasEl: HTMLCanvasElement | null = null;
let currentImage: HTMLImageElement | null = null;
let baseScale = 1;
let viewScale = 1;
let offsetX = 0;
let offsetY = 0;
const MIN_VIEW_SCALE = 0.2;
const MAX_VIEW_SCALE = 8;
const ZOOM_STEP = 1.1;
const DRAG_THRESHOLD_PX = 3;

let isDraggingCanvas = false;
let dragStartX = 0;
let dragStartY = 0;
let hasDragged = false;
let suppressNextClick = false;

let pendingPixel: [number, number] | null = null;

let onGCPListChanged: ((gcps: GCPPoint[]) => void) | null = null;
let onStateChanged: ((state: PickerState) => void) | null = null;

let mapClickHandler: ((evt: any) => void) | null = null;

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
    canvasEl.removeEventListener('click', handleCanvasClick);
    canvasEl.removeEventListener('wheel', handleCanvasWheel);
    canvasEl.removeEventListener('mousedown', handleCanvasMouseDown);
    window.removeEventListener('mousemove', handleCanvasMouseMove);
    window.removeEventListener('mouseup', handleCanvasMouseUp);

    canvasEl.addEventListener('click', handleCanvasClick);
    canvasEl.addEventListener('wheel', handleCanvasWheel, { passive: false });
    canvasEl.addEventListener('mousedown', handleCanvasMouseDown);
    window.addEventListener('mousemove', handleCanvasMouseMove);
    window.addEventListener('mouseup', handleCanvasMouseUp);

    updateCanvasCursor();
  }
}

export function updateImagePreview(image: HTMLImageElement): void {
  currentImage = image;
  if (!canvasEl) return;

  const container = canvasEl.parentElement;
  if (!container) return;

  const maxWidth = container.clientWidth || 300;
  const maxHeight = 200;

  const widthRatio = maxWidth / image.naturalWidth;
  const heightRatio = maxHeight / image.naturalHeight;
  baseScale = Math.min(widthRatio, heightRatio, 1);
  viewScale = 1;
  offsetX = 0;
  offsetY = 0;

  canvasEl.width = image.naturalWidth * baseScale;
  canvasEl.height = image.naturalHeight * baseScale;

  updateCanvasCursor();
  redrawCanvas();
}

function getRenderScale(): number {
  return baseScale * viewScale;
}

function clampOffsetToBounds(): void {
  if (!canvasEl || !currentImage) return;

  const imageWidth = currentImage.naturalWidth * getRenderScale();
  const imageHeight = currentImage.naturalHeight * getRenderScale();
  const canvasWidth = canvasEl.width;
  const canvasHeight = canvasEl.height;

  let minOffsetX: number;
  let maxOffsetX: number;
  let minOffsetY: number;
  let maxOffsetY: number;

  if (imageWidth <= canvasWidth) {
    const centeredX = (canvasWidth - imageWidth) / 2;
    minOffsetX = centeredX;
    maxOffsetX = centeredX;
  } else {
    minOffsetX = canvasWidth - imageWidth;
    maxOffsetX = 0;
  }

  if (imageHeight <= canvasHeight) {
    const centeredY = (canvasHeight - imageHeight) / 2;
    minOffsetY = centeredY;
    maxOffsetY = centeredY;
  } else {
    minOffsetY = canvasHeight - imageHeight;
    maxOffsetY = 0;
  }

  offsetX = Math.min(maxOffsetX, Math.max(minOffsetX, offsetX));
  offsetY = Math.min(maxOffsetY, Math.max(minOffsetY, offsetY));
}

function redrawCanvas(): void {
  if (!canvasEl || !currentImage) return;

  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;

  const renderScale = getRenderScale();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  ctx.setTransform(renderScale, 0, 0, renderScale, offsetX, offsetY);
  ctx.drawImage(currentImage, 0, 0, currentImage.naturalWidth, currentImage.naturalHeight);

  gcpList.forEach((gcp, index) => {
    const cx = gcp.pixel[0];
    const cy = gcp.pixel[1];

    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), cx, cy);
  });

  if (state === 'awaiting_map' && pendingPixel) {
    const cx = pendingPixel[0];
    const cy = pendingPixel[1];

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

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (state === 'awaiting_pixel') {
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.setLineDash([]);
  }
}

function handleCanvasWheel(evt: WheelEvent): void {
  if (!canvasEl || !currentImage) return;

  evt.preventDefault();

  const { canvasX, canvasY } = getCanvasPointFromClientEvent(evt);

  const prevViewScale = viewScale;
  const nextScale = evt.deltaY < 0 ? prevViewScale * ZOOM_STEP : prevViewScale / ZOOM_STEP;
  viewScale = Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, nextScale));

  if (viewScale === prevViewScale) {
    return;
  }

  const prevRenderScale = baseScale * prevViewScale;
  const nextRenderScale = getRenderScale();

  const imageX = (canvasX - offsetX) / prevRenderScale;
  const imageY = (canvasY - offsetY) / prevRenderScale;
  offsetX = canvasX - imageX * nextRenderScale;
  offsetY = canvasY - imageY * nextRenderScale;

  clampOffsetToBounds();
  redrawCanvas();
}

function handleCanvasMouseDown(evt: MouseEvent): void {
  if (!canvasEl || !currentImage || evt.button !== 0) return;

  isDraggingCanvas = true;
  dragStartX = evt.clientX;
  dragStartY = evt.clientY;
  hasDragged = false;
  updateCanvasCursor();
}

function handleCanvasMouseMove(evt: MouseEvent): void {
  if (!isDraggingCanvas || !currentImage) return;

  const dx = evt.clientX - dragStartX;
  const dy = evt.clientY - dragStartY;

  if (dx === 0 && dy === 0) return;

  if (!hasDragged && (Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX)) {
    hasDragged = true;
  }

  offsetX += dx;
  offsetY += dy;
  dragStartX = evt.clientX;
  dragStartY = evt.clientY;

  clampOffsetToBounds();
  redrawCanvas();
}

function handleCanvasMouseUp(): void {
  if (!isDraggingCanvas) return;

  isDraggingCanvas = false;
  if (hasDragged) {
    suppressNextClick = true;
  }
  hasDragged = false;
  updateCanvasCursor();
}

function updateCanvasCursor(): void {
  if (!canvasEl) return;

  if (isDraggingCanvas) {
    canvasEl.style.cursor = 'grabbing';
    return;
  }

  if (state === 'awaiting_pixel') {
    canvasEl.style.cursor = 'crosshair';
    return;
  }

  canvasEl.style.cursor = currentImage ? 'grab' : 'default';
}

function handleCanvasClick(evt: MouseEvent): void {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }

  if (state !== 'awaiting_pixel' || !canvasEl || !currentImage) return;

  const { canvasX, canvasY } = getCanvasPointFromClientEvent(evt);
  const renderScale = getRenderScale();

  const pixelX = Math.round((canvasX - offsetX) / renderScale);
  const pixelY = Math.round((canvasY - offsetY) / renderScale);

  if (pixelX < 0 || pixelX >= currentImage.naturalWidth ||
      pixelY < 0 || pixelY >= currentImage.naturalHeight) {
    return;
  }

  pendingPixel = [pixelX, pixelY];
  setState('awaiting_map');
  redrawCanvas();

  console.log(`GCP 픽셀 좌표 선택: [${pixelX}, ${pixelY}] → 지도에서 대응 좌표를 클릭하세요.`);
}

function getCanvasPointFromClientEvent(evt: MouseEvent | WheelEvent): { canvasX: number; canvasY: number } {
  if (!canvasEl) return { canvasX: 0, canvasY: 0 };

  const rect = canvasEl.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvasEl.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvasEl.height / rect.height : 1;

  return {
    canvasX: (evt.clientX - rect.left) * scaleX,
    canvasY: (evt.clientY - rect.top) * scaleY
  };
}

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
  addMapMarker(gcp, gcpList.length);

  pendingPixel = null;
  setState('idle');
  redrawCanvas();

  onGCPListChanged?.(gcpList);

  console.log(`GCP ${gcpList.length} 추가 완료: pixel=[${gcp.pixel}], map=[${lonLat[0].toFixed(6)}, ${lonLat[1].toFixed(6)}]`);
}

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

function setState(newState: PickerState): void {
  const oldState = state;
  state = newState;

  if (newState === 'awaiting_map' && mapRef && !mapClickHandler) {
    mapClickHandler = handleMapClick;
    mapRef.on('singleclick', mapClickHandler);

    const mapEl = mapRef.getTargetElement();
    if (mapEl) mapEl.classList.add('coordinate-picking');
  }

  if (newState !== 'awaiting_map' && mapRef && mapClickHandler) {
    mapRef.un('singleclick', mapClickHandler);
    mapClickHandler = null;

    const mapEl = mapRef.getTargetElement();
    if (mapEl) mapEl.classList.remove('coordinate-picking');
  }

  updateCanvasCursor();
  onStateChanged?.(newState);
  console.log(`GCP Picker 상태 변경: ${oldState} → ${newState}`);
}

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
