import Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import Collection from 'ol/Collection';
import Feature from 'ol/Feature';
import { Pointer as PointerInteraction } from 'ol/interaction';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import { Geometry, Point } from 'ol/geom';
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
   * Rotate 모드 활성화
   */
  activate(): void {
    if (this.isActive) return;

    this.rotateInteraction = new RotateInteraction(this.vectorSource);
    this.map.addInteraction(this.rotateInteraction);

    this.isActive = true;
    console.log('Rotate 모드 활성화 (회전 가능)');
    console.log('- 객체를 클릭하여 선택');
    console.log('- 드래그하여 회전');
  }

  /**
   * Rotate 모드 비활성화
   */
  deactivate(): void {
    if (!this.isActive) return;

    if (this.rotateInteraction) {
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
 * 커스텀 회전 인터랙션
 */
class RotateInteraction extends PointerInteraction {
  private vectorSource: VectorSource;
  private selectedFeature: Feature<Geometry> | null = null;
  private center: Coordinate | null = null;
  private startAngle: number = 0;

  constructor(vectorSource: VectorSource) {
    super();
    this.vectorSource = vectorSource;
  }

  handleDownEvent(evt: MapBrowserEvent<UIEvent>): boolean {
    const map = evt.map;
    const feature = map.forEachFeatureAtPixel(evt.pixel, (feature) => feature as Feature<Geometry>);

    if (feature) {
      this.selectedFeature = feature;
      const geometry = feature.getGeometry();

      if (geometry) {
        const extent = geometry.getExtent();
        this.center = [
          (extent[0] + extent[2]) / 2,
          (extent[1] + extent[3]) / 2
        ];

        const dx = evt.coordinate[0] - this.center[0];
        const dy = evt.coordinate[1] - this.center[1];
        this.startAngle = Math.atan2(dy, dx);

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

        console.log('회전 시작');
      }
      return true;
    }

    return false;
  }

  handleDragEvent(evt: MapBrowserEvent<UIEvent>): void {
    if (this.selectedFeature && this.center) {
      const dx = evt.coordinate[0] - this.center[0];
      const dy = evt.coordinate[1] - this.center[1];
      const currentAngle = Math.atan2(dy, dx);
      const deltaAngle = currentAngle - this.startAngle;

      const geometry = this.selectedFeature.getGeometry();
      if (geometry) {
        geometry.rotate(deltaAngle, this.center);
        this.startAngle = currentAngle;
      }
    }
  }

  handleUpEvent(evt: MapBrowserEvent<UIEvent>): boolean {
    if (this.selectedFeature) {
      console.log('회전 완료');

      // 스타일 초기화
      this.selectedFeature.setStyle(undefined);
      this.selectedFeature = null;
      this.center = null;
    }
    return false;
  }
}
