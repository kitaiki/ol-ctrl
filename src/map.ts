import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import 'ol/ol.css';

export interface MapInstance {
  map: Map;
  vectorSource: VectorSource;
  vectorLayer: VectorLayer<VectorSource>;
}

/**
 * OpenLayers 지도 초기화
 */
export function initMap(target: string): MapInstance {
  // 벡터 소스 및 레이어 생성 (그리기 객체 저장용)
  const vectorSource = new VectorSource();

  const vectorLayer = new VectorLayer({
    source: vectorSource,
    style: {
      'fill-color': 'rgba(255, 255, 255, 0.2)',
      'stroke-color': '#ffcc33',
      'stroke-width': 2,
      'circle-radius': 7,
      'circle-fill-color': '#ffcc33',
    }
  });

  // 지도 생성
  const map = new Map({
    target,
    layers: [
      // 배경 타일 레이어 (OpenStreetMap)
      new TileLayer({
        source: new OSM()
      }),
      // 벡터 레이어 (그리기 객체)
      vectorLayer
    ],
    view: new View({
      center: fromLonLat([127.0276, 37.4979]), // 서울 강남구 중심
      zoom: 13
    })
  });

  return {
    map,
    vectorSource,
    vectorLayer
  };
}
