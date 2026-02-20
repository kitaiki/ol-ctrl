import { Polygon } from 'ol/geom';

// ===== 데이터 구조 =====

export interface GCPPoint {
  id: string;
  pixel: [number, number];      // 이미지 픽셀 좌표 (x, y)
  map: [number, number];        // EPSG:3857 좌표
  mapLonLat: [number, number];  // WGS84 표시용
}

export interface AffineMatrix {
  a: number;  // x scale + rotation
  b: number;  // y shear + rotation
  tx: number; // x translation
  c: number;  // x shear + rotation
  d: number;  // y scale + rotation
  ty: number; // y translation
}

export interface GeoImageParams {
  imageCenter: [number, number];
  imageScale: [number, number];
  imageRotate: number;
}

export type AffineFitStatus = 'UNVERIFIABLE_3PT' | 'VERIFIED';

export interface AffineResidual {
  id: string;
  errorMeters: number;
  observed: [number, number];
  predicted: [number, number];
}

export interface AffineFitReport {
  fitStatus: AffineFitStatus;
  message: string;
  rmseMeters: number | null;
  maxErrorMeters: number | null;
  residuals: AffineResidual[];
}

// ===== 아핀 변환 계산 =====

/**
 * 3x3 선형 시스템을 Cramer's rule로 풀기
 * Ax = b (3x3)
 */
function solveCramer3(
  A: number[][],
  b: number[]
): number[] {
  const det = (m: number[][]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const detA = det(A);
  if (Math.abs(detA) < 1e-12) {
    throw new Error('GCP 포인트가 공선(collinear)이거나 중복됩니다. GCP 위치를 확인하세요.');
  }

  const result: number[] = [];
  for (let i = 0; i < 3; i++) {
    const Ai = A.map(row => [...row]);
    for (let j = 0; j < 3; j++) {
      Ai[j][i] = b[j];
    }
    result.push(det(Ai) / detA);
  }
  return result;
}

/**
 * 3+개 GCP에서 아핀 변환 행렬 계산
 * pixel (u,v) → map (x,y)
 * x = a*u + b*v + tx
 * y = c*u + d*v + ty
 *
 * 3개: 정확한 해
 * 4+개: 최소자승법 (A^T * A * x = A^T * b)
 */
export function solveAffineTransform(gcps: GCPPoint[]): AffineMatrix {
  const n = gcps.length;
  if (n < 3) {
    throw new Error('최소 3개의 GCP가 필요합니다.');
  }

  // 행렬 구성: 각 GCP → [u, v, 1] 행
  // x 방정식: a*u + b*v + tx = mapX
  // y 방정식: c*u + d*v + ty = mapY

  if (n === 3) {
    // 정확한 해 (Cramer's rule)
    const A = gcps.map(g => [g.pixel[0], g.pixel[1], 1]);
    const bx = gcps.map(g => g.map[0]);
    const by = gcps.map(g => g.map[1]);

    const [a, b, tx] = solveCramer3(A, bx);
    const [c, d, ty] = solveCramer3(A, by);

    return { a, b, tx, c, d, ty };
  }

  // 최소자승법 (4+개 GCP)
  // A^T * A * params = A^T * b
  // A = [[u1, v1, 1], [u2, v2, 1], ...]

  // A^T * A (3x3)
  const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const Atbx = [0, 0, 0];
  const Atby = [0, 0, 0];

  for (const g of gcps) {
    const row = [g.pixel[0], g.pixel[1], 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        AtA[i][j] += row[i] * row[j];
      }
      Atbx[i] += row[i] * g.map[0];
      Atby[i] += row[i] * g.map[1];
    }
  }

  const [a, b, tx] = solveCramer3(AtA, Atbx);
  const [c, d, ty] = solveCramer3(AtA, Atby);

  return { a, b, tx, c, d, ty };
}

// ===== 아핀 행렬 분해 =====

/**
 * 아핀 행렬을 GeoImage 파라미터로 분해
 * - center: 이미지 중심 픽셀을 아핀 변환한 좌표
 * - scale: sx = sqrt(a^2 + c^2), sy = sqrt(b^2 + d^2)
 * - rotation: atan2(c, a), GeoImage용 = -theta
 */
export function decomposeAffineToGeoImageParams(
  affine: AffineMatrix,
  imgW: number,
  imgH: number
): GeoImageParams {
  const { a, b, tx, c, d, ty } = affine;

  // 이미지 중심 픽셀 → 지도 좌표
  const cx = imgW / 2;
  const cy = imgH / 2;
  const centerX = a * cx + b * cy + tx;
  const centerY = c * cx + d * cy + ty;

  // 스케일
  const sx = Math.sqrt(a * a + c * c);
  const sy = Math.sqrt(b * b + d * d);

  // 회전 (라디안)
  const theta = Math.atan2(c, a);

  // Shear 경고 체크
  const expectedB = -sy * Math.sin(theta);
  const expectedD = sy * Math.cos(theta);
  const shearError = Math.abs(b - expectedB) + Math.abs(d - expectedD);
  if (shearError > 0.01 * (sx + sy)) {
    console.warn('GCP 변환에 기울임(shear)이 감지되었습니다. GeoImage는 기울임을 지원하지 않으므로 근사치로 표시됩니다.');
  }

  return {
    imageCenter: [centerX, centerY],
    imageScale: [sx, sy],
    imageRotate: -theta  // GeoImage는 반시계방향이 양수
  };
}

// ===== Proxy Polygon 생성 =====

/**
 * 이미지 4꼭짓점을 아핀 변환하여 Polygon 생성
 */
