import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';

export function initMap(): { map: Map; vectorSource: VectorSource } {
  // 벡터 레이어 소스 생성
  const vectorSource = new VectorSource();

  // 벡터 레이어 생성
  const vectorLayer = new VectorLayer({
    source: vectorSource,
  });

  // 지도 생성
  const map = new Map({
    target: 'map',
    layers: [
      new TileLayer({
        source: new OSM(),
      }),
      vectorLayer,
    ],
    view: new View({
      center: fromLonLat([128.6276, 35.8777]), // 동대구역
      zoom: 13,
    }),
  });

  console.log('지도 초기화 완료');

  return { map, vectorSource };
}
