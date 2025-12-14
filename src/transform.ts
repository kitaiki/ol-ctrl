import Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Feature from 'ol/Feature';
import Select from 'ol/interaction/Select';
import Translate from 'ol/interaction/Translate';
import { click } from 'ol/events/condition';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import { Polygon } from 'ol/geom';
import { Geometry } from 'ol/geom';

export class TransformController {
  private map: Map;
  private vectorSource: VectorSource;
  private selectInteraction: Select | null = null;
  private translateInteraction: Translate | null = null;
  private boundingBoxLayer: VectorLayer<VectorSource> | null = null;
  private boundingBoxSource: VectorSource;
  private isActive: boolean = false;

  constructor(map: Map, vectorSource: VectorSource) {
    this.map = map;
    this.vectorSource = vectorSource;
    this.boundingBoxSource = new VectorSource();
  }

  /**
   * Transform 모드 활성화 (이동 + Bounding Box 표시)
   */
  activate(): void {
    if (this.isActive) return;

    // Bounding Box 레이어 생성
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
    this.map.addLayer(this.boundingBoxLayer);

    // 선택 스타일 정의
    const selectedStyle = new Style({
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
        }),
        stroke: new Stroke({
          color: '#ffffff',
          width: 2
        })
      })
    });

    // Select 인터랙션 - 객체 선택
    this.selectInteraction = new Select({
      condition: click,
      style: selectedStyle
    });

    this.map.addInteraction(this.selectInteraction);

    // Translate 인터랙션 - 객체 이동
    this.translateInteraction = new Translate({
      features: this.selectInteraction.getFeatures()
    });

    this.map.addInteraction(this.translateInteraction);

    // 이벤트 리스너
    this.selectInteraction.on('select', (event) => {
      this.boundingBoxSource.clear();

      if (event.selected.length > 0) {
        const feature = event.selected[0];
        const geometry = feature.getGeometry();

        if (geometry) {
          this.createBoundingBox(geometry);
          console.log('객체 선택됨:', feature);
        }
      } else {
        console.log('선택 해제됨');
      }
    });

    this.translateInteraction.on('translatestart', () => {
      console.log('객체 이동 시작');
    });

    this.translateInteraction.on('translating', (event) => {
      // 이동 중 Bounding Box 업데이트
      this.boundingBoxSource.clear();
      const features = event.features.getArray();
      if (features.length > 0) {
        const geometry = features[0].getGeometry();
        if (geometry) {
          this.createBoundingBox(geometry);
        }
      }
    });

    this.translateInteraction.on('translateend', (event) => {
      console.log('객체 이동 완료:', event.features.getArray());
    });

    this.isActive = true;
    console.log('Transform 모드 활성화 (이동 가능)');
    console.log('- 객체를 클릭하여 선택');
    console.log('- 드래그하여 이동');
    console.log('- 선택 시 Bounding Box 표시');
  }

  /**
   * Bounding Box 생성
   */
  private createBoundingBox(geometry: Geometry): void {
    const extent = geometry.getExtent();
    const bbox = [
      [extent[0], extent[1]], // 좌하단
      [extent[2], extent[1]], // 우하단
      [extent[2], extent[3]], // 우상단
      [extent[0], extent[3]], // 좌상단
      [extent[0], extent[1]]  // 닫기
    ];

    const boundingBoxFeature = new Feature({
      geometry: new Polygon([bbox])
    });

    this.boundingBoxSource.addFeature(boundingBoxFeature);
  }

  /**
   * Transform 모드 비활성화
   */
  deactivate(): void {
    if (!this.isActive) return;

    if (this.selectInteraction) {
      this.selectInteraction.getFeatures().clear();
      this.map.removeInteraction(this.selectInteraction);
      this.selectInteraction = null;
    }

    if (this.translateInteraction) {
      this.map.removeInteraction(this.translateInteraction);
      this.translateInteraction = null;
    }

    if (this.boundingBoxLayer) {
      this.map.removeLayer(this.boundingBoxLayer);
      this.boundingBoxLayer = null;
    }

    this.boundingBoxSource.clear();

    this.isActive = false;
    console.log('Transform 모드 비활성화');
  }

  /**
   * Transform 모드 토글
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
