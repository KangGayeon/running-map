/* 안전시설 레이어 (담당: 안전시설 데이터 분석)
 * 데이터: 저장소의 safety/ 폴더 (WGS84 GeoJSON)
 *   ../safety/by_region/<시군구코드>.geojson   경찰·신호등·횡단보도·보안등·CCTV (properties.layer 로 구분)
 *   ../safety/blind_spots/<시군구코드>.geojson 안전 사각지대 선
 *   ../safety/region_safety.json               시군구별 안전 지표
 * index.html 은 아래 함수만 부른다 (이 파일이 없어도 앱은 그대로 동작):
 *   init(map, state) · refresh() · onHome(code) · onCourse(code) · onUpdate(pos, heading) · onStop()
 */
window.SafetyLayer = (() => {
  const BASE = "../safety/";
  const S = { map: null, app: null, on: false, files: new Map(), stats: null, cross: [], police: [], shown: "" };
  const ICONS = { police: ["👮", "#b197fc"], police_day: ["👮", "#6b7177"], signal: ["🚦", "#ff6b6b"], crosswalk: ["🚸", "#4dabf7"],
                  bell: ["🔔", "#ffa94d"] };

  // ---------- 계산 도우미 ----------
  const rad = (d) => d * Math.PI / 180;
  const hav = (a, b) => {
    const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };
  const brg = (a, b) => {
    const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
    const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  const ang = (a, b) => ((b - a + 540) % 360) - 180;
  const fmt = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 10) * 10}m`;
  const pct = (v) => v == null ? "–" : `${Math.round(v)}%`;
  // 1km를 화면 픽셀로: MapLibre(512px 타일)에서 1픽셀 = 78271.5×cos(위도)/2^줌 m → 위도 36.5° 기준 62,930/2^줌 m
  const kmPx = (km) => ["interpolate", ["exponential", 2], ["zoom"], 8, km * 1000 * 2 ** 8 / 62930,
                        20, km * 1000 * 2 ** 20 / 62930];

  function css() {
    const st = document.createElement("style");
    st.textContent = `
      .sf-row .ic { background: #2a2346; }
      .sf-row[aria-pressed="true"] { outline: 2px solid #b197fc; outline-offset: -2px; }
      .sf-row[aria-pressed="true"] .ic { background: #b197fc; color: #14101f; }
      .sf-row .sw { width: 42px; height: 24px; flex: none; border-radius: 12px; background: var(--card-2); position: relative; }
      .sf-row .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
        background: var(--ink-3); transition: left .2s; }
      .sf-row[aria-pressed="true"] .sw { background: #b197fc; }
      .sf-row[aria-pressed="true"] .sw::after { left: 21px; background: #fff; }
      .sf-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: var(--ink-2); margin: -2px 2px 10px; }
      .sf-legend i { display: inline-block; width: 14px; height: 4px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
      .sf-course { grid-column: 1 / -1; font-size: 12px; line-height: 1.6; color: var(--ink-2); }
      .sf-course b { display: inline; margin: 0; font-size: 13px; color: var(--ink); }
      .sf-run { position: absolute; left: 16px; right: 16px; top: calc(env(safe-area-inset-top, 0px) + 82px); max-width: 528px;
        margin: 0 auto; display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 8px 12px; border-radius: 14px;
        font-size: 12px; color: var(--ink); }
      .sf-run b { font-variant-numeric: tabular-nums; }
      .sf-warn { color: var(--danger); }`;
    document.head.appendChild(st);
  }
  function addIcons(map) {
    for (const [t, [emoji, color]] of Object.entries(ICONS)) {
      const size = t.startsWith("police") ? 30 : 24, pr = 2, c = document.createElement("canvas");
      c.width = c.height = size * pr;
      const g = c.getContext("2d"); g.scale(pr, pr);
      g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2.5, 0, Math.PI * 2);
      g.fillStyle = "#17191c"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = color; g.stroke();
      g.font = `${Math.round(size * .5)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(emoji, size / 2, size / 2 + 1);
      map.addImage(`sf-${t}`, g.getImageData(0, 0, c.width, c.height), { pixelRatio: pr });
    }
  }

  // ---------- 지도 레이어 ----------
  const LAYERS = ["sf-blind", "sf-police-r", "sf-lamp", "sf-cctv", "sf-icons"];
  function addLayers(map) {
    const empty = { type: "FeatureCollection", features: [] };
    map.addSource("sf-pts", { type: "geojson", data: empty });
    map.addSource("sf-blind", { type: "geojson", data: empty });
    const vis = { visibility: "none" };
    map.addLayer({ id: "sf-blind", type: "line", source: "sf-blind", minzoom: 11, layout: { ...vis, "line-cap": "round" },
      paint: { "line-color": "#ff5c8a", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 16, 5],
               "line-opacity": .75, "line-dasharray": [1.2, 1] } });
    map.addLayer({ id: "sf-police-r", type: "circle", source: "sf-pts", minzoom: 11, layout: vis,
      filter: ["all", ["==", ["get", "layer"], "police"], ["==", ["get", "open_24h"], true]],
      paint: { "circle-radius": kmPx(1), "circle-color": "#b197fc", "circle-opacity": .06, "circle-pitch-alignment": "map",
               "circle-stroke-color": "#b197fc", "circle-stroke-width": 1, "circle-stroke-opacity": .35 } });
    map.addLayer({ id: "sf-lamp", type: "circle", source: "sf-pts", minzoom: 14, layout: vis, filter: ["==", ["get", "layer"], "lamp"],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 1.5, 18, 5], "circle-color": "#ffd43b",
               "circle-blur": .5, "circle-opacity": .85 } });
    map.addLayer({ id: "sf-cctv", type: "circle", source: "sf-pts", minzoom: 15, layout: vis,
      filter: ["all", ["==", ["get", "layer"], "cctv"], ["==", ["get", "for_safety"], true]],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 18, 6], "circle-color": "#e9ecef",
               "circle-stroke-color": "#495057", "circle-stroke-width": 1.5 } });
    map.addLayer({ id: "sf-icons", type: "symbol", source: "sf-pts", minzoom: 12, layout: { ...vis,
      "icon-image": ["concat", "sf-", ["get", "k"]], "icon-allow-overlap": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, ["match", ["get", "layer"], "police", .7, .3], 16, ["match", ["get", "layer"], "police", 1, .85]] },
      filter: ["any", ["==", ["get", "layer"], "police"], ["==", ["get", "layer"], "bell"],
               ["all", [">=", ["zoom"], 15], ["==", ["get", "layer"], "signal"]],
               ["all", [">=", ["zoom"], 15], ["==", ["get", "layer"], "crosswalk"], ["==", ["get", "has_ped_signal"], true]]] });
    map.on("click", "sf-icons", (e) => {
      const p = e.features[0].properties, y = (v) => v === true || v === "true";
      const html = {
        police: () => `👮 <b>${p.name || "경찰관서"}</b><br>${y(p.open_24h) ? "24시간 운영" : "주간만 운영 (치안센터 등)"}`,
        signal: () => `🚦 <b>${y(p.is_pedestrian) ? "보행 신호등" : "신호등"}</b>` +
          (y(p.has_countdown) ? "<br>잔여시간 표시기 있음" : "") + (y(p.night_blink) ? "<br>야간 점멸 운영" : ""),
        bell: () => `🔔 <b>${p.kind || "안전 비상벨"}</b>${p.name ? "<br>" + p.name : ""}<br>위급할 때 누르면 경찰과 연결`,
        crosswalk: () => `🚸 <b>보행신호 횡단보도</b>` + (p.signal_info === "estimated" ? "<br><small>근처 보행 신호등으로 추정</small>" : "") +
          (p.green_sec && p.green_sec !== "null" ? `<br>녹색 ${p.green_sec}초 · 적색 ${p.red_sec}초` : "") +
          `<br>예상 대기 약 ${Math.round(+p.expected_wait_sec)}초` + (y(p.has_lighting) ? "<br>집중조명 있음" : ""),
      }[p.layer];
      if (html) new maplibregl.Popup({ closeButton: false, offset: 14 }).setLngLat(e.features[0].geometry.coordinates).setHTML(html()).addTo(S.map);
    });
  }

  // ---------- 홈 화면 줄 · 범례 ----------
  function addUi() {
    const sheet = document.getElementById("homeSheet"), legend = document.getElementById("legend");
    S.row = document.createElement("button");
    S.row.className = "row sf-row"; S.row.type = "button";
    S.row.innerHTML = `<span class="ic" aria-hidden="true">🛡</span>
      <span class="t"><b>밤 러닝 안심모드</b><small id="sfSub">경찰·신호등·보안등·CCTV·사각지대 보기</small></span>
      <span class="sw" aria-hidden="true"></span>`;
    S.row.onclick = () => setOn(!S.on);
    S.legend = document.createElement("div");
    S.legend.className = "sf-legend"; S.legend.hidden = true;
    S.legend.innerHTML = `<span>👮 24시간 경찰 (보라 원 1km)</span><span>🔔 안심부스</span><span>🚦🚸 신호</span>` +
      `<span><i style="background:#ffd43b"></i>보안등</span><span><i style="background:#e9ecef"></i>CCTV</span>` +
      `<span><i style="background:#ff5c8a"></i>안전 사각지대</span>`;
    if (sheet && legend) { legend.after(S.row); S.row.after(S.legend); }
    // 달리는 중 안내 줄
    S.runBar = document.createElement("div");
    S.runBar.className = "sf-run glass"; S.runBar.hidden = true;
    document.getElementById("run")?.appendChild(S.runBar);
  }

  function setOn(on) {
    S.on = on;
    for (const id of LAYERS) S.map.getLayer(id) && S.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    if (S.map.getLayer("poi-other"))   // 안심모드에서는 기존 OSM 경찰 대신 공공데이터 경찰을 보여줌
      S.map.setFilter("poi-other", on ? ["all", ["!=", ["get", "t"], "toilet"], ["!=", ["get", "t"], "police"]] : ["!=", ["get", "t"], "toilet"]);
    S.row.setAttribute("aria-pressed", on ? "true" : "false");
    S.legend.hidden = !on;
    if (window.runnaviTheme) window.runnaviTheme(on ? "night" : "day");      // 안심모드 = 밤 지도
    try { localStorage.setItem("runnavi-safety", on ? "1" : "0"); } catch (e) {}
    if (on) refresh();
    onHome(S.app.cur);
    if (!on) S.runBar.hidden = true;
  }

  // ---------- 데이터 ----------
  function getJson(url) {
    if (!S.files.has(url)) S.files.set(url, fetch(url).then((r) => r.ok ? r.json() : null).catch(() => null));
    return S.files.get(url);
  }
  function loadStats() {
    if (!S.statsP) S.statsP = getJson(BASE + "region_safety.json").then((rows) => {
      S.stats = {}; for (const r of rows || []) S.stats[r.region_code] = r;
      onHome(S.app.cur);
    });
    return S.statsP;
  }
  let t = null;
  function refresh() {
    if (!S.map || !S.on) return;
    const cur = S.app.cur;
    if (!cur) return;
    // 지금 지역 + 이웃 지역만 (보안등이 많아서 전국을 한꺼번에 받지 않음)
    const codes = [cur, ...((S.app.byCode[cur] || {}).nb || [])].slice(0, 9);
    const key = codes.join(",");
    Promise.all(codes.map((c) => Promise.all([getJson(`${BASE}by_region/${c}.geojson`), getJson(`${BASE}blind_spots/${c}.geojson`)])))
      .then((list) => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (key === S.shown) return;
          S.shown = key;
          const pts = [], blind = [];
          S.cross = []; S.police = [];
          for (const [fac, bl] of list) {
            for (const f of (fac && fac.features) || []) {
              const p = f.properties;
              p.k = p.layer === "police" ? (p.open_24h ? "police" : "police_day") : p.layer;
              pts.push(f);
              const ll = f.geometry.coordinates;
              if ((p.layer === "crosswalk" && p.has_ped_signal) || (p.layer === "signal" && p.is_pedestrian))
                S.cross.push({ ll, g: p.green_sec, r: p.red_sec, w: p.expected_wait_sec, rt: !!p.has_countdown });
              if (p.layer === "police" && p.open_24h) S.police.push({ ll, n: p.name });
            }
            for (const f of (bl && bl.features) || []) blind.push(f);
          }
          S.map.getSource("sf-pts").setData({ type: "FeatureCollection", features: pts });
          S.map.getSource("sf-blind").setData({ type: "FeatureCollection", features: blind });
        }, 60);
      });
  }

  // ---------- 화면별 표시 ----------
  function onHome(code) {
    const sub = document.getElementById("sfSub");
    if (!sub) return;
    const s = S.stats && code && S.stats[code];
    if (!s) { sub.textContent = "경찰·신호등·보안등·CCTV·사각지대 보기"; return; }
    const warn = (s.police_missing_coords_n ? " · 경찰 일부 누락" : "") + (s.has_signal_info === false ? " · 신호 자료 없음" : "");
    sub.innerHTML = `안전 점수 <span style="color:var(--ink);font-weight:700">${s.safety_score ?? "–"}</span> · 밤 경찰 1km ${pct(s.run_police_night_1km_pct)}` +
      ` (낮 ${pct(s.run_police_day_1km_pct)}) · 밤 조명·CCTV ${pct(s.run_night_lit_pct)}${warn}`;
    if (S.on) refresh();
  }
  function onCourse(code) {
    document.querySelector(".sf-course")?.remove();
    const s = S.stats && code && S.stats[code];
    const cards = document.querySelector("#course .cards");
    if (!s || !cards || s.course_length_m == null) return;
    const el = document.createElement("div");
    el.className = "cc sf-course";
    const sig = s.course_signal_crossings ? `신호 횡단 <b>${s.course_signal_crossings}곳</b> · 예상 대기 <b>약 ${Math.max(1, Math.round(s.course_expected_wait_sec / 60))}분</b>`
                                          : `<b>신호 없이</b> 이어 달릴 수 있는 코스`;
    const far = s.course_police24_max_m > 1000 ? ` <span class="sf-warn">⚠</span>` : "";
    el.innerHTML = `🛡 ${sig}<br>24시간 경찰 최대 <b>${fmt(s.course_police24_max_m)}</b>${far} · 사각지대 최장 <b>${fmt(s.course_blind_longest_m)}</b>`;
    cards.prepend(el);
  }
  function onUpdate(pos, heading) {
    if (!S.on || !S.runBar) return;
    let next = null;       // 진행 방향 ±50°, 800m 안의 가장 가까운 보행 신호
    for (const c of S.cross) {
      if (Math.abs(c.ll[1] - pos[1]) > .01 || Math.abs(c.ll[0] - pos[0]) > .012) continue;
      const d = hav(pos, c.ll);
      if (d > 800 || d < 8 || Math.abs(ang(heading, brg(pos, c.ll))) > 50) continue;
      if (!next || d < next.d) next = { ...c, d };
    }
    let pol = null;
    for (const p of S.police) {
      if (Math.abs(p.ll[1] - pos[1]) > .05 || Math.abs(p.ll[0] - pos[0]) > .06) continue;
      const d = hav(pos, p.ll);
      if (!pol || d < pol.d) pol = { ...p, d };
    }
    // 신호 자료가 없는 시군구에서는 '신호 없음'이 아니라 '자료 없음'으로 안내 (실제로 신호가 없는 것과 구분)
    const st = S.stats && S.app.cur && S.stats[S.app.cur];
    const noInfo = st && st.has_signal_info === false;
    const sig = next ? `🚸 앞 신호 <b>${fmt(next.d)}</b>` + (next.g ? ` · 녹색 ${next.g}초/적색 ${next.r}초` : "") + (next.rt ? " · 잔여시간 표시" : "")
                     : noInfo ? "🚸 이 지역은 신호 자료가 없어요" : "🚸 800m 안 신호 없음";
    const po = pol ? `👮 24시간 경찰 <b>${fmt(pol.d)}</b>${pol.d > 1000 ? ' <span class="sf-warn">⚠</span>' : ""}` : `👮 <span class="sf-warn">5km 안 24시간 경찰 없음</span>`;
    S.runBar.innerHTML = `<span>${sig}</span><span>${po}</span>`;
    S.runBar.hidden = false;
  }
  function onStop() { if (S.runBar) S.runBar.hidden = true; }

  function init(map, app) {
    S.map = map; S.app = app;
    css(); addIcons(map); addLayers(map); addUi();
    loadStats();
    let saved = null; try { saved = localStorage.getItem("runnavi-safety"); } catch (e) {}
    const h = new Date().getHours();
    setOn(saved ? saved === "1" : (h >= 19 || h < 6));     // 저장된 설정이 없으면 밤에 자동으로 켬
  }
  return { init, refresh, onHome, onCourse, onUpdate, onStop };
})();
