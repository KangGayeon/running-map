// 앱 화면과 러닝 데이터는 저장해 두고(오프라인에서도 열림), 새 버전이 있으면 뒤에서 갱신
const CACHE = "running-navi-v1";
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // 배경지도 등 외부는 그대로
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request);
    const fresh = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
                                  .catch(() => cached);
    return cached || fresh;
  }));
});
