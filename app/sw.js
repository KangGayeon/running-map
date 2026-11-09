// 앱 화면은 항상 최신 버전을 먼저 받고(인터넷이 없으면 저장본),
// 러닝 데이터는 저장본을 바로 보여주면서 뒤에서 새 버전으로 갱신
const CACHE = "running-navi-v5";
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
