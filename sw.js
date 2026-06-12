const CACHE='fiskedex-v1';
const ASSETS=['/','/index.html','/manifest.webmanifest','/img/forside.jpg','/img/kat-f.jpg','/img/kat-k.jpg','/img/kat-b.jpg','/img/kat-h.jpg','/img/kat-m.jpg','/img/icon-192.png','/img/icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin) return; // Supabase/kart gaar rett paa nett
  e.respondWith(
    fetch(e.request).then(r=>{
      const cp=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,cp));
      return r;
    }).catch(()=>caches.match(e.request).then(m=>m||caches.match('/index.html')))
  );
});
