import { initMap } from './map';
import { DrawController } from './draw';
import { TransformController } from './transform';
import { RotateController } from './rotate';
import { ScaleController } from './scale';

// 지도 초기화
const { map, vectorSource, vectorLayer } = initMap('map');

// 컨트롤러 초기화
const drawController = new DrawController(map, vectorSource);
const transformController = new TransformController(map, vectorSource);
const rotateController = new RotateController(map, vectorSource);
const scaleController = new ScaleController(map, vectorSource);

// UI 요소 가져오기
const drawLineStringBtn = document.getElementById('drawLineString') as HTMLButtonElement;
const drawPolygonBtn = document.getElementById('drawPolygon') as HTMLButtonElement;
const transformBtn = document.getElementById('transform') as HTMLButtonElement;
const rotateBtn = document.getElementById('rotate') as HTMLButtonElement;
const scaleBtn = document.getElementById('scale') as HTMLButtonElement;
const clearAllBtn = document.getElementById('clearAll') as HTMLButtonElement;

// 모든 버튼의 active 상태 제거
function clearActiveButtons(): void {
  drawLineStringBtn.classList.remove('active');
  drawPolygonBtn.classList.remove('active');
  transformBtn.classList.remove('active');
  rotateBtn.classList.remove('active');
  scaleBtn.classList.remove('active');
}

// 모든 편집 모드 비활성화
function deactivateAllEditModes(): void {
  transformController.deactivate();
  rotateController.deactivate();
  scaleController.deactivate();
}

// LineString 그리기 버튼
drawLineStringBtn.addEventListener('click', () => {
  clearActiveButtons();
  deactivateAllEditModes();

  if (drawController.getCurrentMode() === 'LineString') {
    // 이미 활성화된 경우 비활성화
    drawController.stopDrawing();
  } else {
    // 새로 활성화
    drawController.startDrawing('LineString');
    drawLineStringBtn.classList.add('active');
  }
});

// Polygon 그리기 버튼
drawPolygonBtn.addEventListener('click', () => {
  clearActiveButtons();
  deactivateAllEditModes();

  if (drawController.getCurrentMode() === 'Polygon') {
    // 이미 활성화된 경우 비활성화
    drawController.stopDrawing();
  } else {
    // 새로 활성화
    drawController.startDrawing('Polygon');
    drawPolygonBtn.classList.add('active');
  }
});

// Transform 버튼 (이동)
transformBtn.addEventListener('click', () => {
  clearActiveButtons();
  drawController.stopDrawing();

  // 다른 편집 모드 비활성화
  rotateController.deactivate();
  scaleController.deactivate();

  transformController.toggle();

  if (transformController.getIsActive()) {
    transformBtn.classList.add('active');
  }
});

// Rotate 버튼 (회전)
rotateBtn.addEventListener('click', () => {
  clearActiveButtons();
  drawController.stopDrawing();

  // 다른 편집 모드 비활성화
  transformController.deactivate();
  scaleController.deactivate();

  rotateController.toggle();

  if (rotateController.getIsActive()) {
    rotateBtn.classList.add('active');
  }
});

// Scale 버튼 (확대/축소)
scaleBtn.addEventListener('click', () => {
  clearActiveButtons();
  drawController.stopDrawing();

  // 다른 편집 모드 비활성화
  transformController.deactivate();
  rotateController.deactivate();

  scaleController.toggle();

  if (scaleController.getIsActive()) {
    scaleBtn.classList.add('active');
  }
});

// 모두 지우기 버튼
clearAllBtn.addEventListener('click', () => {
  if (confirm('모든 객체를 삭제하시겠습니까?')) {
    clearActiveButtons();
    drawController.stopDrawing();
    deactivateAllEditModes();
    drawController.clearAll();
  }
});

console.log('OpenLayers 지도 애플리케이션이 시작되었습니다.');
console.log('- LineString/Polygon 그리기 가능');
console.log('- 객체 이동/회전/확대축소 가능 (독립된 버튼)');
