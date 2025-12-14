# ol-ctrl

OpenLayers 기반 지도 제어 애플리케이션입니다. LineString과 Polygon을 그리고, 객체를 선택하여 이동, 회전, 확대/축소할 수 있습니다.

## 주요 기능

### 객체 생성
- **LineString 그리기**: 선 객체 생성
- **Polygon 그리기**: 다각형 객체 생성

### 객체 편집
- **이동(Transform)**: 객체 선택 및 드래그로 이동
- **회전(Rotate)**: Bounding Box 모서리 핸들을 드래그하여 회전
- **확대/축소(Scale)**: Bounding Box 모서리 핸들을 드래그하여 크기 조절

### 기타 기능
- **모두 지우기**: 모든 객체 삭제
- **객체 선택 해제**: 빈 공간 클릭 시 선택 해제

## 기술 스택

- **OpenLayers 8.2.0**: 지도 라이브러리
- **TypeScript 5.3.3**: 타입 안전성
- **Vite 5.0.8**: 빌드 도구

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 시작 (http://localhost:5173)
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

## 프로젝트 구조

```
ol-ctrl/
├── src/
│   ├── main.ts          # 메인 애플리케이션
│   ├── map.ts           # 지도 초기화
│   ├── draw.ts          # 그리기 컨트롤러
│   ├── transform.ts     # 이동 컨트롤러
│   ├── rotate.ts        # 회전 컨트롤러
│   └── scale.ts         # 확대/축소 컨트롤러
├── index.html           # HTML 진입점
├── package.json         # 프로젝트 의존성
├── tsconfig.json        # TypeScript 설정
└── vite.config.ts       # Vite 빌드 설정
```

## 사용 방법

1. 원하는 도구 버튼을 클릭하여 활성화
2. 그리기 도구: 지도를 클릭하여 점 추가, 더블클릭으로 완료
3. 편집 도구: 객체를 클릭하여 선택 후 작업
4. 같은 버튼을 다시 클릭하면 비활성화

## 주요 특징

- **Shape-Preserving Transforms**: 객체 형태를 유지하며 회전/확대축소
- **Visual Feedback**: Bounding Box와 핸들로 직관적인 편집 UI
- **Toggle Controls**: 버튼 재클릭으로 모드 해제 가능
- **Mutual Exclusivity**: 한 번에 하나의 모드만 활성화
