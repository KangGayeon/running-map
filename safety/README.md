# 안전시설 데이터 (전처리·분석 완료본)

담당: 안전시설 (신호등·횡단보도·경찰관서·보안등) · 기준: 2026-11 공공데이터

## 바로 쓰는 법

- **좌표계: WGS84 (EPSG:4326)**. 구글 지도, Leaflet, MapLibre, 카카오·네이버 지도에 **변환 없이 그대로** 올리면 된다.
- **GeoJSON** 좌표 순서는 `[경도, 위도]`(표준)다. 지도 라이브러리에 파일을 넣기만 하면 표시된다.
  - 구글 지도: `map.data.loadGeoJson(url)`
  - Leaflet: `L.geoJSON(data).addTo(map)`
- **CSV**: `lat`(위도), `lon`(경도) 열이 있다. UTF-8(BOM)이라 엑셀에서도 한글이 안 깨진다.
- **거리 계산이 필요하면** CSV의 `x_5179`, `y_5179`(UTM-K, 미터)를 쓴다. 두 점 거리 = √(Δx²+Δy²) m.
- 좌표 검증: 횡단보도·신호등이 실제 도로에서 떨어진 거리는 중앙값 2~13m이고, 95% 이상이 50m 안에 있다.

## 파일 목록

| 파일 | 내용 | 건수 |
|---|---|---|
| `police.geojson/.csv` | 경찰관서 (경찰서·지구대·파출소·치안센터) — 행정안전부 생활안전지도 치안안전시설 | 3,260 |
| `bells.geojson/.csv` | 스마트 안심부스 (생활안전지도) | 82 |
| `signals.geojson/.csv` | 신호 교차로 (전국 78,653대 + 서울 보행등 24,717개 → 25m 안 신호등을 한 교차로로 묶음) | 29,150 |
| `crosswalks.geojson/.csv` | 횡단보도 (전국 58,852 + 서울 39,036 + 부산 3,815 + 대구 17,573, 중복 제거) | 92,244 |
| `lamps.csv` | 보안등 (전체 186만 행 → 3m 안 중복 묶음). 전국 GeoJSON은 너무 커서 CSV만, 지도에는 시군구 파일 사용 | 1,382,048 |
| `cctv.csv` | CCTV (같은 기둥 5m 안은 하나로 묶음, 전국 38만 행 → 24.6만 곳). 지도에는 시군구 파일 사용 | 246,508 |
| `by_region/<시군구코드>.geojson` | 위 5종을 시군구별로 나눈 파일. 평균 0.9MB, 최대 3.8MB, **앱에서는 이것을 추천** | 251개 |
| `by_region/index.json` | 시군구코드 → 이름, 시설 수 | |
| `region_safety.csv/.json` | 시군구별 안전 지표 (전국 251곳) | 251 |
| `regions_safety.geojson` | 시군구 경계 + 지표 (색칠 지도용) | 251 |
| `blind_spots/<시군구코드>.geojson` | 안전 사각지대 선 (전국을 합치면 너무 커서 시군구별로 나눔) | 250개 파일, 790,600개 선 |
| `course_crossings.geojson` | 추천 코스 위 신호 횡단 지점 | 328 |
| `leaflet_safety.js` | 팀 메인 지도·시군구 러닝 지도용 안전시설 레이어 | |

시군구코드(`region_code`, 예: r020 = 서울 동작구)는 팀 지도의 `regions.geojson` 코드와 같다.

## 열 설명 (데이터 사전)

**공통**: `region_code` 시군구코드 · `sido` 시도 · `sigungu` 시군구 · `lat`/`lon` 위도/경도 · `x_5179`/`y_5179` 미터 좌표 · `source` 출처 (공공데이터 / 공공데이터(좌표:OSM매칭) / OSM)

**police**
| 열 | 뜻 |
|---|---|
| name | 관서 이름 (예: 서울동작경찰서 노량진지구대) |
| kind | 지구대 / 파출소 / 경찰서 / 치안센터 / 기타 |
| open_24h | true = 24시간 운영 (지구대·파출소·경찰서), false = 주간만 (치안센터) 또는 불명 → **야간 안심모드는 true만 사용** |

