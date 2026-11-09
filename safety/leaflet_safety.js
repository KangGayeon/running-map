/* 안전시설 레이어 — 팀 folium/Leaflet 지도용
 * 메인 index.html 맨 끝:               <script src="safety/leaflet_safety.js"></script>
 * 시군구 지도(m1~m3/rXXX.html) 맨 끝:  <script src="../safety/leaflet_safety.js"></script>
 * - 메인 지도: '시군구 안전 점수' 색칠만 (시군구를 누르면 점수 요약 + 러닝 지도 링크)
 * - 시군구 지도: 경찰·신호등·횡단보도·보안등·CCTV·사각지대를 기존 '경찰·화장실·편의점' 상자에 같이 넣음
 * 데이터는 이 파일과 같은 폴더(safety/)의 GeoJSON을 읽음. 좌표는 모두 WGS84.
 */
(function () {
  const BASE = (document.currentScript && document.currentScript.src || "").replace(/[^/]*$/, "");   // .../safety/
  const ROOT = BASE.replace(/safety\/$/, "");
  const PAGE_CODE = (location.pathname.match(/\/(r\d{3})\.html$/) || [])[1] || null;   // 시군구 지도면 'r020' 같은 코드

  function findMap() {
    for (const k of Object.keys(window)) {
      try { if (k.startsWith("map_") && window[k] instanceof L.Map) return window[k]; } catch (e) {}
    }
    return null;
  }
  // folium이 만든 기존 레이어 상자(let layer_control_…)를 찾아 같은 상자에 항목을 넣음
  function findLayerControl() {
    for (const s of document.querySelectorAll("script:not([src])")) {
      const m = s.textContent.match(/let (layer_control_[0-9a-f]+) = L\.control\.layers\(/);
      if (m) { try { const c = (0, eval)(m[1]); if (c instanceof L.Control.Layers) return c; } catch (e) {} }
    }
    return null;
  }
  const getJson = (() => { const c = new Map();
    return (u) => { if (!c.has(u)) c.set(u, fetch(u).then((r) => r.ok ? r.json() : null).catch(() => null)); return c.get(u); }; })();
  const pct = (v) => v == null ? "–" : `${Math.round(v)}%`;
  const yes = (v) => v === true || v === "true";

  // ---------- 메인 지도: 시군구 안전 점수 ----------
  function startMain(map) {
    const folder = {};
    fetch(ROOT + "map_codes.csv").then((r) => r.ok ? r.text() : "").then((t) => {
      for (const line of t.split(/\r?\n/).slice(1)) { const [f, c] = line.split(","); if (c) folder[c] = f; }
    }).catch(() => {});
    const color = (s) => s == null ? "#ccc" : s >= 70 ? "#3b1f8f" : s >= 50 ? "#6741d9" : s >= 35 ? "#9775fa" : s >= 20 ? "#d0bfff" : "#f3f0ff";
    const layer = L.geoJSON(null, {
      style: (f) => ({ color: "#555", weight: .5, fillColor: color(f.properties.safety_score), fillOpacity: .7 }),
      onEachFeature: (f, l) => {
        const p = f.properties, code = p.region_code;
        l.bindTooltip(`<b>${p.sido} ${p.sigungu}</b><br>안전 점수 ${p.safety_score ?? "–"}`, { sticky: true });
        l.on("click", () => {
          const link = folder[code] ? `<br><a href="${ROOT}${folder[code]}/${code}.html" target="_blank">🏃 러닝 지도 열기 (안전시설 보기)</a>` : "";
          l.bindPopup(`<b>${p.sido} ${p.sigungu}</b> · 안전 점수 <b>${p.safety_score ?? "–"}</b><br>` +
            `밤 24시간 경찰 1km 안 ${pct(p.run_police_night_1km_pct)} (낮 ${pct(p.run_police_day_1km_pct)})<br>` +
            `밤 조명·CCTV 50m 안 ${pct(p.run_night_lit_pct)} · 사각지대 ${pct(p.run_blind_spot_pct)}` +
            (p.police_missing_coords_n ? `<br><span style="color:#c92a2a">경찰관서 ${p.police_missing_coords_n}곳 좌표 누락</span>` : "") +
            `<br><small>러닝 길 기준</small>${link}`).openPopup();
        });
      },
    });
    getJson(BASE + "regions_safety.geojson").then((g) => g && layer.addData(g));
    const name = "🛡 시군구 안전 점수 (밤 러닝)";
    const ctrl = findLayerControl();
    if (ctrl) ctrl.addOverlay(layer, name);
    else L.control.layers(null, { [name]: layer }, { collapsed: false, position: "topright" }).addTo(map);
    // 처음엔 꺼 둠 (기존 '러닝 전용로 비율' 색칠을 가리지 않도록)
  }

  // ---------- 시군구 지도: 안전시설 ----------
  function startRegion(map, code) {
    const pane = map.createPane("sfPane");
    pane.style.zIndex = 450;
    const canvas = L.canvas({ padding: 0.3, pane: "sfPane" });
    // 보안등·CCTV는 수가 많아서 줌 15 이상(골목이 보일 때)에서만 그림
    const dense = map.createPane("sfDense");
    dense.style.zIndex = 440;
    const denseCanvas = L.canvas({ padding: 0.3, pane: "sfDense" });
    const showDense = () => { dense.style.display = map.getZoom() >= 15 ? "" : "none"; };
    map.on("zoomend", showDense); showDense();
    const css = document.createElement("style");
    css.textContent = `.sf-pol{font-size:16px;line-height:22px;text-align:center;width:24px;height:24px;border-radius:50%;background:#fff;border:2px solid #7048e8}
      .sf-pol.day{border-color:#adb5bd;opacity:.85}`;
    document.head.appendChild(css);
    const g = { police: L.layerGroup(), signal: L.layerGroup(), lamp: L.layerGroup(), cctv: L.layerGroup(), blind: L.layerGroup() };

    Promise.all([getJson(`${BASE}by_region/${code}.geojson`), getJson(`${BASE}blind_spots/${code}.geojson`)]).then(([fac, bl]) => {
      for (const f of (fac && fac.features) || []) {
        const p = f.properties, [x, y] = f.geometry.coordinates, ll = [y, x];
        if (p.layer === "police") {
          const h24 = yes(p.open_24h);
          L.marker(ll, { pane: "sfPane", icon: L.divIcon({ className: "", html: `<div class="sf-pol${h24 ? "" : " day"}">👮</div>`, iconSize: [24, 24] }) })
            .bindPopup(`<b>${p.name || "경찰관서"}</b><br>${h24 ? "24시간 운영" : "주간만 운영 (치안센터 등)"}`).addTo(g.police);
          if (h24) L.circle(ll, { radius: 1000, color: "#7048e8", weight: 1, fillOpacity: .05, interactive: false, renderer: canvas }).addTo(g.police);
        } else if (p.layer === "signal") {
          L.circleMarker(ll, { renderer: canvas, radius: 4, color: "#c92a2a", weight: 1.5, fillColor: "#ff6b6b", fillOpacity: .9 })
            .bindPopup(`🚦 <b>${yes(p.is_pedestrian) ? "보행 신호등" : "신호등"}</b>` + (yes(p.has_countdown) ? "<br>잔여시간 표시기 있음" : "") +
              (yes(p.night_blink) ? "<br>야간 점멸 운영" : "")).addTo(g.signal);
        } else if (p.layer === "crosswalk" && yes(p.has_ped_signal)) {
          L.circleMarker(ll, { renderer: canvas, radius: 4, color: "#1864ab", weight: 1.5, fillColor: "#4dabf7", fillOpacity: .9 })
            .bindPopup(`🚸 <b>보행신호 횡단보도</b>` + (p.green_sec != null ? `<br>녹색 ${p.green_sec}초 · 적색 ${p.red_sec}초` : "") +
              `<br>예상 대기 약 ${Math.round(p.expected_wait_sec)}초` + (yes(p.has_lighting) ? "<br>집중조명 있음" : "")).addTo(g.signal);
        } else if (p.layer === "lamp") {
          L.circleMarker(ll, { renderer: denseCanvas, radius: 2, stroke: false, fillColor: "#f59f00", fillOpacity: .8, interactive: false }).addTo(g.lamp);
        } else if (p.layer === "cctv" && yes(p.for_safety)) {
          L.circleMarker(ll, { renderer: denseCanvas, radius: 2.5, color: "#343a40", weight: 1, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(g.cctv);
        }
      }
      for (const f of (bl && bl.features) || [])
        L.geoJSON(f, { renderer: canvas, interactive: false, style: { color: "#e64980", weight: 3, dashArray: "4 4", opacity: .85 } }).addTo(g.blind);
    });

    const items = {
      "👮 경찰 공공데이터 (보라 원 = 24시간 1km)": g.police,
      "🚦 신호등 · 🔵 보행신호 횡단보도": g.signal,
      "💡 보안등 (확대하면 보임)": g.lamp,
      "📹 안전용 CCTV (확대하면 보임)": g.cctv,
      "⚠ 안전 사각지대 (분홍 점선)": g.blind,
    };
    const ctrl = findLayerControl();
    if (ctrl) for (const [n, l] of Object.entries(items)) ctrl.addOverlay(l, n);
    else L.control.layers(null, items, { collapsed: false, position: "topright" }).addTo(map);
    for (const k of ["police", "signal", "lamp", "blind"]) g[k].addTo(map);       // CCTV는 처음엔 꺼 둠
  }

  function boot(n) {
    const map = window.L && findMap();
    if (map) return PAGE_CODE ? startRegion(map, PAGE_CODE) : startMain(map);
    if (n < 50) setTimeout(() => boot(n + 1), 100);
  }
  if (document.readyState === "complete") boot(0); else window.addEventListener("load", () => boot(0));
})();
