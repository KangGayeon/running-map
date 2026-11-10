/* 워치 알림: 달리는 중 '다음 화장실'을 휴대폰 알림으로 띄워 갤럭시 워치에 바로 보이게 함 (담당: 화장실 공공데이터)
 * 원리: 휴대폰 알림은 갤럭시 워치에 그대로 전달됨 → 워치 앱 없이 손목에서 확인 가능
 *   - 'START(미리 달리기)'나 '지금 내 위치에서 달리기'를 누를 때 알림 허용을 한 번 물어봄
 *   - 알림 하나를 계속 고쳐 쓰는 방식이라 알림이 쌓이지 않음 (조용히 갱신)
 *   - 새 화장실로 바뀌었는데 300m 안이거나, 100m 안으로 들어오면 그때만 진동
 *   - 밤 러닝 안심모드가 켜져 있으면 밤 안심 등급도 같이 표시
 * index.html 은 아래만 부른다: update(target, ahead) · stop()   (이 파일이 없어도 앱은 그대로 동작)
 */
window.WatchNotify = (() => {
  const TAG = "runnavi-toilet";
  const PACE = 360;                     // 예상 시간 계산용 6:00/km (index.html 과 같음)
  const GRADE = { "초록": "비상벨·CCTV 있음", "노랑": "비상벨 또는 CCTV", "빨강": "안전설비 없음" };
  const S = { ok: false, last: { k: null, near: false, bucket: null, at: 0 } };
  const supported = "Notification" in window && "serviceWorker" in navigator;

  async function ask() {
    if (!supported) return;
    try { if (Notification.permission === "default") await Notification.requestPermission(); } catch (e) {}
    S.ok = Notification.permission === "granted";
  }

  const fmt = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 10) * 10}m`;
  // 거리가 이만큼 바뀔 때만 알림을 고침 (가까울수록 촘촘히)
  const bucket = (d) => d < 200 ? Math.round(d / 20) : d < 1000 ? 100 + Math.round(d / 50) : 1000 + Math.round(d / 250);

  async function show(title, body, alert) {
    const opt = { body, tag: TAG, icon: "icon-192.png", badge: "icon-192.png", renotify: alert, silent: !alert,
                  vibrate: alert ? [200, 100, 200] : undefined, requireInteraction: false, data: { url: location.href } };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) return reg.showNotification(title, opt);
      new Notification(title, opt);
    } catch (e) {}
  }

  function update(t, ahead) {
    if (!S.ok || !t) return;
    const now = Date.now(), d = Math.round(t.d), k = t.ll ? t.ll.map((v) => v.toFixed(5)).join(",") : t.name;
    const b = bucket(d), near = d <= 100;
    const changed = k !== S.last.k;
    if (!changed && b === S.last.bucket && now - S.last.at < 30000) return;       // 바뀐 게 없으면 30초에 한 번만
    if (!changed && now - S.last.at < 4000 && !(near && !S.last.near)) return;   // 너무 잦은 갱신 방지
    const alert = (changed && d <= 300) || (near && !S.last.near);
    const night = window.NightToilet?.isOn?.() && GRADE[t.g] ? ` · 밤: ${GRADE[t.g]}` : "";
    const mins = Math.max(1, Math.round(d / 1000 * PACE / 60));
    show(`🚻 ${ahead ? "앞쪽" : "뒤쪽"} 화장실 ${fmt(d)}`, `${t.name || "공중화장실"} · 약 ${mins}분${night}`, alert);
    S.last = { k, near, bucket: b, at: now };
  }

  async function stop() {
    S.last = { k: null, near: false, bucket: null, at: 0 };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      (await reg?.getNotifications({ tag: TAG }) || []).forEach((n) => n.close());
    } catch (e) {}
  }

  // 달리기 시작 버튼을 누를 때(사용자가 직접 누른 순간) 알림 허용을 물어봄
  function hook() {
    for (const id of ["btnStart", "gpsRow"]) document.getElementById(id)?.addEventListener("click", ask, { capture: true });
    if (supported && Notification.permission === "granted") S.ok = true;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook); else hook();

  return { update, stop, ask };
})();