**signals**
| 열 | 뜻 |
|---|---|
| heads | 묶인 신호등 대수 |
| is_pedestrian | 보행 신호등 포함 |
| has_countdown | 잔여시간 표시기 있음 |
| has_sound | 시각장애인 음향신호기 |
| has_push_button | 보행자 작동 신호기 (버튼) |
| night_blink | 야간 점멸 운영 (밤에는 신호 대기가 없을 수 있음) |

**crosswalks**
| 열 | 뜻 |
|---|---|
| has_ped_signal | 보행 신호등 있음 (러너가 멈출 수 있는 곳) |
| signal_info | recorded = 원본에 신호 유무가 적혀 있음 / estimated = 20m 안 보행 신호등으로 추정(서울) / unknown = 신호 정보 없음(대구) |
| green_sec / red_sec | 보행 녹색·적색 시간(초). 자료가 있는 곳만 (약 18%) |
| expected_wait_sec | 예상 대기(초) = 적색² / (2×(녹색+적색)), 무작위 도착 기준. 시간 정보가 없으면 녹색 30초 / 적색 90초로 가정 (→ 33.8초) |
| signal_time_known | 녹색·적색 시간이 실제 자료인지 |
| has_lighting | 횡단보도 집중조명 (야간 안심 요소) |

**lamps**: `name` 위치명 · `lamp_count` 설치 개수

**cctv**: `purpose` 설치목적 (생활방범, 다목적, 어린이보호, 교통단속 …) · `for_safety` 사람 안전용인지 (생활방범·다목적·어린이보호·차량방범 = true, 교통단속·쓰레기단속·시설물관리 등 = false) · `camera_count` 카메라 대수

**by_region 파일**: 모든 점에 `layer` 값(police / signal / crosswalk / lamp / cctv)이 있다. 이 값으로 아이콘을 나눠 표시하면 된다.

**region_safety (시군구 지표)**
| 열 | 뜻 |
|---|---|
| area_police_day_1km_pct / area_police_night_1km_pct | 시군구 면적 중 경찰관서 1km 안 비율. 낮 = 모든 관서, 밤 = 24시간 관서만 |
| police_missing_coords_n | 경찰청 명단에 있지만 좌표를 못 구한 관서 수 (0이 아니면 경찰 지표가 실제보다 낮음) |
| crosswalk_ped_signal_pct, crosswalk_lighting_pct | 보행신호 / 집중조명 있는 횡단보도 비율 |
| green_sec_mean, red_sec_mean, wait_per_signal_crossing_sec | 평균 녹색·적색 시간, 신호 횡단 1곳당 예상 대기 |
| signal_countdown_pct, signal_night_blink_pct | 잔여시간 표시기 / 야간 점멸 비율 |
| lamp_per_km2 | km²당 보안등 수 |
| cctv_n, cctv_safety_n, cctv_cameras, cctv_safety_per_km2 | CCTV 위치 수, 그중 안전용 수, 카메라 대수, km²당 안전용 CCTV |
| has_*_data | 그 시군구에 해당 데이터가 있는지 (**false면 0이 아니라 '자료 없음'**) |
| run_* (251개 시군구 전체) | 팀 러닝 길 기준: 경찰 1km 안 비율(낮/밤), 야간 조명 비율, km당 신호 횡단, 사각지대 길이·비율 |
| safety_score | 안전 점수 0~100 = 50×밤 경찰 1km 비율 + 50×야간 조명 비율 (조명 자료가 없으면 100×밤 경찰 비율) |
| course_* | 추천 코스: 길이, 신호 횡단 수, 예상 대기(초), 24시간 경찰 최대 거리, 사각지대 최장 연속 길이 |

## 구글 AI Studio에서 쓰기

