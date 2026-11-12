/* 음성 코치: 화장실 바로 앞에서만 한마디 알려줌 (담당: 화장실 공공데이터)
 * 휴대폰 브라우저에 들어 있는 음성 합성(speechSynthesis, 한국어)을 사용 → 서버·비용 없음
 *   - 진행 방향 앞쪽 화장실이 120m 안으로 들어오면 한 번만: "곧 오른쪽에 화장실이 있어요."
 *   - 그 밖에는 말하지 않음 (거리·페이스·신호 안내 없음)
 *   - 홈 화면 '음성 코치' 스위치로 켜고 끔 (설정 기억)
 * index.html 은 아래만 부른다: update(info) · stop()   (이 파일이 없어도 앱은 그대로 동작)
 *   info = { target(다음 화장실: d, rel, ll), ahead }
 */
window.VoiceCoach = (() => {
  const NEAR_M = 120;
  const S = { on: true, voice: null, saidK: null, row: null };
  const ok = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const side = (rel) => Math.abs(rel) <= 25 ? "앞쪽에" : rel > 0 ? "오른쪽에" : "왼쪽에";

  function pickVoice() {
    if (!ok) return;
    const vs = speechSynthesis.getVoices();
    S.voice = vs.find((v) => /ko[-_]KR/i.test(v.lang) && /google|samsung/i.test(v.name)) || vs.find((v) => /^ko/i.test(v.lang)) || null;
  }
  function say(text) {
    if (!ok || !S.on) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR"; u.rate = 1; if (S.voice) u.voice = S.voice;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  // 안드로이드 크롬은 사용자가 버튼을 누른 순간에 한 번 말해야 이후 자동 안내가 나옴
  function unlock() {
    if (!ok || !S.on) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
  }

  function update(i) {
    if (!S.on || !i) return;
    const t = i.target;
    if (!t || !t.ll || !i.ahead) return;
    const k = t.ll.map((v) => v.toFixed(5)).join(",");
    if (t.d <= NEAR_M && k !== S.saidK) {           // 같은 화장실은 한 번만
      S.saidK = k;
      say(`곧 ${side(t.rel)} 화장실이 있어요.`);
    }
  }

  function start() { S.saidK = null; unlock(); }
  function stop() { S.saidK = null; try { ok && speechSynthesis.cancel(); } catch (e) {} }

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
      <span class="t"><b>음성 안내</b><small>화장실 바로 앞에서만 한마디 알려줘요</small></span>
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
    else if (test) say("음성 안내를 켰어요.");
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
