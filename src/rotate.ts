import Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Feature from 'ol/Feature';
import { Pointer as PointerInteraction } from 'ol/interaction';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import { Geometry, Point, Polygon } from 'ol/geom';
import { Coordinate } from 'ol/coordinate';
import { MapBrowserEvent } from 'ol';

export class RotateController {
  private map: Map;
  private vectorSource: VectorSource;
  private rotateInteraction: RotateInteraction | null = null;
  private isActive: boolean = false;

  constructor(map: Map, vectorSource: VectorSource) {
    this.map = map;
    this.vectorSource = vectorSource;
  }

  /**
   * Rotate 모드 활성화 (Bounding Box + 모서리 핸들)
   */
  activate(): void {
    if (this.isActive) return;

    this.rotateInteraction = new RotateInteraction(this.map, this.vectorSource);
    this.map.addInteraction(this.rotateInteraction);

    this.isActive = true;
    console.log('Rotate 모드 활성화 (회전 가능)');
    console.log('- 객체를 클릭하여 선택');
    console.log('- Bounding Box 모서리를 드래그하여 회전');
    console.log('- 객체 모양은 변경되지 않습니다');
  }

  /**
   * Rotate 모드 비활성화
   */
  deactivate(): void {
    if (!this.isActive) return;

    if (this.rotateInteraction) {
      this.rotateInteraction.cleanup();
      this.map.removeInteraction(this.rotateInteraction);
      this.rotateInteraction = null;
    }

    this.isActive = false;
    console.log('Rotate 모드 비활성화');
  }

  /**
   * Rotate 모드 토글
   */
  toggle(): void {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  /**
   * 활성화 상태 확인
   */
  getIsActive(): boolean {
    return this.isActive;
  }
}

/**
 * 회전 전용 인터랙션 (Bounding Box + 모서리 핸들)
 */
class RotateInteraction extends PointerInteraction {
  private map: Map;
  private vectorSource: VectorSource;
  private selectedFeature: Feature<Geometry> | null = null;
  private center: Coordinate | null = null;
  private initialAngle: number = 0;
  private lastAngle: number = 0;

  // Bounding Box 관련
  private boundingBoxLayer: VectorLayer<VectorSource> | null = null;
  private boundingBoxSource: VectorSource;
  private handleLayer: VectorLayer<VectorSource> | null = null;
  private handleSource: VectorSource;
  private draggedHandle: Feature<Point> | null = null;

  constructor(map: Map, vectorSource: VectorSource) {
    super();
    this.map = map;
    this.vectorSource = vectorSource;
    this.boundingBoxSource = new VectorSource();
    this.handleSource = new VectorSource();

    this.createLayers();
  }

