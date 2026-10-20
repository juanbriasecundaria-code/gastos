if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js').then(function(reg){
      // Busca una versión nueva del Service Worker al abrir la app y cada vez
      // que vuelve a primer plano (clave para la app instalada en el celular,
      // que si no se le pide, puede quedarse con una copia vieja indefinidamente).
      reg.update();
      document.addEventListener('visibilitychange', function(){
        if(document.visibilityState === 'visible') reg.update();
      });
    }).catch(function(err){
      console.warn('No se pudo registrar el service worker (la app sigue funcionando igual):', err);
    });
    // Cuando el nuevo Service Worker toma el control, recargamos una sola vez
    // para que los cambios se vean solos, sin tener que borrar y reinstalar la app.
    var recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      if(recargando) return;
      recargando = true;
      window.location.reload();
    });
  });
}

/* ===== Botón "Instalar app" =====
   - Android / Chrome / Edge (escritorio): usa el evento beforeinstallprompt.
   - iPhone / iPad: Safari no tiene ese evento, así que mostramos cómo hacerlo a mano.
   - Si la app ya está instalada (modo standalone) el botón no aparece. */
(function(){
  'use strict';
  var group = document.getElementById('installGroup');
  var btn = document.getElementById('btnInstallApp');
  if(!group || !btn) return;
  var deferred = null;

  function isStandalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }
  function isIOS(){
    var ua = navigator.userAgent || '';
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function refresh(){
    var visible = !isStandalone() && (!!deferred || isIOS());
    group.style.display = visible ? '' : 'none';
  }

  function showIosHelp(){
    var prev = document.activeElement;
    var ov = document.createElement('div');
    ov.className = 'account-overlay open';
    var box = document.createElement('div');
    box.className = 'account-box confirm-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    var h = document.createElement('h3');
    h.textContent = 'Instalar MiBudget'; h.style.marginBottom = '10px';
    box.appendChild(h);
    ['En iPhone o iPad: tocá el botón Compartir de Safari (el cuadrado con la flecha hacia arriba).',
     'Después elegí «Agregar a inicio» y confirmá.'].forEach(function(t){
      var p = document.createElement('p'); p.textContent = t; box.appendChild(p);
    });
    var actions = document.createElement('div'); actions.className = 'confirm-actions';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn'; ok.textContent = 'Entendido';
    actions.appendChild(ok); box.appendChild(actions);
    ov.appendChild(box); document.body.appendChild(ov);
    function close(){
      document.removeEventListener('keydown', onKey, true);
      ov.remove();
      if(prev && prev.focus) prev.focus();
    }
    function onKey(e){ if(e.key === 'Escape'){ e.preventDefault(); close(); } }
    document.addEventListener('keydown', onKey, true);
    ok.addEventListener('click', close);
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    ok.focus();
  }

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();          // evitamos el mini-aviso automático y usamos nuestro botón
    deferred = e;
    refresh();
  });
  window.addEventListener('appinstalled', function(){ deferred = null; refresh(); });
  if(window.matchMedia){
    var mq = window.matchMedia('(display-mode: standalone)');
    if(mq.addEventListener) mq.addEventListener('change', refresh);
    else if(mq.addListener) mq.addListener(refresh);
  }

  btn.addEventListener('click', function(){
    if(deferred){
      var p = deferred; deferred = null;
      group.style.display = 'none';
      p.prompt();
      if(p.userChoice && p.userChoice.catch) p.userChoice.catch(function(){});
      return;
    }
    if(isIOS()) showIosHelp();
  });

  refresh();
})();
