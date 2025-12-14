import Map from 'ol/Map';
import VectorSource from 'ol/source/Vector';
import Collection from 'ol/Collection';
import Feature from 'ol/Feature';
import Select from 'ol/interaction/Select';
import Translate from 'ol/interaction/Translate';
import { click } from 'ol/events/condition';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';

export class TransformController {
  private map: Map;
  private vectorSource: VectorSource;
  private selectInteraction: Select | null = null;
  private translateInteraction: Translate | null = null;
  private isActive: boolean = false;

  constructor(map: Map, vectorSource: VectorSource) {
    this.map = map;
    this.vectorSource = vectorSource;
  }

  /**
   * Transform 모드 활성화 (이동만)
   */
  activate(): void {
    if (this.isActive) return;

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
      if (event.selected.length > 0) {
        console.log('객체 선택됨:', event.selected[0]);
      } else {
        console.log('선택 해제됨');
      }
    });

    this.translateInteraction.on('translatestart', () => {
      console.log('객체 이동 시작');
    });

    this.translateInteraction.on('translateend', (event) => {
      console.log('객체 이동 완료:', event.features.getArray());
    });

    this.isActive = true;
    console.log('Transform 모드 활성화 (이동 가능)');
    console.log('- 객체를 클릭하여 선택');
    console.log('- 드래그하여 이동');
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

  /**
   * 선택된 객체 가져오기
   */
  getSelectedFeatures(): Collection<Feature> | null {
    return this.selectInteraction?.getFeatures() || null;
  }
}
