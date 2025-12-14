import Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import Collection from 'ol/Collection';
import Feature from 'ol/Feature';
import { Pointer as PointerInteraction } from 'ol/interaction';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import { Geometry } from 'ol/geom';
import { Coordinate } from 'ol/coordinate';
import { MapBrowserEvent } from 'ol';

export class ScaleController {
  private map: Map;
  private vectorSource: VectorSource;
  private scaleInteraction: ScaleInteraction | null = null;
  private isActive: boolean = false;

  constructor(map: Map, vectorSource: VectorSource) {
    this.map = map;
    this.vectorSource = vectorSource;
  }

  /**
   * Scale 모드 활성화
   */
  activate(): void {
    if (this.isActive) return;

    this.scaleInteraction = new ScaleInteraction(this.vectorSource);
    this.map.addInteraction(this.scaleInteraction);

    this.isActive = true;
    console.log('확대/축소 모드 활성화');
    console.log('- 객체를 클릭하여 선택');
    console.log('- 위로 드래그: 확대');
    console.log('- 아래로 드래그: 축소');
  }

  /**
   * Scale 모드 비활성화
   */
  deactivate(): void {
    if (!this.isActive) return;

    if (this.scaleInteraction) {
      this.map.removeInteraction(this.scaleInteraction);
      this.scaleInteraction = null;
    }

    this.isActive = false;
    console.log('확대/축소 모드 비활성화');
  }

  /**
   * Scale 모드 토글
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
 * 커스텀 크기 조절 인터랙션
 */
class ScaleInteraction extends PointerInteraction {
  private vectorSource: VectorSource;
  private selectedFeature: Feature<Geometry> | null = null;
  private center: Coordinate | null = null;
  private startY: number = 0;
  private originalScale: number = 1;

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

        this.startY = evt.pixel[1];
        this.originalScale = 1;

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

        console.log('크기 조절 시작');
      }
      return true;
    }

    return false;
  }

  handleDragEvent(evt: MapBrowserEvent<UIEvent>): void {
    if (this.selectedFeature && this.center) {
      const deltaY = this.startY - evt.pixel[1]; // 위로: +, 아래로: -
      const scaleFactor = 1 + deltaY / 100; // 100픽셀당 2배

      if (scaleFactor > 0.1 && scaleFactor < 10) { // 최소/최대 제한
        const geometry = this.selectedFeature.getGeometry();
        if (geometry) {
          // 이전 스케일을 되돌리고 새로운 스케일 적용
          geometry.scale(1 / this.originalScale, 1 / this.originalScale, this.center);
          geometry.scale(scaleFactor, scaleFactor, this.center);
          this.originalScale = scaleFactor;
        }
      }
    }
  }

  handleUpEvent(evt: MapBrowserEvent<UIEvent>): boolean {
    if (this.selectedFeature) {
      console.log('크기 조절 완료');

      // 스타일 초기화
      this.selectedFeature.setStyle(undefined);
      this.selectedFeature = null;
      this.center = null;
      this.originalScale = 1;
    }
    return false;
  }
}