export function createProxyPolygonFromAffine(
  affine: AffineMatrix,
  imgW: number,
  imgH: number
): Polygon {
  const { a, b, tx, c, d, ty } = affine;

  // 이미지 4꼭짓점 (좌상, 우상, 우하, 좌하)
  // 픽셀 좌표계는 좌상단 원점(0,0), y-down 기준
  const corners: [number, number][] = [
    [0, 0],         // 좌상
    [imgW, 0],      // 우상
    [imgW, imgH],   // 우하
    [0, imgH],      // 좌하
  ];

  const mapCorners = corners.map(([u, v]) => [
    a * u + b * v + tx,
    c * u + d * v + ty
  ]);

  // 폐곡선
  mapCorners.push([...mapCorners[0]]);

  return new Polygon([mapCorners]);
}

export function applyAffine(
  affine: AffineMatrix,
  u: number,
  v: number
): [number, number] {
  const { a, b, tx, c, d, ty } = affine;
  return [
    a * u + b * v + tx,
    c * u + d * v + ty
  ];
}

export function invertAffine(affine: AffineMatrix): AffineMatrix {
  const { a, b, tx, c, d, ty } = affine;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) {
    throw new Error('역행렬을 계산할 수 없는 아핀 행렬입니다.');
  }

  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  const itx = -(ia * tx + ib * ty);
  const ity = -(ic * tx + id * ty);

  return { a: ia, b: ib, tx: itx, c: ic, d: id, ty: ity };
}

export function computeAffineFitReport(
  gcps: GCPPoint[],
  affine: AffineMatrix
): AffineFitReport {
  if (gcps.length <= 3) {
    return {
      fitStatus: 'UNVERIFIABLE_3PT',
      message: '3점은 모델 적합성 검증이 불가합니다. 최소 4점 이상을 권장합니다.',
      rmseMeters: null,
      maxErrorMeters: null,
      residuals: []
    };
  }

  const residuals: AffineResidual[] = gcps.map(gcp => {
    const predicted = applyAffine(affine, gcp.pixel[0], gcp.pixel[1]);
    const dx = predicted[0] - gcp.map[0];
    const dy = predicted[1] - gcp.map[1];
    return {
      id: gcp.id,
      errorMeters: Math.sqrt(dx * dx + dy * dy),
      observed: gcp.map,
      predicted
    };
  });

  const sse = residuals.reduce((sum, r) => sum + r.errorMeters ** 2, 0);
  const rmseMeters = Math.sqrt(sse / residuals.length);
  const maxErrorMeters = residuals.reduce((max, r) => Math.max(max, r.errorMeters), 0);

  return {
    fitStatus: 'VERIFIED',
    message: '잔차가 계산되었습니다.',
    rmseMeters,
    maxErrorMeters,
    residuals
  };
}

// ===== 검증 함수 =====

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * GCP 목록 검증
 */
export function validateGCPs(gcps: GCPPoint[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 최소 3개 필요
  if (gcps.length < 3) {
    errors.push(`최소 3개의 GCP가 필요합니다. (현재: ${gcps.length}개)`);
    return { valid: false, errors, warnings };
  }

  // 중복 픽셀 좌표 체크
  for (let i = 0; i < gcps.length; i++) {
    for (let j = i + 1; j < gcps.length; j++) {
      const dist = Math.sqrt(
        (gcps[i].pixel[0] - gcps[j].pixel[0]) ** 2 +
        (gcps[i].pixel[1] - gcps[j].pixel[1]) ** 2
      );
      if (dist < 1) {
        errors.push(`GCP ${i + 1}과 ${j + 1}의 픽셀 좌표가 중복됩니다.`);
      }
    }
  }

  // 중복 지도 좌표 체크
  for (let i = 0; i < gcps.length; i++) {
    for (let j = i + 1; j < gcps.length; j++) {
      const dist = Math.sqrt(
        (gcps[i].map[0] - gcps[j].map[0]) ** 2 +
        (gcps[i].map[1] - gcps[j].map[1]) ** 2
      );
      if (dist < 0.01) {
        errors.push(`GCP ${i + 1}과 ${j + 1}의 지도 좌표가 중복됩니다.`);
      }
    }
  }

  // 공선성 체크 (3개의 픽셀 좌표가 일직선인지)
  if (gcps.length >= 3) {
    const [p1, p2, p3] = gcps;
    const area = Math.abs(
      p1.pixel[0] * (p2.pixel[1] - p3.pixel[1]) +
      p2.pixel[0] * (p3.pixel[1] - p1.pixel[1]) +
      p3.pixel[0] * (p1.pixel[1] - p2.pixel[1])
    );
    if (area < 1) {
      errors.push('처음 3개의 GCP 픽셀 좌표가 거의 일직선입니다. 다양한 위치에 GCP를 배치하세요.');
    }
  }

  // 스케일 비율 체크 (경고)
  if (gcps.length >= 3) {
    try {
      const affine = solveAffineTransform(gcps);
      const sx = Math.sqrt(affine.a ** 2 + affine.c ** 2);
      const sy = Math.sqrt(affine.b ** 2 + affine.d ** 2);
      const ratio = Math.max(sx, sy) / Math.min(sx, sy);
      if (ratio > 10) {
        warnings.push(`X/Y 스케일 비율이 ${ratio.toFixed(1)}:1로 매우 큽니다. GCP 위치를 확인하세요.`);
      }
    } catch {
      // solveAffineTransform에서 에러 발생 시 공선성 에러로 처리됨
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
