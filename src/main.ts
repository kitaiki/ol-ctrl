import 'ol/ol.css';
import 'ol-ext/dist/ol-ext.css';
import { initMap } from './map';
import { startDrawing, stopDrawing, isDrawing } from './draw';
import { initTransform, startTransform, stopTransform, isTransformActive } from './transform';
import { loadImageFromGCPParams, clearImage, setImageOpacity, hasImage, createImageElement } from './image-overlay';
import {
  initAlignRotate,
  startSelectMode,
  stopSelectMode,
  isSelectModeActive,
  executeRotation
} from './align-rotate';
import {
  initGCPPicker,
  startGCPPicking,
  cancelGCPPicking,
  isGCPPickingActive,
  getGCPList,
  clearGCPs,
  updateImagePreview,
  removeGCP,
  getCurrentImage,
  getGCPPickerState
} from './gcp-picker';
import {
  solveAffineTransform,
  decomposeAffineToGeoImageParams,
  createProxyPolygonFromAffine,
  validateGCPs
} from './gcp-transform';
import type { GCPPoint } from './gcp-transform';

// 지도 초기화
const { map, vectorSource } = initMap();

// Transform 인터랙션 초기화
initTransform(map, vectorSource);

// Align Rotate 기능 초기화
initAlignRotate(map, vectorSource);

// ===== UI 요소 =====

