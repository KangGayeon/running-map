// 앱 화면은 항상 최신 버전을 먼저 받고(인터넷이 없으면 저장본),
// 러닝 데이터는 저장본을 바로 보여주면서 뒤에서 새 버전으로 갱신
const CACHE = "running-navi-v14";   // safety.js: 안심부스·신호 자료 없음 표시
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // 배경지도 등 외부는 그대로
  const isPage = e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/");
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request);
    const fresh = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; });
    if (isPage) return fresh.catch(() => cached);           // 화면: 최신 우선
    return cached || fresh.catch(() => cached);             // 데이터: 저장본 우선
  }));
});
// 워치·휴대폰에서 화장실 알림을 누르면 앱 화면으로 돌아감
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const c = list.find((w) => w.url.includes("/app/") && !w.url.includes("/watch/"));
    return c ? c.focus() : self.clients.openWindow(e.notification.data?.url || "./");
  }));
});
