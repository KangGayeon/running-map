/* 밤 안심 화장실 (담당: 화장실 공공데이터)
 * 데이터: data/r/*.json 의 화장실 poi 뒤 4칸 [밤안심등급, 밤개방, 비상벨, CCTV]
 * '밤 러닝 안심모드'(safety.js) 버튼이 켜지면 자동으로 함께 동작한다. 이 파일이 없어도 앱은 그대로 동작.
 *   - 밤에 닫거나 개방시간을 알 수 없는 화장실은 지도와 안내에서 숨김
 *   - 화장실 아이콘 테두리 색 = 밤 안심 등급 (초록: 비상벨+CCTV / 노랑: 둘 중 하나 / 빨강: 둘 다 없음 / 회색: 등급 정보 없는 OSM 화장실)
 *   - 달리는 중 '다음 화장실' 안내도 밤에 열린 곳만 고름
 * index.html 은 아래만 부른다: init(map, state) · ok(toilet) · badge(toilet)
 */
window.NightToilet = (() => {
  const GRADE = {
    "초록": ["#2fbf71", "비상벨·CCTV 있음"],
    "노랑": ["#f5b700", "비상벨 또는 CCTV"],
    "빨강": ["#ff5c5c", "안전설비 없음"],
  };
  const OSM_COLOR = "#8a949c";
  const S = { map: null, on: false, origIcon: null, origFilter: null };

  function addIcons(map) {
    const draw = (id, color) => {
      const size = 36, pr = 2, c = document.createElement("canvas");
      c.width = c.height = size * pr;
      const g = c.getContext("2d"); g.scale(pr, pr);
      g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      g.fillStyle = "#17191c"; g.fill(); g.lineWidth = 3.5; g.strokeStyle = color; g.stroke();
      g.font = `${Math.round(size * .5)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("🚻", size / 2, size / 2 + 1);
      if (!map.hasImage(id)) map.addImage(id, g.getImageData(0, 0, c.width, c.height), { pixelRatio: pr });
    };
    for (const [k, [color]] of Object.entries(GRADE)) draw(`toilet-night-${k}`, color);
    draw("toilet-night-osm", OSM_COLOR);
  }

  function apply() {
    const map = S.map;
    if (!map || !map.getLayer("poi-toilet")) return;
    if (S.on) {
      // 밤에 쓸 수 없는 곳(등급 '제외')은 숨기고, 나머지는 등급 색 아이콘으로
      map.setFilter("poi-toilet", ["all", ["==", ["get", "t"], "toilet"], ["!=", ["coalesce", ["get", "g"], ""], "제외"]]);
      map.setLayoutProperty("poi-toilet", "icon-image",
        ["match", ["coalesce", ["get", "g"], ""], "초록", "toilet-night-초록", "노랑", "toilet-night-노랑",
          "빨강", "toilet-night-빨강", "toilet-night-osm"]);
    } else {
      map.setFilter("poi-toilet", S.origFilter);
      map.setLayoutProperty("poi-toilet", "icon-image", S.origIcon);
    }
    legend();
  }

  function legend() {
    const box = document.querySelector(".sf-legend");
    if (!box) return;
    let el = box.querySelector(".nt-legend");
    if (!el) {
      el = document.createElement("span");
      el.className = "nt-legend";
      el.style.cssText = "flex-basis:100%;display:flex;flex-wrap:wrap;gap:2px 10px";
      el.innerHTML = "<span>🚻 밤에 열린 화장실만:</span>" +
        Object.entries(GRADE).map(([k, [c, t]]) =>
          `<span><i style="background:${c};width:8px;height:8px;border-radius:50%"></i>${t}</span>`).join("") +
        `<span><i style="background:${OSM_COLOR};width:8px;height:8px;border-radius:50%"></i>정보 없음</span>`;
      box.appendChild(el);
    }
  }

  function watchToggle() {
    const row = document.querySelector(".sf-row");
    if (!row) return false;
    const read = () => {
      const on = row.getAttribute("aria-pressed") === "true";
      if (on !== S.on) { S.on = on; apply(); }
    };
    new MutationObserver(read).observe(row, { attributes: true, attributeFilter: ["aria-pressed"] });
    read();
    return true;
  }

  function init(map, state) {
    S.map = map;
    S.origIcon = map.getLayoutProperty("poi-toilet", "icon-image");
    S.origFilter = map.getFilter("poi-toilet");
    addIcons(map);
    // 안심모드 버튼이 아직 안 만들어졌으면 잠깐 기다렸다가 연결
    if (!watchToggle()) {
      let tries = 0;
      const t = setInterval(() => { if (watchToggle() || ++tries > 20) clearInterval(t); }, 300);
    }
  }

  // 안내에 써도 되는 화장실인지 (안심모드가 꺼져 있으면 전부 OK)
  const ok = (t) => !S.on || (t.g || "") !== "제외";

  // 달리는 중 안내 문구 뒤에 붙일 짧은 표시
  const badge = (t) => {
    if (!S.on || !t || !GRADE[t.g]) return "";
    return ` · <span style="color:${GRADE[t.g][0]}">● ${GRADE[t.g][1]}</span>`;
  };

  return { init, ok, badge, isOn: () => S.on };
})();
