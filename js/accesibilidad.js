/* ===== Accesibilidad: modales, gráficos, etiquetas, movimiento reducido ===== */
(function(){
  var FOC='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function vis(el){ return el.getClientRects().length>0; }
  /* 1) Modales: role, aria-modal, foco atrapado y devuelto */
  var lastOutside=null;
  document.addEventListener('focusin',function(e){
    if(!e.target.closest || !e.target.closest('.account-overlay.open,.search-overlay.open')) lastOutside=e.target;
  },true);
  [['presupuestosOverlay','Presupuestos'],['reglasOverlay','Reglas'],['recoOverlay','Recordatorios'],['accountOverlay','Cuenta'],['shareOverlay','Compartir'],['searchOverlay','Búsqueda']].forEach(function(sp){
    var ov=document.getElementById(sp[0]); if(!ov) return;
    var box=ov.querySelector('.account-box,.search-box')||ov.firstElementChild||ov;
    box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true'); box.setAttribute('tabindex','-1');
    var h=box.querySelector('h1,h2,h3');
    if(h){ if(!h.id) h.id=sp[0]+'Title'; box.setAttribute('aria-labelledby',h.id); } else box.setAttribute('aria-label',sp[1]);
    var saved=null, was=false;
    new MutationObserver(function(){
      var open=ov.classList.contains('open');
      if(open && !was){
        saved=lastOutside||document.activeElement;
        setTimeout(function(){ if(!box.contains(document.activeElement)){ var f=[].filter.call(box.querySelectorAll(FOC),vis)[0]; (f||box).focus(); } },40);
      }
      if(!open && was){ var t=saved; saved=null; setTimeout(function(){ if(t && document.contains(t) && t.focus) t.focus(); },0); }
      was=open;
    }).observe(ov,{attributes:true,attributeFilter:['class']});
    ov.addEventListener('keydown',function(e){
      if(e.key!=='Tab' || !ov.classList.contains('open')) return;
      var f=[].filter.call(box.querySelectorAll(FOC),vis);
      if(!f.length){ e.preventDefault(); box.focus(); return; }
      var a=f[0], z=f[f.length-1], cur=document.activeElement;
      if(e.shiftKey && (cur===a || !box.contains(cur) || cur===box)){ e.preventDefault(); z.focus(); }
      else if(!e.shiftKey && cur===z){ e.preventDefault(); a.focus(); }
    });
  });

  /* 1b) Modales creados desde JS (confirmar, pedir texto, gasto rápido, importar extracto…): nombre accesible,
         foco inicial y foco atrapado. Los que ya manejan su propio Tab no se pisan (e.defaultPrevented). */
  var dlgN=0;
  function enhanceDynamicModal(ov){
    if(ov.getAttribute('data-a11y-dlg')) return; ov.setAttribute('data-a11y-dlg','1');
    var box=ov.querySelector('.account-box,.search-box')||ov.firstElementChild; if(!box) return;
    if(!box.getAttribute('role')) box.setAttribute('role','dialog');
    box.setAttribute('aria-modal','true');
    if(!box.hasAttribute('tabindex')) box.setAttribute('tabindex','-1');
    if(!box.hasAttribute('aria-labelledby') && !box.hasAttribute('aria-label')){
      var h=box.querySelector('h1,h2,h3');
      if(h){ if(!h.id) h.id='a11yDlgTitle'+(++dlgN); box.setAttribute('aria-labelledby',h.id); }
    }
    setTimeout(function(){
      if(!document.contains(box) || box.contains(document.activeElement)) return;
      var f=[].filter.call(box.querySelectorAll(FOC),vis)[0]; (f||box).focus();
    },40);
    ov.addEventListener('keydown',function(e){
      if(e.key!=='Tab' || e.defaultPrevented) return;
      var f=[].filter.call(box.querySelectorAll(FOC),vis);
      if(!f.length){ e.preventDefault(); box.focus(); return; }
      var first=f[0], last=f[f.length-1], cur=document.activeElement;
      if(e.shiftKey && (cur===first || !box.contains(cur) || cur===box)){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && cur===last){ e.preventDefault(); first.focus(); }
    });
  }
  new MutationObserver(function(muts){
    muts.forEach(function(m){ [].forEach.call(m.addedNodes,function(n){
      if(n.nodeType===1 && n.classList.contains('account-overlay') && !n.id) enhanceDynamicModal(n);
    }); });
  }).observe(document.body,{childList:true});

  /* 1c) Encabezados desplegables que solo respondían al mouse:
         - tarjetas de Gráficos: el título pasa a ser un <button> real (Enter/Espacio nativos) con aria-expanded;
         - grupos por mes de Gastos/Ingresos: role=button + teclado, y el foco vuelve al encabezado tras redibujar. */
  function discPass(){
    document.querySelectorAll('#view-graficos [data-chart-toggle]').forEach(function(head){
      var h=head.querySelector('h3'); if(!h || h.querySelector('button.a11y-disc')) return;
      var btn=document.createElement('button'); btn.type='button'; btn.className='a11y-disc';
      while(h.firstChild) btn.appendChild(h.firstChild);
      var chev=btn.querySelector('.grp-chevron'); if(chev) chev.setAttribute('aria-hidden','true');
      h.appendChild(btn);
    });
    document.querySelectorAll('.month-group-head').forEach(function(h){
      h.setAttribute('role','button'); h.setAttribute('tabindex','0');
      h.setAttribute('aria-expanded', h.classList.contains('is-collapsed') ? 'false' : 'true');
    });
    syncDisc();
  }
  function syncDisc(){
    document.querySelectorAll('#view-graficos [data-chart-toggle]').forEach(function(head){
      var b=head.querySelector('button.a11y-disc'), card=head.closest('.chart-card'); if(!b||!card) return;
      var v=card.classList.contains('collapsed') ? 'false' : 'true';
      if(b.getAttribute('aria-expanded')!==v) b.setAttribute('aria-expanded',v);
    });
  }
  var gv=document.getElementById('view-graficos');
  if(gv) new MutationObserver(syncDisc).observe(gv,{attributes:true,attributeFilter:['class'],subtree:true});
  document.addEventListener('keydown',function(e){
    var h=e.target.closest && e.target.closest('.month-group-head');
    if(!h || e.target!==h || (e.key!=='Enter' && e.key!==' ')) return;
    e.preventDefault();
    var sec=h.getAttribute('data-sec'), mes=h.getAttribute('data-mes');
    h.click();
    requestAnimationFrame(function(){   // la lista se redibuja entera: se devuelve el foco al mismo encabezado
      var n=document.querySelector('.month-group-head[data-sec="'+sec+'"][data-mes="'+mes+'"]');
      if(n){ n.setAttribute('tabindex','0'); if(document.activeElement!==n) n.focus(); }
    });
  });

  /* 2) Etiquetas asociadas a sus campos */
  var uidN=0;
  function labelsPass(){
    document.querySelectorAll('label:not([for])').forEach(function(l){
      if(l.querySelector('input,select,textarea') || !l.parentElement) return;
      var c=[].filter.call(l.parentElement.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea'),function(x){
        return l.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING;
      })[0];
      if(!c) return;
      if(!c.id) c.id='a11y_f'+(++uidN);
      l.setAttribute('for',c.id);
    });
    document.querySelectorAll('input,select,textarea').forEach(function(c){
      if(c.type==='hidden' || c.hidden || c.getAttribute('aria-hidden')==='true' || c.hasAttribute('aria-label') || c.hasAttribute('aria-labelledby') || c.closest('label')) return;
      if(c.id && document.querySelector('label[for="'+c.id+'"]')) return;
      var t=c.getAttribute('title')||c.getAttribute('placeholder')||(c.tagName==='SELECT' && c.options[0] ? c.options[0].text : '');
      if(t) c.setAttribute('aria-label',t);
    });
  }

  /* 3) Gráficos: texto alternativo, teclado y patrón para el color violeta */
  var pid=0;
  function chartsPass(){
    document.querySelectorAll('#view-graficos svg[viewBox],#view-resumen svg[viewBox],#view-inversion svg[viewBox]').forEach(function(svg){
      if(svg.classList.contains('icon') || svg.closest('button') || svg.getAttribute('data-a11y')) return;
      svg.setAttribute('data-a11y','1');
      var card=svg.closest('.chart-card,.form-card,section,.view');
      var h=card && card.querySelector('h3,h2,.view-title');
      var title=(svg.getAttribute('aria-label')||(h?h.textContent.trim():'Gráfico'));
      var tips=svg.querySelectorAll('[data-tip]');
      if(tips.length){ svg.setAttribute('role','group'); svg.setAttribute('aria-label',title+'. Usá las flechas para recorrer los '+tips.length+' datos.'); }
      else if(!svg.getAttribute('role')){ svg.setAttribute('role','img'); svg.setAttribute('aria-label',title); }
      /* patrón de rayas sobre lo violeta (variable), para no depender solo del color */
      var vio=[].filter.call(svg.querySelectorAll('rect'),function(r){
        var f=(r.getAttribute('fill')||'').toUpperCase();
        return !r.closest('defs') && !r.hasAttribute('data-a11y-clone') && (f==='#B47EF5' || f==='URL(#GBAR_B47EF5)' || f.indexOf('B47EF5')!==-1 && f.indexOf('URL')===0);
      });
      if(vio.length){
        var ns='http://www.w3.org/2000/svg', id='a11yStripe'+(++pid);
        var defs=svg.querySelector('defs'); if(!defs){ defs=document.createElementNS(ns,'defs'); svg.insertBefore(defs,svg.firstChild); }
        var pat=document.createElementNS(ns,'pattern');
        pat.setAttribute('id',id); pat.setAttribute('width','6'); pat.setAttribute('height','6'); pat.setAttribute('patternUnits','userSpaceOnUse'); pat.setAttribute('patternTransform','rotate(45)');
        pat.innerHTML='<rect width="2.5" height="6" fill="rgba(0,0,0,.35)"/>';
        defs.appendChild(pat);
        vio.forEach(function(r){
          var c=r.cloneNode(false);
          ['data-tip','tabindex','role','aria-label','class','style'].forEach(function(a){ c.removeAttribute(a); });
          c.setAttribute('fill','url(#'+id+')'); c.setAttribute('pointer-events','none'); c.setAttribute('aria-hidden','true'); c.setAttribute('data-a11y-clone','1');
          r.parentNode.insertBefore(c,r.nextSibling);
        });
      }
    });
    /* elementos con tooltip: foco por teclado (un solo tab stop por gráfico) y nombre accesible */
    var seen=[];
    document.querySelectorAll('#view-graficos [data-tip],#view-resumen [data-tip],#view-inversion [data-tip]').forEach(function(el){
      if(el.hasAttribute('data-a11y-tip')) return;
      el.setAttribute('data-a11y-tip','1');
      var g=el.closest('svg,table,.chart-card')||document.body;
      el.setAttribute('tabindex', seen.indexOf(g)===-1 && !g.querySelector('[data-a11y-first]') ? '0' : '-1');
      if(el.getAttribute('tabindex')==='0'){ el.setAttribute('data-a11y-first','1'); seen.push(g); }
      el.setAttribute('aria-label',el.getAttribute('data-tip'));
      if(el.namespaceURI==='http://www.w3.org/2000/svg' || el.tagName==='DIV') el.setAttribute('role','img');
    });
  }
  var tipEl=function(){ return document.querySelector('.chart-tooltip'); };
  document.addEventListener('focusin',function(e){
    var t=e.target.closest && e.target.closest('[data-tip][tabindex]'), tip=tipEl(); if(!t||!tip) return;
    var r=t.getBoundingClientRect();
    tip.textContent=t.getAttribute('data-tip'); tip.style.left=(r.left+r.width/2)+'px'; tip.style.top=(r.top-10)+'px'; tip.classList.add('show');
  });
  document.addEventListener('focusout',function(e){
    if(e.target.closest && e.target.closest('[data-tip][tabindex]')){ var tip=tipEl(); if(tip) tip.classList.remove('show'); }
  });
  document.addEventListener('keydown',function(e){
    var t=e.target.closest && e.target.closest('[data-tip][tabindex]'); if(!t) return;
    if(e.key==='Escape'){ var tp=tipEl(); if(tp) tp.classList.remove('show'); return; }
    var d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];
    var g=t.closest('svg,table,.chart-card')||document.body;
    var items=[].slice.call(g.querySelectorAll('[data-tip][tabindex]')), i=items.indexOf(t), n;
    if(e.key==='Home') n=0; else if(e.key==='End') n=items.length-1; else if(d) n=Math.max(0,Math.min(items.length-1,i+d)); else return;
    e.preventDefault();
    items.forEach(function(x){ x.setAttribute('tabindex','-1'); });
    items[n].setAttribute('tabindex','0'); items[n].focus();
  });

  /* 4) Movimiento reducido también para el scroll suave por JS */
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){
    var orig=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(a){ if(a && typeof a==='object') a=Object.assign({},a,{behavior:'auto'}); return orig.call(this,a); };
  }

  /* Pasadas iniciales y tras cada re-render */
  var obs, queued=false;
  function pass(){ queued=false; obs.disconnect(); try{ labelsPass(); chartsPass(); discPass(); }catch(_e){} obs.observe(document.body,{childList:true,subtree:true}); }
  obs=new MutationObserver(function(){ if(!queued){ queued=true; requestAnimationFrame(pass); } });
  pass();
})();
