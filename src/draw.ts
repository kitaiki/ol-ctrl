import Map from 'ol/Map';
import Draw from 'ol/interaction/Draw';
import VectorSource from 'ol/source/Vector';
import { Type as GeometryType } from 'ol/geom/Geometry';

export type DrawMode = 'LineString' | 'Polygon' | null;

export class DrawController {
  private map: Map;
  private vectorSource: VectorSource;
  private currentDraw: Draw | null = null;
  private currentMode: DrawMode = null;

  constructor(map: Map, vectorSource: VectorSource) {
    this.map = map;
    this.vectorSource = vectorSource;
  }

  /**
   * 그리기 모드 시작
   */
  startDrawing(type: GeometryType): void {
    // 기존 그리기 모드 종료
    this.stopDrawing();

    // 새 그리기 인터랙션 생성
    this.currentDraw = new Draw({
      source: this.vectorSource,
      type: type
    });

    // 지도에 추가
    this.map.addInteraction(this.currentDraw);
    this.currentMode = type as DrawMode;

    // 그리기 완료 이벤트 리스너
    this.currentDraw.on('drawend', (event) => {
      console.log(`${type} 객체 생성 완료:`, event.feature);
    });
  }

  /**
   * 그리기 모드 종료
   */
  stopDrawing(): void {
    if (this.currentDraw) {
      this.map.removeInteraction(this.currentDraw);
      this.currentDraw = null;
      this.currentMode = null;
    }
  }

  /**
   * 현재 활성화된 그리기 모드 확인
   */
  getCurrentMode(): DrawMode {
    return this.currentMode;
  }

  /**
   * 모든 그린 객체 삭제
   */
  clearAll(): void {
    this.vectorSource.clear();
    console.log('모든 객체 삭제됨');
  }
}
