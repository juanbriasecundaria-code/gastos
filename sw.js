/* Service Worker — Libro de Gastos
   Cachea la app (HTML, fuentes, SDK de Firebase) para que abra incluso sin
   conexión, después de haberla visitado al menos una vez con internet.
*/
var CACHE_NAME = 'libro-gastos-v1';

var PRECACHE_URLS = [
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(PRECACHE_URLS.map(function(url){
        return cache.add(url).catch(function(err){
          console.warn('[SW] No se pudo precachear', url, err);
        });
      }));
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;

  var isNavigation = req.mode === 'navigate' ||
    (req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').indexOf('text/html') !== -1);

  if(isNavigation){
    // Para el HTML: intentamos la red primero (para traer cambios nuevos),
    // y si no hay conexión, servimos la última copia guardada.
    event.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          return cached || caches.match('./');
        });
      })
    );
    return;
  }

  // Para todo lo demás (fuentes, SDK de Firebase, etc.): caché primero,
  // y si no está, se busca en la red y se guarda para la próxima vez.
  event.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        return res;
      }).catch(function(){ return cached; });
    })
  );
});
