/* Service Worker — Libro de Gastos
   Cachea la app (HTML, fuentes, SDK de Firebase) para que abra incluso sin
   conexión, después de haberla visitado al menos una vez con internet.

   IMPORTANTE: subí el número de versión de CACHE_NAME cada vez que publiques
   un cambio en la app. Es lo que hace que el navegador note que este archivo
   cambió y descargue la versión nueva en vez de seguir usando la vieja para
   siempre (clave en la app instalada desde Safari en el celular).
*/
var CACHE_NAME = 'libro-gastos-v27';

var DATA_CACHE = 'libro-gastos-data'; // copia de los recordatorios para avisar con la app cerrada (no se borra al actualizar)

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
      return Promise.all(keys.filter(function(k){ return k!==CACHE_NAME && k!==DATA_CACHE; }).map(function(k){ return caches.delete(k); }));
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

  // La API de cotización histórica (ArgentinaDatos) siempre trae la misma URL
  // pero su contenido cambia día a día: acá SÍ priorizamos la red (para no
  // quedarnos con datos viejos) y solo caemos al caché si no hay conexión.
  var url;
  try{ url = new URL(req.url); }catch(e){ url = null; }
  if(url && url.hostname === 'api.argentinadatos.com'){
    event.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req);
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
