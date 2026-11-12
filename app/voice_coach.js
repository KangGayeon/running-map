/* 음성 코치: 달리는 중 이어폰으로 화장실·신호·거리를 말로 알려줌 (담당: 화장실 공공데이터)
 * 휴대폰 브라우저에 들어 있는 음성 합성(speechSynthesis, 한국어)을 사용 → 서버·비용 없음
 *   - 1km마다: "2킬로미터. 평균 페이스 6분 10초."
 *   - 화장실: 앞쪽 화장실이 바뀌어 500m 안이면 이름과 거리, 100m 안에 들어오면 한 번 더 (밤 안심모드면 안전설비도)
 *   - 신호: 진행 방향 300m 안 보행 신호 횡단보도 → "300미터 앞 신호등. 예상 대기 30초."
 *   - 홈 화면 '음성 코치' 스위치로 켜고 끔 (설정 기억)
 * index.html 은 아래만 부른다: update(info) · stop()   (이 파일이 없어도 앱은 그대로 동작)
 *   info = { pos:[경도,위도], heading, dist(m), sec(초), target(다음 화장실), ahead, region, demo }
 */
window.VoiceCoach = (() => {
  const SAFETY = "../safety/by_region/";
  const S = { on: true, voice: null, km: 0, toiletK: null, toiletNear: false, said: new Set(), cross: [], region: null,
              files: new Map(), lastSay: 0, row: null };
  const ok = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

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
  const meters = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)}킬로미터` : m < 200 ? `${Math.max(10, Math.round(m / 10) * 10)}미터` : `${Math.round(m / 50) * 50}미터`;
  const side = (rel) => Math.abs(rel) <= 20 ? "앞쪽" : rel > 0 ? "오른쪽 앞" : "왼쪽 앞";
  const GRADE = { "초록": "비상벨과 CCTV가 있어요.", "노랑": "비상벨이나 CCTV가 있어요.", "빨강": "안전설비는 없어요." };

  // ---------- 말하기 ----------
  function pickVoice() {
    if (!ok) return;
    const vs = speechSynthesis.getVoices();
    S.voice = vs.find((v) => /ko[-_]KR/i.test(v.lang) && /google|samsung/i.test(v.name)) || vs.find((v) => /^ko/i.test(v.lang)) || null;
  }
  function say(text, urgent) {
    if (!ok || !S.on) return;
    const now = Date.now();
    if (!urgent && (speechSynthesis.speaking || speechSynthesis.pending) && now - S.lastSay < 6000) return;   // 말이 겹치면 덜 중요한 건 건너뜀
    if (urgent && speechSynthesis.pending) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR"; u.rate = 1.05; if (S.voice) u.voice = S.voice;
    speechSynthesis.speak(u);
    S.lastSay = now;
  }
  // 안드로이드 크롬은 사용자가 버튼을 누른 순간에 한 번 말해야 이후 자동 안내가 나옴
  function unlock() {
    if (!ok || !S.on) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
  }

  // ---------- 신호(보행 신호 횡단보도) 데이터 ----------
  function loadRegion(code) {
    if (!code || code === S.region) return;
    S.region = code;
    if (!S.files.has(code)) S.files.set(code, fetch(`${SAFETY}${code}.geojson`).then((r) => r.ok ? r.json() : null).catch(() => null));
    S.files.get(code).then((g) => {
      if (S.region !== code) return;
      S.cross = [];
      for (const f of (g && g.features) || []) {
        const p = f.properties;
        if ((p.layer === "crosswalk" && p.has_ped_signal) || (p.layer === "signal" && p.is_pedestrian))
          S.cross.push({ ll: f.geometry.coordinates, w: p.expected_wait_sec, rt: !!p.has_countdown });
      }
    });
  }

  // ---------- 달리는 중 ----------
  function update(i) {
    if (!S.on || !i || !i.pos) return;
    loadRegion(i.region);

    // 1) 1km마다 거리·평균 페이스
    const km = Math.floor((i.dist || 0) / 1000);
    if (km > S.km) {
      S.km = km;
      const pace = i.sec / Math.max(i.dist / 1000, .01), m = Math.floor(pace / 60), s = Math.round(pace % 60);
      say(`${km}킬로미터. 평균 페이스 ${m}분 ${s}초.`, true);
    }

    // 2) 다음 화장실
    const t = i.target;
    if (t && t.ll) {
      const k = t.ll.map((v) => v.toFixed(5)).join(","), d = t.d;
      const night = window.NightToilet?.isOn?.() && GRADE[t.g] ? " " + GRADE[t.g] : "";
      if (k !== S.toiletK) {
        S.toiletK = k; S.toiletNear = false;
        if (i.ahead && d <= 500) say(`${side(t.rel)} ${meters(d)}에 화장실. ${t.name || "공중화장실"}.${night}`);
      } else if (!S.toiletNear && i.ahead && d <= 100) {
        S.toiletNear = true;
        say(`화장실이 ${side(t.rel)} ${meters(d)}예요.`, true);
      }
    }

    // 3) 진행 방향 300m 안 신호
    let next = null;
    for (const c of S.cross) {
      if (Math.abs(c.ll[1] - i.pos[1]) > .004 || Math.abs(c.ll[0] - i.pos[0]) > .005) continue;
      const d = hav(i.pos, c.ll);
      if (d < 40 || d > 300 || Math.abs(ang(i.heading || 0, brg(i.pos, c.ll))) > 35) continue;
      if (!next || d < next.d) next = { ...c, d };
    }
    if (next) {
      const k = next.ll.map((v) => v.toFixed(5)).join(",");
      if (!S.said.has(k)) {
        S.said.add(k);
        const w = next.w ? ` 예상 대기 ${Math.round(next.w / 5) * 5 || 5}초.` : "";
        say(`${meters(next.d)} 앞 신호등.${w}${next.rt ? " 잔여시간 표시기가 있어요." : ""}`);
      }
    }
  }

  function start() { S.km = 0; S.toiletK = null; S.toiletNear = false; S.said.clear(); unlock(); }
  function stop() { S.km = 0; S.toiletK = null; S.said.clear(); try { ok && speechSynthesis.cancel(); } catch (e) {} }

  // ---------- 홈 화면 스위치 ----------
  function addUi() {
    const after = document.getElementById("watchRow");
    if (!after || !ok) return;
    const st = document.createElement("style");
    st.textContent = `.vc-row .sw { width: 42px; height: 24px; flex: none; border-radius: 12px; background: var(--card-2); position: relative; }
      .vc-row .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
        background: var(--ink-3); transition: left .2s; }
      .vc-row[aria-pressed="true"] .sw { background: var(--lime, #c6f432); }
      .vc-row[aria-pressed="true"] .sw::after { left: 21px; background: #fff; }`;
    document.head.appendChild(st);
    S.row = document.createElement("button");
    S.row.className = "row vc-row"; S.row.type = "button";
    S.row.innerHTML = `<span class="ic" aria-hidden="true">🔊</span>
      <span class="t"><b>음성 코치</b><small>이어폰으로 화장실·신호·1km 페이스를 말로 알려줘요</small></span>
      <span class="sw" aria-hidden="true"></span>`;
    S.row.onclick = () => setOn(!S.on, true);
    after.after(S.row);
    setOn(S.on, false);
  }
  function setOn(on, test) {
    S.on = on;
    if (S.row) S.row.setAttribute("aria-pressed", on ? "true" : "false");
    try { localStorage.setItem("runnavi-voice", on ? "1" : "0"); } catch (e) {}
    if (!on) { try { ok && speechSynthesis.cancel(); } catch (e) {} }
    else if (test) say("음성 코치를 켰어요.", true);
  }

  function init() {
    try { const v = localStorage.getItem("runnavi-voice"); if (v) S.on = v === "1"; } catch (e) {}
    if (ok) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
    addUi();
    for (const id of ["btnStart", "gpsRow"]) document.getElementById(id)?.addEventListener("click", start, { capture: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  return { update, stop, say, isOn: () => S.on };
})();
