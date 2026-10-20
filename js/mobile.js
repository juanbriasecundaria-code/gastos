/* ===================== MEJORAS MOBILE: barra, "Más", teclado, tabla por mes ===================== */
(function(){
  var root=document.documentElement;
  var isMobile=function(){return window.matchMedia('(max-width:860px)').matches;};

  /* --- título del header superior --- */
  var top=document.getElementById('mTopbar'), topTitle=document.getElementById('mTopbarTitle');
  function updTop(){
    if(!top) return;
    var h=document.querySelector('.view.active .view-title');
    if(h && topTitle.textContent!==h.textContent) topTitle.textContent=h.textContent;
    top.classList.toggle('show', window.scrollY>70);
  }
  window.addEventListener('scroll',updTop,{passive:true});

  /* --- hoja "Más" --- */
  var moreBtn=document.getElementById('btnNavMore'), sheet=document.getElementById('moreSheet'), back=document.getElementById('moreBackdrop');
  var burger=document.getElementById('btnMobileMenu');
  function mkItem(label,svgSrc,onClick,tab){
    var b=document.createElement('button'); b.type='button'; b.setAttribute('role','menuitem');
    if(tab) b.dataset.moreTab=tab;
    if(svgSrc) b.appendChild(svgSrc.cloneNode(true));
    var sp=document.createElement('span'); sp.textContent=label; b.appendChild(sp);
    b.addEventListener('click',onClick); return b;
  }
  function closeMore(){ if(!sheet) return; sheet.classList.remove('open'); back.classList.remove('open'); moreBtn.setAttribute('aria-expanded','false'); }
  function openMore(){ sheet.classList.add('open'); back.classList.add('open'); moreBtn.setAttribute('aria-expanded','true'); syncMore(); }
  function syncMore(){
    var v=document.querySelector('.view.active'); var id=v?v.id.replace('view-',''):'';
    var inMore=(id==='dolar'||id==='inversion');
    if(moreBtn) moreBtn.classList.toggle('active',inMore);
    if(sheet) sheet.querySelectorAll('[data-more-tab]').forEach(function(b){b.classList.toggle('active',b.dataset.moreTab===id);});
  }
  if(moreBtn && sheet && back){
    [['Dólar','dolar'],['Inversión','inversion']].forEach(function(t){
      var ic=document.querySelector('.bottom-nav .nav-btn[data-tab="'+t[1]+'"] .bn-icon svg');
      sheet.appendChild(mkItem(t[0],ic,function(){ closeMore(); var nb=document.querySelector('.bottom-nav .nav-btn[data-tab="'+t[1]+'"]'); if(nb) nb.click(); setTimeout(function(){syncMore();updTop();},0); },t[1]));
    });
    var menuIc=document.querySelector('#btnMobileMenu svg');
    sheet.appendChild(mkItem('Menú completo',menuIc,function(){ closeMore(); if(burger) burger.click(); }));
    moreBtn.addEventListener('click',function(){ sheet.classList.contains('open')?closeMore():openMore(); });
    back.addEventListener('click',closeMore);
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeMore(); });
  }
  document.querySelectorAll('.nav-btn[data-tab]').forEach(function(b){
    b.addEventListener('click',function(){ closeMore(); setTimeout(function(){syncMore();updTop();window.scrollTo(0,0);},0); });
  });
  syncMore(); updTop();

  /* --- ocultar barra con teclado abierto --- */
  var kbTimer=null;
  function isField(el){ return el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(el.type||''); }
  function setKb(on){ root.classList.toggle('kb-open',!!on && isMobile()); }
  document.addEventListener('focusin',function(e){ if(isField(e.target)){ clearTimeout(kbTimer); setKb(true); } });
  document.addEventListener('focusout',function(){ clearTimeout(kbTimer); kbTimer=setTimeout(function(){ if(!isField(document.activeElement)) setKb(false); },120); });
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',function(){
      var shrunk=(window.innerHeight-window.visualViewport.height)>140;
      if(shrunk) setKb(true); else if(!isField(document.activeElement)) setKb(false);
    });
  }

  /* --- menú ⋯ del header del Resumen --- */
  var mb=document.getElementById('btnResumenMore');
  if(mb){
    var box=mb.parentNode;
    mb.addEventListener('click',function(e){ e.stopPropagation(); var o=box.classList.toggle('more-open'); mb.setAttribute('aria-expanded',o?'true':'false'); });
    document.addEventListener('click',function(){ box.classList.remove('more-open'); mb.setAttribute('aria-expanded','false'); });
  }

  /* --- tabla del Resumen: selector de mes (mobile) --- */
  var table=document.getElementById('pivotTable');
  var NAMES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  if(table){
    var wrap=table.parentNode, bar=document.createElement('div');
    bar.className='pivot-monthbar no-print'; bar.id='pivotMonthBar'; bar.setAttribute('role','tablist');
    wrap.parentNode.insertBefore(bar,wrap);
    var sel='all';
    sel=String(new Date().getMonth());
    function paint(){
      table.dataset.m=sel;
      bar.querySelectorAll('.pm-chip').forEach(function(c){
        var on=c.dataset.m===sel; c.classList.toggle('active',on); c.setAttribute('aria-selected',on?'true':'false');
      });
    }
    NAMES.forEach(function(m,i){
      var c=document.createElement('button'); c.type='button'; c.className='pm-chip'; c.dataset.m=String(i); c.setAttribute('role','tab'); c.textContent=m; bar.appendChild(c);
    });
    var all=document.createElement('button'); all.type='button'; all.className='pm-chip'; all.dataset.m='all'; all.setAttribute('role','tab'); all.textContent='Año'; bar.appendChild(all);
    bar.addEventListener('click',function(e){
      var c=e.target.closest('.pm-chip'); if(!c) return; sel=c.dataset.m; paint();
      c.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});
    });
    paint();
    var act=bar.querySelector('.pm-chip.active'); if(act && isMobile()) bar.scrollLeft=Math.max(0,act.offsetLeft-bar.clientWidth/2+act.offsetWidth/2);
  }
})();
