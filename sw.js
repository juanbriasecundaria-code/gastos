/* Service Worker — MiBudget / Libro de Gastos
   Deja la app disponible sin conexión (después de abrirla una vez con internet)
   y avisa de los recordatorios de pago con la app cerrada.

   VERSIÓN: la línea CACHE_NAME y la lista APP_SHELL las actualiza sola la herramienta
   `python tools/stamp-sw.py` (ejecutala antes de publicar). Si te olvidás, no pasa nada
   grave: los archivos propios de la app se piden primero a la red, así que siempre se
   ve la última versión cuando hay conexión; la versión solo sirve para limpiar cachés viejas.
*/
var CACHE_NAME = 'libro-gastos-09c5296609';

var DATA_CACHE = 'libro-gastos-data'; // copia de los recordatorios para avisar con la app cerrada (no se borra al actualizar)

/* APP_SHELL_START */
var APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/accesibilidad.js',
  'js/app.js',
  'js/firebase-config.js',
  'js/i18n.js',
  'js/mobile.js',
  'js/privacidad.js',
  'js/pwa.js',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'splash/iphone-1125x2436.png',
  'splash/iphone-1170x2532.png',
  'splash/iphone-1179x2556.png',
  'splash/iphone-1242x2688.png',
  'splash/iphone-1284x2778.png',
  'splash/iphone-1290x2796.png',
  'splash/iphone-750x1334.png',
  'splash/iphone-828x1792.png'
];
/* APP_SHELL_END */

var PRECACHE_THIRD_PARTY = [
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js'
];

// Únicos orígenes externos que se guardan en caché (fuentes y SDK de Firebase).
// Todo lo demás (Firestore, Auth, etc.) pasa directo a la red sin tocarlo.
var CACHEABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

// Si la red tarda más que esto y hay copia guardada, se usa la copia.
var NETWORK_TIMEOUT_MS = 4000;

function addSafely(cache, url){
  return cache.add(url).catch(function(err){
    console.warn('[SW] No se pudo precachear', url, err);
  });
}

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(APP_SHELL.concat(PRECACHE_THIRD_PARTY).map(function(url){
        return addSafely(cache, url);
      }));
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME && k !== DATA_CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function storable(res){
  return res && (res.ok || res.type === 'opaque');
}

// Red primero (para traer cambios), con copia guardada como respaldo.
function networkFirst(req, matchOpts){
  return caches.open(CACHE_NAME).then(function(cache){
    return cache.match(req, matchOpts).then(function(cached){
      var net = fetch(req).then(function(res){
        if(storable(res)){ var copy = res.clone(); cache.put(req, copy); }
        return res;
      });
      if(!cached) return net;
      return new Promise(function(resolve){
        var done = false;
        var timer = setTimeout(function(){ if(!done){ done = true; resolve(cached); } }, NETWORK_TIMEOUT_MS);
        net.then(function(res){ if(!done){ done = true; clearTimeout(timer); resolve(res); } },
                 function(){ if(!done){ done = true; clearTimeout(timer); resolve(cached); } });
      });
    });
  });
}

// Caché primero, y si no está se busca en la red y se guarda (fuentes, SDK).
function cacheFirst(req){
  return caches.match(req).then(function(cached){
    if(cached) return cached;
    return fetch(req).then(function(res){
      if(storable(res)){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
      }
      return res;
    });
  });
}

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;

  var url;
  try{ url = new URL(req.url); }catch(e){ return; }

  var isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') && req.headers.get('accept').indexOf('text/html') !== -1);

  // Páginas: red primero; sin conexión, la última copia (aunque la URL traiga ?tab=...).
  if(isNavigation && url.origin === self.location.origin){
    event.respondWith(
      networkFirst(req, { ignoreSearch: true }).catch(function(){
        return caches.match('./index.html').then(function(c){ return c || caches.match('./'); });
      })
    );
    return;
  }

  // Archivos propios (CSS, JS, íconos, manifest): red primero, así nunca quedan viejos.
  if(url.origin === self.location.origin){
    event.respondWith(networkFirst(req));
    return;
  }

  // La cotización histórica cambia día a día con la misma URL: red primero.
  if(url.hostname === 'api.argentinadatos.com'){
    event.respondWith(networkFirst(req).catch(function(){ return caches.match(req); }));
    return;
  }

  // Fuentes y SDK de Firebase: caché primero.
  if(CACHEABLE_HOSTS.indexOf(url.hostname) !== -1){
    event.respondWith(cacheFirst(req));
    return;
  }
  // Cualquier otro origen: lo maneja el navegador.
});

/* ===== Recordatorios de vencimiento: notificaciones con la app cerrada =====
   Funciona solo donde el navegador permite Periodic Background Sync (Chrome en Android con la app
   instalada y el permiso de notificaciones); la frecuencia la decide el navegador. */
function recoPad(n){ return String(n).padStart(2,'0'); }
function recoCuando(left){
  if(left<0) return 'Venció hace '+(-left)+(left===-1?' día':' días');
  if(left===0) return 'Vence hoy';
  if(left===1) return 'Vence mañana';
  return 'Vence en '+left+' días';
}
function recoCheck(){
  return caches.open(DATA_CACHE).then(function(cache){
    return Promise.all([cache.match('__reco.json'), cache.match('__reco-notif.json')]).then(function(rs){
      if(!rs[0]) return;
      return Promise.all([rs[0].json(), rs[1] ? rs[1].json() : {}]).then(function(vals){
        var snap = vals[0] || {}, notif = vals[1] || {};
        var now = new Date(), h0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var hoy = h0.getFullYear()+'-'+recoPad(h0.getMonth()+1)+'-'+recoPad(h0.getDate());
        var jobs = [];
        (snap.items || []).forEach(function(r){
          for(var k=0;k<2;k++){
            var d0 = new Date(h0.getFullYear(), h0.getMonth()+k, 1), y = d0.getFullYear(), m = d0.getMonth();
            var last = new Date(y, m+1, 0).getDate();
            var due = new Date(y, m, Math.min(r.dia||1, last));
            var left = Math.round((due-h0)/86400000);
            if(left > (r.antes||0) || left < -10) continue;
            var key = y+'-'+recoPad(m+1);
            if(r.paid && r.paid[key]) continue;
            var tag = 'reco-'+r.id+'-'+key;
            if(notif[tag] !== hoy){
              notif[tag] = hoy;
              jobs.push(self.registration.showNotification('Acordate de pagar: '+r.nombre, {
                body: recoCuando(left)+' (día '+recoPad(due.getDate())+'/'+recoPad(due.getMonth()+1)+')',
                tag: tag, data: {url: './'}
              }));
            }
            break;
          }
        });
        var ks = Object.keys(notif);
        if(ks.length > 150) ks.slice(0, ks.length-150).forEach(function(k){ delete notif[k]; });
        return Promise.all(jobs).then(function(){
          return cache.put('__reco-notif.json', new Response(JSON.stringify(notif), {headers:{'Content-Type':'application/json'}}));
        });
      });
    });
  }).catch(function(err){ console.warn('[SW] recordatorios:', err); });
}
self.addEventListener('periodicsync', function(event){
  if(event.tag === 'reco-check') event.waitUntil(recoCheck());
});
self.addEventListener('notificationclick', function(event){
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){ if('focus' in list[i]) return list[i].focus(); }
    if(self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