  /**
   * Bounding Box와 핸들 레이어 생성
   */
  private createLayers(): void {
    // Bounding Box 레이어
    this.boundingBoxLayer = new VectorLayer({
      source: this.boundingBoxSource,
      style: new Style({
        stroke: new Stroke({
          color: '#ff3333',
          width: 2,
          lineDash: [5, 5]
        }),
        fill: new Fill({
          color: 'rgba(255, 51, 51, 0.05)'
        })
      }),
      zIndex: 1000
    });

    // 핸들 레이어
    this.handleLayer = new VectorLayer({
      source: this.handleSource,
      style: new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({
            color: '#ff3333'
          }),
          stroke: new Stroke({
            color: '#ffffff',
            width: 2
          })
        })
      }),
      zIndex: 1001
    });

    this.map.addLayer(this.boundingBoxLayer);
    this.map.addLayer(this.handleLayer);
  }

  /**
   * Bounding Box 및 핸들 생성 (회전된 상태 유지)
   */
  private createBoundingBoxAndHandles(geometry: Geometry, currentAngle?: number): void {
    this.boundingBoxSource.clear();
    this.handleSource.clear();

    const extent = geometry.getExtent();
    const center = [
      (extent[0] + extent[2]) / 2,
      (extent[1] + extent[3]) / 2
    ];

    // 초기 Bounding Box 좌표 (회전 전)
    let bbox = [
      [extent[0], extent[1]], // 좌하단
      [extent[2], extent[1]], // 우하단
      [extent[2], extent[3]], // 우상단
      [extent[0], extent[3]], // 좌상단
      [extent[0], extent[1]]  // 닫기
    ];

    // 현재 각도가 있으면 Bounding Box도 회전
    if (currentAngle !== undefined && this.center) {
      bbox = bbox.map(coord => {
        const dx = coord[0] - this.center![0];
        const dy = coord[1] - this.center![1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const newAngle = angle + (currentAngle - this.initialAngle);

        return [
          this.center![0] + distance * Math.cos(newAngle),
          this.center![1] + distance * Math.sin(newAngle)
        ];
      });
    }

    // Bounding Box
    const boundingBoxFeature = new Feature({
      geometry: new Polygon([bbox])
    });
    this.boundingBoxSource.addFeature(boundingBoxFeature);

    // 4개 모서리 핸들 (닫기 좌표 제외)
    const corners = bbox.slice(0, 4);

    corners.forEach((corner, index) => {
      const handle = new Feature({
        geometry: new Point(corner)
      });
      handle.set('handleIndex', index);
      this.handleSource.addFeature(handle);
    });
  }

  handleDownEvent(evt: MapBrowserEvent<UIEvent>): boolean {
    // 먼저 핸들 체크
    const handleFeature = this.map.forEachFeatureAtPixel(
      evt.pixel,
      (feature) => feature as Feature<Point>,
      { layerFilter: (layer) => layer === this.handleLayer }
    );

    if (handleFeature) {
      this.draggedHandle = handleFeature;
      if (this.selectedFeature && this.center) {
        const handleCoord = (handleFeature.getGeometry() as Point).getCoordinates();
        const dx = handleCoord[0] - this.center[0];
        const dy = handleCoord[1] - this.center[1];
        this.initialAngle = Math.atan2(dy, dx);
        this.lastAngle = this.initialAngle;
        console.log('회전 시작 (핸들 드래그)');
      }
      return true;
    }

    // 객체 선택
    const feature = this.map.forEachFeatureAtPixel(
      evt.pixel,
      (feature) => feature as Feature<Geometry>,
      { layerFilter: (layer) => layer !== this.boundingBoxLayer && layer !== this.handleLayer }
    );

    if (feature) {
      this.selectedFeature = feature;
      const geometry = feature.getGeometry();

      if (geometry) {
        // 중심점 계산
        const extent = geometry.getExtent();
        this.center = [
          (extent[0] + extent[2]) / 2,
          (extent[1] + extent[3]) / 2
        ];

        // Bounding Box 및 핸들 생성
        this.createBoundingBoxAndHandles(geometry);

        // 선택 스타일 적용
        feature.setStyle(new Style({
          fill: new Fill({
            color: 'rgba(255, 51, 51, 0.1)'
          }),
          stroke: new Stroke({
            color: '#ff3333',
            width: 3
          }),
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({
              color: '#ff3333'
            })
          })
        }));

        console.log('객체 선택됨');
      }
      return true;
    }

    // 빈 공간 클릭 시 선택 해제
    if (this.selectedFeature) {
      this.selectedFeature.setStyle(undefined);
      this.selectedFeature = null;
      this.center = null;
      this.boundingBoxSource.clear();
      this.handleSource.clear();
      console.log('선택 해제됨');
    }

    return false;
  }

  handleDragEvent(evt: MapBrowserEvent<UIEvent>): void {
    if (this.draggedHandle && this.selectedFeature && this.center) {
      const geometry = this.selectedFeature.getGeometry();
      if (geometry) {
        // 현재 각도 계산
        const dx = evt.coordinate[0] - this.center[0];
        const dy = evt.coordinate[1] - this.center[1];
        const currentAngle = Math.atan2(dy, dx);

        // 이전 프레임부터의 각도 변화만큼 회전
        const deltaAngle = currentAngle - this.lastAngle;

        // geometry.rotate() 메서드로 전체 객체 회전 (모양 유지)
        geometry.rotate(deltaAngle, this.center);

        // Bounding Box 및 핸들 업데이트
        this.createBoundingBoxAndHandles(geometry, currentAngle);

        // 중심점 재계산 (회전 후)
        const extent = geometry.getExtent();
        this.center = [
          (extent[0] + extent[2]) / 2,
          (extent[1] + extent[3]) / 2
        ];

        this.lastAngle = currentAngle;
      }
    }
  }

  handleUpEvent(evt: MapBrowserEvent<UIEvent>): boolean {
    if (this.draggedHandle && this.selectedFeature) {
      // 최종 회전 각도 계산
      const totalRotation = this.lastAngle - this.initialAngle;
      const degrees = (totalRotation * 180 / Math.PI).toFixed(1);
      console.log('회전 완료:', degrees + '도');

      this.draggedHandle = null;
    }
    return false;
  }

  /**
   * 정리
   */
  cleanup(): void {
    if (this.selectedFeature) {
      this.selectedFeature.setStyle(undefined);
    }

    this.boundingBoxSource.clear();
    this.handleSource.clear();

    if (this.boundingBoxLayer) {
      this.map.removeLayer(this.boundingBoxLayer);
      this.boundingBoxLayer = null;
    }

    if (this.handleLayer) {
      this.map.removeLayer(this.handleLayer);
      this.handleLayer = null;
    }
  }
}
