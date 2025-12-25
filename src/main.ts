import 'ol/ol.css';
import 'ol-ext/dist/ol-ext.css';
import { initMap } from './map';
import { startDrawing, stopDrawing, isDrawing } from './draw';
import { initTransform, startTransform, stopTransform, isTransformActive } from './transform';

// 지도 초기화
const { map, vectorSource } = initMap();

// Transform 인터랙션 초기화
initTransform(map, vectorSource);

// UI 요소
const drawLineBtn = document.getElementById('drawLineBtn') as HTMLButtonElement;
const drawPolygonBtn = document.getElementById('drawPolygonBtn') as HTMLButtonElement;
const editBtn = document.getElementById('editBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// 선 그리기 버튼
drawLineBtn.addEventListener('click', () => {
  // 편집 모드 비활성화
  if (isTransformActive()) {
    stopTransform();
    editBtn.classList.remove('active');
  }

  if (isDrawing()) {
    stopDrawing(map);
    drawLineBtn.classList.remove('active');
    drawPolygonBtn.classList.remove('active');
  } else {
    startDrawing(map, vectorSource, 'LineString');
    drawLineBtn.classList.add('active');
    drawPolygonBtn.classList.remove('active');
  }
});

// 다각형 그리기 버튼
drawPolygonBtn.addEventListener('click', () => {
  // 편집 모드 비활성화
  if (isTransformActive()) {
    stopTransform();
    editBtn.classList.remove('active');
  }

  if (isDrawing()) {
    stopDrawing(map);
    drawLineBtn.classList.remove('active');
    drawPolygonBtn.classList.remove('active');
  } else {
    startDrawing(map, vectorSource, 'Polygon');
    drawPolygonBtn.classList.add('active');
    drawLineBtn.classList.remove('active');
  }
});

// 객체 편집 버튼
editBtn.addEventListener('click', () => {
  // 그리기 모드 비활성화
  if (isDrawing()) {
    stopDrawing(map);
    drawLineBtn.classList.remove('active');
    drawPolygonBtn.classList.remove('active');
  }

  if (isTransformActive()) {
    stopTransform();
    editBtn.classList.remove('active');
  } else {
    startTransform();
    editBtn.classList.add('active');
  }
});

// 모두 지우기 버튼
clearBtn.addEventListener('click', () => {
  vectorSource.clear();
  console.log('모든 객체 삭제');
});
