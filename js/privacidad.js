/* ===== Modo privacidad: difumina montos ===== */
(function(){
  var KEY='libroGastos_privacy';
  function apply(on, persist){
    document.documentElement.classList.toggle('privacy', on);
    ['btnPrivacy','btnPrivacyFloat'].forEach(function(id){
      var b=document.getElementById(id); if(!b) return;
      b.setAttribute('aria-pressed', on?'true':'false');
      var t=on?'Mostrar montos':'Ocultar montos';
      b.title=t; if(id==='btnPrivacyFloat') b.setAttribute('aria-label',t);
    });
    var tx=document.getElementById('btnPrivacyTxt'); if(tx) tx.textContent=on?'Mostrar montos':'Ocultar montos';
    if(persist){ try{ localStorage.setItem(KEY,on?'1':'0'); }catch(_e){} }
  }
  function toggle(){ apply(!document.documentElement.classList.contains('privacy'), true); }
  ['btnPrivacy','btnPrivacyFloat'].forEach(function(id){ var b=document.getElementById(id); if(b) b.addEventListener('click',toggle); });
  apply(document.documentElement.classList.contains('privacy'), false);
})();
