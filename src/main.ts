import 'ol/ol.css';
import 'ol-ext/dist/ol-ext.css';
import { initMap } from './map';
import { startDrawing, stopDrawing, isDrawing } from './draw';
import { initTransform, startTransform, stopTransform, isTransformActive } from './transform';
import { loadImage, clearImage, setImageOpacity, hasImage, validateCoordinates } from './image-overlay';
import {
  initCoordinatePicker,
  startPickingCoordinates,
  stopPickingCoordinates,
  isCoordinatePickingActive
} from './coord-picker';

// 지도 초기화
const { map, vectorSource } = initMap();

// Transform 인터랙션 초기화
initTransform(map, vectorSource);

// 좌표 선택 기능 초기화
initCoordinatePicker(map, vectorSource);

// UI 요소
const drawLineBtn = document.getElementById('drawLineBtn') as HTMLButtonElement;
const drawPolygonBtn = document.getElementById('drawPolygonBtn') as HTMLButtonElement;
const editBtn = document.getElementById('editBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// 이미지 오버레이 UI 요소
const imageOverlayBtn = document.getElementById('imageOverlayBtn') as HTMLButtonElement;
const imagePanel = document.getElementById('imagePanel') as HTMLDivElement;
const imageFile = document.getElementById('imageFile') as HTMLInputElement;
const minLonInput = document.getElementById('minLon') as HTMLInputElement;
const minLatInput = document.getElementById('minLat') as HTMLInputElement;
const maxLonInput = document.getElementById('maxLon') as HTMLInputElement;
const maxLatInput = document.getElementById('maxLat') as HTMLInputElement;
const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
const opacityValue = document.getElementById('opacityValue') as HTMLSpanElement;
const applyImageBtn = document.getElementById('applyImageBtn') as HTMLButtonElement;
const clearImageBtn = document.getElementById('clearImageBtn') as HTMLButtonElement;
const pickCoordBtn = document.getElementById('pickCoordBtn') as HTMLButtonElement;
const pickInstructions = document.getElementById('pickInstructions') as HTMLDivElement;

// 선 그리기 버튼
drawLineBtn.addEventListener('click', () => {
  // 편집 모드 비활성화
  if (isTransformActive()) {
    stopTransform();
    editBtn.classList.remove('active');
  }

  // 좌표 선택 모드 비활성화
  if (isCoordinatePickingActive()) {
    stopPickingCoordinates();
    pickCoordBtn.classList.remove('active');
    pickInstructions.classList.add('hidden');
    const mapElement = map.getTargetElement();
    if (mapElement) mapElement.classList.remove('coordinate-picking');
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

  // 좌표 선택 모드 비활성화
  if (isCoordinatePickingActive()) {
    stopPickingCoordinates();
    pickCoordBtn.classList.remove('active');
    pickInstructions.classList.add('hidden');
    const mapElement = map.getTargetElement();
    if (mapElement) mapElement.classList.remove('coordinate-picking');
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

  // 좌표 선택 모드 비활성화
  if (isCoordinatePickingActive()) {
    stopPickingCoordinates();
    pickCoordBtn.classList.remove('active');
    pickInstructions.classList.add('hidden');
    const mapElement = map.getTargetElement();
    if (mapElement) mapElement.classList.remove('coordinate-picking');
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
  if (hasImage()) {
    clearImage(map, vectorSource);
  }
  console.log('모든 객체 및 이미지 삭제');
});

// 이미지 오버레이 버튼
imageOverlayBtn.addEventListener('click', () => {
  // 그리기 모드 비활성화
  if (isDrawing()) {
    stopDrawing(map);
    drawLineBtn.classList.remove('active');
    drawPolygonBtn.classList.remove('active');
  }

  // 편집 모드 비활성화
  if (isTransformActive()) {
    stopTransform();
    editBtn.classList.remove('active');
  }

  // 좌표 선택 모드 비활성화
  if (isCoordinatePickingActive()) {
    stopPickingCoordinates();
    pickCoordBtn.classList.remove('active');
    pickInstructions.classList.add('hidden');
    const mapElement = map.getTargetElement();
    if (mapElement) mapElement.classList.remove('coordinate-picking');
  }

  // 패널 토글
  imagePanel.classList.toggle('hidden');
  imageOverlayBtn.classList.toggle('active');
});

// 이미지 적용 버튼
applyImageBtn.addEventListener('click', async () => {
  try {
    // 파일 선택 확인
    if (!imageFile.files || imageFile.files.length === 0) {
      alert('이미지 파일을 선택하세요.');
      return;
    }

    // 좌표 파싱
    const minLon = parseFloat(minLonInput.value);
    const minLat = parseFloat(minLatInput.value);
    const maxLon = parseFloat(maxLonInput.value);
    const maxLat = parseFloat(maxLatInput.value);

    // 좌표 검증
    if (!validateCoordinates(minLon, minLat, maxLon, maxLat)) {
      alert('유효하지 않은 좌표입니다. 좌표 범위를 확인하세요.\n\n' +
            '- 경도: -180 ~ 180\n' +
            '- 위도: -90 ~ 90\n' +
            '- 최소값 < 최대값');
      return;
    }

    // 투명도
    const opacity = parseInt(opacitySlider.value) / 100;

    // 이미지 로드
    const file = imageFile.files[0];
    const extent: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];

    await loadImage(map, vectorSource, file, extent, opacity);
    alert('이미지가 성공적으로 로드되었습니다.');

  } catch (error) {
    console.error('이미지 로드 오류:', error);
    alert(`이미지 로드 중 오류가 발생했습니다.\n\n${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
});

// 이미지 제거 버튼
clearImageBtn.addEventListener('click', () => {
  if (hasImage()) {
    clearImage(map, vectorSource);
    alert('이미지가 제거되었습니다.');
  } else {
    alert('제거할 이미지가 없습니다.');
  }
});

// 투명도 슬라이더
opacitySlider.addEventListener('input', (e) => {
  const opacity = parseInt((e.target as HTMLInputElement).value) / 100;
  setImageOpacity(opacity);
  opacityValue.textContent = `${Math.round(opacity * 100)}%`;
});

// 좌표 선택 버튼
pickCoordBtn.addEventListener('click', () => {
  if (isCoordinatePickingActive()) {
    // 선택 모드 비활성화
    stopPickingCoordinates();
    pickCoordBtn.classList.remove('active');
    pickInstructions.classList.add('hidden');

    // 지도 커서 클래스 제거
    const mapElement = map.getTargetElement();
    if (mapElement) mapElement.classList.remove('coordinate-picking');

    console.log('좌표 선택 모드 종료 (수동)');
  } else {
    // 다른 모드 비활성화
    if (isDrawing()) {
      stopDrawing(map);
      drawLineBtn.classList.remove('active');
      drawPolygonBtn.classList.remove('active');
    }
    if (isTransformActive()) {
      stopTransform();
      editBtn.classList.remove('active');
    }

    // 선택 모드 활성화
    startPickingCoordinates(minLonInput, minLatInput, maxLonInput, maxLatInput);
    pickCoordBtn.classList.add('active');
    pickInstructions.classList.remove('hidden');

    // 지도 커서 변경
    const mapElement = map.getTargetElement();
    if (mapElement) mapElement.classList.add('coordinate-picking');

    console.log('좌표 선택 모드 시작');
  }
});