const drawLineBtn = document.getElementById('drawLineBtn') as HTMLButtonElement;
const drawPolygonBtn = document.getElementById('drawPolygonBtn') as HTMLButtonElement;
const editBtn = document.getElementById('editBtn') as HTMLButtonElement;
const selectBtn = document.getElementById('selectBtn') as HTMLButtonElement;
const rotateBtn = document.getElementById('rotateBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;

// 이미지 오버레이 UI 요소
const imageOverlayBtn = document.getElementById('imageOverlayBtn') as HTMLButtonElement;
const imagePanel = document.getElementById('imagePanel') as HTMLDivElement;
const imageFile = document.getElementById('imageFile') as HTMLInputElement;
const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
const opacityValue = document.getElementById('opacityValue') as HTMLSpanElement;
const applyImageBtn = document.getElementById('applyImageBtn') as HTMLButtonElement;
const clearImageBtn = document.getElementById('clearImageBtn') as HTMLButtonElement;

// GCP UI 요소
const addGCPBtn = document.getElementById('addGCPBtn') as HTMLButtonElement;
const clearGCPBtn = document.getElementById('clearGCPBtn') as HTMLButtonElement;
const gcpTableBody = document.getElementById('gcpTableBody') as HTMLTableSectionElement;
const gcpStatus = document.getElementById('gcpStatus') as HTMLDivElement;
const gcpPreviewCanvas = document.getElementById('gcpPreviewCanvas') as HTMLCanvasElement;
const gcpPreviewPlaceholder = document.getElementById('gcpPreviewPlaceholder') as HTMLDivElement;

// ===== GCP Picker 초기화 =====

initGCPPicker(map, vectorSource, {
  onGCPListChanged: (gcps: GCPPoint[]) => {
    updateGCPTable(gcps);
  },
  onStateChanged: (state: string) => {
    updateGCPStatusUI(state);
  }
});

// ===== 상호 배제 헬퍼 =====

function deactivateAllModes(): void {
  if (isDrawing()) {
    stopDrawing(map);
    drawLineBtn.classList.remove('active');
    drawPolygonBtn.classList.remove('active');
  }
  if (isTransformActive()) {
    stopTransform();
    editBtn.classList.remove('active');
  }
  if (isSelectModeActive()) {
    stopSelectMode();
    selectBtn.classList.remove('active');
  }
  if (isGCPPickingActive()) {
    cancelGCPPicking();
  }
}

// ===== 이미지 파일 변경 시 GCP 미리보기 업데이트 =====

imageFile.addEventListener('change', () => {
  if (imageFile.files && imageFile.files.length > 0) {
    loadPreviewImage(imageFile.files[0]);
  }
});

async function loadPreviewImage(file: File): Promise<void> {
  try {
    const img = await createImageElement(file);
    updateImagePreview(img);
    gcpPreviewCanvas.style.display = 'block';
    gcpPreviewPlaceholder.style.display = 'none';
  } catch (error) {
    console.error('미리보기 로드 실패:', error);
  }
}

// ===== GCP UI 업데이트 =====

function updateGCPTable(gcps: GCPPoint[]): void {
  gcpTableBody.innerHTML = '';

  gcps.forEach((gcp, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${gcp.pixel[0]}, ${gcp.pixel[1]}</td>
      <td>${gcp.mapLonLat[0].toFixed(5)}, ${gcp.mapLonLat[1].toFixed(5)}</td>
      <td><button class="delete-btn" data-index="${index}">X</button></td>
    `;
    gcpTableBody.appendChild(row);
  });

  // 삭제 버튼 이벤트
  gcpTableBody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLButtonElement).dataset.index!);
      removeGCP(index);
    });
  });
}

function updateGCPStatusUI(state: string): void {
  gcpStatus.className = 'gcp-status';

  switch (state) {
    case 'idle':
      gcpStatus.textContent = '대기 중';
      gcpStatus.classList.add('idle');
      addGCPBtn.classList.remove('active');
      break;
    case 'awaiting_pixel':
      gcpStatus.textContent = '이미지에서 픽셀 좌표를 클릭하세요';
      gcpStatus.classList.add('awaiting-pixel');
      addGCPBtn.classList.add('active');
      break;
    case 'awaiting_map':
      gcpStatus.textContent = '지도에서 대응 좌표를 클릭하세요';
      gcpStatus.classList.add('awaiting-map');
      addGCPBtn.classList.add('active');
      break;
  }
}

// ===== GCP 버튼 =====

addGCPBtn.addEventListener('click', () => {
  if (isGCPPickingActive()) {
    cancelGCPPicking();
    return;
  }

  // 이미지 확인
  if (!imageFile.files || imageFile.files.length === 0) {
    alert('이미지 파일을 먼저 선택하세요.');
    return;
  }

  if (!getCurrentImage()) {
    alert('이미지 미리보기가 로드될 때까지 기다려주세요.');
    return;
  }

  // 다른 모드 비활성화
  deactivateAllModes();

  startGCPPicking();
});

clearGCPBtn.addEventListener('click', () => {
  clearGCPs();
  updateGCPTable([]);
});

// ===== 선 그리기 버튼 =====

drawLineBtn.addEventListener('click', () => {
  deactivateAllModes();

  if (isDrawing()) {
    // deactivateAllModes에서 이미 중지됨
  } else {
    startDrawing(map, vectorSource, 'LineString');
    drawLineBtn.classList.add('active');
  }
});

// ===== 다각형 그리기 버튼 =====

drawPolygonBtn.addEventListener('click', () => {
  deactivateAllModes();

  if (isDrawing()) {
    // deactivateAllModes에서 이미 중지됨
  } else {
    startDrawing(map, vectorSource, 'Polygon');
    drawPolygonBtn.classList.add('active');
  }
});

// ===== 객체 편집 버튼 =====

editBtn.addEventListener('click', () => {
  const wasActive = isTransformActive();
  deactivateAllModes();

  if (!wasActive) {
    startTransform();
    editBtn.classList.add('active');
  }
});

// ===== 모두 지우기 버튼 =====

clearBtn.addEventListener('click', () => {
  vectorSource.clear();
  if (hasImage()) {
    clearImage(map, vectorSource);
  }
  // GCP 마커도 같이 지워짐 (vectorSource.clear로)
  clearGCPs();
  updateGCPTable([]);
  console.log('모든 객체 및 이미지 삭제');
});

// ===== 이미지 오버레이 버튼 =====

imageOverlayBtn.addEventListener('click', () => {
  deactivateAllModes();

  imagePanel.classList.toggle('hidden');
  imageOverlayBtn.classList.toggle('active');
});

// ===== 이미지 적용 버튼 =====

applyImageBtn.addEventListener('click', async () => {
  try {
    if (!imageFile.files || imageFile.files.length === 0) {
      alert('이미지 파일을 선택하세요.');
      return;
    }

    const file = imageFile.files[0];
    const opacity = parseInt(opacitySlider.value) / 100;

    // GCP 모드
    const gcps = getGCPList();

    // 검증
    const validation = validateGCPs(gcps);
    if (!validation.valid) {
      alert('GCP 검증 실패:\n\n' + validation.errors.join('\n'));
      return;
    }
    if (validation.warnings.length > 0) {
      const proceed = confirm('경고:\n\n' + validation.warnings.join('\n') + '\n\n계속 진행하시겠습니까?');
      if (!proceed) return;
    }

    // 이미지 크기 가져오기
    const img = getCurrentImage();
    if (!img) {
      alert('이미지 미리보기가 로드되지 않았습니다.');
      return;
    }

    // 아핀 변환 계산
    const affine = solveAffineTransform(gcps);
    const geoImageParams = decomposeAffineToGeoImageParams(affine, img.naturalWidth, img.naturalHeight);
    const proxyPolygon = createProxyPolygonFromAffine(affine, img.naturalWidth, img.naturalHeight);

    console.log('아핀 변환 결과:', affine);
    console.log('GeoImage 파라미터:', geoImageParams);

    // GCP 마커 제거 (이미지 적용 후)
    clearGCPs();
    updateGCPTable([]);

    await loadImageFromGCPParams(map, vectorSource, file, geoImageParams, proxyPolygon, opacity);
    alert('GCP 기반 이미지가 성공적으로 로드되었습니다.');

  } catch (error) {
    console.error('이미지 로드 오류:', error);
    alert(`이미지 로드 중 오류가 발생했습니다.\n\n${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
});

// ===== 이미지 제거 버튼 =====

clearImageBtn.addEventListener('click', () => {
  if (hasImage()) {
    clearImage(map, vectorSource);
    alert('이미지가 제거되었습니다.');
  } else {
    alert('제거할 이미지가 없습니다.');
  }
});

// ===== 투명도 슬라이더 =====

opacitySlider.addEventListener('input', (e) => {
  const opacity = parseInt((e.target as HTMLInputElement).value) / 100;
  setImageOpacity(opacity);
  opacityValue.textContent = `${Math.round(opacity * 100)}%`;
});

// ===== 선택 버튼 (기준 객체 및 회전 대상 선택) =====

selectBtn.addEventListener('click', () => {
  const wasActive = isSelectModeActive();
  deactivateAllModes();

  if (!wasActive) {
    startSelectMode();
    selectBtn.classList.add('active');
    console.log('선택 모드 시작 - Ctrl+클릭: 기준 면, 클릭: 회전 대상');
  }
});

// ===== 회전 버튼 (정렬 회전 실행) =====

rotateBtn.addEventListener('click', () => {
  executeRotation();
});
