/* 안전시설 레이어 — 팀 메인 지도(folium/Leaflet)용
 * 메인 index.html 맨 끝에 한 줄:  <script src="safety/leaflet_safety.js"></script>
 * - 멀리서 볼 때: 시군구 '안전 점수' 색칠 (켜고 끄기)
 * - 확대했을 때(줌 13 이상): 화면 안 시군구의 경찰·신호등·횡단보도·보안등·CCTV·사각지대
 * 데이터는 이 파일과 같은 폴더(safety/)의 GeoJSON을 읽음. 좌표는 모두 WGS84.
 */
(function () {
  const BASE = (document.currentScript && document.currentScript.src || "").replace(/[^/]*$/, "");   // .../safety/
  const ROOT = BASE.replace(/safety\/$/, "");
  const ZOOM_FAC = 13;

  function findMap() {
    for (const k of Object.keys(window)) {
      try { if (k.startsWith("map_") && window[k] instanceof L.Map) return window[k]; } catch (e) {}
    }
    return null;
  }
  const getJson = (() => { const c = new Map();
    return (u) => { if (!c.has(u)) c.set(u, fetch(u).then((r) => r.ok ? r.json() : null).catch(() => null)); return c.get(u); }; })();
  const pct = (v) => v == null ? "–" : `${Math.round(v)}%`;
  const fmt = (m) => m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;

  function start(map) {
    // 시설은 전용 pane에 그려서, 멀리서 볼 땐(줌 12 미만) 통째로 숨김
    const pane = map.createPane("sfPane");
    pane.style.zIndex = 450;
    const canvas = L.canvas({ padding: 0.3, pane: "sfPane" });
    const css = document.createElement("style");
    css.textContent = `.sf-hint{background:#fff;padding:6px 10px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.3);font:12px sans-serif}
      .sf-pol{font-size:18px;line-height:24px;text-align:center;width:26px;height:26px;border-radius:50%;background:#fff;border:2px solid #7048e8}
      .sf-pol.day{border-color:#adb5bd;opacity:.85}`;
    document.head.appendChild(css);

    // ---------- 1) 시군구 안전 점수 ----------
    const folder = {};
    fetch(ROOT + "map_codes.csv").then((r) => r.ok ? r.text() : "").then((t) => {
      for (const line of t.split(/\r?\n/).slice(1)) { const [f, c] = line.split(","); if (c) folder[c] = f; }
    }).catch(() => {});
    const scoreColor = (s) => s == null ? "#ccc" : s >= 70 ? "#3b1f8f" : s >= 50 ? "#6741d9" : s >= 35 ? "#9775fa" : s >= 20 ? "#d0bfff" : "#f3f0ff";
    const scoreLayer = L.geoJSON(null, {
      style: (f) => ({ color: "#555", weight: .5, fillColor: scoreColor(f.properties.safety_score), fillOpacity: .7 }),
      onEachFeature: (f, layer) => {
        const p = f.properties, code = p.region_code;
        layer.bindTooltip(`<b>${p.sido} ${p.sigungu}</b><br>안전 점수 ${p.safety_score ?? "–"}`, { sticky: true });
        layer.on("click", () => {
          const link = folder[code] ? `<br><a href="${ROOT}${folder[code]}/${code}.html" target="_blank">🏃 러닝 지도 열기</a>` : "";
          layer.bindPopup(`<b>${p.sido} ${p.sigungu}</b> · 안전 점수 <b>${p.safety_score ?? "–"}</b><br>` +
            `밤 24시간 경찰 1km 안 ${pct(p.run_police_night_1km_pct)} (낮 ${pct(p.run_police_day_1km_pct)})<br>` +
            `밤 조명·CCTV 50m 안 ${pct(p.run_night_lit_pct)} · 사각지대 ${pct(p.run_blind_spot_pct)}` +
            (p.police_missing_coords_n ? `<br><span style="color:#c92a2a">경찰관서 ${p.police_missing_coords_n}곳 좌표 누락</span>` : "") +
            `<br><small>러닝 길 기준 · 신호 횡단 ${p.run_signal_crossings_per_km ?? "–"}곳/km</small>${link}`).openPopup();
        });
      },
    });
    let regionBoxes = [];
    getJson(BASE + "regions_safety.geojson").then((g) => {
      if (!g) return;
      scoreLayer.addData(g);
      regionBoxes = g.features.map((f) => ({ code: f.properties.region_code, b: L.geoJSON(f).getBounds() }));
      refresh();
    });

    // ---------- 2) 확대 시 시설 ----------
    const groups = {
      police: L.layerGroup(), signal: L.layerGroup(), lamp: L.layerGroup(), cctv: L.layerGroup(), blind: L.layerGroup(),
    };
    const loaded = new Set();
    const yes = (v) => v === true || v === "true";
    function addRegion(code) {
      if (loaded.has(code)) return;
      loaded.add(code);
      Promise.all([getJson(`${BASE}by_region/${code}.geojson`), getJson(`${BASE}blind_spots/${code}.geojson`)]).then(([fac, bl]) => {
        for (const f of (fac && fac.features) || []) {
          const p = f.properties, [x, y] = f.geometry.coordinates, ll = [y, x];
          if (p.layer === "police") {
            const h24 = yes(p.open_24h);
            L.marker(ll, { pane: "sfPane", icon: L.divIcon({ className: "", html: `<div class="sf-pol${h24 ? "" : " day"}">👮</div>`, iconSize: [26, 26] }) })
              .bindPopup(`<b>${p.name || "경찰관서"}</b><br>${h24 ? "24시간 운영" : "주간만 운영 (치안센터 등)"}`).addTo(groups.police);
            if (h24) L.circle(ll, { radius: 1000, color: "#7048e8", weight: 1, fillOpacity: .05, interactive: false, renderer: canvas }).addTo(groups.police);
          } else if (p.layer === "signal") {
            L.circleMarker(ll, { renderer: canvas, radius: 4, color: "#c92a2a", weight: 1.5, fillColor: "#ff6b6b", fillOpacity: .9 })
              .bindPopup(`🚦 <b>${yes(p.is_pedestrian) ? "보행 신호등" : "신호등"}</b>` + (yes(p.has_countdown) ? "<br>잔여시간 표시기 있음" : "") +
                (yes(p.night_blink) ? "<br>야간 점멸 운영" : "")).addTo(groups.signal);
          } else if (p.layer === "crosswalk" && yes(p.has_ped_signal)) {
            L.circleMarker(ll, { renderer: canvas, radius: 4, color: "#1864ab", weight: 1.5, fillColor: "#4dabf7", fillOpacity: .9 })
              .bindPopup(`🚸 <b>보행신호 횡단보도</b>` + (p.green_sec != null ? `<br>녹색 ${p.green_sec}초 · 적색 ${p.red_sec}초` : "") +
                `<br>예상 대기 약 ${Math.round(p.expected_wait_sec)}초` + (yes(p.has_lighting) ? "<br>집중조명 있음" : "")).addTo(groups.signal);
          } else if (p.layer === "lamp") {
            L.circleMarker(ll, { renderer: canvas, radius: 2, stroke: false, fillColor: "#f59f00", fillOpacity: .8, interactive: false }).addTo(groups.lamp);
          } else if (p.layer === "cctv" && yes(p.for_safety)) {
            L.circleMarker(ll, { renderer: canvas, radius: 2.5, color: "#343a40", weight: 1, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(groups.cctv);
          }
        }
        for (const f of (bl && bl.features) || [])
          L.geoJSON(f, { renderer: canvas, interactive: false, style: { color: "#e64980", weight: 3, dashArray: "4 4", opacity: .85 } }).addTo(groups.blind);
      });
    }
    const hint = L.control({ position: "bottomright" });
    hint.onAdd = () => { const d = L.DomUtil.create("div", "sf-hint"); d.innerHTML = "🛡 지도를 확대하면 안전시설이 보여요"; return d; };
    hint.addTo(map);
    function refresh() {
      const z = map.getZoom();
      hint.getContainer().style.display = z >= ZOOM_FAC ? "none" : "";
      pane.style.display = z >= 12 ? "" : "none";
      if (z < ZOOM_FAC || !regionBoxes.length) return;
      const view = map.getBounds(), c = map.getCenter();
      regionBoxes.filter((r) => r.b.intersects(view))
        .sort((a, b) => c.distanceTo(a.b.getCenter()) - c.distanceTo(b.b.getCenter())).slice(0, 6)
        .forEach((r) => addRegion(r.code));
    }
    map.on("moveend", refresh);

    // ---------- 3) 켜고 끄는 상자 ----------
    L.control.layers(null, {
      "🛡 시군구 안전 점수 (밤 러닝)": scoreLayer,
      "👮 경찰 (보라 원 = 24시간 1km)": groups.police,
      "🚦 신호등 · 🔵 보행신호 횡단보도": groups.signal,
      "💡 보안등": groups.lamp,
      "📹 안전용 CCTV": groups.cctv,
      "⚠ 안전 사각지대 (분홍 점선)": groups.blind,
    }, { collapsed: false, position: "topright" }).addTo(map);
    for (const k of ["police", "signal", "lamp", "blind"]) groups[k].addTo(map);   // CCTV·안전 점수는 처음엔 꺼 둠
    refresh();
  }

  function boot(n) {
    const map = window.L && findMap();
    if (map) return start(map);
    if (n < 50) setTimeout(() => boot(n + 1), 100);
  }
  if (document.readyState === "complete") boot(0); else window.addEventListener("load", () => boot(0));
})();