AI Studio 앱은 웹에서 파일을 받아와야 하므로 **`share` 폴더를 GitHub에 올리고 GitHub Pages 주소로 불러오는 방식**을 추천한다. 팀 `running-map` 저장소에 넣으면 주소는 다음과 같다.
`https://kanggayeon.github.io/running-map/share/by_region/r020.geojson`

프롬프트 예시:
```
지도 앱에 안전시설 레이어를 추가해줘.
- 데이터: https://…/share/by_region/{시군구코드}.geojson (WGS84 GeoJSON, 좌표 변환 필요 없음)
- 각 점의 properties.layer 값(police / signal / crosswalk / lamp / cctv)에 따라 아이콘을 다르게 표시 (cctv는 for_safety=true만)
- police 중 open_24h=true는 보라색, false는 회색. 24시간 경찰 주변 1km 원 표시
- crosswalk는 has_ped_signal=true만 표시. 누르면 green_sec, red_sec, expected_wait_sec 보여주기
- '야간 안심모드' 버튼: 켜면 lamp(노란 점)와 blind_spots/{시군구코드}.geojson(분홍 점선) 표시
- 시군구 목록과 이름은 by_region/index.json 사용
```

## 전국 분석 결과 요약 (러닝 길 기준, 251개 시군구)

- **전국 평균**: 러닝 길 중 24시간 경찰 1km 안은 밤 32.1%(낮 36.4%), 밤에 조명·CCTV 50m 안은 31.4%, 안전 사각지대는 54.4%.
- **시도별 안전 점수**: 서울 72.2 > 부산 57.0 > 대구 56.0 > 대전 40.8 … 경북 13.7, 강원 13.1. 대도시와 군 지역의 격차가 크다.
- **안전 점수 상위**: 부산 중구 87, 서울 중구·대구 중구 86, 수원 팔달구 84. **하위**: 홍천·정선·인제 4점 (러닝 길의 90% 이상이 사각지대).
- **낮과 밤 격차**: 과천시는 낮 49.8%에서 밤 26.2%로, 서울 구로구는 94.2%에서 75.7%로 떨어진다(치안센터가 밤에 운영하지 않음). 밤 러닝 안심모드가 필요한 근거가 된다.
- **추천 코스(251개)**: 221개 코스에 24시간 경찰이 1km 넘게 떨어진 구간이 있다. 신호 횡단이 있는 49개 코스는 평균 6.7곳, 예상 대기는 평균 4분(239초)이다.

## 주의할 점

- 경찰관서는 **행정안전부 생활안전지도 치안안전시설**(좌표 포함 공공데이터, 이용 제한 없음)을 쓴다. 경찰청 지구대·파출소 명단 2,047곳 중 2,024곳(99%)이 이 자료에 있고, 나머지 23곳(14개 시군구)은 `police_missing_coords_n`에 표시했다.

- 모두 **전체 자료**다 (신호등·횡단보도·보안등은 오픈API로 전체 수집, 2026-11). 표준데이터에 등록하지 않은 지자체는 **시 자체 공개자료로 보완**했다: 서울(자치구별 신호등 및 횡단보도 위치, 2023.5, EPSG:5186), 부산(횡단보도 위치 정보, 2025.4), 대구(횡단보도 SHP, EPSG:5187, 신호 정보 없음). 시 자료는 전국 자료가 없는 시군구에만 썼다. 그래도 251개 시군구 중 **신호 정보가 있는 곳은 162곳**이고(`has_signal_info`), 보안등 244곳, CCTV 251곳이다. `has_*`가 false면 '시설 0개'가 아니라 '자료 없음'이다.
- 보안등 258,203건(14%, 청주·여수·강남·고양 등)은 원본에 좌표가 없고 주소만 있어서 빠졌다. 지오코딩 키(카카오·브이월드)가 있으면 주소로 채울 수 있다.
- 이제 OSM 자료는 쓰지 않는다. 모든 시설이 공공데이터다.
- 다시 만들기: (`python safety/fetch_api.py`) → `python safety/preprocess.py` → `python safety/analyze.py r020 …` → `python safety/export_share.py`
