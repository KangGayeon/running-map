/* 코스 화장실 최대 간격 (담당: 화장실 공공데이터)
 * 추천 코스에서 '화장실 없이 가장 길게 달려야 하는 구간'을 낮·밤으로 계산해 보여줌
 *   - 코스 화장실 = 코스선 150m 안 (앱의 '코스 150m 안 화장실'과 같은 기준)
 *   - 낮 = 모든 화장실, 밤 = 밤에 열려 있는 공공데이터 화장실(밤 안심 등급 초록·노랑·빨강)
 *   - 홈 '오늘의 코스' 설명과 코스 화면 화장실 카드에 숫자 표시
 *   - 코스 화면 지도에 그 구간을 주황 점선으로 표시 (밤 러닝 안심모드가 켜져 있으면 밤 기준)
 * index.html 은 아래만 부른다: init(map, state) · home(reg) · course(reg) · clear()   (이 파일이 없어도 앱 동작)
 */
window.CourseGap = (() => {
  const NEAR_M = 150, NIGHT = new Set(["초록", "노랑", "빨강"]);
  const S = { map: null, app: null, cache: new Map(), tag: null };

  const rad = (d) => d * Math.PI / 180;
  const hav = (a, b) => {
    const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };
  const km = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 10) * 10}m`;
  const nightOn = () => !!window.NightToilet?.isOn?.();

  // 출발점·화장실·도착점을 코스 순서로 놓고 이웃한 두 점 사이가 가장 먼 구간
  function gapOf(route, cum, pos) {
    const L = cum.at(-1), loop = hav(route[0], route.at(-1)) < 100;
    if (!pos.length) return { max: L, a: 0, b: L, n: 0 };
    let seg = [[0, pos[0]], ...pos.slice(1).map((p, i) => [pos.at(i), p]), [pos.at(-1), L]];
    if (loop) seg = [...pos.slice(1).map((p, i) => [pos.at(i), p]), [pos.at(-1), L + pos[0]]];
    let best = seg[0];
    for (const s of seg) if (s[1] - s[0] > best[1] - best[0]) best = s;
    return { max: best[1] - best[0], a: best[0], b: best[1], n: pos.length };
  }

  function compute(reg) {
    if (!reg || !reg.route || reg.route.length < 2) return null;
    if (S.cache.has(reg.code)) return S.cache.get(reg.code);
    const route = reg.route, cum = [0];
    for (let i = 1; i < route.length; i++) cum.push(cum.at(-1) + hav(route.at(i - 1), route.at(i)));
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    for (const [x, y] of route) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const pad = NEAR_M / 90000, day = [], night = [];
    for (const t of S.app.toilets || []) {
      const [x, y] = t.ll;
      if (x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad) continue;
      let bi = 0, bd = Infinity;
      route.forEach((p, i) => { const d = hav(p, t.ll); if (d < bd) { bd = d; bi = i; } });
      if (bd > NEAR_M) continue;
      day.push(cum.at(bi));
      if (NIGHT.has(t.g)) night.push(cum.at(bi));
    }
    day.sort((a, b) => a - b); night.sort((a, b) => a - b);
    const r = { L: cum.at(-1), cum, day: gapOf(route, cum, day), night: gapOf(route, cum, night) };
    if ((S.app.toilets || []).length) S.cache.set(reg.code, r);
    return r;
  }

  // 코스에서 출발점 기준 a~b(m) 구간의 좌표 (한 바퀴 코스면 끝을 넘어 처음으로 이어짐)
  function slice(route, cum, a, b) {
    const L = cum.at(-1), out = [];
    const take = (lo, hi) => route.forEach((p, i) => { const c = cum.at(i); if (c >= lo && c <= hi) out.push(p); });
    if (b <= L) take(a, b); else { take(a, L); take(0, b - L); }
    return out.length >= 2 ? out : null;
  }

  function home(reg) {
    const r = compute(reg), el = document.getElementById("courseInfo");
    if (!r || !el || el.querySelector(".cg")) return;
    const g = nightOn() ? r.night : r.day;
    el.insertAdjacentHTML("beforeend", `<span class="cg"> · ${nightOn() ? "밤 " : ""}화장실 최대 간격 ${km(g.max)}</span>`);
  }

  function course(reg) {
    const r = compute(reg);
    if (!r) return;
    const card = document.getElementById("cToilet")?.parentElement?.querySelector("small");
    if (card) card.innerHTML = `코스 150m 안<br>최대 간격 ${km(r.day.max)} · 밤 ${km(r.night.max)}`;
    const g = nightOn() ? r.night : r.day, seg = slice(reg.route, r.cum, g.a, g.b);
    if (!seg || g.max < 300) return clear();
    S.map.getSource("cg-gap")?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: seg } });
    S.tag.textContent = `🚻 화장실 없는 구간 ${km(g.max)}${nightOn() ? " (밤)" : ""}`;
    S.marker.setLngLat(seg[Math.floor(seg.length / 2)]).addTo(S.map);
  }

  function clear() {
    S.map?.getSource("cg-gap")?.setData({ type: "FeatureCollection", features: [] });
    S.marker?.remove();
  }

  function init(map, app) {
    S.map = map; S.app = app;
    map.addSource("cg-gap", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "cg-gap", type: "line", source: "cg-gap",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ff9f43", "line-width": 6, "line-dasharray": [1.2, 1.4], "line-opacity": .95 } });
    S.tag = document.createElement("div");
    S.tag.style.cssText = "padding:4px 9px;border-radius:10px;background:rgba(23,25,28,.92);color:#ffb86b;font:600 12px/1.3 system-ui,sans-serif;border:1px solid #ff9f43;white-space:nowrap";
    S.marker = new maplibregl.Marker({ element: S.tag, anchor: "bottom", offset: [0, -8] });
    // 안심모드를 켜고 끄면 코스 화면의 점선도 낮/밤 기준으로 다시 그림
    const row = document.querySelector(".sf-row");
    if (row) new MutationObserver(() => {
      const reg = app.cur && app.loaded?.get(app.cur);
      if (app.screen === "course" && reg) course(reg);
    }).observe(row, { attributes: true, attributeFilter: ["aria-pressed"] });
  }

  return { init, home, course, clear, compute };
})();
