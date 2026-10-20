(function(){
"use strict";

function startApp(preloadedStore, cloudMode, cloudUid){

var MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
var CAT_FIJAS = ["Alquiler","Expensas","Gas","Luz","Cable e internet","Celular","Suscripciones mensuales","Impuestos","Obra Social / Prepaga","Seguro","Transporte","Cuotas Tarjeta de Crédito","Universidad","Otros egresos"];
var CAT_VARIABLES = ["Alimentación","Salidas / Entretenimiento","Ropa","Compras","Regalos","Bebidas","Vacaciones","Futbol","Créditos","Transferencias hacia","Universidad","Suscripción","Servicios","Otros"];
var STORAGE_KEY = "libroGastos_v2";
var LEGACY_KEY = "libroGastos_v1";
var DEFAULT_YEAR = "2026";
function cloudCacheKey(){ return STORAGE_KEY+'_cloud_'+cloudUid; }

var collapsedGroups = new Set();
var ICON_EDIT='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
var ICON_DEL='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
var ICON_CHEV='<svg class="icon chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

function isActiveYearCurrent(){
  return parseInt(STORE.activeEjercicio,10) === new Date().getFullYear();
}
function currentMonthIdxForDisplay(){
  return isActiveYearCurrent() ? new Date().getMonth() : -1;
}
function resetCollapsedForActiveYear(){
  collapsedGroups.clear();
  var yearNum = parseInt(STORE.activeEjercicio, 10);
  var nowYear = new Date().getFullYear();
  var nowMonth = new Date().getMonth();
  ['ingresos','gastos','dolar','inversion'].forEach(function(sec){
    MESES.forEach(function(m, idx){
      var shouldCollapse;
      if(yearNum < nowYear) shouldCollapse = true;
      else if(yearNum > nowYear) shouldCollapse = false;
      else shouldCollapse = idx < nowMonth;
      if(shouldCollapse) collapsedGroups.add(sec+'-'+m);
    });
  });
}

var fmt = new Intl.NumberFormat('es-AR', {maximumFractionDigits:0});
var fmtDec = new Intl.NumberFormat('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});

function money(n){
  if(n===null || n===undefined || isNaN(n)) return "-";
  var neg = n < 0;
  var s = "$" + fmt.format(Math.abs(Math.round(n)));
  return neg ? "-"+s : s;
}
function usd(n){
  if(n===null || n===undefined || isNaN(n)) return "-";
  return "US$" + fmtDec.format(n);
}
function fmtCot(n){
  n = +n || 0;
  return '$' + (Math.abs(n - Math.round(n)) < 0.005 ? fmt.format(Math.round(n)) : fmtDec.format(n));
}
function usdDetailHtml(it){
  if(it.cant===null || it.cant===undefined) return '<span class="usd-gasto">Carga manual</span>';
  return '<span class="usd-gasto">'+money(it.cant)+'<em>gastados</em></span>'+
    '<small class="usd-cot"><span class="cot-lbl">Cotización</span><span class="cot-chip">'+fmtCot(it.valor)+'</span></small>';
}
function uid(prefix){ return prefix + "_" + Math.random().toString(36).slice(2,9); }
function currentAutor(){ return window.__gastosCurrentUsername || null; }
function esSoloLectura(){ return window.__gastosCurrentRol === 'lector'; }

/* ===================== FECHAS (helpers) ===================== */
// Parsea un string "YYYY-MM-DD" (el que devuelve un <input type="date">) como fecha
// LOCAL, evitando el corrimiento de un día que da "new Date('YYYY-MM-DD')" por UTC.
function parseFechaLocal(str){
  if(!str) return null;
  var partes = str.split('-');
  if(partes.length !== 3) return null;
  var y = parseInt(partes[0],10), m = parseInt(partes[1],10), d = parseInt(partes[2],10);
  if(isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m-1, d);
}
function formatFechaISO(date){
  var y = date.getFullYear();
  var m = String(date.getMonth()+1).padStart(2,'0');
  var d = String(date.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+d;
}
function formatFechaCorta(str){
  var d = parseFechaLocal(str);
  if(!d) return '';
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
}

/* ===================== MONEY INPUT (formato de miles + fórmulas de suma) ===================== */
function formatSingleMoneyTerm(raw){
  raw = String(raw||'').replace(/\./g,'');
  var parts = raw.split(',');
  var intPart = parts[0].replace(/[^\d]/g,'');
  var decPart = parts.length>1 ? parts[1].replace(/[^\d]/g,'').slice(0,2) : null;
  intPart = intPart.replace(/^0+(?=\d)/,'');
  var withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return withDots + (decPart!==null ? ','+decPart : (raw.indexOf(',')!==-1 ? ',' : ''));
}
function parseMoneyValue(str){
  if(str===null || str===undefined) return NaN;
  str = String(str).replace(/\s+/g,'');
  if(str==='') return NaN;
  // Fórmulas con + - * / (sin eval). Ej: "45000/3", "1500,50*2+200"
  var pos = 0;
  function num(){
    var m = /^[\d.,]+/.exec(str.slice(pos));
    if(!m) return NaN;
    pos += m[0].length;
    return parseFloat(m[0].replace(/\./g,'').replace(',', '.'));
  }
  function factor(){
    var sign = 1;
    while(str[pos]==='+' || str[pos]==='-'){ if(str[pos]==='-') sign = -sign; pos++; }
    return sign*num();
  }
  function term(){
    var v = factor();
    while(str[pos]==='*' || str[pos]==='/'){
      var op = str[pos++], r = factor();
      if(op==='*') v *= r; else { if(r===0) return NaN; v /= r; }
    }
    return v;
  }
  var res = term();
  while(str[pos]==='+' || str[pos]==='-'){
    var op = str[pos++], r = term();
    res = (op==='+') ? res + r : res - r;
  }
  if(pos!==str.length || !isFinite(res)) return NaN;
  return Math.round(res*100)/100;
}
function hasMoneyFormula(str){
  str = String(str||'');
  return /[+\-*\/]/.test(str.slice(1)) || (str.length && (str[0]==='+'));
}
function formatMoneyLive(raw){
  raw = String(raw||'');
  var parts = raw.split(/([+\-*\/])/);
  return parts.map(function(p){
    return (p==='+'||p==='-'||p==='*'||p==='/') ? p : formatSingleMoneyTerm(p);
  }).join('');
}
function countDigits(str){ return (String(str).match(/[\d,+\-*\/]/g)||[]).length; }
function setCaretByDigitCount(el, formatted, digitCount){
  var count=0, pos=formatted.length;
  if(digitCount<=0){ el.setSelectionRange(0,0); return; }
  for(var i=0;i<formatted.length;i++){
    if(/[\d,+\-*\/]/.test(formatted[i])) count++;
    if(count>=digitCount){ pos=i+1; break; }
  }
  el.setSelectionRange(pos,pos);
}
function attachMoneyInput(el, previewEl){
  if(!el) return;
  function refreshPreview(){
    if(!previewEl) return;
    if(!hasMoneyFormula(el.value)){
      previewEl.style.display = 'none';
      previewEl.textContent = '';
      return;
    }
    var sum = parseMoneyValue(el.value);
    if(isNaN(sum)){
      previewEl.style.display = 'none';
      previewEl.textContent = '';
      return;
    }
    previewEl.style.display = 'block';
    previewEl.textContent = '= '+money(sum);
  }
  el.addEventListener('input', function(){
    var cursorPos = el.selectionStart;
    var digitsBefore = countDigits(el.value.slice(0,cursorPos));
    var formatted = formatMoneyLive(el.value);
    el.value = formatted;
    setCaretByDigitCount(el, formatted, digitsBefore);
    refreshPreview();
  });
  refreshPreview();
}
function setMoneyInputValue(el, num){
  if(!el) return;
  if(num===null || num===undefined || isNaN(num)){ el.value=''; return; }
  var str = String(Math.round(num*100)/100).replace('.', ',');
  el.value = formatMoneyLive(str);
}


/* ===================== DATA ===================== */
var seed = JSON.parse(document.getElementById('seedData').textContent);

function normalizeExercise(data){
  if(!data) data = {};
  if(!data.ingresos) data.ingresos = [];
  if(!data.gastos) data.gastos = [];
  if(!data.dolar) data.dolar = [];
  if(!data.inversion) data.inversion = [];
  upgradeInvestments(data);
  if(!data.customCategorias) data.customCategorias = {Fijo:[], Variable:[]};
  if(!data.customCategorias.Fijo) data.customCategorias.Fijo = [];
  if(!data.customCategorias.Variable) data.customCategorias.Variable = [];
  if(!data.deletedBaseCategorias) data.deletedBaseCategorias = {Fijo:[], Variable:[]};
  if(!data.deletedBaseCategorias.Fijo) data.deletedBaseCategorias.Fijo = [];
  if(!data.deletedBaseCategorias.Variable) data.deletedBaseCategorias.Variable = [];
  if(!data.presupuestos) data.presupuestos = {};
  sanitizeEntryIds(data);
  return data;
}

/* Los datos de un libro compartido los puede escribir otra persona: nos aseguramos de que
   los ids (que se usan en atributos HTML) solo tengan caracteres inocuos. */
function sanitizeEntryIds(data){
  ['ingresos','gastos','dolar','inversion'].forEach(function(k){
    if(!Array.isArray(data[k])){ data[k] = []; return; }
    data[k] = data[k].filter(function(x){ return x && typeof x === 'object'; });
    data[k].forEach(function(x){
      if(typeof x.id === 'string' && !/^[\w.:-]+$/.test(x.id)){
        x.id = x.id.replace(/[^\w.:-]/g, '_') || uid('x');
      }
    });
  });
}

function normalizeStoreObj(raw){
  try{
    var store = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    if(store && store.ejercicios && Object.keys(store.ejercicios).length){
      Object.keys(store.ejercicios).forEach(function(y){ store.ejercicios[y] = normalizeExercise(store.ejercicios[y]); });
      if(!store.activeEjercicio || !store.ejercicios[store.activeEjercicio]){
        store.activeEjercicio = Object.keys(store.ejercicios).sort()[0];
      }
      if(!Array.isArray(store.reglas)) store.reglas = [];
      if(!Array.isArray(store.recordatorios)) store.recordatorios = [];
      return store;
    }
  }catch(e){ /* inválido, seguimos */ }
  return null;
}

function loadStore(){
  if(cloudMode){
    // Modo con login: los datos de este usuario SOLO pueden venir de:
    // 1) lo que ya bajamos de Firestore para su cuenta, o
    // 2) una copia local guardada antes con ESTA MISMA cuenta (para uso offline).
    // Nunca se usan datos locales de otra sesión ni los datos de ejemplo.
    var fromCloud = normalizeStoreObj(preloadedStore);
    if(fromCloud) return fromCloud;
    var cachedRaw = localStorage.getItem(cloudCacheKey());
    var fromCache = cachedRaw ? normalizeStoreObj(cachedRaw) : null;
    if(fromCache) return fromCache;
    // Cuenta nueva: arranca 100% vacía.
    var storeCloudNew = { activeEjercicio: DEFAULT_YEAR, ejercicios:{} };
    storeCloudNew.ejercicios[DEFAULT_YEAR] = normalizeExercise({});
    return storeCloudNew;
  }

  // ---- Modo local (sin login / Firebase no configurado) ----
  var raw = localStorage.getItem(STORAGE_KEY);
  var fromLocal = raw ? normalizeStoreObj(raw) : null;
  if(fromLocal) return fromLocal;
  // Migración desde versión anterior (un solo ejercicio, sin años)
  var legacyRaw = localStorage.getItem(LEGACY_KEY);
  if(legacyRaw){
    try{
      var legacy = normalizeExercise(JSON.parse(legacyRaw));
      var storeMig = { activeEjercicio: DEFAULT_YEAR, ejercicios:{} };
      storeMig.ejercicios[DEFAULT_YEAR] = legacy;
      return storeMig;
    }catch(e){ /* fall through */ }
  }
  // Usuario nuevo: datos originales del Excel
  var storeNew = { activeEjercicio: DEFAULT_YEAR, ejercicios:{} };
  storeNew.ejercicios[DEFAULT_YEAR] = normalizeExercise(JSON.parse(JSON.stringify(seed)));
  return storeNew;
}
function saveData(){
  if(cloudMode){
    localStorage.setItem(cloudCacheKey(), JSON.stringify(STORE));
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STORE));
  }
  if(window.__gastosCloudSync) window.__gastosCloudSync(STORE);
}

var STORE = loadStore();
var DATA = STORE.ejercicios[STORE.activeEjercicio];

function catsFor(tipo){
  var base = tipo === 'Fijo' ? CAT_FIJAS : CAT_VARIABLES;
  var deletedBase = DATA.deletedBaseCategorias[tipo] || [];
  var baseVisible = base.filter(function(c){ return deletedBase.indexOf(c)===-1; });
  var custom = DATA.customCategorias[tipo] || [];
  return baseVisible.concat(custom).sort(function(a,b){ return a.localeCompare(b, 'es'); });
}

/* ===================== REGLAS DE CATEGORIZACIÓN AUTOMÁTICA ===================== */
/* Viven en STORE.reglas (compartidas entre ejercicios y sincronizadas con el libro).
   Cada regla: {id, texto, tipo:'Fijo'|'Variable', cat}. Si la descripción de un gasto
   CONTIENE el texto (sin distinguir mayúsculas ni tildes), se asignan tipo y categoría.
   Si coinciden varias, gana la de texto más largo (la más específica). */
function getReglas(){ if(!Array.isArray(STORE.reglas)) STORE.reglas = []; return STORE.reglas; }
function matchRegla(desc){
  var t = normalizeSearchText(desc||'').trim();
  if(!t) return null;
  var best = null, bestLen = 0;
  getReglas().forEach(function(r){
    var k = normalizeSearchText(r.texto||'').trim();
    if(!k || k.length < bestLen || t.indexOf(k) === -1) return;
    if(k.length === bestLen && best) return; // empate: queda la primera
    if(catsFor(r.tipo).indexOf(r.cat) === -1) return; // la categoría ya no existe en este ejercicio
    best = r; bestLen = k.length;
  });
  return best;
}
/* API para cualquier flujo de carga/importación: window.categorizarGasto('COMPRA CARREFOUR 123') → {tipo,cat,texto} | null */
window.categorizarGasto = function(desc){ var r = matchRegla(desc); return r ? {tipo:r.tipo, cat:r.cat, texto:r.texto} : null; };

/* Ícono simple (estilo lucide, sin emoji) según palabras clave del nombre de categoría */
var CAT_ICON_DEFS = [
  { kw:['tarjeta'],
    svg:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>' },
  { kw:['alquiler','renta','vivienda','casa','hogar','expensas'],
    svg:'<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10a1 1 0 0 0 1 1h3v-7h6v7h3a1 1 0 0 0 1-1V10"/>' },
  { kw:['comida','super','almacen','almacén','alimento','alimentaci','mercado','despensa','verduler'],
    svg:'<path d="M5 2v6a2 2 0 0 0 4 0V2"/><path d="M7 8v14"/><path d="M17 2c-1.7 0-3 2.5-3 6s1.3 5 3 5v9"/>' },
  { kw:['transporte','auto','nafta','combustible','colectivo','uber','sube','nena'],
    svg:'<rect x="3" y="6" width="18" height="11" rx="2"/><path d="M3 12h18"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>' },
  { kw:['seguro','seguros'],
    svg:'<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/>' },
  { kw:['salud','medic','farmacia','doctor','obra social','odont'],
    svg:'<path d="M12 21s-7-4.35-9.5-8.5C.7 9 2 5 6 5c2.2 0 3.5 1.3 4.5 3 1-1.7 2.3-3 4.5-3 4 0 5.3 4 3.5 7.5C19 16.65 12 21 12 21z"/>' },
  { kw:['servicio','luz','agua','gas'],
    svg:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
  { kw:['celular','móvil','movil','telefono','teléfono'],
    svg:'<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>' },
  { kw:['cable','internet','wifi'],
    svg:'<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none"/>' },
  { kw:['educ','colegio','curso','universidad','escuela','libro'],
    svg:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
  { kw:['entreten','ocio','salida','cine'],
    svg:'<path d="M4 4h16l-8 9z"/><path d="M12 13v7"/><path d="M8 20h8"/>' },
  { kw:['suscripcion','suscripción','streaming','netflix','spotify','disney','hbo','prime video'],
    svg:'<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>' },
  { kw:['bebida','bebidas'],
    svg:'<path d="M10 2h4v4l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3z"/><line x1="9" y1="13" x2="15" y2="13"/>' },
  { kw:['regalo','cumple'],
    svg:'<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18"/><path d="M7.5 8a2.5 2.5 0 1 1 0-5C9.5 3 12 8 12 8s2.5-5 4.5-5a2.5 2.5 0 1 1 0 5"/>' },
  { kw:['ropa','indumentaria','vestimenta','calzado'],
    svg:'<path d="M16 3l3 3-2 2v13H7V8L5 6l3-3 4 2 4-2z"/>' },
  { kw:['impuesto','impuestos','afip','iva'],
    svg:'<path d="M6 2h12v19l-3-2-3 2-3-2-3 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/>' },
  { kw:['compra','compras'],
    svg:'<path d="M6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>' },
  { kw:['credito','crédito','prestamo','préstamo'],
    svg:'<path d="M3 21h18"/><path d="M5 21V10"/><path d="M10 21V10"/><path d="M14 21V10"/><path d="M19 21V10"/><path d="M2 10l10-6 10 6"/>' },
  { kw:['transferencia','transferencias'],
    svg:'<path d="M4 12h14"/><path d="M13 6l6 6-6 6"/>' },
  { kw:['deporte','deportes','futbol','fútbol','gimnasio','gym'],
    svg:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/><path d="M3 12h18"/><path d="M5.5 5.8c2 2.3 2 10.1 0 12.4"/><path d="M18.5 5.8c-2 2.3-2 10.1 0 12.4"/>' },
  { kw:['vacacion','vacaciones','viaje','turismo'],
    svg:'<path d="M12 2a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/><path d="M12 11v9"/><path d="M9 22a3 3 0 0 0 6 0"/>' }
];
var CAT_ICON_DEFAULT = '<path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>';
function catIconSvg(catName){
  var n = (catName||'').toLowerCase();
  var def = CAT_ICON_DEFS.find(function(d){ return d.kw.some(function(k){ return n.indexOf(k)!==-1; }); });
  var path = def ? def.svg : CAT_ICON_DEFAULT;
  return '<svg class="icon cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
}
function isCustomCat(tipo, cat){
  return (DATA.customCategorias[tipo]||[]).indexOf(cat) !== -1;
}

/* ===================== EJERCICIOS (años) ===================== */
function ejercicioYears(){
  return Object.keys(STORE.ejercicios).sort();
}
function renderEjercicioSelect(){
  var sel = document.getElementById('ejercicioSelect');
  sel.innerHTML = "";
  ejercicioYears().forEach(function(y){
    var o = document.createElement('option');
    o.value = y; o.textContent = 'Ejercicio '+y;
    if(y === STORE.activeEjercicio) o.selected = true;
    sel.appendChild(o);
  });
}
function switchEjercicio(year){
  if(!STORE.ejercicios[year]) return;
  STORE.activeEjercicio = year;
  DATA = STORE.ejercicios[year];
  saveData();
  resetCollapsedForActiveYear();
  fillCatSelect(false);
  if(typeof updateDescDatalist==='function') updateDescDatalist();
  renderEjercicioSelect();
  renderAll();
  toast('Ejercicio '+year+' activo');
}
document.getElementById('ejercicioSelect').addEventListener('change', function(e){
  switchEjercicio(e.target.value);
});
document.getElementById('btnNuevoEjercicio').addEventListener('click', async function(){
  var sugerido = String(Math.max.apply(null, ejercicioYears().map(Number))+1);
  var input = await askPrompt({title:'Nuevo ejercicio', label:'Año del nuevo ejercicio', value:sugerido, inputMode:'numeric', confirmLabel:'Crear'});
  if(!input) return;
  var year = input.trim();
  if(!/^\d{4}$/.test(year)){
    toast('Ingresá un año válido (ej: 2027)');
    return;
  }
  if(STORE.ejercicios[year]){
    toast('El ejercicio '+year+' ya existe');
    switchEjercicio(year);
    return;
  }
  var nuevo = normalizeExercise({
    customCategorias:{
      Fijo: (DATA.customCategorias.Fijo||[]).slice(),
      Variable: (DATA.customCategorias.Variable||[]).slice()
    }
    // deletedBaseCategorias NO se hereda: el ejercicio nuevo arranca con
    // todas las categorías originales visibles, aunque en otro ejercicio
    // hayas eliminado alguna.
  });
  STORE.ejercicios[year] = nuevo;
  switchEjercicio(year);
  toast('Ejercicio '+year+' creado');
});
document.getElementById('btnDeleteEjercicio').addEventListener('click', function(){
  var years = ejercicioYears();
  if(years.length<=1){
    toast('No podés eliminar el único ejercicio');
    return;
  }
  if(esSoloLectura()){ toast('Estás en modo solo lectura: no podés eliminar ejercicios.'); return; }
  var actual = STORE.activeEjercicio;
  askConfirm({
    title: 'Eliminar el ejercicio ' + actual,
    paragraphs: ['Se borran todos los ingresos, gastos, compras de dólares e inversiones de ese año. Antes se guarda una copia automática y vas a poder deshacerlo unos segundos.'],
    stats: [['Registros que se borran', String(exerciseRecords(DATA))]],
    confirmLabel: 'Eliminar ejercicio',
    altLabel: 'Descargar copia y eliminar'
  }).then(function(res){
    if(!res) return;
    if(res === 'alt') downloadBackupFile();
    var snap = takeSnapshot('Antes de eliminar el ejercicio ' + actual);
    delete STORE.ejercicios[actual];
    STORE.activeEjercicio = ejercicioYears()[0];
    DATA = STORE.ejercicios[STORE.activeEjercicio];
    saveData();
    resetCollapsedForActiveYear();
    fillCatSelect(false);
    if(typeof updateDescDatalist==='function') updateDescDatalist();
    renderEjercicioSelect();
    renderAll();
    toast('Ejercicio '+actual+' eliminado', { action: undoFromSnapshot(snap, 'Ejercicio '+actual+' recuperado'), duration: 12000 });
  });
});
renderEjercicioSelect();
resetCollapsedForActiveYear();


/* ===================== TOAST ===================== */
var toastEl = document.getElementById('toast');
var toastTimer;
function toast(msg, opts){
  opts = opts || {};
  toastEl.textContent = '';
  var span = document.createElement('span');
  span.textContent = msg;
  toastEl.appendChild(span);
  toastEl.classList.toggle('has-action', !!opts.action);
  if(opts.action){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = opts.actionLabel || 'Deshacer';
    b.addEventListener('click', function(){
      clearTimeout(toastTimer);
      toastEl.classList.remove('show', 'has-action');
      opts.action();
    });
    toastEl.appendChild(b);
  }
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, opts.duration || (opts.action ? 7000 : 2200));
}

/* ===================== COPIAS AUTOMÁTICAS + CONFIRMACIÓN ===================== */
// Antes de cualquier operación que reemplaza datos (importar, restaurar, eliminar
// ejercicio) se guarda una copia local (las últimas 3) y se ofrece "Deshacer".
function snapKey(){ return STORAGE_KEY + '_snaps' + (cloudMode ? '_' + cloudUid : ''); }
function exerciseRecords(e){
  e = e || {};
  return (e.ingresos||[]).length + (e.gastos||[]).length + (e.dolar||[]).length + (e.inversion||[]).length;
}
function storeStats(store){
  var years = Object.keys((store && store.ejercicios) || {});
  var regs = 0;
  years.forEach(function(y){ regs += exerciseRecords(store.ejercicios[y]); });
  return { ejercicios: years.length, registros: regs };
}
function statsText(st){ return st.ejercicios + ' ejercicio(s) · ' + st.registros + ' registros'; }
function readSnaps(){
  try{
    var a = JSON.parse(localStorage.getItem(snapKey()) || '[]');
    return Array.isArray(a) ? a : [];
  }catch(e){ return []; }
}
function updateSnapshotButton(){
  var el = document.getElementById('btnRecoverSnapshot');
  if(el) el.style.display = readSnaps().length ? '' : 'none';
}
function takeSnapshot(reason){
  var snap = { ts: Date.now(), reason: reason, json: JSON.stringify(STORE) };
  var snaps = [snap].concat(readSnaps()).slice(0, 3);
  // Si no entra en localStorage, se van soltando las copias más viejas.
  while(snaps.length){
    try{ localStorage.setItem(snapKey(), JSON.stringify(snaps)); break; }
    catch(e){ snaps.pop(); }
  }
  updateSnapshotButton();
  return snap; // siempre queda en memoria para el "Deshacer", aunque no entre en localStorage
}
function restoreFromJson(json){
  var incoming = normalizeStoreObj(json);
  if(!incoming){ toast('No se pudo restaurar la copia'); return false; }
  STORE = incoming;
  DATA = STORE.ejercicios[STORE.activeEjercicio];
  saveData(); resetCollapsedForActiveYear(); fillCatSelect(false); updateDescDatalist(); renderEjercicioSelect(); renderAll();
  return true;
}
function undoFromSnapshot(snap, okMsg){
  return function(){ if(restoreFromJson(snap.json)) toast(okMsg); };
}
function downloadBackupFile(){
  var blob = new Blob([JSON.stringify(STORE, null, 2)], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'gastos-backup-'+(new Date().toISOString().slice(0,10))+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  markBackupDone();
}

/* ===================== AVISO DE RESPALDO ===================== */
// Guarda (en este dispositivo) cuándo se descargó el último backup .json y,
// si pasaron más de BACKUP_MAX_DAYS días, avisa una vez por día al abrir la app.
var BACKUP_KEY = 'libroGastos_lastBackup';
var BACKUP_REMIND_KEY = 'libroGastos_backupRemindedOn';
var BACKUP_MAX_DAYS = 30;
function markBackupDone(){
  try{ localStorage.setItem(BACKUP_KEY, String(Date.now())); }catch(e){}
}
function storeHasData(){
  try{
    var ej = STORE.ejercicios || {};
    return Object.keys(ej).some(function(y){
      var e = ej[y] || {};
      return ['ingresos','gastos','dolar','inversion'].some(function(k){ return e[k] && e[k].length; });
    });
  }catch(e){ return false; }
}
function checkBackupReminder(){
  if(window.__backupChecked) return;
  window.__backupChecked = true;
  try{
    var last = parseInt(localStorage.getItem(BACKUP_KEY), 10);
    if(!last){ markBackupDone(); return; }   // primer uso con esta función: se empieza a contar desde hoy
    var days = Math.floor((Date.now() - last) / 86400000);
    if(days < BACKUP_MAX_DAYS) return;
    var hoy = new Date().toISOString().slice(0,10);
    if(localStorage.getItem(BACKUP_REMIND_KEY) === hoy) return;   // ya se avisó hoy
    setTimeout(function(){
      if(esSoloLectura() || !storeHasData()) return;
      try{ localStorage.setItem(BACKUP_REMIND_KEY, hoy); }catch(e){}
      toast('Hace ' + days + ' días que no descargás un backup', {
        action: function(){ downloadBackupFile(); toast('Backup descargado (todos los ejercicios)'); },
        actionLabel: 'Descargar',
        duration: 12000
      });
    }, 4000);
  }catch(e){}
}
// Diálogo de confirmación accesible. Devuelve una Promesa: false (cancelar), true (confirmar)
// o 'alt' (acción alternativa, p. ej. "Descargar copia y continuar").
function askConfirm(o){
  return new Promise(function(resolve){
    var prev = document.activeElement;
    var ov = document.createElement('div');
    ov.className = 'account-overlay open';
    var box = document.createElement('div');
    box.className = 'account-box confirm-box';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    var tid = 'confirmTitle' + Date.now();
    box.setAttribute('aria-labelledby', tid);
    var h = document.createElement('h3');
    h.id = tid; h.textContent = o.title; h.style.marginBottom = '10px';
    box.appendChild(h);
    (o.paragraphs || []).forEach(function(t){
      var p = document.createElement('p'); p.textContent = t; box.appendChild(p);
    });
    if(o.stats && o.stats.length){
      var st = document.createElement('div'); st.className = 'confirm-stats';
      o.stats.forEach(function(r){
        var d = document.createElement('div');
        var a = document.createElement('span'); a.textContent = r[0];
        var b = document.createElement('strong'); b.textContent = r[1];
        d.appendChild(a); d.appendChild(b); st.appendChild(d);
      });
      box.appendChild(st);
    }
    var act = document.createElement('div'); act.className = 'confirm-actions';
    function mk(label, cls, val){
      var b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = label;
      b.addEventListener('click', function(){ done(val); });
      act.appendChild(b);
      return b;
    }
    if(o.altLabel) mk(o.altLabel, 'ghost-btn confirm-alt', 'alt');
    var cancel = mk('Cancelar', 'ghost-btn', false);
    mk(o.confirmLabel || 'Continuar', o.danger === false ? 'btn' : 'btn btn-danger', true);
    box.appendChild(act); ov.appendChild(box); document.body.appendChild(ov);
    function onKey(e){
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); done(false); return; }
      if(e.key === 'Tab'){
        var f = box.querySelectorAll('button');
        if(!f.length) return;
        var first = f[0], last = f[f.length-1];
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    }
    function done(val){
      document.removeEventListener('keydown', onKey, true);
      ov.remove();
      if(prev && prev.focus) prev.focus();
      resolve(val);
    }
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', function(e){ if(e.target === ov) done(false); });
    cancel.focus();
  });
}

/* ===================== NAV ===================== */
// Centraliza el cambio de vista (la usan los botones del menú y también
// los shortcuts del ícono / accesos directos del manifest, vía URL).
function activarTab(tab){
  var view = document.getElementById('view-'+tab);
  if(!view || view.classList.contains('active')) return !!view;
  document.querySelectorAll('.nav-btn[data-tab]').forEach(function(b){
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  var saliente = document.querySelector('.view.active');
  if(saliente){
    saliente.classList.remove('active');
    saliente.classList.add('leaving');
    // Saca la vista anterior del flujo recién cuando terminó su fade-out
    // (con fallback por si 'animationend' no llega a disparar)
    var limpiar = function(){ saliente.classList.remove('leaving'); };
    saliente.addEventListener('animationend', limpiar, {once:true});
    setTimeout(limpiar, 220);
  }
  view.classList.add('active');
  // En mobile, asegurar que el tab activo quede visible dentro del nav con scroll horizontal
  var sideBtn = document.querySelector('.sidebar .nav-btn[data-tab="'+tab+'"]');
  if(sideBtn && sideBtn.scrollIntoView){
    sideBtn.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'});
  }
  return true;
}
document.querySelectorAll('.nav-btn[data-tab]').forEach(function(btn){
  btn.addEventListener('click', function(){ activarTab(btn.dataset.tab); });
});

/* ===================== SHORTCUTS DEL ÍCONO (manifest) =====================
   Los shortcuts "Agregar gasto" / "Ver resumen del mes" abren la app con
   ?tab=XXX (y opcionalmente &action=add) en la URL. Lo resolvemos acá, una
   vez que ya existen las vistas en el DOM. */
(function(){
  try{
    var params = new URLSearchParams(window.location.search);
    var tab = params.get('tab');
    if(tab && activarTab(tab)){
      if(params.get('action') === 'add' && tab === 'gastos'){
        setTimeout(function(){
          var form = document.getElementById('formGasto');
          if(form){
            form.scrollIntoView({behavior:'smooth', block:'start'});
            var firstField = form.querySelector('input, select, textarea');
            if(firstField) firstField.focus({preventScroll:true});
          }
        }, 300);
      }
      // Limpiamos la URL para que un refresh posterior no te vuelva a tirar al mismo tab
      if(window.history && window.history.replaceState){
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }catch(e){}
})();

/* ===================== MENÚ MOBILE (cajón lateral) ===================== */
(function(){
  var btn = document.getElementById('btnMobileMenu');
  var sidebar = document.querySelector('.sidebar');
  var backdrop = document.getElementById('mobileSidebarBackdrop');
  if(!btn || !sidebar || !backdrop) return;
  function open(){
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('open');
    btn.setAttribute('aria-expanded','true');
  }
  function close(){
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('open');
    btn.setAttribute('aria-expanded','false');
  }
  btn.addEventListener('click', function(){
    sidebar.classList.contains('mobile-open') ? close() : open();
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape') close();
  });
  // Al elegir una vista desde el cajón, cerrarlo
  sidebar.querySelectorAll('.nav-btn[data-tab]').forEach(function(b){
    b.addEventListener('click', close);
  });
})();

/* ===================== TEMA CLARO / OSCURO ===================== */
var THEME_KEY = 'libroGastos_theme';
// persist=false: solo aplica visualmente (lo usa el modo automático, para no
// "fijar" una preferencia manual cuando en realidad sigue al sistema).
function applyTheme(theme, persist){
  document.documentElement.classList.toggle('theme-light', theme==='light');
  var btnTheme = document.getElementById('btnThemeToggle');
  if(btnTheme) btnTheme.innerHTML = theme==='light'
    ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Modo oscuro'
    : '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg> Modo claro';
  if(persist !== false){
    try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
  }
}
(function(){
  var saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
  var mq = (window.matchMedia) ? window.matchMedia('(prefers-color-scheme: light)') : null;

  if(saved === 'light' || saved === 'dark'){
    applyTheme(saved, false); // ya estaba aplicado por el script anti-flash; solo sincroniza el botón
  }else{
    applyTheme(mq && mq.matches ? 'light' : 'dark', false); // modo automático: sigue al sistema
  }

  // Mientras el usuario no haya tocado el botón (no hay preferencia guardada),
  // si cambia el modo claro/oscuro del sistema (ej. a la noche), la app lo sigue solita.
  if(mq){
    var onSystemChange = function(e){
      var current = null;
      try{ current = localStorage.getItem(THEME_KEY); }catch(err){}
      if(current !== 'light' && current !== 'dark'){
        applyTheme(e.matches ? 'light' : 'dark', false);
        renderGraficos();
      }
    };
    if(mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if(mq.addListener) mq.addListener(onSystemChange); // Safari viejo
  }

  var btnTheme = document.getElementById('btnThemeToggle');
  if(btnTheme){
    btnTheme.addEventListener('click', function(){
      var isLight = document.documentElement.classList.contains('theme-light');
      applyTheme(isLight ? 'dark' : 'light'); // acá sí persiste: a partir de ahora es manual
      renderGraficos(); // los charts SVG usan colores fijos que hay que releer del nuevo tema
    });
  }
})();

/* ===================== SELECT POPULATION ===================== */
function fillMonthSelect(sel, withAll){
  sel.innerHTML = "";
  if(withAll){
    var o = document.createElement('option');
    o.value=""; o.textContent="Todos los meses";
    sel.appendChild(o);
  }
  MESES.forEach(function(m){
    var o = document.createElement('option');
    o.value=m; o.textContent=m;
    sel.appendChild(o);
  });
}
["ingMes","gasMes","usdMes","invMes"].forEach(function(id){
  fillMonthSelect(document.getElementById(id), false);
});
fillMonthSelect(document.getElementById('filtMes'), true);
fillMonthSelect(document.getElementById('filtIngMes'), true);
fillMonthSelect(document.getElementById('filtUsdMes'), true);
fillMonthSelect(document.getElementById('filtInvMes'), true);
fillMonthSelect(document.getElementById('hormigaMes'), true);
fillMonthSelect(document.getElementById('presuChartMes'), false);

['usdCant','usdValor','usdTotal','invValorActual'].forEach(function(id){
  attachMoneyInput(document.getElementById(id));
});
attachMoneyInput(document.getElementById('hormigaUmbral'));
attachMoneyInput(document.getElementById('ingMonto'), document.getElementById('ingMontoPreview'));
attachMoneyInput(document.getElementById('gasMonto'), document.getElementById('gasMontoPreview'));

function fillCatSelect(preserve){
  var sel = document.getElementById('gasCat');
  var tipo = document.getElementById('gasTipo').value;
  var prev = preserve ? sel.value : null;
  var list = catsFor(tipo);
  sel.innerHTML = "";
  list.forEach(function(c){
    var o = document.createElement('option');
    o.value=c; o.textContent=c;
    sel.appendChild(o);
  });
  var newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ Agregar categoría nueva…';
  sel.appendChild(newOpt);
  if(prev && list.indexOf(prev)!==-1) sel.value = prev;
  updateDelCatButton();
}
document.getElementById('gasTipo').addEventListener('change', function(){ fillCatSelect(false); updateDescSuggestSource(); });
fillCatSelect(false);

function updateDelCatButton(){
  var cat = document.getElementById('gasCat').value;
  var btn = document.getElementById('btnDelCat');
  btn.disabled = (cat === '__new__' || !cat);
}
document.getElementById('btnDelCat').addEventListener('click', async function(){
  var tipo = document.getElementById('gasTipo').value;
  var cat = document.getElementById('gasCat').value;
  if(cat === '__new__' || !cat) return;
  var enUso = DATA.gastos.filter(function(g){ return g.tipo===tipo && g.cat===cat; }).length;
  if(enUso>0){
    toast('No se puede eliminar: tiene '+enUso+' gasto(s) cargado(s) con esa categoría');
    return;
  }
  var esBase = !isCustomCat(tipo, cat);
  var msg = esBase
    ? '¿Eliminar la categoría original "'+cat+'"? Podés volver a agregarla después escribiendo el mismo nombre en "+ Agregar categoría nueva".'
    : '¿Eliminar la categoría "'+cat+'"? Esta acción no se puede deshacer.';
  if(!(await askConfirmSimple(msg))) return;
  if(esBase){
    if(DATA.deletedBaseCategorias[tipo].indexOf(cat)===-1) DATA.deletedBaseCategorias[tipo].push(cat);
  } else {
    DATA.customCategorias[tipo] = DATA.customCategorias[tipo].filter(function(c){ return c!==cat; });
  }
  saveData();
  fillCatSelect(false);
  toast('Categoría "'+cat+'" eliminada');
  if(typeof renderAll==='function') renderAll();
});

function updateDescDatalist(){ updateDescSuggestSource(); }

/* ===================== AUTOCOMPLETADO DE DESCRIPCIÓN (estilo Proveedores) ===================== */
var _gasDescOptions = [];
var _gasDescSuggestIdx = -1;
function updateDescSuggestSource(){
  var cat = document.getElementById('gasCat').value;
  var seen = {};
  DATA.gastos.forEach(function(g){
    if(g.cat===cat && g.desc) seen[g.desc]=true;
  });
  _gasDescOptions = Object.keys(seen).sort(function(a,b){ return a.localeCompare(b,'es'); });
}
function descGetMatches(q){
  if(!q) return _gasDescOptions;
  var lq = normalizeSearchText(q);
  return [
    ..._gasDescOptions.filter(function(n){ return normalizeSearchText(n).indexOf(lq)===0; }),
    ..._gasDescOptions.filter(function(n){ return normalizeSearchText(n).indexOf(lq)!==0 && normalizeSearchText(n).indexOf(lq)!==-1; })
  ];
}
function descSuggest(val){
  var list = document.getElementById('gasDescSuggest');
  var q = val.trim();
  var matches = descGetMatches(q);
  _gasDescSuggestIdx = -1;
  if(!matches.length || (matches.length===1 && matches[0]===q)){
    list.style.display='none';
    return;
  }
  var nq = normalizeSearchText(q);
  list.innerHTML = matches.slice(0,30).map(function(n, i){
    var esc = escapeHtml(n);
    if(nq){
      var idx = normalizeSearchText(n).indexOf(nq);
      if(idx!==-1){
        esc = escapeHtml(n.slice(0,idx))+'<strong>'+escapeHtml(n.slice(idx, idx+nq.length))+'</strong>'+escapeHtml(n.slice(idx+nq.length));
      }
    }
    return '<div class="suggest-item" data-idx="'+i+'">'+esc+'</div>';
  }).join('');
  list.style.display='block';
}
function descSelectSug(name){
  document.getElementById('gasDesc').value = name;
  document.getElementById('gasDescSuggest').style.display='none';
  _gasDescSuggestIdx = -1;
}
var gasDescInput = document.getElementById('gasDesc');
var gasDescSuggestEl = document.getElementById('gasDescSuggest');
gasDescInput.addEventListener('input', function(){ descSuggest(this.value); });
gasDescInput.addEventListener('focus', function(){ descSuggest(this.value); });
gasDescSuggestEl.addEventListener('mousedown', function(e){
  var item = e.target.closest('.suggest-item');
  if(!item) return;
  e.preventDefault();
  var matches = descGetMatches(gasDescInput.value.trim());
  descSelectSug(matches[+item.dataset.idx]);
});
gasDescInput.addEventListener('keydown', function(e){
  var list = gasDescSuggestEl;
  var items = list.querySelectorAll('.suggest-item');
  if(!items.length) return;
  if(e.key==='ArrowDown'){
    e.preventDefault();
    _gasDescSuggestIdx = Math.min(_gasDescSuggestIdx+1, items.length-1);
  } else if(e.key==='ArrowUp'){
    e.preventDefault();
    _gasDescSuggestIdx = Math.max(_gasDescSuggestIdx-1, -1);
  } else if(e.key==='Enter' && _gasDescSuggestIdx>=0){
    e.preventDefault();
    var matches = descGetMatches(gasDescInput.value.trim());
    descSelectSug(matches[_gasDescSuggestIdx]);
    return;
  } else if(e.key==='Escape'){
    list.style.display='none';
    _gasDescSuggestIdx=-1;
    return;
  } else { return; }
  items.forEach(function(el,i){ el.classList.toggle('active', i===_gasDescSuggestIdx); });
  if(_gasDescSuggestIdx>=0) items[_gasDescSuggestIdx].scrollIntoView({block:'nearest'});
});
document.addEventListener('mousedown', function(e){
  if(gasDescSuggestEl && !gasDescSuggestEl.contains(e.target) && e.target!==gasDescInput){
    gasDescSuggestEl.style.display='none';
  }
});

document.getElementById('gasCat').addEventListener('change', async function(e){
  var sel = e.target;
  if(sel.value !== '__new__'){ updateDescSuggestSource(); updateDelCatButton(); return; }
  var tipo = document.getElementById('gasTipo').value;
  var nombre = await askPrompt({title:'Nueva categoría', label:'Nombre de la nueva categoría de gasto '+tipo.toLowerCase(), confirmLabel:'Agregar'});
  nombre = nombre ? nombre.trim() : '';
  if(!nombre){
    fillCatSelect(false);
    return;
  }
  var existentes = catsFor(tipo);
  var yaExiste = existentes.some(function(c){ return c.toLowerCase()===nombre.toLowerCase(); });
  if(!yaExiste){
    DATA.customCategorias[tipo].push(nombre);
    saveData();
  }
  fillCatSelect(false);
  sel.value = yaExiste ? existentes.filter(function(c){return c.toLowerCase()===nombre.toLowerCase();})[0] : nombre;
  toast('Categoría "'+nombre+'" agregada');
  updateDescSuggestSource();
  updateDelCatButton();
  if(typeof renderAll==='function') renderAll();
});
updateDescSuggestSource();

/* current month default = current real month name if within Enero-Diciembre else Enero */
(function setDefaultMonths(){
  var idx = new Date().getMonth();
  var m = MESES[idx] || "Enero";
  ["ingMes","gasMes","usdMes","invMes","presuChartMes"].forEach(function(id){
    document.getElementById(id).value = m;
  });
})();

/* ===================== COMPUTATION ===================== */
function computeMonth(mes){
  var ingresos = DATA.ingresos.filter(function(x){return x.mes===mes;});
  var totalIngresos = ingresos.reduce(function(s,x){return Math.round((s+(+x.monto||0))*100)/100;},0);

  var gastosMes = DATA.gastos.filter(function(x){return x.mes===mes;});
  var fijosPorCat = {}, variablesPorCat = {};
  CAT_FIJAS.forEach(function(c){ fijosPorCat[c]=0; });
  CAT_VARIABLES.forEach(function(c){ variablesPorCat[c]=0; });
  var totalFijos=0, totalVariables=0;
  gastosMes.forEach(function(g){
    var m = +g.monto || 0;
    if(g.tipo === 'Fijo'){
      if(!(g.cat in fijosPorCat)) fijosPorCat[g.cat]=0;
      fijosPorCat[g.cat]+=m; totalFijos+=m;
    } else {
      if(!(g.cat in variablesPorCat)) variablesPorCat[g.cat]=0;
      variablesPorCat[g.cat]+=m; totalVariables+=m;
    }
  });
  var totalGastos = totalFijos+totalVariables;

  var dolarMes = DATA.dolar.filter(function(x){return x.mes===mes;});
  var pesosGastadosUsd = dolarMes.reduce(function(s,x){
    var c = (x.cant===null||x.cant===undefined) ? 0 : (+x.cant||0);
    return s+c;
  },0);
  var totalUsd = dolarMes.reduce(function(s,x){return s+(+x.total||0);},0);

  var invMes = DATA.inversion.filter(function(x){return x.mes===mes;});
  var montoInversion = invMes.reduce(function(sum,x){return sum + (x.tipo==='aporte' ? (+x.pesos||0) : x.tipo==='retiro' ? -(+x.pesos||0) : 0);},0);
  var pctInversion = totalIngresos>0 ? montoInversion/totalIngresos*100 : 0;

  var totalGastado = totalGastos + pesosGastadosUsd + montoInversion;
  var totalRestante = totalIngresos - totalGastado;

  return {
    mes:mes, totalIngresos:totalIngresos,
    fijosPorCat:fijosPorCat, variablesPorCat:variablesPorCat,
    totalFijos:totalFijos, totalVariables:totalVariables, totalGastos:totalGastos,
    pesosGastadosUsd:pesosGastadosUsd, totalUsd:totalUsd,
    pctInversion:pctInversion, montoInversion:montoInversion,
    totalGastado:totalGastado, totalRestante:totalRestante
  };
}

/* ===================== RESUMEN VIEW ===================== */
var pivotCollapsed = {}; // recuerda qué grupos (fijo/variable) están colapsados entre renders
function renderResumen(){
  var months = MESES.map(computeMonth);
  var yearIngresos = months.reduce(function(s,m){return s+m.totalIngresos;},0);
  var yearGastos = months.reduce(function(s,m){return s+m.totalGastos;},0);
  var yearRestante = months.reduce(function(s,m){return s+m.totalRestante;},0);
  var yearUsd = months.reduce(function(s,m){return s+m.totalUsd;},0);

  var kpiRow = document.getElementById('kpiRow');
  kpiRow.innerHTML =
    '<div class="kpi k-ingreso"><div class="kpi-label">Ingresos del año</div><div class="kpi-value">'+money(yearIngresos)+'</div><div class="kpi-sub">acumulado 12 meses</div></div>'+
    '<div class="kpi k-gasto"><div class="kpi-label">Gastos del año</div><div class="kpi-value">'+money(yearGastos)+'</div><div class="kpi-sub">fijos + variables</div></div>'+
    '<div class="kpi k-restante kpi-hero"><div class="kpi-label">Restante del año</div><div class="kpi-value'+(yearRestante<0?' neg':'')+'">'+money(yearRestante)+'</div><div class="kpi-sub">ingresos − gastado total</div></div>'+
    '<div class="kpi k-usd"><div class="kpi-label">USD comprados</div><div class="kpi-value">'+usd(yearUsd)+'</div><div class="kpi-sub">total del año</div></div>';
  (function(){
    var comprometido = montoComprometidoCuotas();
    if(comprometido && comprometido.cuotas>0){
      kpiRow.insertAdjacentHTML('beforeend',
        '<div class="kpi k-cuotas kpi-cuotas"><div class="kpi-label">Comprometido en cuotas</div><div class="kpi-value">'+money(comprometido.total)+'</div><div class="kpi-sub">'+comprometido.cuotas+' cuota(s) pendiente(s), resto del año</div></div>');
    }
  })();
  (function(){
    function vb(fn, kind){
      var v = months.map(fn);
      for(var i=v.length-1;i>0;i--){
        if(v[i]!==0 && v[i-1]!==0){
          var pct=((v[i]-v[i-1])/Math.abs(v[i-1]))*100, up=pct>=0, good=kind==='ingreso'?up:!up;
          return ' <span class="var-badge '+(good?'var-good':'var-bad')+'" title="'+MESES[i]+' vs. '+MESES[i-1]+(good?' (a favor)':' (en contra)')+'">'+(up?'▲':'▼')+' '+(Math.abs(pct)>=300?money(Math.abs(v[i]-v[i-1])):Math.abs(Math.round(pct))+'%')+' vs '+MESES[i-1].slice(0,3)+'</span>';
        }
      }
      return '';
    }
    var subs = kpiRow.querySelectorAll('.kpi-sub');
    if(subs[0]) subs[0].insertAdjacentHTML('beforeend', vb(function(m){return m.totalIngresos;},'ingreso'));
    if(subs[1]) subs[1].insertAdjacentHTML('beforeend', vb(function(m){return m.totalGastos;},'gasto'));
    if(subs[2]) subs[2].insertAdjacentHTML('beforeend', vb(function(m){return m.totalRestante;},'ingreso'));
  })();

  var table = document.getElementById('pivotTable');
  var html = '<thead><tr><th>Categoría</th>';
  MESES.forEach(function(m){ html += '<th>'+m.slice(0,3)+'</th>'; });
  html += '<th class="col-total">Total</th></tr></thead><tbody>';

  var rowIdx = 0;
  function delayAttr(){
    var d = Math.min(rowIdx*22, 260);
    rowIdx++;
    return ' style="animation-delay:'+d+'ms"';
  }

  // Variación entre los dos últimos meses consecutivos con datos (para saber si "veníamos subiendo o bajando")
  function variationBadge(vals, kind){
    for(var i=vals.length-1; i>0; i--){
      if(vals[i]!==0 && vals[i-1]!==0){
        var pct = ((vals[i]-vals[i-1])/Math.abs(vals[i-1]))*100;
        var up = pct >= 0;
        var good = kind==='ingreso' ? up : !up;
        return '<span class="var-badge '+(good?'var-good':'var-bad')+'" title="Último mes con datos vs. '+MESES[i-1]+(good?' (a favor)':' (en contra)')+'">'+(up?'▲':'▼')+' '+Math.abs(Math.round(pct))+'%</span>';
      }
    }
    return '';
  }

  function rowFor(label, valuesFn, cls, variationKind){
    var vals = months.map(valuesFn);
    var tot = vals.reduce(function(a,b){return a+b;},0);
    var r = '<tr class="'+(cls||'')+'"'+delayAttr()+'><td>'+label+'</td>';
    vals.forEach(function(v){ r += '<td class="'+(v===0?'zero':'')+'">'+(v===0?'–':money(v))+'</td>'; });
    var badge = variationKind ? variationBadge(vals, variationKind) : '';
    r += '<td class="col-total">'+money(tot)+badge+'</td></tr>';
    return r;
  }

  // Filas de categoría: ordenadas por influencia (mayor a menor), con ícono, barra relativa y heatmap por celda
  function catRowsHtml(cats, valuesFn, groupKey){
    var collapsed = !!pivotCollapsed[groupKey];
    var tipo = groupKey==='fijo' ? 'Fijo' : 'Variable';
    var curIdx = currentMonthIdxForDisplay();
    var rows = cats.map(function(cat){
      var vals = months.map(function(m){ return valuesFn(m, cat); });
      var tot = vals.reduce(function(a,b){return a+b;},0);
      return {cat:cat, vals:vals, tot:tot};
    }).filter(function(r){ return r.tot !== 0; });
    rows.sort(function(a,b){ return b.tot - a.tot; });
    var maxTot = rows.reduce(function(m,r){return Math.max(m,r.tot);},0) || 1;
    var groupTot = rows.reduce(function(sm,r){return sm+r.tot;},0) || 1;
    return rows.map(function(r){
      var presupuesto = DATA.presupuestos[presuKey(tipo, r.cat)];
      var barStyle, badge = '';
      if(presupuesto && curIdx>=0){
        var gastadoMes = r.vals[curIdx];
        var pctBudget = (gastadoMes/presupuesto)*100;
        var w = Math.min(100, Math.max(4, Math.round(pctBudget)));
        var color = pctBudget>=100 ? 'var(--neg)' : (pctBudget>=80 ? '#F0B43A' : 'var(--'+groupKey+')');
        barStyle = 'width:'+w+'%;background:'+color+';';
        if(pctBudget>=100){
          badge = '<span class="presu-badge" title="Superaste el presupuesto de '+money(presupuesto)+' para '+MESES[curIdx]+'">+'+Math.round(pctBudget-100)+'%</span>';
        }
      } else {
        var pct = Math.max(4, Math.round((r.tot/maxTot)*100));
        barStyle = 'width:'+pct+'%;';
      }
      var meterTxt, meterTitle;
      if(presupuesto && curIdx>=0){
        meterTxt = Math.round(((r.vals[curIdx]||0)/presupuesto)*100)+'%';
        meterTitle = money(r.vals[curIdx]||0)+' de '+money(presupuesto)+' de presupuesto en '+MESES[curIdx];
      } else {
        var shareV = (r.tot/groupTot)*100;
        meterTxt = (shareV<1 ? '<1' : Math.round(shareV))+'%';
        meterTitle = meterTxt+' del total de gastos '+(tipo==='Fijo'?'fijos':'variables')+' del año (la barra es relativa a la categoría más grande)';
      }
      var cells = '<td>'+catIconSvg(r.cat)+'<span class="cat-label"><span class="cat-name">'+escapeHtml(r.cat)+badge+'</span>'+
        '<span class="cat-meter"><span class="cat-bar-wrap"><span class="cat-bar" style="'+barStyle+'"></span></span><span class="cat-pct" title="'+meterTitle+'">'+meterTxt+'</span></span></span></td>';
      r.vals.forEach(function(v){
        if(v===0){ cells += '<td class="zero">–</td>'; return; }
        cells += '<td>'+money(v)+'</td>';
      });
      cells += '<td class="col-total">'+money(r.tot)+'</td>';
      return '<tr class="cat-row cat-'+groupKey+(collapsed?' row-collapsed':'')+'" data-group="'+groupKey+'"'+delayAttr()+'>'+cells+'</tr>';
    }).join('');
  }

  // Encabezado de grupo colapsable (fijo/variable, que suelen tener muchas categorías)
  function grpRowHtml(label, key, collapsible){
    var collapsed = collapsible && !!pivotCollapsed[key];
    var chevron = collapsible ? '<span class="grp-chevron'+(collapsed?' is-collapsed':'')+'">'+ICON_CHEV+'</span>' : '';
    var attrs = collapsible ? ' data-toggle="'+key+'" role="button" tabindex="0"' : '';
    return '<tr class="grp-row grp-'+key+'"'+attrs+delayAttr()+'><td>'+chevron+label+'</td>'+
      MESES.map(function(){return '<td></td>';}).join('')+'<td class="col-total"></td></tr>';
  }

  html += grpRowHtml('Ingresos', 'ingreso', false);
  html += rowFor('Total Ingresos', function(m){return m.totalIngresos;}, '', 'ingreso');

  html += grpRowHtml('Gastos fijos', 'fijo', true);
  html += catRowsHtml(catsFor('Fijo'), function(m,cat){return m.fijosPorCat[cat]||0;}, 'fijo');
  html += rowFor('Total Gastos Fijos', function(m){return m.totalFijos;}, 'total-row');

  html += grpRowHtml('Gastos variables', 'variable', true);
  html += catRowsHtml(catsFor('Variable'), function(m,cat){return m.variablesPorCat[cat]||0;}, 'variable');
  html += rowFor('Total Gastos Variables', function(m){return m.totalVariables;}, 'total-row');

  html += rowFor('Gastos Totales', function(m){return m.totalGastos;}, 'total-row', 'gasto');

  html += grpRowHtml('Compra dólar', 'dolar', false);
  html += rowFor('$ Gastados', function(m){return m.pesosGastadosUsd;});
  var dolarRowVals = months.map(function(m){return m.totalUsd;});
  var dolarTot = dolarRowVals.reduce(function(a,b){return a+b;},0);
  html += '<tr'+delayAttr()+'><td>USD Totales</td>'+dolarRowVals.map(function(v){return '<td class="'+(v===0?'zero':'')+'">'+(v===0?'–':usd(v))+'</td>';}).join('')+'<td class="col-total">'+usd(dolarTot)+'</td></tr>';

  if(DATA.inversion.length){
    html += grpRowHtml('Inversión', 'inversion', false);
    html += rowFor('Aportes − retiros (pesos)', function(m){return m.montoInversion;});
  }

  html += grpRowHtml('Resumen', 'resumen', false);
  html += rowFor('Total Gastado', function(m){return m.totalGastado;});
  html += rowFor('Total Restante', function(m){return m.totalRestante;}, 'total-row', 'ingreso');

  html += '</tbody>';
  table.innerHTML = html;
  (function(){
    var yr=parseInt(STORE.activeEjercicio,10), now=new Date(), ny=now.getFullYear(), nm=now.getMonth();
    var cur = yr===ny ? nm : -1;
    for(var r=0;r<table.rows.length;r++){
      var cs=table.rows[r].cells;
      for(var i=0;i<12;i++){
        var c=cs[i+1]; if(!c) continue;
        if(i===cur) c.classList.add('m-cur');
        else if(yr>ny || (yr===ny && i>nm)) c.classList.add('m-future');
      }
    }
  })();

  if(!table.dataset.toggleBound){
    table.dataset.toggleBound = '1';
    table.addEventListener('click', function(e){
      var trigger = e.target.closest('[data-toggle]');
      if(!trigger) return;
      var key = trigger.getAttribute('data-toggle');
      pivotCollapsed[key] = !pivotCollapsed[key];
      renderResumen();
    });
    table.addEventListener('keydown', function(e){
      if(e.key !== 'Enter' && e.key !== ' ') return;
      var trigger = e.target.closest('[data-toggle]');
      if(!trigger) return;
      e.preventDefault();
      var key = trigger.getAttribute('data-toggle');
      pivotCollapsed[key] = !pivotCollapsed[key];
      renderResumen();
    });
  }
}

/* ===================== ENTRY LISTS (generic) ===================== */
function groupByMonth(arr){
  var groups = {};
  MESES.forEach(function(m){ groups[m]=[]; });
  arr.forEach(function(x){
    if(!groups[x.mes]) groups[x.mes]=[];
    groups[x.mes].push(x);
  });
  return groups;
}

function monthHeadHtml(sec, mes, rightLabel){
  var key = sec+'-'+mes;
  var collapsed = collapsedGroups.has(key);
  var esMesActual = mes===MESES[currentMonthIdxForDisplay()];
  return '<div class="month-group-head'+(collapsed?' is-collapsed':'')+'" data-sec="'+sec+'" data-mes="'+mes+'">'+
    '<span class="mg-label"><span class="chev">'+ICON_CHEV+'</span>'+mes+(esMesActual?' <span style="color:var(--text-faint);font-weight:400;margin-left:6px;">(mes actual)</span>':'')+'</span>'+
    '<span>'+rightLabel+'</span></div>';
}

function renderIngresos(){
  var container = document.getElementById('listIngresos');
  var filtMes = document.getElementById('filtIngMes').value;
  var filtTipo = document.getElementById('filtIngTipo').value;
  var arr = DATA.ingresos.filter(function(x){
    if(filtMes && x.mes!==filtMes) return false;
    if(filtTipo && x.tipo!==filtTipo) return false;
    return true;
  });
  var groups = groupByMonth(arr);
  var html = "";
  var any = false;
  MESES.forEach(function(mes){
    var items = groups[mes];
    if(!items.length) return;
    any = true;
    var total = items.reduce(function(s,x){return Math.round((s+(+x.monto||0))*100)/100;},0);
    var collapsed = collapsedGroups.has('ingresos-'+mes);
    html += '<div class="month-group">'+monthHeadHtml('ingresos', mes, money(total))+'<div class="entry-list"'+(collapsed?' style="display:none"':'')+'>';
    items.forEach(function(it){
      var tagClass = it.tipo==='Sueldo' ? 'tag-sueldo' : 'tag-extra';
      var isEd = editingId.ingresos===it.id;
      var ingSub = [it.fecha?formatFechaCorta(it.fecha):null, it.autor?escapeHtml(it.autor):null].filter(Boolean).join(' · ');
      html += '<div class="entry-row'+(isEd?' is-editing':'')+'"><span class="tag '+tagClass+'">'+escapeHtml(it.tipo)+'</span><span class="entry-desc">'+(ingSub?('<small>'+ingSub+'</small>'):'')+'</span><span class="entry-amt">'+money(it.monto)+'</span><button class="entry-edit" data-kind="ingresos" data-id="'+escapeHtml(it.id)+'" title="Editar" aria-label="Editar">'+ICON_EDIT+'</button><button class="entry-del" data-kind="ingresos" data-id="'+escapeHtml(it.id)+'" title="Eliminar" aria-label="Eliminar">'+ICON_DEL+'</button></div>';
    });
    html += '</div></div>';
  });
  container.innerHTML = any ? html : (DATA.ingresos.length ? '<div class="empty-state">No hay ingresos que coincidan con el filtro.</div>' : '<div class="empty-state">Todavía no cargaste ingresos.<button type="button" class="btn btn-accent-ingreso empty-cta" data-focus="ingMonto">Cargar mi primer ingreso</button></div>');
}

function renderGastos(){
  var container = document.getElementById('listGastos');
  var filtMes = document.getElementById('filtMes').value;
  var filtTipo = document.getElementById('filtTipo').value;
  var filtBusq = document.getElementById('filtBusqueda').value.trim().toLowerCase();

  var arr = DATA.gastos.filter(function(g){
    if(filtMes && g.mes!==filtMes) return false;
    if(filtTipo && g.tipo!==filtTipo) return false;
    if(!gastoPasaFiltrosExtra(g)) return false;
    if(filtBusq){
      var hay = (g.cat+' '+(g.desc||'')).toLowerCase();
      if(hay.indexOf(filtBusq)===-1) return false;
    }
    return true;
  });

  var groups = groupByMonth(arr);
  ordenarGrupos(groups);
  var html = "";
  var any = false;
  MESES.forEach(function(mes){
    var items = groups[mes];
    if(!items.length) return;
    any = true;
    var total = items.reduce(function(s,x){return Math.round((s+(+x.monto||0))*100)/100;},0);
    var collapsed = collapsedGroups.has('gastos-'+mes);
    html += '<div class="month-group">'+monthHeadHtml('gastos', mes, money(total))+'<div class="entry-list"'+(collapsed?' style="display:none"':'')+'>';
    items.forEach(function(it){
      var tagClass = it.tipo==='Fijo' ? 'tag-fijo' : 'tag-variable';
      var isEd = editingId.gastos===it.id;
      var subLine = [it.fecha?formatFechaCorta(it.fecha):null, it.desc?escapeHtml(it.desc):null, it.autor?escapeHtml(it.autor):null].filter(Boolean).join(' · ');
      var cuotaBadge = it.cuotaGrupoId ? '<span class="cuota-badge" title="Cuota '+it.cuotaNum+' de '+it.cuotaTotal+' — compra total '+money(it.cuotaMontoTotal)+'">Cuota '+it.cuotaNum+'/'+it.cuotaTotal+'</span>' : '';
      var recurBadge = (it.recurrente && !it.cuotaGrupoId) ? '<span class="recur-badge" title="Gasto recurrente"><svg class="icon" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></span>' : '';
      html += '<div class="entry-row has-dup'+(isEd?' is-editing':'')+'"><span class="tag '+tagClass+'">'+escapeHtml(it.tipo)+'</span><span class="entry-desc">'+cuotaBadge+recurBadge+escapeHtml(it.cat)+(subLine?('<small>'+subLine+'</small>'):'')+'</span><span class="entry-amt">'+money(it.monto)+'</span><button class="entry-dup" data-dup="'+escapeHtml(it.id)+'" title="Duplicar" aria-label="Duplicar">'+ICON_DUP+'</button><button class="entry-edit" data-kind="gastos" data-id="'+escapeHtml(it.id)+'" title="Editar" aria-label="Editar">'+ICON_EDIT+'</button><button class="entry-del" data-kind="gastos" data-id="'+escapeHtml(it.id)+'" title="Eliminar" aria-label="Eliminar">'+ICON_DEL+'</button></div>';
    });
    html += '</div></div>';
  });
  container.innerHTML = any ? html : (DATA.gastos.length ? '<div class="empty-state">No hay gastos que coincidan con el filtro.</div>' : '<div class="empty-state">Todavía no cargaste gastos.<button type="button" class="btn btn-accent-fijo empty-cta" data-focus="gasMonto">Cargar mi primer gasto</button></div>');
}

function renderDolar(){
  var container = document.getElementById('listDolar');
  var filtMes = document.getElementById('filtUsdMes').value;
  var arr = DATA.dolar.filter(function(x){ return !filtMes || x.mes===filtMes; });
  var groups = groupByMonth(arr);
  var html = "";
  var any = false;
  MESES.forEach(function(mes){
    var items = groups[mes];
    if(!items.length) return;
    any = true;
    var totalUsd = items.reduce(function(s,x){return s+(+x.total||0);},0);
    var collapsed = collapsedGroups.has('dolar-'+mes);
    html += '<div class="month-group">'+monthHeadHtml('dolar', mes, usd(totalUsd))+'<div class="entry-list"'+(collapsed?' style="display:none"':'')+'>';
    items.forEach(function(it){
      var detail = usdDetailHtml(it);
      var isEd = editingId.dolar===it.id;
      html += '<div class="entry-row'+(isEd?' is-editing':'')+'"><span class="tag tag-usd">USD</span><span class="entry-desc">'+detail+'</span><span class="entry-amt">'+usd(it.total)+'</span><button class="entry-edit" data-kind="dolar" data-id="'+escapeHtml(it.id)+'" title="Editar" aria-label="Editar">'+ICON_EDIT+'</button><button class="entry-del" data-kind="dolar" data-id="'+escapeHtml(it.id)+'" title="Eliminar" aria-label="Eliminar">'+ICON_DEL+'</button></div>';
    });
    html += '</div></div>';
  });
  container.innerHTML = any ? html : '<div class="empty-state">Todavía no registraste compras de dólares.<button type="button" class="btn btn-accent-dolar empty-cta" data-focus="usdCant">Registrar mi primera compra</button></div>';
}

/* Inversiones: movimientos reales, saldos fechados y monedas independientes. */
function upgradeInvestments(data){
  if(!data.invGoals) data.invGoals={};
  var legacy=data.inversion.filter(function(x){return !x.tipo;});
  if(!legacy.length) return;
  data.inversionLegacyBackup=JSON.parse(JSON.stringify(legacy));
  var fresh=data.inversion.filter(function(x){return !!x.tipo;});
  MESES.forEach(function(mes,mi){
    var old=legacy.filter(function(x){return x.mes===mes;}); if(!old.length)return;
    var last=old[old.length-1], val=null;
    old.forEach(function(x){if(x.valorActual!==null&&x.valorActual!==undefined&&x.valorActual!=='')val=+x.valorActual;});
    var income=data.ingresos.filter(function(x){return x.mes===mes;}).reduce(function(sum,x){return sum+(+x.monto||0);},0);
    var amount=Math.max(0,income*(+last.pct||0)/100);
    fresh.push({id:last.id||uid('inv'),mes:mes,nombre:'Inversión anterior',moneda:'ARS',tipo:'aporte',monto:amount,pesos:amount,valorActual:val,legacy:true,nota:'Estimado a partir del porcentaje anterior ('+(+last.pct||0)+'%). Revisá el importe real.',autor:last.autor||null});
    if(+last.pct>=0&&+last.pct<=100)data.invGoals[mes]=+last.pct;
  });
  data.inversion=fresh;
}
var invLabels={aporte:'Aporte',retiro:'Retiro',valor:'Saldo actualizado',inicial:'Saldo inicial'};
function invMoney(n,c){return n===null||n===undefined?'—':(c==='USD'?'US$ ':'$ ')+fmtDec.format(n);}
function invDate(x){
  if(x.fecha)return x.fecha;
  var mi=MESES.indexOf(x.mes),year=+STORE.activeEjercicio;
  return year+'-'+String(mi+1).padStart(2,'0')+'-'+new Date(year,mi+1,0).getDate();
}
function invRows(currency,name,month){
  return DATA.inversion.map(function(x,i){return {x:x,i:i};}).filter(function(r){return (!currency||r.x.moneda===currency)&&(!name||r.x.nombre===name)&&(month===undefined||MESES.indexOf(r.x.mes)<=month);}).sort(function(a,b){return invDate(a.x).localeCompare(invDate(b.x))||a.i-b.i;}).map(function(r){return r.x;});
}
function invAccounts(currency,name,month){
  var groups=new Map();
  invRows(currency,name,month).forEach(function(x){
    var key=JSON.stringify([x.nombre,x.moneda]);
    if(!groups.has(key))groups.set(key,{nombre:x.nombre,moneda:x.moneda,initial:0,aportes:0,retiros:0,base:0,value:null,performance:null,asof:'',pending:false,rows:[]});
    var a=groups.get(key);a.rows.push(x);
    if(x.tipo==='inicial'){a.initial+=x.monto;a.base+=x.monto;}
    if(x.tipo==='aporte'){a.aportes+=x.monto;a.base+=x.monto;a.pending=true;}
    if(x.tipo==='retiro'){a.retiros+=x.monto;a.base-=x.monto;a.pending=true;}
    var value=x.tipo==='valor'||x.tipo==='inicial'?x.monto:x.valorActual;
    if(value!==null&&value!==undefined&&value!==''){
      a.value=+value;a.asof=invDate(x);a.performance=a.value-a.base;a.pending=false;
    }
  });
  return Array.from(groups.values());
}
function invFillNames(id,currency,allLabel){
  var el=document.getElementById(id),old=el.value;
  var names=Array.from(new Set(DATA.inversion.filter(function(x){return !currency||x.moneda===currency;}).map(function(x){return x.nombre;}))).sort();
  el.innerHTML=(allLabel?'<option value="">'+allLabel+'</option>':'')+names.map(function(n){return '<option value="'+escapeHtml(n)+'">'+escapeHtml(n)+'</option>';}).join('');
  if(names.indexOf(old)!==-1)el.value=old;
}
function invDefaultDate(){
  var now=new Date(),yr=String(STORE.activeEjercicio);
  document.getElementById('invFecha').value=yr+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(Math.min(now.getDate(),new Date(+yr,now.getMonth()+1,0).getDate())).padStart(2,'0');
}
function invFormMode(){
  var type=document.getElementById('invTipo').value,flow=type==='aporte'||type==='retiro',currency=document.getElementById('invMoneda').value;
  document.getElementById('invMontoLabel').textContent={aporte:'Importe del aporte',retiro:'Importe del retiro',valor:'Saldo total de la inversión',inicial:'Saldo al inicio del año'}[type];
  document.getElementById('invValorActual').disabled=!flow;
  document.getElementById('invValorActual').closest('.field').hidden=!flow;
  document.getElementById('invCashMode').disabled=!flow;
  document.getElementById('invCashMode').closest('.field').hidden=!flow;
  document.getElementById('invPesosField').hidden=!(flow&&currency==='USD'&&document.getElementById('invCashMode').value==='auto');
  document.getElementById('invFormHelp').textContent=type==='inicial'?'Cargá el saldo al 1 de enero. No descuenta dinero del presupuesto y establece la base del resultado anual.':type==='valor'?'Ingresá el saldo completo que muestra tu banco o aplicación, incluyendo tus aportes y rendimientos. No genera un ingreso ni un gasto.':'El saldo posterior es opcional, pero permite calcular el resultado a esta fecha. Registrá todos los movimientos anteriores a ese saldo. Si solo transferís dinero ya contabilizado, elegí «Sin movimiento de pesos».';
}
function renderInvGoal(){
  var mes=document.getElementById('invGoalMes').value;
  var goal=(DATA.invGoals||{})[mes];
  document.getElementById('invGoalPct').value=goal===undefined?'':goal;
  var income=computeMonth(mes).totalIngresos;
  var actual=DATA.inversion.filter(function(x){return x.mes===mes&&x.tipo==='aporte';}).reduce(function(sum,x){return sum+(x.moneda==='ARS'?x.monto:x.pesos||0);},0);
  var target=income*(goal||0)/100;
  document.getElementById('invGoalStatus').textContent=goal===undefined?'Elegí el mes y guardá tu objetivo.':mes+': '+money(actual)+' aportados de '+money(target)+' de meta'+(target>0?' ('+Math.round(actual/target*100)+'%).':'.')+' Se cuentan aportes en pesos y aportes en USD con pesos declarados; no se descuentan retiros.';
}
function renderInversion(){
  var currency=document.getElementById('invCurrency').value,accounts=invAccounts(currency);
  var base=0,value=0,perf=0,complete=accounts.length>0;
  accounts.forEach(function(a){base+=a.base;if(a.value===null||a.pending)complete=false;else{value+=a.value;perf+=a.performance;}});
  var rows=invRows(currency),ap=rows.reduce(function(s,x){return s+(x.tipo==='aporte'?x.monto:0);},0),ret=rows.reduce(function(s,x){return s+(x.tipo==='retiro'?x.monto:0);},0);
  var cards=[['Capital neto',invMoney(base,currency),'Saldo inicial + aportes − retiros'],['Valor declarado',complete?invMoney(value,currency):'Pendiente','Suma de últimos saldos; pueden tener fechas distintas'],['Resultado del año',complete?invMoney(perf,currency):'Pendiente','Valor declarado − capital neto'],['Aportes / retiros','<span style="font-size:16px">↑ '+invMoney(ap,currency)+'<br>↓ '+invMoney(ret,currency)+'</span>','Movimientos del año seleccionado']];
  document.getElementById('invKpiRow').innerHTML=cards.map(function(c){return '<div class="kpi"><div class="kpi-label">'+c[0]+'</div><div class="kpi-value" style="font-size:22px">'+c[1]+'</div><div class="kpi-sub">'+c[2]+'</div></div>';}).join('');
  document.getElementById('invAccounts').innerHTML=accounts.map(function(a){var name=escapeHtml(a.nombre);return '<article class="inv-account"><h3>'+name+'</h3><strong>'+invMoney(a.value,a.moneda)+'</strong><p class="inv-help">'+(a.asof?'Saldo declarado al '+a.asof:'Sin saldo declarado')+'<br>Capital neto: '+invMoney(a.base,a.moneda)+'<br>'+(a.pending||a.value===null?'<span class="inv-warn">Actualizá el saldo para calcular el resultado.</span>':'Resultado: '+invMoney(a.performance,a.moneda))+'</p><div class="inv-actions">'+['aporte','retiro','valor'].map(function(t){return '<button type="button" class="btn" data-inv-action="'+t+'" data-name="'+name+'" data-currency="'+escapeHtml(a.moneda)+'">'+{aporte:'Aportar',retiro:'Retirar',valor:'Actualizar saldo'}[t]+'</button>';}).join('')+'</div></article>';}).join('')||'<p class="inv-help">Todavía no registraste inversiones en esta moneda. Cargá tu primer aporte o un saldo inicial.</p>';
  invFillNames('invNames',null,null);invFillNames('filtInvName',currency,'Todas las inversiones');
  var mes=document.getElementById('filtInvMes').value,name=document.getElementById('filtInvName').value;
  var filtered=rows.filter(function(x){return (!mes||x.mes===mes)&&(!name||x.nombre===name);}).reverse();
  document.getElementById('listInversion').innerHTML=filtered.length?'<div class="inv-history"><table><thead><tr><th>Fecha</th><th>Inversión</th><th>Movimiento</th><th>Importe</th><th>Detalle</th><th>Acciones</th></tr></thead><tbody>'+filtered.map(function(x){return '<tr><td>'+invDate(x)+'</td><td>'+escapeHtml(x.nombre)+'</td><td>'+invLabels[x.tipo]+'</td><td>'+invMoney(x.monto,x.moneda)+'</td><td>'+escapeHtml(x.nota||'')+(x.valorActual!==null&&x.valorActual!==undefined?'<br>Saldo posterior: '+invMoney(x.valorActual,x.moneda):'')+(x.pesos>0?'<br>Movimiento de pesos: '+money(x.pesos):'')+'</td><td><button type="button" class="entry-edit" data-kind="inversion" data-id="'+escapeHtml(x.id)+'" aria-label="Editar movimiento">'+ICON_EDIT+'</button><button type="button" class="entry-del" data-kind="inversion" data-id="'+escapeHtml(x.id)+'" aria-label="Eliminar movimiento">'+ICON_DEL+'</button></td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty-state">No hay movimientos con estos filtros.</div>';
  document.getElementById('invLegacyNotice').textContent=DATA.inversion.some(function(x){return x.legacy;})?'Los registros anteriores se convirtieron en importes fijos estimados. Revisá «Inversión anterior»: se conservó el último porcentaje de cada mes y el último saldo declarado. Los originales están preservados en la copia de datos.':'';
  var year=String(STORE.activeEjercicio),date=document.getElementById('invFecha');date.min=year+'-01-01';date.max=year+'-12-31';
  if(!date.value||date.value.slice(0,4)!==year){invDefaultDate();}
  renderInvGoal();invFormMode();
}
function renderInvestmentChart(){
  var currency=document.getElementById('invChartCurrency').value;
  invFillNames('invChartName',currency,'Todas las inversiones');
  var name=document.getElementById('invChartName').value,rows=invRows(currency,name),el=document.getElementById('chartInversion');
  if(!rows.length){el.innerHTML='<div class="empty-state">Registrá aportes y saldos para ver su evolución.</div>';return;}
  var end=Math.max.apply(null,rows.map(function(x){return MESES.indexOf(x.mes);}));
  var points=MESES.slice(0,end+1).map(function(m,i){var aa=invAccounts(currency,name,i),base=0,value=0,valid=aa.length>0;aa.forEach(function(a){base+=a.base;if(a.value===null||a.pending)valid=false;else value+=a.value;});return {mes:m,base:aa.length?base:null,value:valid?value:null};});
  var nums=[0];points.forEach(function(p){if(p.base!==null)nums.push(p.base);if(p.value!==null)nums.push(p.value);});
  var min=Math.min.apply(null,nums),max=Math.max.apply(null,nums);if(max===min)max=min+1;var span=max-min;max+=span*.12;min-=span*.08;
  var W=900,H=290,L=100,R=28,T=20,B=45,iw=W-L-R,ih=H-T-B;
  function xx(i){return L+i*iw/11;}function yy(v){return T+(max-v)/(max-min)*ih;}
  var svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Capital neto y valor declarado de las inversiones por mes">';
  for(var j=0;j<5;j++){var v=min+(max-min)*j/4,y=yy(v);svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="'+CHART_COLORS.grid+'"/><text x="'+(L-8)+'" y="'+(y+4)+'" text-anchor="end" fill="'+CHART_COLORS.textDim+'" font-size="11">'+fmt.format(v)+'</text>';}
  MESES.forEach(function(m,i){svg+='<text x="'+xx(i)+'" y="'+(H-14)+'" text-anchor="middle" fill="'+CHART_COLORS.textDim+'" font-size="11">'+m.slice(0,3)+'</text>';});
  [{key:'base',color:CHART_COLORS.inversion,label:'Capital neto'},{key:'value',color:CHART_COLORS.ingreso,label:'Valor declarado'}].forEach(function(series){var path='',prev=false;points.forEach(function(p,i){var v=p[series.key];if(v===null){prev=false;return;}path+=(prev?' L ':' M ')+xx(i)+' '+yy(v);prev=true;});svg+='<path d="'+path+'" fill="none" stroke="'+series.color+'" stroke-width="2.5"/>';points.forEach(function(p,i){if(p[series.key]===null)return;var tip=p.mes+' · '+series.label+': '+invMoney(p[series.key],currency);svg+='<circle cx="'+xx(i)+'" cy="'+yy(p[series.key])+'" r="4" fill="'+series.color+'" data-tip="'+escapeHtml(tip)+'"><title>'+escapeHtml(tip)+'</title></circle>';});});
  svg+='</svg>';
  el.innerHTML='<div class="inv-legend"><span style="color:var(--inversion)">● Capital neto (inicial + aportes − retiros)</span><span style="color:var(--ingreso)">● Valor declarado</span></div><div class="inv-chart-wrap">'+svg+'</div><p class="inv-help">'+currency+' · Año '+escapeHtml(String(STORE.activeEjercicio))+'. Cada punto refleja los registros hasta fin de mes. Se conserva el último saldo declarado si no hubo nuevos movimientos; no implica que el valor de mercado siga igual. Si hubo aportes o retiros sin un nuevo saldo, la línea se interrumpe. La distancia entre líneas representa el resultado según los saldos declarados.</p><details class="inv-chart-table"><summary>Ver datos del gráfico</summary><div class="inv-history"><table><thead><tr><th>Mes</th><th>Capital neto</th><th>Valor declarado</th><th>Resultado</th></tr></thead><tbody>'+points.map(function(p){return '<tr><td>'+p.mes+'</td><td>'+invMoney(p.base,currency)+'</td><td>'+invMoney(p.value,currency)+'</td><td>'+invMoney(p.value===null?null:p.value-p.base,currency)+'</td></tr>';}).join('')+'</tbody></table></div></details>';
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

/* ===================== EDICIÓN DE ENTRADAS ===================== */
var editingId = { ingresos:null, gastos:null, dolar:null, inversion:null };
var SECTION_FORM = {
  ingresos:{formId:'formIngreso', titleId:'ingFormTitle', submitId:'ingSubmitBtn', cancelId:'ingCancelEdit', mesId:'ingMes', addTitle:'Agregar ingreso', editTitle:'Editar ingreso', addBtn:'Agregar', editBtn:'Guardar cambios'},
  gastos:{formId:'formGasto', titleId:'gasFormTitle', submitId:'gasSubmitBtn', cancelId:'gasCancelEdit', mesId:'gasMes', addTitle:'Agregar gasto', editTitle:'Editar gasto', addBtn:'Agregar', editBtn:'Guardar cambios'},
  dolar:{formId:'formDolar', titleId:'usdFormTitle', submitId:'usdSubmitBtn', cancelId:'usdCancelEdit', mesId:'usdMes', addTitle:'Registrar compra', editTitle:'Editar compra', addBtn:'Agregar', editBtn:'Guardar cambios'},
  inversion:{formId:'formInversion', titleId:'invFormTitle', submitId:'invSubmitBtn', cancelId:'invCancelEdit', mesId:'invMes', addTitle:'Registrar movimiento', editTitle:'Editar movimiento', addBtn:'Agregar', editBtn:'Guardar cambios'}
};

function setFormEditMode(kind, isEditing){
  var cfg = SECTION_FORM[kind];
  document.getElementById(cfg.titleId).innerHTML = isEditing ? (cfg.editTitle+'<span class="edit-badge">editando</span>') : cfg.addTitle;
  document.getElementById(cfg.submitId).textContent = isEditing ? cfg.editBtn : cfg.addBtn;
  document.getElementById(cfg.cancelId).style.display = isEditing ? 'inline-flex' : 'none';
  document.getElementById(cfg.formId).closest('.form-card').classList.toggle('is-editing', isEditing);
  if(kind==='gastos'){
    var repeatWrap = document.getElementById('gasRepeatWrap');
    if(repeatWrap) repeatWrap.style.display = isEditing ? 'none' : '';
    var repeatOptions = document.getElementById('gasRepeatOptions');
    if(repeatOptions) repeatOptions.style.display = isEditing ? 'none' : (document.getElementById('gasRepeat').checked ? '' : 'none');
    var cuotasWrap = document.getElementById('gasCuotasWrap');
    if(cuotasWrap) cuotasWrap.style.display = isEditing ? 'none' : '';
    var cuotasOptions = document.getElementById('gasCuotasOptions');
    if(cuotasOptions) cuotasOptions.style.display = isEditing ? 'none' : (document.getElementById('gasCuotas').checked ? '' : 'none');
  }
}

function hideMoneyPreview(id){
  var el = document.getElementById(id);
  if(el){ el.style.display='none'; el.textContent=''; }
}
function resetFormDefaults(kind){
  var cfg = SECTION_FORM[kind];
  document.getElementById(cfg.formId).reset();
  var idx = new Date().getMonth();
  document.getElementById(cfg.mesId).value = MESES[idx] || 'Enero';
  if(kind==='gastos'){
    fillCatSelect(false); updateDescDatalist();
    var ro = document.getElementById('gasRepeatOptions');
    var rd = document.getElementById('gasRepeatDias');
    if(ro) ro.style.display = 'none';
    if(rd) rd.style.display = 'none';
    var cc = document.getElementById('gasCuotas');
    if(cc){ cc.checked = false; if(window.__syncGasCuotas) window.__syncGasCuotas(); }
  }
  if(kind==='inversion'){ invDefaultDate(); invFormMode(); }
  if(kind==='ingresos') hideMoneyPreview('ingMontoPreview');
  if(kind==='gastos') hideMoneyPreview('gasMontoPreview');
}

function cancelEdit(kind){
  editingId[kind] = null;
  setFormEditMode(kind, false);
  resetFormDefaults(kind);
  renderAll();
}

function populateFormForEdit(kind, item){
  if(kind==='ingresos'){
    document.getElementById('ingMes').value = item.mes;
    document.getElementById('ingFecha').value = item.fecha || '';
    document.getElementById('ingTipo').value = item.tipo;
    setMoneyInputValue(document.getElementById('ingMonto'), item.monto);
    hideMoneyPreview('ingMontoPreview');
  } else if(kind==='gastos'){
    document.getElementById('gasMes').value = item.mes;
    document.getElementById('gasFecha').value = item.fecha || '';
    document.getElementById('gasTipo').value = item.tipo;
    fillCatSelect(false);
    document.getElementById('gasCat').value = item.cat;
    updateDelCatButton();
    updateDescDatalist();
    document.getElementById('gasDesc').value = item.desc||'';
    setMoneyInputValue(document.getElementById('gasMonto'), item.monto);
    hideMoneyPreview('gasMontoPreview');
  } else if(kind==='dolar'){
    document.getElementById('usdMes').value = item.mes;
    setMoneyInputValue(document.getElementById('usdCant'), item.cant);
    setMoneyInputValue(document.getElementById('usdValor'), item.valor);
    setMoneyInputValue(document.getElementById('usdTotal'), item.total);
  } else if(kind==='inversion'){
    document.getElementById('invMes').value = item.mes;
    document.getElementById('invName').value = item.nombre;
    document.getElementById('invMoneda').value = item.moneda;
    document.getElementById('invTipo').value = item.tipo;
    document.getElementById('invFecha').value = invDate(item);
    setMoneyInputValue(document.getElementById('invMonto'), item.monto);
    setMoneyInputValue(document.getElementById('invValorActual'), item.valorActual);
    document.getElementById('invCashMode').value = item.pesos>0 ? 'auto' : 'none';
    setMoneyInputValue(document.getElementById('invPesos'), item.pesos);
    document.getElementById('invNota').value = item.nota||'';
    invFormMode();
  }
}

function startEdit(kind, id){
  var item = DATA[kind].filter(function(x){return x.id===id;})[0];
  if(!item) return;
  editingId[kind] = id;
  populateFormForEdit(kind, item);
  setFormEditMode(kind, true);
  if(kind==='gastos'){ if(window.setGasFormOpen) window.setGasFormOpen(true); var _mo=document.getElementById('gasMore'); if(_mo && item.fecha) _mo.open=true; }
  renderAll();
  var formCard = document.getElementById(SECTION_FORM[kind].formId).closest('.form-card');
  formCard.scrollIntoView({behavior:'smooth', block:'start'});
}
Object.keys(SECTION_FORM).forEach(function(kind){
  document.getElementById(SECTION_FORM[kind].cancelId).addEventListener('click', function(){ cancelEdit(kind); });
});

/* ===================== DELETE (event delegation) ===================== */
document.getElementById('view-ingresos').addEventListener('click', onDelClick);
document.getElementById('view-gastos').addEventListener('click', onDelClick);
document.getElementById('view-dolar').addEventListener('click', onDelClick);
document.getElementById('view-inversion').addEventListener('click', onDelClick);
async function onDelClick(e){
  var toggleHead = e.target.closest('.month-group-head');
  if(toggleHead){
    var key = toggleHead.dataset.sec+'-'+toggleHead.dataset.mes;
    if(collapsedGroups.has(key)) collapsedGroups.delete(key); else collapsedGroups.add(key);
    renderAll();
    return;
  }
  var editBtn = e.target.closest('.entry-edit');
  if(editBtn){
    startEdit(editBtn.dataset.kind, editBtn.dataset.id);
    return;
  }
  var btn = e.target.closest('.entry-del');
  if(!btn) return;
  if(esSoloLectura()){ toast('Estás en modo solo lectura: no podés eliminar registros.'); return; }
  var kind = btn.dataset.kind, id = btn.dataset.id;
  if(editingId[kind]===id){
    editingId[kind] = null;
    setFormEditMode(kind, false);
    resetFormDefaults(kind);
  }
  var delYear = STORE.activeEjercicio;
  var delIdx = DATA[kind].findIndex(function(x){return x.id===id;});
  var delItem = delIdx >= 0 ? DATA[kind][delIdx] : null;
  var delExtra = [];
  if(kind==='gastos' && delItem && (delItem.recurrente || delItem.cuotaGrupoId)){
    var sig = gastosSiguientes(delItem);
    if(sig.length){
      var esCuotaDel = !!delItem.cuotaGrupoId;
      var r = await askConfirm({title: esCuotaDel?'Cuota de compra':'Gasto recurrente', paragraphs:[esCuotaDel?('Esta compra tiene '+sig.length+' cuota(s) más adelante.'):('Este gasto se repite: hay '+sig.length+' más adelante.')], altLabel:(esCuotaDel?'Esta':'Este')+' y las siguientes ('+(sig.length+1)+')', confirmLabel:esCuotaDel?'Solo esta':'Solo este', danger:false});
      if(!r) return;
      if(r==='alt') delExtra = sig.map(function(g){ return {item:g, idx:DATA.gastos.indexOf(g)}; });
    }
  }
  var delIds = [id].concat(delExtra.map(function(x){return x.item.id;}));
  delIdx = DATA[kind].findIndex(function(x){return x.id===id;});
  DATA[kind] = DATA[kind].filter(function(x){return delIds.indexOf(x.id)===-1;});
  saveData();
  renderAll();
  toast(delIds.length>1 ? delIds.length+' registros eliminados' : 'Registro eliminado', delItem ? { action: function(){
    restoreDeletedEntry(delYear, kind, delItem, delIdx);
    delExtra.forEach(function(x){ restoreDeletedEntry(delYear, kind, x.item, x.idx); });
  } } : undefined);
}
function restoreDeletedEntry(year, kind, item, idx){
  var ex = STORE.ejercicios[year];
  if(!ex || !ex[kind]){ toast('No se pudo deshacer: el ejercicio ya no existe'); return; }
  if(!ex[kind].some(function(x){return x.id===item.id;})){
    ex[kind].splice(Math.min(idx, ex[kind].length), 0, item);
  }
  DATA = STORE.ejercicios[STORE.activeEjercicio];
  saveData(); renderAll();
  toast('Registro restaurado');
}

/* ===================== FORMS ===================== */
document.getElementById('formIngreso').addEventListener('submit', function(e){
  e.preventDefault();
  if(esSoloLectura()){ toast('Estás en modo solo lectura: no podés cargar ingresos.'); return; }
  var fd = new FormData(e.target);
  var monto = parseMoneyValue(fd.get('monto'));
  if(isNaN(monto)) return;
  var ingFecha = fd.get('fecha') || '';
  var _antesI = new Set(DATA.ingresos.map(function(x){return x.id;}));
  var _editadoI = editingId.ingresos;
  if(editingId.ingresos){
    var item = DATA.ingresos.filter(function(x){return x.id===editingId.ingresos;})[0];
    if(item){ item.mes=fd.get('mes'); item.fecha=ingFecha; item.tipo=fd.get('tipo'); item.monto=monto; item.autor=currentAutor(); }
    editingId.ingresos = null;
    setFormEditMode('ingresos', false);
    toast('Ingreso actualizado');
  } else {
    DATA.ingresos.push({id:uid('ing'), mes:fd.get('mes'), fecha:ingFecha, tipo:fd.get('tipo'), monto:monto, autor:currentAutor()});
    toast('Ingreso agregado');
  }
  saveData(); renderAll();
  flashEntry('ingresos', _antesI, _editadoI, fd.get('mes'));
  document.getElementById('ingMonto').value = '';
  document.getElementById('ingFecha').value = '';
  hideMoneyPreview('ingMontoPreview');
});

document.getElementById('formGasto').addEventListener('submit', async function(e){
  e.preventDefault();
  if(esSoloLectura()){ toast('Estás en modo solo lectura: no podés cargar gastos.'); return; }
  var fd = new FormData(e.target);
  var monto = parseMoneyValue(fd.get('monto'));
  if(isNaN(monto)) return;
  var cat = fd.get('cat');
  if(cat==='__new__') return;
  var gasFechaVal = fd.get('fecha') || '';
  var _antes = new Set(DATA.gastos.map(function(x){return x.id;}));
  var _editado = editingId.gastos;
  if(editingId.gastos){
    var item = DATA.gastos.filter(function(x){return x.id===editingId.gastos;})[0];
    if(item){
      var _esCuotaItem = !!item.cuotaGrupoId;
      var _sig = (item.recurrente || _esCuotaItem) ? gastosSiguientes(item) : [];
      var _alc = false;
      if(_sig.length){
        _alc = _esCuotaItem
          ? await askConfirm({title:'Editar cuota', paragraphs:['Esta compra tiene '+_sig.length+' cuota(s) más adelante. El monto de cada cuota no se puede editar en bloque (quedó fijado al cargar la compra); se puede aplicar tipo, categoría y descripción a las siguientes.'], altLabel:'Esta y las siguientes ('+(_sig.length+1)+')', confirmLabel:'Solo esta', danger:false})
          : await askConfirm({title:'Editar gasto recurrente', paragraphs:['Podés aplicar tipo, categoría, descripción y monto a los '+_sig.length+' siguientes. La fecha y el mes de cada uno no cambian.'], altLabel:'Este y los siguientes ('+(_sig.length+1)+')', confirmLabel:'Solo este', danger:false});
        if(!_alc) return;
      }
      var _montoFinal = (_esCuotaItem && _alc==='alt') ? item.monto : monto; // en cuotas, "y las siguientes" no toca el monto
      item.mes=fd.get('mes'); item.fecha=gasFechaVal; item.tipo=fd.get('tipo'); item.cat=cat; item.desc=fd.get('desc')||''; item.monto=_montoFinal; item.autor=currentAutor();
      if(_alc==='alt') _sig.forEach(function(g){ g.tipo=item.tipo; g.cat=cat; g.desc=item.desc; if(!_esCuotaItem) g.monto=monto; g.autor=currentAutor(); });
    }
    editingId.gastos = null;
    setFormEditMode('gastos', false);
    toast('Gasto actualizado');
  } else {
    var mes = fd.get('mes');
    var tipo = fd.get('tipo');
    var desc = fd.get('desc')||'';
    var repetir = fd.get('repetir') === 'on';
    var esCuotas = document.getElementById('gasCuotas').checked;
    if(esCuotas){
      var nCuotas = Math.max(2, parseInt(document.getElementById('gasCuotasN').value,10) || 2);
      var montoBase = Math.round((monto/nCuotas)*100)/100;
      var cuotaGrupoId = uid('cuo');
      var startIdx = MESES.indexOf(mes);
      var fechaBaseCuo = gasFechaVal ? parseFechaLocal(gasFechaVal) : null;
      var acumuladoCuo = 0, creadasCuo = 0;
      for(var ci=0; ci<nCuotas; ci++){
        var mi = startIdx + ci;
        if(mi >= MESES.length) break; // se corta al fin del ejercicio; el resto queda para el año que viene
        var montoCuota = (ci===nCuotas-1) ? Math.round((monto-acumuladoCuo)*100)/100 : montoBase;
        if(ci < nCuotas-1) acumuladoCuo += montoBase;
        var fechaCuo = '';
        if(fechaBaseCuo) fechaCuo = formatFechaISO(new Date(fechaBaseCuo.getFullYear(), mi, fechaBaseCuo.getDate()));
        DATA.gastos.push({
          id:uid('gas'), mes:MESES[mi], fecha:fechaCuo, tipo:tipo, cat:cat, desc:desc, monto:montoCuota,
          cuotaGrupoId:cuotaGrupoId, cuotaNum:ci+1, cuotaTotal:nCuotas, cuotaMontoTotal:monto,
          autor:currentAutor()
        });
        creadasCuo++;
      }
      var fueraCuo = nCuotas - creadasCuo;
      toast(fueraCuo>0 ? 'Compra en '+nCuotas+' cuotas cargada ('+fueraCuo+' quedan para el próximo ejercicio)' : 'Compra en '+nCuotas+' cuotas cargada');
    } else if(repetir){
      var freq = document.getElementById('gasRepeatFreq').value || 'mensual';
      var creados = 0;
      if(freq === 'mensual'){
        // Comportamiento clásico: un registro por mes hasta fin de año, conservando
        // el mismo día del mes en cada ocurrencia si se cargó una fecha.
        var startIdx = MESES.indexOf(mes);
        var fechaBase = gasFechaVal ? parseFechaLocal(gasFechaVal) : null;
        MESES.forEach(function(m, i){
          if(i < startIdx) return; // no tocar meses anteriores al elegido
          var yaExiste = DATA.gastos.some(function(x){
            return x.mes===m && x.tipo===tipo && x.cat===cat && (x.desc||'')===desc;
          });
          if(yaExiste) return; // evitar duplicar si ya había un gasto igual cargado ese mes
          var fechaOcurrencia = '';
          if(fechaBase) fechaOcurrencia = formatFechaISO(new Date(fechaBase.getFullYear(), i, fechaBase.getDate()));
          DATA.gastos.push({id:uid('gas'), mes:m, fecha:fechaOcurrencia, tipo:tipo, cat:cat, desc:desc, monto:monto, recurrente:true, autor:currentAutor()});
          creados++;
        });
        toast(creados>1 ? 'Gasto agregado y repetido en '+(creados-1)+' mes(es) más' : 'Gasto agregado');
      } else if(!gasFechaVal){
        toast('Para repetir de forma semanal, quincenal o cada N días, completá la Fecha.');
        return;
      } else {
        var intervalo = freq==='semanal' ? 7 : freq==='quincenal' ? 15 : Math.max(1, parseInt(document.getElementById('gasRepeatDias').value,10) || 1);
        var yearNum = parseInt(STORE.activeEjercicio, 10);
        var finEjercicio = new Date(yearNum, 11, 31);
        var cursor = parseFechaLocal(gasFechaVal);
        if(!cursor){ toast('Fecha inválida.'); return; }
        var salvaguarda = 0;
        while(cursor.getTime() <= finEjercicio.getTime() && salvaguarda < 500){
          salvaguarda++;
          var fechaIso = formatFechaISO(cursor);
          var mesOcurrencia = MESES[cursor.getMonth()];
          var yaExiste = DATA.gastos.some(function(x){
            return x.fecha===fechaIso && x.tipo===tipo && x.cat===cat && (x.desc||'')===desc;
          });
          if(!yaExiste){
            DATA.gastos.push({id:uid('gas'), mes:mesOcurrencia, fecha:fechaIso, tipo:tipo, cat:cat, desc:desc, monto:monto, recurrente:true, recurrenciaFreq:freq, autor:currentAutor()});
            creados++;
          }
          cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()+intervalo);
        }
        toast(creados>1 ? 'Gasto agregado y repetido '+(creados-1)+' vez(es) más' : 'Gasto agregado');
      }
    } else {
      DATA.gastos.push({id:uid('gas'), mes:mes, fecha:gasFechaVal, tipo:tipo, cat:cat, desc:desc, monto:monto, autor:currentAutor()});
      toast('Gasto agregado');
    }
  }
  saveData(); updateDescDatalist(); renderAll();
  flashEntry('gastos', _antes, _editado, fd.get('mes'));
  try{ budgetAlert(fd.get('tipo'), cat, fd.get('mes')); }catch(_e){}
  if(window.innerWidth<=860 && window.setGasFormOpen) window.setGasFormOpen(false);
  document.getElementById('gasDesc').value='';
  document.getElementById('gasMonto').value='';
  document.getElementById('gasFecha').value='';
  document.getElementById('gasRepeat').checked = false;
  document.getElementById('gasRepeatOptions').style.display = 'none';
  document.getElementById('gasRepeatDias').style.display = 'none';
  document.getElementById('gasCuotas').checked = false;
  if(window.__syncGasCuotas) window.__syncGasCuotas();
  hideMoneyPreview('gasMontoPreview');
});

/* Mostrar/ocultar las opciones de frecuencia según el checkbox y el select */
(function(){
  var chk = document.getElementById('gasRepeat');
  var opts = document.getElementById('gasRepeatOptions');
  var freqSel = document.getElementById('gasRepeatFreq');
  var diasInput = document.getElementById('gasRepeatDias');
  function sync(){
    opts.style.display = chk.checked ? '' : 'none';
    diasInput.style.display = (chk.checked && freqSel.value==='personalizado') ? '' : 'none';
    var chkCuotas = document.getElementById('gasCuotas');
    if(chk.checked && chkCuotas && chkCuotas.checked){ chkCuotas.checked = false; if(window.__syncGasCuotas) window.__syncGasCuotas(); }
  }
  chk.addEventListener('change', sync);
  freqSel.addEventListener('change', sync);
  sync();
})();

/* Cuotas de tarjeta de crédito: toggle, exclusión mutua con "Repetir",
   y preview en vivo de "N cuotas de $X" con ajuste de redondeo en la última. */
(function(){
  var chkCuotas = document.getElementById('gasCuotas');
  var chkRepeat = document.getElementById('gasRepeat');
  var opts = document.getElementById('gasCuotasOptions');
  var nInput = document.getElementById('gasCuotasN');
  var montoInput = document.getElementById('gasMonto');
  var montoLabel = document.getElementById('gasMontoLabel');
  var preview = document.getElementById('gasCuotaPreview');
  var hint = document.getElementById('gasCuotaHint');
  var mesSel = document.getElementById('gasMes');

  function montosCuotas(total, n){
    // Reparte el total en n cuotas, ajustando la diferencia de redondeo en la última.
    var base = Math.round((total/n)*100)/100;
    var montos = [];
    for(var i=0;i<n-1;i++) montos.push(base);
    var acumulado = base*(n-1);
    montos.push(Math.round((total-acumulado)*100)/100);
    return montos;
  }

  function sync(){
    var activo = chkCuotas.checked;
    opts.style.display = activo ? '' : 'none';
    montoLabel.textContent = activo ? 'Monto total de la compra' : 'Monto';
    if(activo && chkRepeat.checked){ chkRepeat.checked = false; chkRepeat.dispatchEvent(new Event('change')); }
    actualizarPreview();
  }
  function actualizarPreview(){
    if(!chkCuotas.checked){ preview.textContent=''; hint.style.display='none'; return; }
    var total = parseMoneyValue(montoInput.value);
    var n = Math.max(2, parseInt(nInput.value,10) || 2);
    if(isNaN(total) || total<=0){ preview.textContent=''; hint.style.display='none'; return; }
    var montos = montosCuotas(total, n);
    preview.textContent = n+' cuotas de '+money(montos[0])+(montos[n-1]!==montos[0] ? ' (última '+money(montos[n-1])+')' : '');
    var startIdx = MESES.indexOf(mesSel.value);
    var restantesEnEjercicio = MESES.length - startIdx;
    if(n > restantesEnEjercicio){
      var fuera = n - restantesEnEjercicio;
      hint.style.display = '';
      hint.textContent = 'Ojo: '+fuera+' cuota(s) caen después de diciembre — vas a tener que cargarlas vos cuando abras el próximo ejercicio.';
    } else {
      hint.style.display = 'none';
    }
  }
  chkCuotas.addEventListener('change', sync);
  nInput.addEventListener('input', actualizarPreview);
  montoInput.addEventListener('input', actualizarPreview);
  mesSel.addEventListener('change', actualizarPreview);
  sync();
  window.__syncGasCuotas = sync; // para resetear desde el submit handler
})();

var usdCant = document.getElementById('usdCant');
var usdValor = document.getElementById('usdValor');
var usdTotal = document.getElementById('usdTotal');
function autoCalcUsd(){
  var c = parseMoneyValue(usdCant.value), v = parseMoneyValue(usdValor.value);
  if(!isNaN(c) && !isNaN(v) && v!==0){
    setMoneyInputValue(usdTotal, c/v);
  }
}
usdCant.addEventListener('input', autoCalcUsd);
usdValor.addEventListener('input', autoCalcUsd);

document.getElementById('formDolar').addEventListener('submit', function(e){
  e.preventDefault();
  if(esSoloLectura()){ toast('Estás en modo solo lectura: no podés cargar compras de dólar.'); return; }
  var fd = new FormData(e.target);
  var cantRaw = fd.get('cant'), valorRaw = fd.get('valor');
  var cant = cantRaw==='' ? null : parseMoneyValue(cantRaw);
  var valor = valorRaw==='' ? null : parseMoneyValue(valorRaw);
  var total = parseMoneyValue(fd.get('total'));
  if(isNaN(total)){
    if(cant!==null && valor){ total = cant/valor; } else { return; }
  }
  if(editingId.dolar){
    var item = DATA.dolar.filter(function(x){return x.id===editingId.dolar;})[0];
    if(item){ item.mes=fd.get('mes'); item.cant=cant; item.valor=valor; item.total=total; item.autor=currentAutor(); }
    editingId.dolar = null;
    setFormEditMode('dolar', false);
    toast('Compra actualizada');
  } else {
    DATA.dolar.push({id:uid('usd'), mes:fd.get('mes'), cant:cant, valor:valor, total:total, autor:currentAutor()});
    toast('Compra registrada');
  }
  saveData(); renderAll();
  document.getElementById('usdCant').value='';
  document.getElementById('usdValor').value='';
  document.getElementById('usdTotal').value='';
});

function invNumber(id,optional){
  var raw=document.getElementById(id).value.trim();if(!raw&&optional)return null;
  if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(raw))return NaN;
  return Number(raw.replace(/\./g,'').replace(',','.'));
}
document.getElementById('formInversion').addEventListener('submit',function(e){
  e.preventDefault();if(esSoloLectura()){toast('Estás en modo solo lectura.');return;}
  var nombre=document.getElementById('invName').value.trim(),moneda=document.getElementById('invMoneda').value,tipo=document.getElementById('invTipo').value,fecha=document.getElementById('invFecha').value;
  var monto=invNumber('invMonto'),valor=invNumber('invValorActual',true),flow=tipo==='aporte'||tipo==='retiro';
  if(!nombre||!fecha||fecha.slice(0,4)!==String(STORE.activeEjercicio)||!Number.isFinite(monto)||monto<0||(flow&&monto===0)){toast('Revisá nombre, fecha e importe. Usá coma para los decimales.');return;}
  if(flow&&valor!==null&&(!Number.isFinite(valor)||valor<0)){toast('El saldo debe ser un número igual o mayor a cero.');return;}
  if(tipo==='inicial'&&fecha!==String(STORE.activeEjercicio)+'-01-01'){toast('El saldo inicial corresponde al 1 de enero del año seleccionado.');return;}
  if(tipo==='inicial'&&DATA.inversion.some(function(x){return x.id!==editingId.inversion&&x.nombre===nombre&&x.moneda===moneda&&x.tipo==='inicial';})){toast('Esta inversión ya tiene saldo inicial. Editá el registro existente.');return;}
  var pesos=0;
  if(flow&&document.getElementById('invCashMode').value==='auto'){
    pesos=moneda==='ARS'?monto:invNumber('invPesos');
    if(!Number.isFinite(pesos)||pesos<=0){toast('Indicá los pesos pagados o recibidos, o elegí «Sin movimiento de pesos».');return;}
  }
  var item={id:editingId.inversion||uid('inv'),mes:MESES[Number(fecha.slice(5,7))-1],fecha:fecha,nombre:nombre,moneda:moneda,tipo:tipo,monto:monto,pesos:pesos,valorActual:flow?valor:null,nota:document.getElementById('invNota').value.trim(),autor:currentAutor()};
  if(editingId.inversion){var idx=DATA.inversion.findIndex(function(x){return x.id===editingId.inversion;});if(idx===-1){toast('El movimiento ya no existe.');return;}DATA.inversion[idx]=item;}
  else DATA.inversion.push(item);
  editingId.inversion=null;setFormEditMode('inversion',false);saveData();
  document.getElementById('formInversion').reset();document.getElementById('invName').value=nombre;document.getElementById('invMoneda').value=moneda;document.getElementById('invCurrency').value=moneda;
  invDefaultDate();renderAll();toast('Movimiento guardado');
});
['invTipo','invMoneda','invCashMode'].forEach(function(id){document.getElementById(id).addEventListener('change',function(){
  if(id==='invMoneda')document.getElementById('invCashMode').value=document.getElementById(id).value==='USD'?'none':'auto';
  if(id==='invTipo'&&document.getElementById(id).value==='inicial')document.getElementById('invFecha').value=STORE.activeEjercicio+'-01-01';
  invFormMode();
});});
['invCurrency','filtInvName'].forEach(function(id){document.getElementById(id).addEventListener('change',renderInversion);});
['invChartCurrency','invChartName'].forEach(function(id){document.getElementById(id).addEventListener('change',renderInvestmentChart);});
document.getElementById('invAccounts').addEventListener('click',function(e){var b=e.target.closest('[data-inv-action]');if(!b)return;
  if(esSoloLectura()){toast('Estás en modo solo lectura.');return;}
  editingId.inversion=null;setFormEditMode('inversion',false);document.getElementById('formInversion').reset();
  document.getElementById('invName').value=b.dataset.name;document.getElementById('invMoneda').value=b.dataset.currency;document.getElementById('invTipo').value=b.dataset.invAction;document.getElementById('invCashMode').value=b.dataset.currency==='USD'?'none':'auto';invDefaultDate();invFormMode();document.getElementById('formInversion').scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('invMonto').focus();
});
document.getElementById('invGoalMes').innerHTML=MESES.map(function(m){return '<option>'+m+'</option>';}).join('');
document.getElementById('invGoalMes').value=MESES[new Date().getMonth()];
document.getElementById('invGoalMes').addEventListener('change',renderInvGoal);
document.getElementById('invGoalForm').addEventListener('submit',function(e){e.preventDefault();if(esSoloLectura()){toast('Estás en modo solo lectura.');return;}var raw=document.getElementById('invGoalPct').value,pct=Number(raw);if(raw===''||!Number.isFinite(pct)||pct<0||pct>100)return;DATA.invGoals[document.getElementById('invGoalMes').value]=pct;saveData();renderInvGoal();toast('Meta guardada');});
document.getElementById('invExport').addEventListener('click',function(){
  var mes=document.getElementById('filtInvMes').value,nombre=document.getElementById('filtInvName').value;
  var records=invRows(document.getElementById('invCurrency').value,nombre).filter(function(x){return !mes||x.mes===mes;});
  if(!records.length){toast('No hay movimientos para exportar.');return;}
  var rows=[['Fecha','Inversión','Moneda','Movimiento','Importe','Saldo posterior','Pesos pagados/recibidos','Nota']].concat(records.map(function(x){return [invDate(x),x.nombre,x.moneda,invLabels[x.tipo],x.monto,x.valorActual==null?'':x.valorActual,x.pesos||0,x.nota||''];}));
  var csv=rows.map(function(row){return row.map(function(v){var s=typeof v==='number'?String(v).replace('.',','):String(v);if(/^[=+@-]/.test(s)&&typeof v==='string')s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';');}).join('\r\n');
  var url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='inversiones-'+STORE.activeEjercicio+'.csv';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
});
invDefaultDate();

/* filters for gastos */
['filtMes','filtTipo','filtBusqueda'].forEach(function(id){
  document.getElementById(id).addEventListener('input', renderGastos);
  document.getElementById(id).addEventListener('change', renderGastos);
});
['filtIngMes','filtIngTipo'].forEach(function(id){
  document.getElementById(id).addEventListener('change', renderIngresos);
});
document.getElementById('filtUsdMes').addEventListener('change', renderDolar);
document.getElementById('filtInvMes').addEventListener('change', renderInversion);
document.getElementById('toggleUsdEquiv').addEventListener('change', renderGraficos);
document.getElementById('toggleUsdFijoVar').addEventListener('change', renderGraficos);
document.getElementById('fijoVarChartMode').addEventListener('change', renderGraficos);
document.getElementById('toggleUsdDonut').addEventListener('change', renderGraficos);
document.getElementById('toggleUsdRestante').addEventListener('change', renderGraficos);
document.getElementById('toggleUsdHeatmap').addEventListener('change', renderGraficos);
['hormigaMes','hormigaUmbral','hormigaMinOcurrencias'].forEach(function(id){
  document.getElementById(id).addEventListener('input', renderHormiga);
  document.getElementById(id).addEventListener('change', renderHormiga);
});
document.getElementById('presuChartMes').addEventListener('change', renderPresupuestoChart);
['input','change'].forEach(function(ev){
  document.getElementById('ahorroMeta').addEventListener(ev, renderAhorroChart);
});

/* ===================== EXPORTAR / IMPRIMIR RESUMEN ===================== */
/* ===================== EXPORTAR CSV (Resumen) ===================== */
function sortedCatsByTotal(cats, months, valuesFn){
  return cats.map(function(cat){
    var tot = months.reduce(function(s,m){ return s + valuesFn(m, cat); }, 0);
    return {cat:cat, tot:tot};
  }).sort(function(a,b){ return b.tot - a.tot; }).map(function(x){ return x.cat; });
}
function exportResumenCSV(){
  var months = MESES.map(computeMonth);
  var rows = [['Categoría'].concat(MESES).concat(['Total'])];

  function addRow(label, valuesFn){
    var vals = months.map(valuesFn);
    var tot = vals.reduce(function(a,b){return a+b;},0);
    rows.push([label].concat(vals).concat([tot]));
  }

  addRow('Total Ingresos', function(m){return m.totalIngresos;});

  sortedCatsByTotal(catsFor('Fijo'), months, function(m,cat){return m.fijosPorCat[cat]||0;}).forEach(function(cat){
    addRow(cat, function(m){return m.fijosPorCat[cat]||0;});
  });
  addRow('Total Gastos Fijos', function(m){return m.totalFijos;});

  sortedCatsByTotal(catsFor('Variable'), months, function(m,cat){return m.variablesPorCat[cat]||0;}).forEach(function(cat){
    addRow(cat, function(m){return m.variablesPorCat[cat]||0;});
  });
  addRow('Total Gastos Variables', function(m){return m.totalVariables;});
  addRow('Gastos Totales', function(m){return m.totalGastos;});
  addRow('$ Gastados (pesos)', function(m){return m.pesosGastadosUsd;});
  addRow('USD Totales', function(m){return m.totalUsd;});
  if(DATA.inversion.length){ addRow('Aportes − retiros (pesos)', function(m){return m.montoInversion;}); }
  addRow('Total Gastado', function(m){return m.totalGastado;});
  addRow('Total Restante', function(m){return m.totalRestante;});

  var csv = rows.map(function(r){
    return r.map(function(cell){
      var s = String(cell);
      if(s.indexOf(',')!==-1 || s.indexOf('"')!==-1 || s.indexOf('\n')!==-1){ s = '"'+s.replace(/"/g,'""')+'"'; }
      return s;
    }).join(',');
  }).join('\r\n');

  var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'resumen-'+String(STORE.activeEjercicio).replace(/[^a-z0-9-_]/gi,'_')+'.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 500);
  toast('CSV descargado');
}
document.getElementById('btnExportCsv').addEventListener('click', exportResumenCSV);

document.getElementById('btnPrintResumen').addEventListener('click', function(){
  var resumenBtn = document.querySelector('.nav-btn[data-tab="resumen"]');
  if(resumenBtn && !resumenBtn.classList.contains('active')) resumenBtn.click();
  var printHeader = document.getElementById('printHeader');
  var ahora = new Date();
  var fechaTxt = ahora.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric'});
  var horaTxt = ahora.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
  printHeader.innerHTML =
    '<div class="print-title">Ejercicio '+escapeHtml(STORE.activeEjercicio)+'</div>'+
    '<div class="print-sub">Generado el '+fechaTxt+' a las '+horaTxt+'</div>';
  setTimeout(function(){ window.print(); }, 60);
});

/* ===================== PRESUPUESTOS POR CATEGORÍA ===================== */
function presuKey(tipo, cat){ return tipo+'|'+cat; }
var presupuestosOverlay = document.getElementById('presupuestosOverlay');
function renderPresupuestosModal(){
  function listHtml(tipo){
    return catsFor(tipo).map(function(cat){
      var key = presuKey(tipo, cat);
      var val = DATA.presupuestos[key];
      return '<div class="presu-row">'+
        '<span class="presu-name">'+escapeHtml(cat)+'</span>'+
        '<input type="text" inputmode="decimal" class="money-input presu-input" data-key="'+escapeHtml(key)+'" placeholder="Sin tope" value="'+(val?fmt.format(val):'')+'">'+
      '</div>';
    }).join('');
  }
  document.getElementById('presupuestosFijoList').innerHTML = listHtml('Fijo');
  document.getElementById('presupuestosVariableList').innerHTML = listHtml('Variable');
  presupuestosOverlay.querySelectorAll('.presu-input').forEach(function(inp){
    attachMoneyInput(inp);
    inp.addEventListener('change', function(){
      var key = inp.getAttribute('data-key');
      var num = parseMoneyValue(inp.value);
      if(!inp.value.trim() || isNaN(num) || num<=0){
        delete DATA.presupuestos[key];
      } else {
        DATA.presupuestos[key] = num;
      }
      saveData();
      renderAll();
    });
  });
}
function openPresupuestosModal(){ renderPresupuestosModal(); presupuestosOverlay.classList.add('open'); }
function closePresupuestosModal(){ presupuestosOverlay.classList.remove('open'); }
document.getElementById('btnPresupuestos').addEventListener('click', openPresupuestosModal);
document.getElementById('presupuestosClose').addEventListener('click', closePresupuestosModal);
presupuestosOverlay.addEventListener('click', function(e){ if(e.target===presupuestosOverlay) closePresupuestosModal(); });
document.addEventListener('keydown', function(e){
  if(e.key==='Escape' && presupuestosOverlay.classList.contains('open')) closePresupuestosModal();
});

/* ===================== REGLAS: MODAL Y ENGANCHES ===================== */
var reglasOverlay = document.getElementById('reglasOverlay');
function fillReglaCats(){
  var tipo = document.getElementById('reglaTipo').value;
  var sel = document.getElementById('reglaCat');
  var prev = sel.value;
  var list = catsFor(tipo);
  sel.innerHTML = list.map(function(c){ return '<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>'; }).join('');
  if(prev && list.indexOf(prev)!==-1) sel.value = prev;
}
function renderReglasModal(){
  fillReglaCats();
  var rs = getReglas().slice().sort(function(a,b){ return a.texto.localeCompare(b.texto,'es'); });
  document.getElementById('reglasList').innerHTML = rs.length ? rs.map(function(r){
    var label = '«'+r.texto+'» → '+r.cat+' ('+r.tipo+')';
    return '<div class="presu-row"><span class="presu-name" title="'+escapeHtml(label)+'">'+escapeHtml(label)+'</span>'+
      '<button type="button" class="ghost-btn regla-del" data-id="'+escapeHtml(r.id)+'" aria-label="Eliminar regla" title="Eliminar regla">✕</button></div>';
  }).join('') : '<div class="empty-state">Todavía no hay reglas.</div>';
}
function openReglasModal(){ renderReglasModal(); reglasOverlay.classList.add('open'); setTimeout(function(){ document.getElementById('reglaTexto').focus(); }, 50); }
function closeReglasModal(){ reglasOverlay.classList.remove('open'); }
document.getElementById('btnReglas').addEventListener('click', openReglasModal);
document.getElementById('reglasClose').addEventListener('click', closeReglasModal);
reglasOverlay.addEventListener('click', function(e){ if(e.target===reglasOverlay) closeReglasModal(); });
document.addEventListener('keydown', function(e){ if(e.key==='Escape' && reglasOverlay.classList.contains('open')) closeReglasModal(); });
document.getElementById('reglaTipo').addEventListener('change', fillReglaCats);

function agregarRegla(){
  if(esSoloLectura()){ toast('Estás en modo solo lectura.'); return; }
  var inp = document.getElementById('reglaTexto');
  var texto = inp.value.trim();
  var tipo = document.getElementById('reglaTipo').value;
  var cat = document.getElementById('reglaCat').value;
  if(texto.length < 2){ toast('Escribí al menos 2 letras para la regla.'); inp.focus(); return; }
  if(!cat){ toast('Elegí una categoría.'); return; }
  var key = normalizeSearchText(texto).trim();
  var existente = getReglas().filter(function(r){ return normalizeSearchText(r.texto).trim()===key; })[0];
  if(existente){ existente.tipo = tipo; existente.cat = cat; existente.texto = texto; toast('Regla actualizada'); }
  else { getReglas().push({id:uid('reg'), texto:texto, tipo:tipo, cat:cat}); toast('Regla agregada'); }
  saveData(); inp.value = ''; renderReglasModal(); inp.focus();
}
document.getElementById('reglaAdd').addEventListener('click', agregarRegla);
document.getElementById('reglaTexto').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); agregarRegla(); } });
document.getElementById('reglasList').addEventListener('click', function(e){
  var b = e.target.closest('.regla-del'); if(!b) return;
  if(esSoloLectura()){ toast('Estás en modo solo lectura.'); return; }
  STORE.reglas = getReglas().filter(function(r){ return r.id!==b.getAttribute('data-id'); });
  saveData(); renderReglasModal(); toast('Regla eliminada');
});

/* Aplicar las reglas a los gastos ya cargados del ejercicio activo (con copia automática y Deshacer) */
function reglasCambios(soloOtros){
  var out = [];
  DATA.gastos.forEach(function(g){
    var r = matchRegla(g.desc);
    if(!r || (g.tipo===r.tipo && g.cat===r.cat)) return;
    if(soloOtros && g.cat!=='Otros' && g.cat!=='Otros egresos') return;
    out.push({g:g, r:r});
  });
  return out;
}
document.getElementById('reglasApply').addEventListener('click', async function(){
  if(esSoloLectura()){ toast('Estás en modo solo lectura.'); return; }
  var todos = reglasCambios(false), otros = reglasCambios(true);
  if(!todos.length){ toast('Ningún gasto del ejercicio necesita cambios con estas reglas.'); return; }
  var res = await askConfirm({
    title: 'Aplicar reglas a gastos existentes',
    paragraphs: ['Se van a recategorizar gastos del ejercicio '+STORE.activeEjercicio+' según sus reglas. Esto pisa la categoría que tengan hoy. Antes se guarda una copia automática y vas a poder deshacerlo.'],
    stats: [['Gastos que cambiarían', String(todos.length)], ['De ellos, hoy en «Otros»', String(otros.length)]],
    confirmLabel: 'Aplicar a todos',
    altLabel: 'Solo los de «Otros»',
    danger: false
  });
  if(!res) return;
  var lista = res==='alt' ? otros : todos;
  if(!lista.length){ toast('No hay gastos para cambiar.'); return; }
  var snap = takeSnapshot('Antes de aplicar reglas de categorización');
  lista.forEach(function(x){ x.g.tipo = x.r.tipo; x.g.cat = x.r.cat; });
  saveData(); updateDescDatalist(); renderAll(); fillCatSelect(true);
  toast(lista.length+' gasto(s) recategorizado(s)', { action: undoFromSnapshot(snap, 'Cambio deshecho'), duration: 12000 });
});

/* Formulario "Agregar gasto": al escribir la descripción se completan tipo y categoría,
   salvo que ya los hayas elegido a mano para este gasto o estés editando uno existente. */
(function(){
  var manual = false;
  var tSel = document.getElementById('gasTipo'), cSel = document.getElementById('gasCat');
  var hint = document.createElement('small');
  hint.id = 'gasRuleHint';
  hint.style.cssText = 'display:none;margin-top:6px;color:var(--text-faint);font-size:12px;';
  gasDescSuggestEl.parentNode.appendChild(hint);
  function hideHint(){ hint.style.display = 'none'; }
  function aplicar(){
    if(editingId.gastos){ hideHint(); return; }
    var desc = gasDescInput.value;
    if(!desc.trim()){ manual = false; hideHint(); return; }
    if(manual) return;
    var r = matchRegla(desc);
    if(!r){ hideHint(); return; }
    var changed = false;
    if(tSel.value !== r.tipo){ tSel.value = r.tipo; fillCatSelect(false); changed = true; }
    if(cSel.value !== r.cat){ cSel.value = r.cat; changed = true; }
    if(changed){ updateDelCatButton(); updateDescSuggestSource(); }
    hint.textContent = 'Regla automática: «'+r.texto+'» → '+r.cat;
    hint.style.display = 'block';
  }
  ['input','change','blur'].forEach(function(ev){ gasDescInput.addEventListener(ev, aplicar); });
  [tSel, cSel].forEach(function(el){ el.addEventListener('change', function(){ manual = true; hideHint(); }); });
  document.getElementById('formGasto').addEventListener('submit', function(){ manual = false; hideHint(); }, true);
})();

/* ===================== RECORDATORIOS DE VENCIMIENTO ===================== */
/* STORE.recordatorios: [{id, nombre, tipo, cat, texto, dia, antes, pagados:{'AAAA-MM':true}}]
   Vencen un día fijo de cada mes. Se avisa desde `antes` días antes hasta pagar (o hasta 10 días después).
   Se considera pagado si el usuario lo marca o si hay un gasto (no repetido/en cuotas) de esa categoría ese mes. */
function getRecordatorios(){ if(!Array.isArray(STORE.recordatorios)) STORE.recordatorios = []; return STORE.recordatorios; }
function recoPad(n){ return String(n).padStart(2,'0'); }
function recoMesKey(y,m0){ return y+'-'+recoPad(m0+1); }
function recoIso(d){ return d.getFullYear()+'-'+recoPad(d.getMonth()+1)+'-'+recoPad(d.getDate()); }
function recoDueDate(y,m0,dia){ var last = new Date(y,m0+1,0).getDate(); return new Date(y,m0,Math.min(+dia||1,last)); }
function recoPagado(r,y,m0){
  if(r.pagados && r.pagados[recoMesKey(y,m0)]) return true;
  if(!r.cat) return false;
  var ej = STORE.ejercicios[String(y)]; if(!ej || !ej.gastos) return false;
  var mes = MESES[m0], tx = r.texto ? normalizeSearchText(r.texto) : '', hoyIso = recoIso(new Date());
  return ej.gastos.some(function(g){
    if(g.recurrente || g.cuotaGrupoId) return false;           // cargados por adelantado: no prueban que se pagó
    if(g.mes!==mes || g.tipo!==r.tipo || g.cat!==r.cat) return false;
    if(g.fecha && g.fecha>hoyIso) return false;
    return !tx || normalizeSearchText(g.desc||'').indexOf(tx)!==-1;
  });
}
function recoPendientes(hoy){
  hoy = hoy || new Date();
  var h0 = new Date(hoy.getFullYear(),hoy.getMonth(),hoy.getDate()), out = [];
  getRecordatorios().forEach(function(r){
    for(var k=0;k<2;k++){
      var d0 = new Date(h0.getFullYear(),h0.getMonth()+k,1), y = d0.getFullYear(), m = d0.getMonth();
      var due = recoDueDate(y,m,r.dia), left = Math.round((due-h0)/86400000);
      if(left > (+r.antes||0) || left < -10) continue;
      if(recoPagado(r,y,m)) continue;
      out.push({r:r, y:y, m:m, due:due, left:left, key:recoMesKey(y,m)});
      break;
    }
  });
  return out.sort(function(a,b){ return a.left-b.left; });
}
function recoCuando(left){
  if(left<0) return 'Venció hace '+(-left)+(left===-1?' día':' días');
  if(left===0) return 'Vence hoy';
  if(left===1) return 'Vence mañana';
  return 'Vence en '+left+' días';
}
function recoFechaCorta(d){ return recoPad(d.getDate())+'/'+recoPad(d.getMonth()+1); }

/* Notificaciones (a través del service worker, que es lo que permite mostrarlas en celular) */
function recoMostrarNotif(title, body, tag){
  var opts = {body:body, tag:tag, data:{url:'./'}};
  if('serviceWorker' in navigator && navigator.serviceWorker.getRegistration){
    navigator.serviceWorker.getRegistration().then(function(reg){
      if(reg && reg.showNotification) reg.showNotification(title, opts);
      else { try{ new Notification(title, opts); }catch(e){} }
    }).catch(function(){ try{ new Notification(title, opts); }catch(e){} });
  } else { try{ new Notification(title, opts); }catch(e){} }
}
function recoNotificar(){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  var hoy = recoIso(new Date()), done = {};
  try{ done = JSON.parse(localStorage.getItem('libroGastos_recoNotif')||'{}'); }catch(e){ done = {}; }
  var cambio = false;
  recoPendientes().forEach(function(x){
    var tag = 'reco-'+x.r.id+'-'+x.key;
    if(done[tag]===hoy) return;
    recoMostrarNotif('Acordate de pagar: '+x.r.nombre, recoCuando(x.left)+' (día '+recoFechaCorta(x.due)+')', tag);
    done[tag] = hoy; cambio = true;
  });
  if(cambio){
    var ks = Object.keys(done); if(ks.length>150){ ks.slice(0,ks.length-150).forEach(function(k){ delete done[k]; }); }
    try{ localStorage.setItem('libroGastos_recoNotif', JSON.stringify(done)); }catch(e){}
  }
}
/* Copia mínima para que el service worker pueda avisar aunque la app esté cerrada (Periodic Background Sync, solo Chrome/Android) */
var _recoSnapTimer = null;
function recoGuardarSnapshot(){
  if(!('caches' in window)) return;
  clearTimeout(_recoSnapTimer);
  _recoSnapTimer = setTimeout(function(){
    var hoy = new Date();
    var items = getRecordatorios().map(function(r){
      var paid = {};
      for(var k=0;k<3;k++){
        var d0 = new Date(hoy.getFullYear(),hoy.getMonth()+k,1);
        paid[recoMesKey(d0.getFullYear(),d0.getMonth())] = recoPagado(r,d0.getFullYear(),d0.getMonth());
      }
      return {id:r.id, nombre:r.nombre, dia:+r.dia, antes:+r.antes||0, paid:paid};
    });
    caches.open('libro-gastos-data').then(function(c){
      return c.put('__reco.json', new Response(JSON.stringify({items:items, ts:Date.now()}), {headers:{'Content-Type':'application/json'}}));
    }).catch(function(){});
  }, 800);
}
function recoRegistrarPeriodic(){
  if(!('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission!=='granted') return;
  navigator.serviceWorker.ready.then(function(reg){
    if(!reg.periodicSync || !navigator.permissions) return;
    return navigator.permissions.query({name:'periodic-background-sync'}).then(function(st){
      if(st.state==='granted') return reg.periodicSync.register('reco-check', {minInterval:12*60*60*1000});
    });
  }).catch(function(){});
}

/* Cartel al abrir la app */
function renderRecoBanner(){
  var el = document.getElementById('recoBanner'); if(!el) return;
  var p = recoPendientes();
  var cnt = document.getElementById('recoBtnCount'); if(cnt) cnt.textContent = p.length ? ' ('+p.length+')' : '';
  var snooze = ''; try{ snooze = localStorage.getItem('libroGastos_recoSnooze')||''; }catch(e){}
  if(!p.length || snooze===recoIso(new Date())){ el.style.display = 'none'; el.innerHTML = ''; }
  else {
    el.innerHTML = '<div class="reco-head"><strong>Recordatorios de pago</strong><span class="reco-actions">'+
      '<button type="button" class="ghost-btn" data-reco-open>Ver</button>'+
      '<button type="button" class="ghost-btn" data-reco-snooze aria-label="Ocultar por hoy" title="Ocultar por hoy">✕</button></span></div>'+
      p.slice(0,4).map(function(x){
        return '<div class="reco-row"><span class="reco-txt"><strong>'+escapeHtml(x.r.nombre)+'</strong> — '+escapeHtml(recoCuando(x.left))+' ('+recoFechaCorta(x.due)+')</span>'+
          '<button type="button" class="ghost-btn" data-reco-paid="'+escapeHtml(x.r.id)+'" data-key="'+x.key+'">Ya pagué</button></div>';
      }).join('')+(p.length>4 ? '<div class="reco-row"><span class="reco-txt">+ '+(p.length-4)+' más</span></div>' : '');
    el.style.display = '';
  }
  recoGuardarSnapshot();
  clearTimeout(renderRecoBanner._t);
  renderRecoBanner._t = setTimeout(recoNotificar, 1200);
}
document.getElementById('recoBanner').addEventListener('click', function(e){
  if(e.target.closest('[data-reco-open]')){ openRecoModal(); return; }
  if(e.target.closest('[data-reco-snooze]')){ try{ localStorage.setItem('libroGastos_recoSnooze', recoIso(new Date())); }catch(_e){} renderRecoBanner(); return; }
  var b = e.target.closest('[data-reco-paid]'); if(!b) return;
  if(esSoloLectura()){ toast('Estás en modo solo lectura.'); return; }
  var r = getRecordatorios().filter(function(x){ return x.id===b.getAttribute('data-reco-paid'); })[0]; if(!r) return;
  var key = b.getAttribute('data-key');
  if(!r.pagados) r.pagados = {};
  r.pagados[key] = true;
  saveData(); renderRecoBanner(); if(recoOverlay.classList.contains('open')) renderRecoModal();
  toast('«'+r.nombre+'» marcado como pagado', { action: function(){ delete r.pagados[key]; saveData(); renderRecoBanner(); }, duration: 8000 });
});

/* Ventana de gestión */
var recoOverlay = document.getElementById('recoOverlay');
function recoFillGastos(){
  var sel = document.getElementById('recoGasto'), prev = sel.value;
  var html = '<option value="">(Sin gasto asociado)</option>';
  ['Fijo','Variable'].forEach(function(t){
    html += '<optgroup label="'+t+'">'+catsFor(t).map(function(c){ return '<option value="'+escapeHtml(t+'|'+c)+'">'+escapeHtml(c)+'</option>'; }).join('')+'</optgroup>';
  });
  sel.innerHTML = html;
  if(prev) sel.value = prev;
}
function recoEstadoPermiso(){
  var st = document.getElementById('recoPermStatus'), btn = document.getElementById('recoPermBtn'), test = document.getElementById('recoTestBtn');
  var msg, canAsk = false, granted = false;
  if(!('Notification' in window)){ msg = 'Este navegador no permite notificaciones (en iPhone, abrí la app instalada desde el ícono de inicio). Igual vas a ver el cartel al abrirla.'; }
  else if(Notification.permission==='granted'){ msg = 'Notificaciones activadas en este dispositivo.'; granted = true; }
  else if(Notification.permission==='denied'){ msg = 'Las notificaciones están bloqueadas para este sitio. Podés habilitarlas desde los ajustes del navegador o de la app instalada.'; }
  else { msg = 'Todavía no activaste las notificaciones en este dispositivo.'; canAsk = true; }
  st.textContent = msg; btn.style.display = canAsk ? '' : 'none'; test.style.display = granted ? '' : 'none';
}
function renderRecoModal(){
  recoFillGastos(); recoEstadoPermiso();
  var hoy = new Date();
  var rs = getRecordatorios().slice().sort(function(a,b){ return (+a.dia)-(+b.dia); });
  document.getElementById('recoList').innerHTML = rs.length ? rs.map(function(r){
    var pag = recoPagado(r, hoy.getFullYear(), hoy.getMonth());
    var det = 'día '+r.dia+' · avisa '+(+r.antes||0)+' día(s) antes'+(r.cat ? ' · '+r.tipo+' › '+r.cat : '')+(pag ? ' · ✓ pagado este mes' : '');
    return '<div class="presu-row"><span class="presu-name" title="'+escapeHtml(r.nombre+' — '+det)+'"><strong>'+escapeHtml(r.nombre)+'</strong> — '+escapeHtml(det)+'</span>'+
      '<button type="button" class="ghost-btn reco-del" data-id="'+escapeHtml(r.id)+'" aria-label="Eliminar recordatorio" title="Eliminar recordatorio">✕</button></div>';
  }).join('') : '<div class="empty-state">Todavía no hay recordatorios.</div>';
}
function openRecoModal(){ renderRecoModal(); recoOverlay.classList.add('open'); }
function closeRecoModal(){ recoOverlay.classList.remove('open'); }
document.getElementById('btnReco').addEventListener('click', openRecoModal);
document.getElementById('recoClose').addEventListener('click', closeRecoModal);
recoOverlay.addEventListener('click', function(e){ if(e.target===recoOverlay) closeRecoModal(); });
document.addEventListener('keydown', function(e){ if(e.key==='Escape' && recoOverlay.classList.contains('open')) closeRecoModal(); });
document.getElementById('recoGasto').addEventListener('change', function(){
  var n = document.getElementById('recoNombre');
  if(this.value && !n.value.trim()) n.value = this.value.split('|')[1];
});
document.getElementById('recoAdd').addEventListener('click', function(){
  if(esSoloLectura()){ toast('Estás en modo solo lectura.'); return; }
  var nombre = document.getElementById('recoNombre').value.trim();
  var dia = parseInt(document.getElementById('recoDia').value,10);
  var antes = parseInt(document.getElementById('recoAntes').value,10);
  var g = document.getElementById('recoGasto').value.split('|');
  if(!nombre){ toast('Escribí un nombre para el recordatorio.'); return; }
  if(!(dia>=1 && dia<=31)){ toast('El día del mes tiene que estar entre 1 y 31.'); return; }
  if(isNaN(antes) || antes<0 || antes>14) antes = 3;
  getRecordatorios().push({id:uid('rec'), nombre:nombre, tipo:g[0]||'', cat:g[1]||'', texto:document.getElementById('recoTexto').value.trim(), dia:dia, antes:antes, pagados:{}});
  saveData();
  ['recoNombre','recoDia','recoTexto'].forEach(function(id){ document.getElementById(id).value = ''; });
  document.getElementById('recoGasto').value = ''; document.getElementById('recoAntes').value = '3';
  renderRecoModal(); renderRecoBanner(); toast('Recordatorio agregado');
});
document.getElementById('recoList').addEventListener('click', function(e){
  var b = e.target.closest('.reco-del'); if(!b) return;
  if(esSoloLectura()){ toast('Estás en modo solo lectura.'); return; }
  STORE.recordatorios = getRecordatorios().filter(function(r){ return r.id!==b.getAttribute('data-id'); });
  saveData(); renderRecoModal(); renderRecoBanner(); toast('Recordatorio eliminado');
});
document.getElementById('recoPermBtn').addEventListener('click', function(){
  if(!('Notification' in window)){ recoEstadoPermiso(); return; }
  Notification.requestPermission().then(function(){ recoEstadoPermiso(); recoRegistrarPeriodic(); recoNotificar(); });
});
document.getElementById('recoTestBtn').addEventListener('click', function(){
  recoMostrarNotif('Acordate de pagar: Luz (prueba)', 'Así se va a ver el aviso de un vencimiento.', 'reco-test');
});
/* Re-chequeo al volver a la app y cada media hora mientras está abierta */
document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') renderRecoBanner(); });
setInterval(function(){ if(document.visibilityState==='visible') renderRecoBanner(); }, 30*60*1000);
window.addEventListener('load', recoRegistrarPeriodic);

/* ===================== BACKUP ===================== */
document.getElementById('btnExport').addEventListener('click', function(){
  downloadBackupFile();
  toast('Backup descargado (todos los ejercicios)');
});
document.getElementById('btnImport').addEventListener('click', function(){
  document.getElementById('fileImport').click();
});
document.getElementById('fileImport').addEventListener('change', function(e){
  var file = e.target.files[0];
  var input = e.target;
  if(!file) return;
  if(esSoloLectura()){ toast('Estás en modo solo lectura: no podés importar backups.'); input.value = ''; return; }
  var reader = new FileReader();
  reader.onload = function(){
    var incoming = null, scope = null;
    try{
      var parsed = JSON.parse(reader.result);
      if(parsed && parsed.ejercicios && Object.keys(parsed.ejercicios).length){
        incoming = normalizeStoreObj(parsed); scope = 'all';   // backup completo (multi-ejercicio)
      } else if(parsed && parsed.ingresos && parsed.gastos && parsed.dolar){
        incoming = normalizeExercise(parsed); scope = 'one';   // un solo ejercicio: va sobre el activo
      }
    }catch(err){ incoming = null; }
    if(!incoming){ toast('No se pudo leer el archivo'); return; }
    var year = STORE.activeEjercicio;
    var cfg = scope === 'all'
      ? { paragraphs: ['Esto reemplaza TODOS los ejercicios actuales por los del archivo.'],
          stats: [['Ahora en la app', statsText(storeStats(STORE))], ['El archivo trae', statsText(storeStats(incoming))]] }
      : { paragraphs: ['Esto reemplaza solo el ejercicio ' + year + ' por el contenido del archivo. Los demás años no se tocan.'],
          stats: [['Ejercicio ' + year + ' ahora', exerciseRecords(DATA) + ' registros'], ['El archivo trae', exerciseRecords(incoming) + ' registros']] };
    askConfirm({
      title: 'Importar backup',
      paragraphs: cfg.paragraphs.concat(['Antes se guarda una copia automática y vas a poder deshacerlo.']),
      stats: cfg.stats,
      confirmLabel: 'Reemplazar',
      altLabel: 'Descargar copia actual y reemplazar'
    }).then(function(res){
      if(!res) return;
      if(res === 'alt') downloadBackupFile();
      var snap = takeSnapshot('Antes de importar un backup');
      if(scope === 'all'){
        var _reglasPrev = getReglas(), _recoPrev = getRecordatorios();
        STORE = incoming;
        if(!getReglas().length) STORE.reglas = _reglasPrev; // backups viejos no traen reglas: se conservan las actuales
        if(!getRecordatorios().length) STORE.recordatorios = _recoPrev;
        DATA = STORE.ejercicios[STORE.activeEjercicio];
        saveData(); resetCollapsedForActiveYear(); fillCatSelect(false); updateDescDatalist(); renderEjercicioSelect(); renderAll();
        toast('Backup importado (todos los ejercicios)', { action: undoFromSnapshot(snap, 'Importación deshecha'), duration: 12000 });
      } else {
        STORE.ejercicios[year] = incoming;
        DATA = STORE.ejercicios[year];
        saveData(); fillCatSelect(false); updateDescDatalist(); renderAll();
        toast('Backup importado en el ejercicio ' + year, { action: undoFromSnapshot(snap, 'Importación deshecha'), duration: 12000 });
      }
    });
  };
  reader.readAsText(file);
  input.value = '';
});
document.getElementById('btnReset').addEventListener('click', function(){
  if(esSoloLectura()){ toast('Estás en modo solo lectura: no podés restaurar datos.'); return; }
  var year = STORE.activeEjercicio;
  var esAnioOriginal = year === DEFAULT_YEAR;
  var nuevaData = esAnioOriginal ? JSON.parse(JSON.stringify(seed)) : {};
  var nuevaN = exerciseRecords(normalizeExercise(JSON.parse(JSON.stringify(nuevaData))));
  askConfirm({
    title: esAnioOriginal ? 'Restaurar datos originales' : 'Vaciar el ejercicio ' + year,
    paragraphs: [esAnioOriginal
      ? 'Esto reemplaza los datos del ejercicio '+year+' por los datos originales del Excel.'
      : 'El ejercicio '+year+' no tiene datos originales de fábrica: esto lo vacía por completo.',
      'Antes se guarda una copia automática y vas a poder deshacerlo.'],
    stats: [['Ejercicio ' + year + ' ahora', exerciseRecords(DATA) + ' registros'], ['Quedaría con', nuevaN + ' registros']],
    confirmLabel: esAnioOriginal ? 'Restaurar' : 'Vaciar',
    altLabel: 'Descargar copia y continuar'
  }).then(function(res){
    if(!res) return;
    if(res === 'alt') downloadBackupFile();
    var snap = takeSnapshot('Antes de ' + (esAnioOriginal ? 'restaurar datos originales' : 'vaciar el ejercicio ' + year));
    DATA = normalizeExercise(nuevaData);
    STORE.ejercicios[year] = DATA;
    saveData(); fillCatSelect(false); updateDescDatalist(); renderAll();
    toast(esAnioOriginal ? 'Datos originales restaurados' : 'Ejercicio vaciado', { action: undoFromSnapshot(snap, 'Cambio deshecho'), duration: 12000 });
  });
});

/* Recuperar la última copia automática (guardada antes de importar / restaurar / eliminar) */
document.getElementById('btnRecoverSnapshot').addEventListener('click', function(){
  if(esSoloLectura()){ toast('Estás en modo solo lectura: no podés recuperar copias.'); return; }
  var snaps = readSnaps();
  if(!snaps.length){ toast('No hay copias automáticas guardadas'); updateSnapshotButton(); return; }
  var sn = snaps[0];
  var snStore = normalizeStoreObj(sn.json);
  if(!snStore){ toast('La copia guardada está dañada'); return; }
  askConfirm({
    title: 'Recuperar copia automática',
    paragraphs: ['Vas a volver al estado que tenía la app antes de la última operación riesgosa. El estado actual también se guarda como copia, así que podés volver a él.'],
    stats: [
      ['Copia', new Date(sn.ts).toLocaleString('es-AR', {dateStyle:'short', timeStyle:'short'}) + ' · ' + sn.reason],
      ['La copia contiene', statsText(storeStats(snStore))],
      ['Ahora en la app', statsText(storeStats(STORE))]
    ],
    confirmLabel: 'Recuperar',
    danger: false
  }).then(function(ok){
    if(!ok) return;
    var cur = takeSnapshot('Antes de recuperar una copia');
    if(restoreFromJson(sn.json)) toast('Copia recuperada', { action: undoFromSnapshot(cur, 'Recuperación deshecha'), duration: 12000 });
  });
});
updateSnapshotButton();

/* ===================== CHARTS ===================== */
var CHART_COLORS = {
  ingreso:'#4FD1A5', fijo:'#F0B43A', variable:'#B47EF5', dolar:'#5B9FED',
  inversion:'#F2679A', neg:'#F2696B', grid:'#2C333C', textDim:'#8B98A5', textFaint:'#5B6874'
};
var DONUT_PALETTE = ['#F0B43A','#B47EF5','#5B9FED','#4FD1A5','#F2679A','#FF8B5E','#8B98A5'];
cargarUsdOficialCache();

function niceCeil(v){
  if(v<=0) return 1;
  var exp = Math.floor(Math.log10(v));
  var base = Math.pow(10,exp);
  var frac = v/base;
  var niceFrac = frac<=1?1:(frac<=2?2:(frac<=5?5:10));
  return niceFrac*base;
}
function compactMoney(v){
  var sign = v<0 ? '-' : '';
  v = Math.abs(v);
  if(v>=1e6) return sign+'$'+(v/1e6).toFixed(1)+'M';
  if(v>=1e3) return sign+'$'+Math.round(v/1e3)+'K';
  return sign+'$'+Math.round(v);
}
function compactUsd(v){
  var sign = v<0 ? '-' : '';
  v = Math.abs(v);
  if(v>=1e3) return sign+'US$'+(v/1e3).toFixed(1)+'K';
  return sign+'US$'+Math.round(v);
}

function buildBarChart(series, mode, opts){
  opts = opts || {};
  var axisFmt = opts.usd ? compactUsd : compactMoney;
  var tipFmt = opts.usd ? usd : money;
  var W=860, H=300, padL=(opts.usd?70:58), padR=14, padT=14, padB=40;
  var innerW=W-padL-padR, innerH=H-padT-padB;
  var n=MESES.length;
  var maxVal;
  if(mode==='stacked'){
    var sums = MESES.map(function(_,i){ return series.reduce(function(s,se){return s+(se.data[i]||0);},0); });
    maxVal = Math.max.apply(null, sums.concat([1]));
  } else {
    var allVals = [];
    series.forEach(function(se){ allVals = allVals.concat(se.data); });
    maxVal = Math.max.apply(null, allVals.concat([1]));
  }
  var niceMax = niceCeil(maxVal);
  function gradId(color){ return 'gBar_'+color.replace(/[^a-zA-Z0-9]/g,''); }
  var defs = series.map(function(se){
    var id = gradId(se.color);
    return '<linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+se.color+'"/>'+
      '<stop offset="100%" stop-color="'+se.color+'" stop-opacity="0.72"/>'+
    '</linearGradient>';
  }).join('');
  var ticks=4, gridLines='', yLabels='';
  for(var t=0;t<=ticks;t++){
    var v=niceMax*t/ticks;
    var y=padT+innerH-innerH*t/ticks;
    gridLines += '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CHART_COLORS.grid+'" stroke-width="1"/>';
    yLabels += '<text x="'+(padL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="'+CHART_COLORS.textFaint+'">'+axisFmt(v)+'</text>';
  }
  var groupW = innerW/n, bars='', xlabels='';
  var curIdx = currentMonthIdxForDisplay();
  MESES.forEach(function(mes,i){
    var cx = padL+groupW*i+groupW/2;
    var isCurrent = i===curIdx;
    xlabels += '<text x="'+cx+'" y="'+(H-padB+18)+'" text-anchor="middle" font-size="11" fill="'+(isCurrent?CHART_COLORS.textDim:CHART_COLORS.textFaint)+'">'+mes.slice(0,3)+'</text>';
    if(mode==='stacked'){
      var yBase = padT+innerH;
      var barW = Math.min(30, groupW*0.56);
      series.forEach(function(se){
        var v = se.data[i]||0;
        if(v<=0) return;
        var bh = innerH*v/niceMax;
        yBase -= bh;
        bars += '<rect x="'+(cx-barW/2)+'" y="'+yBase+'" width="'+barW+'" height="'+bh+'" fill="url(#'+gradId(se.color)+')" rx="3" data-tip="'+escapeHtml(mes+' · '+se.label+': '+tipFmt(v))+'"/>';
      });
    } else {
      var count = series.length, barW = Math.min(14, groupW*0.28), gap=4;
      var totalW = barW*count+gap*(count-1), startX = cx-totalW/2;
      series.forEach(function(se,si){
        var v = se.data[i]||0;
        var bh = innerH*v/niceMax;
        var x = startX+si*(barW+gap), y=padT+innerH-bh;
        bars += '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+Math.max(bh,0)+'" fill="url(#'+gradId(se.color)+')" rx="3" data-tip="'+escapeHtml(mes+' · '+se.label+': '+tipFmt(v))+'"/>';
      });
    }
  });
  var legend = series.map(function(se,i){
    return '<g transform="translate('+(padL+i*150)+','+(H-8)+')"><rect width="10" height="10" fill="'+se.color+'" rx="2"/><text x="14" y="9" font-size="11" fill="'+CHART_COLORS.textDim+'">'+escapeHtml(se.label)+'</text></g>';
  }).join('');
  return '<svg viewBox="0 0 '+W+' '+(H+8)+'" style="width:100%;height:auto"><defs>'+defs+'</defs>'+gridLines+yLabels+bars+xlabels+legend+'</svg>';
}

function polarXY(cx,cy,r,deg){
  var rad = deg*Math.PI/180;
  return {x: cx+r*Math.cos(rad), y: cy+r*Math.sin(rad)};
}
function donutSlice(cx,cy,rOut,rIn,a0,a1,color,label,val,total,clickable,fmtFull){
  if(a1-a0>=359.99) a1=a0+359.98;
  var largeArc = (a1-a0)>180 ? 1 : 0;
  var p1=polarXY(cx,cy,rOut,a0), p2=polarXY(cx,cy,rOut,a1);
  var p3=polarXY(cx,cy,rIn,a1), p4=polarXY(cx,cy,rIn,a0);
  var d = ['M',p1.x,p1.y,'A',rOut,rOut,0,largeArc,1,p2.x,p2.y,'L',p3.x,p3.y,'A',rIn,rIn,0,largeArc,0,p4.x,p4.y,'Z'].join(' ');
  var pct = total>0 ? (val/total*100).toFixed(1) : 0;
  var tip = escapeHtml(label+': '+(fmtFull||money)(val)+' ('+pct+'%)');
  var extra = clickable ? ' class="donut-slice" data-cat="'+escapeHtml(label)+'"' : '';
  return '<path d="'+d+'"'+extra+' data-tip="'+tip+'" fill="'+color+'"/>';
}
function buildDonutChart(catTotals, opts){
  opts = opts || {};
  var fmtFull = opts.usd ? usd : money;
  var entries = Object.keys(catTotals).map(function(c){return {cat:c, val:catTotals[c]};}).filter(function(e){return e.val>0;});
  if(!entries.length){
    return '<div class="empty-state">Todavía no hay gastos cargados.</div>';
  }
  entries.sort(function(a,b){return b.val-a.val;});
  var top = entries.slice(0,6);
  var restSum = entries.slice(6).reduce(function(s,e){return s+e.val;},0);
  if(restSum>0) top.push({cat:'Otras categorías', val:restSum});
  var total = top.reduce(function(s,e){return s+e.val;},0) || 1;
  var cx=110, cy=110, rOut=94, rIn=56, start=-90, arcs='';
  top.forEach(function(e,i){
    var angle = e.val/total*360, end=start+angle;
    var clickable = e.cat!=='Otras categorías';
    arcs += donutSlice(cx,cy,rOut,rIn,start,end,DONUT_PALETTE[i%DONUT_PALETTE.length],e.cat,e.val,total,clickable,fmtFull);
    start = end;
  });
  var legend = top.map(function(e,i){
    var pct=(e.val/total*100).toFixed(1);
    var clickable = e.cat!=='Otras categorías';
    return '<div class="donut-legend-row'+(clickable?' clickable':'')+'"'+(clickable?' data-cat="'+escapeHtml(e.cat)+'"':'')+' style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim);padding:4px 0;">'+
      '<span style="width:10px;height:10px;border-radius:3px;background:'+DONUT_PALETTE[i%DONUT_PALETTE.length]+';flex-shrink:0;"></span>'+
      '<span style="flex:1;">'+escapeHtml(e.cat)+'</span>'+
      '<span style="font-family:var(--font-mono);color:var(--text);">'+pct+'%</span></div>';
  }).join('');
  return '<div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap;">'+
    '<svg viewBox="0 0 220 220" style="width:200px;height:200px;flex-shrink:0;">'+arcs+'</svg>'+
    '<div style="flex:0 1 260px;min-width:160px;max-width:280px;">'+legend+'</div></div>';
}

function buildLineChart(data, opts){
  opts = opts || {};
  var tipFmt = opts.usd ? usd : money;
  var W=860,H=260,padL=58,padR=14,padT=14,padB=40;
  var innerW=W-padL-padR, innerH=H-padT-padB;
  var maxVal=Math.max.apply(null, data.concat([0]));
  var minVal=Math.min.apply(null, data.concat([0]));
  var range=(maxVal-minVal)||1, n=data.length;
  var stepX=innerW/(n-1);
  function xFor(i){return padL+stepX*i;}
  function yFor(v){return padT+innerH-(v-minVal)/range*innerH;}
  var zeroY=yFor(0);
  var gridLines='<line x1="'+padL+'" y1="'+zeroY+'" x2="'+(W-padR)+'" y2="'+zeroY+'" stroke="'+CHART_COLORS.textFaint+'" stroke-width="1" stroke-dasharray="3,3"/>';
  var points=data.map(function(v,i){return xFor(i)+','+yFor(v);}).join(' ');
  var areaPts = 'M'+xFor(0)+','+zeroY+' '+data.map(function(v,i){return 'L'+xFor(i)+','+yFor(v);}).join(' ')+' L'+xFor(n-1)+','+zeroY+' Z';
  var dots=data.map(function(v,i){
    return '<circle cx="'+xFor(i)+'" cy="'+yFor(v)+'" r="3.5" fill="'+(v>=0?CHART_COLORS.ingreso:CHART_COLORS.neg)+'" data-tip="'+escapeHtml(MESES[i]+': '+tipFmt(v))+'"/>';
  }).join('');
  var xlabels=MESES.map(function(m,i){
    return '<text x="'+xFor(i)+'" y="'+(H-padB+18)+'" text-anchor="middle" font-size="11" fill="'+CHART_COLORS.textFaint+'">'+m.slice(0,3)+'</text>';
  }).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">'+
    '<defs><linearGradient id="gRestArea" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+CHART_COLORS.dolar+'" stop-opacity="0.32"/>'+
      '<stop offset="100%" stop-color="'+CHART_COLORS.dolar+'" stop-opacity="0"/>'+
    '</linearGradient></defs>'+
    '<path d="'+areaPts+'" fill="url(#gRestArea)"/>'+
    gridLines+
    '<polyline points="'+points+'" fill="none" stroke="'+CHART_COLORS.dolar+'" stroke-width="2"/>'+
    dots+xlabels+'</svg>';
}

/* ----- Referencia dólar / conversión USD equivalente ----- */
function dolarValorMensual(){
  // Valor promedio de cambio registrado en "Compra Dólar" para cada mes (null si no hay datos)
  return MESES.map(function(mes){
    var ops = DATA.dolar.filter(function(x){return x.mes===mes && (+x.valor||0)>0;});
    if(!ops.length) return null;
    var sum = ops.reduce(function(s,x){return s+(+x.valor||0);},0);
    return sum/ops.length;
  });
}
function dolarValorConCarry(valores){
  // Para poder convertir meses sin cotización propia, arrastra la última conocida
  var last=null;
  return valores.map(function(v){ if(v!==null && v!==undefined){ last=v; return v; } return last; });
}
function buildDolarRefChart(valores, fuentes){
  fuentes = fuentes || valores.map(function(v){ return (v===null||v===undefined) ? null : 'compra'; });
  var known = valores.filter(function(v){return v!==null && v!==undefined;});
  if(!known.length){
    return '<div class="empty-state">Todavía no registraste compras de dólares ni se pudo traer la cotización oficial (necesitás conexión a internet al menos una vez).</div>';
  }
  var W=860,H=260,padL=58,padR=14,padT=14,padB=40;
  var innerW=W-padL-padR, innerH=H-padT-padB;
  var maxVal=Math.max.apply(null, known), minVal=Math.min.apply(null, known);
  if(maxVal===minVal){ maxVal+=maxVal*0.1+1; minVal-=minVal*0.1; }
  var range=(maxVal-minVal)||1, n=valores.length;
  var stepX=innerW/(n-1);
  function xFor(i){return padL+stepX*i;}
  function yFor(v){return padT+innerH-(v-minVal)/range*innerH;}
  var ticks=4, gridLines='', yLabels='';
  for(var t=0;t<=ticks;t++){
    var v=minVal+range*t/ticks;
    var y=yFor(v);
    gridLines += '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CHART_COLORS.grid+'" stroke-width="1"/>';
    yLabels += '<text x="'+(padL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="'+CHART_COLORS.textFaint+'">'+money(v)+'</text>';
  }
  var segs=[], curSeg=[];
  valores.forEach(function(v,i){
    if(v===null || v===undefined){ if(curSeg.length){segs.push(curSeg); curSeg=[];} return; }
    curSeg.push(xFor(i)+','+yFor(v));
  });
  if(curSeg.length) segs.push(curSeg);
  var lines = segs.map(function(seg){
    return '<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+CHART_COLORS.dolar+'" stroke-width="2"/>';
  }).join('');
  var areas = segs.map(function(seg){
    var pts = seg.map(function(p){return p;});
    var firstX = pts[0].split(',')[0], lastX = pts[pts.length-1].split(',')[0];
    var floorY = padT+innerH;
    return '<path d="M'+firstX+','+floorY+' L'+pts.join(' L')+' L'+lastX+','+floorY+' Z" fill="url(#gDolarRefArea)"/>';
  }).join('');
  var dots = valores.map(function(v,i){
    if(v===null||v===undefined) return '';
    var esOficial = fuentes[i]==='oficial';
    var tip = esOficial ? (MESES[i]+': '+money(v)+' /USD (promedio oficial del mes)') : (MESES[i]+': '+money(v)+' /USD (tu compra registrada, sin cotización oficial disponible)');
    return esOficial
      ? '<circle cx="'+xFor(i)+'" cy="'+yFor(v)+'" r="3.5" fill="'+CHART_COLORS.dolar+'" data-tip="'+escapeHtml(tip)+'"/>'
      : '<circle cx="'+xFor(i)+'" cy="'+yFor(v)+'" r="3.5" fill="var(--surface)" stroke="'+CHART_COLORS.dolar+'" stroke-width="2" data-tip="'+escapeHtml(tip)+'"/>';
  }).join('');
  var xlabels=MESES.map(function(m,i){
    return '<text x="'+xFor(i)+'" y="'+(H-padB+18)+'" text-anchor="middle" font-size="11" fill="'+CHART_COLORS.textFaint+'">'+m.slice(0,3)+'</text>';
  }).join('');
  var svg = '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">'+
    '<defs><linearGradient id="gDolarRefArea" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+CHART_COLORS.dolar+'" stop-opacity="0.28"/>'+
      '<stop offset="100%" stop-color="'+CHART_COLORS.dolar+'" stop-opacity="0"/>'+
    '</linearGradient></defs>'+
    gridLines+yLabels+areas+lines+dots+xlabels+'</svg>';
  var legend = '<div class="chart-legend-row">'+
      '<div class="chart-legend-item"><span style="width:9px;height:9px;border-radius:50%;background:'+CHART_COLORS.dolar+';display:inline-block;"></span>Promedio oficial del mes</div>'+
      '<div class="chart-legend-item"><span style="width:9px;height:9px;border-radius:50%;background:var(--surface);border:2px solid '+CHART_COLORS.dolar+';display:inline-block;"></span>Tu compra (sin cotización oficial disponible)</div>'+
    '</div>';
  return svg+legend;
}

/* ----- Presupuesto vs. Real por categoría ----- */
function buildPresupuestoChart(mesSel){
  var m = computeMonth(mesSel);
  var rows = [];
  function collect(tipo, porCat){
    Object.keys(porCat).forEach(function(cat){
      var presu = DATA.presupuestos[presuKey(tipo, cat)];
      if(!presu || presu<=0) return;
      rows.push({tipo:tipo, cat:cat, real:porCat[cat]||0, presu:presu});
    });
  }
  collect('Fijo', m.fijosPorCat);
  collect('Variable', m.variablesPorCat);
  if(!rows.length){
    return '<div class="empty-state">No hay presupuestos definidos todavía (configuralos desde "Presupuestos" en Gastos).</div>';
  }
  rows.sort(function(a,b){ return (b.real/b.presu) - (a.real/a.presu); });
  var rowsHtml = rows.map(function(r){
    var pct = r.presu>0 ? (r.real/r.presu*100) : 0;
    var barMax = Math.max(r.real, r.presu, 1);
    var wReal = Math.min(100, r.real/barMax*100);
    var wPresu = Math.min(100, r.presu/barMax*100);
    var color = pct>100 ? CHART_COLORS.neg : (pct>=80 ? CHART_COLORS.fijo : CHART_COLORS.ingreso);
    var badgeClass = pct>100 ? 'var-bad' : 'var-good';
    var badgeTxt = (pct>100?'+':'') + Math.round(pct-100) + '%';
    return '<div class="pchart-row">'+
      '<div class="pchart-top"><span class="pchart-cat">'+escapeHtml(r.cat)+' <span style="opacity:.55;font-size:12px;">('+r.tipo+')</span></span>'+
      '<span class="pchart-vals">'+money(r.real)+' / '+money(r.presu)+' <span class="var-badge '+badgeClass+'">'+badgeTxt+'</span></span></div>'+
      '<div class="pchart-track" data-tip="'+escapeHtml(r.cat+': '+money(r.real)+' de '+money(r.presu)+' presupuestados ('+Math.round(pct)+'%)')+'">'+
        '<div class="pchart-fill" style="width:'+wReal+'%;background:'+color+';"></div>'+
        '<div class="pchart-marker" style="left:'+wPresu+'%;"></div>'+
      '</div></div>';
  }).join('');
  var legend = '<div class="chart-legend-row">'+
      '<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:'+CHART_COLORS.ingreso+';"></span>Bajo control (&lt;80%)</div>'+
      '<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:'+CHART_COLORS.fijo+';"></span>Cerca del límite (80–100%)</div>'+
      '<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:'+CHART_COLORS.neg+';"></span>Excedido (&gt;100%)</div>'+
      '<div class="chart-legend-item"><span style="width:2px;height:12px;background:var(--text-faint);display:inline-block;"></span>Tope del presupuesto</div>'+
    '</div>';
  return rowsHtml+legend;
}
function renderPresupuestoChart(){
  var sel = document.getElementById('presuChartMes');
  document.getElementById('chartPresupuesto').innerHTML = buildPresupuestoChart(sel.value || MESES[0]);
}

/* ----- Tasa de ahorro mensual ----- */
function buildSavingsRateChart(months, metaPct){
  var data = months.map(function(m){
    return m.totalIngresos>0 ? (m.totalRestante/m.totalIngresos*100) : null;
  });
  var W=860,H=280,padL=50,padR=14,padT=14,padB=40;
  var innerW=W-padL-padR, innerH=H-padT-padB;
  var known = data.filter(function(v){return v!==null;});
  var hasNeg = known.some(function(v){return v<0;});
  var yFor, zeroY, niceMax, metaOffScale, ticks=4, gridLines='', yLabels='';
  if(!hasNeg){
    // Sin meses negativos: usamos escala de 0 hacia arriba basada en los datos reales
    // (ignorando la meta), así un ahorro chico se sigue viendo con buena altura de barra.
    var maxKnown = known.length ? Math.max.apply(null, known) : 0;
    niceMax = niceCeil(Math.max(maxKnown*1.35, 3));
    metaOffScale = metaPct > niceMax;
    yFor = function(v){ return padT+innerH - (v/niceMax)*innerH; };
    zeroY = yFor(0);
    for(var t=0;t<=ticks;t++){
      var v = niceMax*t/ticks;
      var y = yFor(v);
      gridLines += '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CHART_COLORS.grid+'" stroke-width="1"/>';
      yLabels += '<text x="'+(padL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="'+CHART_COLORS.textFaint+'">'+Math.round(v)+'%</text>';
    }
  } else {
    // Hay algún mes negativo: mantenemos la escala simétrica alrededor de 0.
    var maxAbs = Math.max.apply(null, known.map(Math.abs).concat([metaPct, 10]));
    niceMax = niceCeil(maxAbs*1.15);
    metaOffScale = false;
    yFor = function(v){ return padT+innerH/2 - (v/niceMax)*(innerH/2); };
    zeroY = yFor(0);
    for(var t=-ticks;t<=ticks;t+=2){
      var v = niceMax*t/ticks;
      var y = yFor(v);
      gridLines += '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CHART_COLORS.grid+'" stroke-width="1"/>';
      yLabels += '<text x="'+(padL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="'+CHART_COLORS.textFaint+'">'+Math.round(v)+'%</text>';
    }
  }
  var metaY = metaOffScale ? padT : yFor(metaPct);
  var n=MESES.length, groupW=innerW/n, bars='', xlabels='';
  var curIdx = currentMonthIdxForDisplay();
  MESES.forEach(function(mes,i){
    var cx = padL+groupW*i+groupW/2;
    xlabels += '<text x="'+cx+'" y="'+(H-padB+18)+'" text-anchor="middle" font-size="11" fill="'+(i===curIdx?CHART_COLORS.textDim:CHART_COLORS.textFaint)+'">'+mes.slice(0,3)+'</text>';
    var v = data[i];
    if(v===null) return;
    var barW = Math.min(26, groupW*0.5);
    var y0 = yFor(Math.max(v,0)), y1 = yFor(Math.min(v,0));
    var h = Math.max(1, y1-y0);
    var color = v<0 ? CHART_COLORS.neg : (v>=metaPct ? CHART_COLORS.ingreso : CHART_COLORS.fijo);
    bars += '<rect x="'+(cx-barW/2)+'" y="'+y0+'" width="'+barW+'" height="'+h+'" fill="'+color+'" rx="3" data-tip="'+escapeHtml(mes+': '+v.toFixed(1)+'% ahorrado sobre el ingreso')+'"/>';
  });
  var metaLabel = metaOffScale ? ('Meta '+metaPct+'% ↑ (fuera de escala)') : ('Meta '+metaPct+'%');
  var metaLine = '<line x1="'+padL+'" y1="'+metaY+'" x2="'+(W-padR)+'" y2="'+metaY+'" stroke="'+CHART_COLORS.dolar+'" stroke-width="1.4" stroke-dasharray="5,4"/>'+
    '<text x="'+(W-padR)+'" y="'+(metaY-5)+'" text-anchor="end" font-size="11" fill="'+CHART_COLORS.dolar+'">'+metaLabel+'</text>';
  var zeroLine = '<line x1="'+padL+'" y1="'+zeroY+'" x2="'+(W-padR)+'" y2="'+zeroY+'" stroke="'+CHART_COLORS.textFaint+'" stroke-width="1"/>';
  var svg = '<svg viewBox="0 0 '+W+' '+(H+8)+'" style="width:100%;height:auto">'+gridLines+yLabels+zeroLine+bars+metaLine+xlabels+'</svg>';
  var legend = '<div class="chart-legend-row">'+
      '<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:'+CHART_COLORS.ingreso+';"></span>Meta cumplida</div>'+
      '<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:'+CHART_COLORS.fijo+';"></span>Ahorró, pero bajo la meta</div>'+
      '<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:'+CHART_COLORS.neg+';"></span>Mes negativo</div>'+
      '<div class="chart-legend-item"><span class="chart-legend-line"></span>Meta configurada</div>'+
    '</div>';
  return svg+legend;
}
function renderAhorroChart(){
  var months = MESES.map(computeMonth);
  var meta = parseFloat(document.getElementById('ahorroMeta').value);
  if(isNaN(meta)) meta = 20;
  document.getElementById('chartAhorro').innerHTML = buildSavingsRateChart(months, meta);
}

/* ----- Mapa de calor: gasto por categoría y mes ----- */
function buildHeatmapChart(months, opts){
  opts = opts || {};
  var fmtFull = opts.usd ? usd : money;
  var fmtCompact = opts.usd ? compactUsd : compactMoney;
  var cats = [];
  CAT_FIJAS.forEach(function(c){ cats.push({cat:c, tipo:'Fijo'}); });
  CAT_VARIABLES.forEach(function(c){ cats.push({cat:c, tipo:'Variable'}); });
  var rows = cats.map(function(c){
    var vals = months.map(function(m){
      return c.tipo==='Fijo' ? (m.fijosPorCat[c.cat]||0) : (m.variablesPorCat[c.cat]||0);
    });
    var total = vals.reduce(function(s,v){return s+v;},0);
    return {cat:c.cat, tipo:c.tipo, vals:vals, total:total};
  }).filter(function(r){ return r.total>0; });
  if(!rows.length){
    return '<div class="empty-state">Todavía no hay gastos cargados.</div>';
  }
  rows.sort(function(a,b){ return b.total-a.total; });
  // Recortar del final los meses sin ningún gasto cargado (ej: meses futuros del año en curso)
  var lastMonthWithData = -1;
  months.forEach(function(m,i){
    var hasAny = rows.some(function(r){ return r.vals[i] > 0; });
    if(hasAny) lastMonthWithData = i;
  });
  var visibleCount = lastMonthWithData + 1;
  rows = rows.map(function(r){ return {cat:r.cat, tipo:r.tipo, vals:r.vals.slice(0, visibleCount), total:r.total}; });
  var mesesVisibles = MESES.slice(0, visibleCount);
  var globalMax = Math.max.apply(null, rows.reduce(function(acc,r){return acc.concat(r.vals);},[]).concat([1]));
  var head = '<tr><th></th>'+mesesVisibles.map(function(mes){return '<th>'+mes.slice(0,3)+'</th>';}).join('')+'</tr>';
  var body = rows.map(function(r){
    var baseColor = r.tipo==='Fijo' ? CHART_COLORS.fijo : CHART_COLORS.variable;
    var cells = r.vals.map(function(v,i){
      if(v<=0) return '<td class="heatmap-empty">·</td>';
      var intensity = Math.min(1, v/globalMax);
      var opacityPct = Math.round(12 + intensity*78);
      return '<td class="heatmap-cell" style="background:color-mix(in srgb, '+baseColor+' '+opacityPct+'%, transparent);" data-tip="'+escapeHtml(r.cat+' · '+mesesVisibles[i]+': '+fmtFull(v))+'">'+fmtCompact(v)+'</td>';
    }).join('');
    return '<tr><td>'+escapeHtml(r.cat)+'</td>'+cells+'</tr>';
  }).join('');
  var legend = '<div class="chart-legend-row">'+
      '<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:'+CHART_COLORS.fijo+';"></span>Categoría fija</div>'+
      '<div class="chart-legend-item"><span class="chart-legend-swatch" style="background:'+CHART_COLORS.variable+';"></span>Categoría variable</div>'+
      '<div class="chart-legend-item chart-legend-scale">'+
        '<span class="chart-legend-gradient" style="background:linear-gradient(90deg, color-mix(in srgb, '+CHART_COLORS.textFaint+' 12%, transparent), '+CHART_COLORS.textFaint+');"></span>'+
        'Menor → mayor gasto ese mes'+
      '</div>'+
    '</div>';
  return '<div class="heatmap-wrap"><table class="heatmap-table">'+head+body+'</table></div>'+legend;
}

/* ----- Gasto mensual en USD equivalente, con dólar OFICIAL histórico (ArgentinaDatos) -----
   A diferencia de "Evolución del dólar (referencia)" (que usa TU precio de compra cargado
   a mano), esto usa la cotización de mercado real de cada mes, así que sirve para ver si
   perdiste o ganaste poder adquisitivo en dólares, más allá de a cuánto compraste vos. */
var USD_OFICIAL_CACHE_KEY = 'libroGastos_usdOficialCache_v1';
var usdOficialCache = {}; // {"2026-03": 1032.5, ...} promedio mensual del dólar oficial (venta)
var usdOficialFetchState = 'idle'; // idle | loading | done | error
function cargarUsdOficialCache(){
  try{
    var raw = localStorage.getItem(USD_OFICIAL_CACHE_KEY);
    if(raw) usdOficialCache = JSON.parse(raw) || {};
  }catch(e){ usdOficialCache = {}; }
}
function guardarUsdOficialCache(){
  try{ localStorage.setItem(USD_OFICIAL_CACHE_KEY, JSON.stringify(usdOficialCache)); }catch(e){}
}
function usdOficialKey(anio, mesIdx){ return anio+'-'+String(mesIdx+1).padStart(2,'0'); }
function usdOficialPromedioMes(anio, mesIdx){
  var v = usdOficialCache[usdOficialKey(anio, mesIdx)];
  return (v===undefined) ? null : v;
}
function fetchUsdOficialHistorico(onDone){
  if(usdOficialFetchState==='loading') return;
  usdOficialFetchState = 'loading';
  fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial')
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(rows){
      var sums={}, counts={};
      (rows||[]).forEach(function(r){
        if(!r || !r.fecha || !(+r.venta>0)) return;
        var key = String(r.fecha).slice(0,7); // "YYYY-MM"
        sums[key] = (sums[key]||0) + (+r.venta);
        counts[key] = (counts[key]||0) + 1;
      });
      Object.keys(sums).forEach(function(key){
        usdOficialCache[key] = sums[key]/counts[key];
      });
      guardarUsdOficialCache();
      usdOficialFetchState = 'done';
      if(onDone) onDone(null);
    })
    .catch(function(err){
      usdOficialFetchState = 'error';
      if(onDone) onDone(err);
    });
}
function buildUsdOficialChart(gastosPesos, usdEquivArr){
  var known = usdEquivArr.filter(function(v){return v!==null && v!==undefined;});
  if(!known.length){
    return '<div class="empty-state">Todavía no se pudo traer la cotización histórica (necesitás conexión a internet al menos una vez).</div>';
  }
  var W=860,H=260,padL=58,padR=64,padT=14,padB=40;
  var innerW=W-padL-padR, innerH=H-padT-padB;
  var n=MESES.length;
  var maxPesos = Math.max.apply(null, gastosPesos.concat([1]));
  var maxUsd = Math.max.apply(null, known.concat([1]));
  var stepX = innerW/(n-1);
  function xFor(i){return padL+stepX*i;}
  function yForPesos(v){return padT+innerH-(v/maxPesos)*innerH;}
  function yForUsd(v){return padT+innerH-(v/maxUsd)*innerH;}
  var ticks=4, gridLines='', yLabelsL='', yLabelsR='';
  for(var t=0;t<=ticks;t++){
    var y = padT+innerH-innerH*t/ticks;
    gridLines += '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CHART_COLORS.grid+'" stroke-width="1"/>';
    yLabelsL += '<text x="'+(padL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="'+CHART_COLORS.textFaint+'">'+compactMoney(maxPesos*t/ticks)+'</text>';
    yLabelsR += '<text x="'+(W-padR+8)+'" y="'+(y+4)+'" text-anchor="start" font-size="11" fill="'+CHART_COLORS.dolar+'">'+compactUsd(maxUsd*t/ticks)+'</text>';
  }
  var pesosPts = gastosPesos.map(function(v,i){return xFor(i)+','+yForPesos(v);}).join(' ');
  var pesosDots = gastosPesos.map(function(v,i){
    return '<circle cx="'+xFor(i)+'" cy="'+yForPesos(v)+'" r="3" fill="'+CHART_COLORS.neg+'" data-tip="'+escapeHtml(MESES[i]+': '+money(v)+' de gasto')+'"/>';
  }).join('');
  var segs=[], curSeg=[];
  usdEquivArr.forEach(function(v,i){
    if(v===null||v===undefined){ if(curSeg.length){segs.push(curSeg); curSeg=[];} return; }
    curSeg.push(xFor(i)+','+yForUsd(v));
  });
  if(curSeg.length) segs.push(curSeg);
  var usdLines = segs.map(function(seg){
    return '<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+CHART_COLORS.dolar+'" stroke-width="2"/>';
  }).join('');
  var usdDots = usdEquivArr.map(function(v,i){
    if(v===null||v===undefined) return '';
    return '<circle cx="'+xFor(i)+'" cy="'+yForUsd(v)+'" r="3.5" fill="'+CHART_COLORS.dolar+'" data-tip="'+escapeHtml(MESES[i]+': '+usd(v)+' equivalentes (dólar oficial)')+'"/>';
  }).join('');
  var xlabels = MESES.map(function(mes,i){
    return '<text x="'+xFor(i)+'" y="'+(H-padB+18)+'" text-anchor="middle" font-size="11" fill="'+CHART_COLORS.textFaint+'">'+mes.slice(0,3)+'</text>';
  }).join('');
  var legend = '<g transform="translate('+padL+','+(H-8)+')">'+
      '<rect width="10" height="10" fill="'+CHART_COLORS.neg+'" rx="2"/><text x="14" y="9" font-size="11" fill="'+CHART_COLORS.textDim+'">Gasto en pesos</text>'+
    '</g><g transform="translate('+(padL+150)+','+(H-8)+')">'+
      '<rect width="10" height="10" fill="'+CHART_COLORS.dolar+'" rx="2"/><text x="14" y="9" font-size="11" fill="'+CHART_COLORS.textDim+'">Gasto en USD oficial (eje der.)</text>'+
    '</g>';
  return '<svg viewBox="0 0 '+W+' '+(H+8)+'" style="width:100%;height:auto">'+gridLines+yLabelsL+yLabelsR+
    '<polyline points="'+pesosPts+'" fill="none" stroke="'+CHART_COLORS.neg+'" stroke-width="2"/>'+
    usdLines+pesosDots+usdDots+xlabels+legend+'</svg>';
}

/* ----- Gasto hormiga ----- */
function renderHormiga(){
  var mesSel = document.getElementById('hormigaMes').value;
  var umbral = parseMoneyValue(document.getElementById('hormigaUmbral').value);
  if(isNaN(umbral) || umbral<=0) umbral = 10000;
  var minOc = parseInt(document.getElementById('hormigaMinOcurrencias').value, 10);
  if(isNaN(minOc) || minOc<2) minOc = 3;

  var arr = DATA.gastos.filter(function(g){
    return (!mesSel || g.mes===mesSel) && (+g.monto||0) > 0 && (+g.monto||0) < umbral;
  });

  var groups = {};
  arr.forEach(function(g){
    var key = (g.desc && g.desc.trim()) ? (g.cat+' · '+g.desc.trim()) : g.cat;
    if(!groups[key]) groups[key] = {name:key, count:0, total:0};
    groups[key].count += 1;
    groups[key].total += (+g.monto||0);
  });
  var hormigas = Object.keys(groups).map(function(k){return groups[k];}).filter(function(g){return g.count>=minOc;});
  hormigas.sort(function(a,b){return b.total-a.total;});

  var container = document.getElementById('hormigaContent');
  if(!hormigas.length){
    container.innerHTML = '<div class="empty-state">No se detectaron gastos hormiga con estos filtros ('+money(umbral)+', mín. '+minOc+' veces).</div>';
    return;
  }
  var totalGastado = hormigas.reduce(function(s,g){return s+g.total;},0);
  var totalOcurrencias = hormigas.reduce(function(s,g){return s+g.count;},0);
  var periodo = mesSel ? mesSel : 'el año';
  var summary = '<div class="hormiga-summary">Gastaste <b>'+money(totalGastado)+'</b> en <b>'+totalOcurrencias+'</b> compras chicas durante '+periodo+' — repartidas en '+hormigas.length+' '+(hormigas.length===1?'concepto':'conceptos')+' recurrentes.</div>';
  var list = '<div class="hormiga-list">'+hormigas.map(function(g){
    return '<div class="hormiga-row"><span class="hr-name">'+escapeHtml(g.name)+'</span><span class="hr-count">×'+g.count+'</span><span class="hr-total">'+money(g.total)+'</span></div>';
  }).join('')+'</div>';
  container.innerHTML = summary+list;
}

function refreshChartThemeColors(){
  // Los charts se dibujan como SVG con colores fijos en JS; los releemos
  // de las variables CSS activas para que respeten el tema claro/oscuro.
  var cs = getComputedStyle(document.documentElement);
  function v(name, fallback){ var val = cs.getPropertyValue(name).trim(); return val || fallback; }
  CHART_COLORS.ingreso = v('--ingreso', CHART_COLORS.ingreso);
  CHART_COLORS.fijo = v('--fijo', CHART_COLORS.fijo);
  CHART_COLORS.variable = v('--variable', CHART_COLORS.variable);
  CHART_COLORS.dolar = v('--dolar', CHART_COLORS.dolar);
  CHART_COLORS.inversion = v('--inversion', CHART_COLORS.inversion);
  CHART_COLORS.neg = v('--neg', CHART_COLORS.neg);
  CHART_COLORS.grid = v('--line', CHART_COLORS.grid);
  CHART_COLORS.textDim = v('--text-dim', CHART_COLORS.textDim);
  CHART_COLORS.textFaint = v('--text-faint', CHART_COLORS.textFaint);
}

function renderGraficos(){
  refreshChartThemeColors();
  renderInvestmentChart();
  var months = MESES.map(computeMonth);
  var enUsd = document.getElementById('toggleUsdEquiv').checked;
  var anioActivo = STORE.activeEjercicio;
  var valores = dolarValorMensual();
  var valoresConv = dolarValorConCarry(valores);
  // Siempre preferimos el promedio oficial de ese mes (API ArgentinaDatos);
  // solo si todavía no lo tenemos, usamos como respaldo la cotización de
  // compra propia (con arrastre) para no dejar el mes en cero.
  function convUsd(v, i, on){
    if(!on) return v;
    var rate = usdOficialPromedioMes(anioActivo, i);
    if(rate===null || rate===undefined) rate = valoresConv[i];
    return rate ? v/rate : 0;
  }
  document.getElementById('chartIngGas').innerHTML = buildBarChart([
    {label:'Ingresos', color:CHART_COLORS.ingreso, data:months.map(function(m,i){return convUsd(m.totalIngresos,i,enUsd);})},
    {label:'Gastos', color:CHART_COLORS.neg, data:months.map(function(m,i){return convUsd(m.totalGastos,i,enUsd);})}
  ], 'grouped', {usd:enUsd});

  var fijoVarMode = document.getElementById('fijoVarChartMode').value;
  var fijoVarUsdLabel = document.getElementById('fijoVarUsdLabel');
  var noteEl = document.getElementById('usdOficialNote');
  if(fijoVarMode==='usdoficial'){
    fijoVarUsdLabel.style.display = 'none';
    var usdOfEquivArr = months.map(function(m,i){
      var rate = usdOficialPromedioMes(anioActivo, i);
      return rate ? (m.totalGastos/rate) : null;
    });
    document.getElementById('chartFijoVar').innerHTML = buildUsdOficialChart(
      months.map(function(m){return m.totalGastos;}), usdOfEquivArr
    );
    var hasAnyUsdOf = usdOfEquivArr.some(function(v){return v!==null;});
    if(usdOficialFetchState==='loading'){
      noteEl.textContent = 'Actualizando cotización histórica del dólar oficial...';
    } else if(usdOficialFetchState==='error' && !hasAnyUsdOf){
      noteEl.textContent = 'No se pudo traer la cotización (sin conexión) y todavía no hay datos guardados.';
    } else if(usdOficialFetchState==='error'){
      noteEl.textContent = 'No se pudo actualizar recién (sin conexión) — mostrando la última cotización guardada.';
    } else if(!hasAnyUsdOf){
      noteEl.textContent = 'Necesitás conexión a internet al menos una vez para traer la cotización histórica.';
    } else {
      noteEl.textContent = 'Fuente: promedio mensual del dólar oficial (venta), vía ArgentinaDatos.';
    }
  } else {
    fijoVarUsdLabel.style.display = '';
    var enUsdFijoVar = document.getElementById('toggleUsdFijoVar').checked;
    noteEl.textContent = '';
    document.getElementById('chartFijoVar').innerHTML = buildBarChart([
      {label:'Fijos', color:CHART_COLORS.fijo, data:months.map(function(m,i){return convUsd(m.totalFijos,i,enUsdFijoVar);})},
      {label:'Variables', color:CHART_COLORS.variable, data:months.map(function(m,i){return convUsd(m.totalVariables,i,enUsdFijoVar);})}
    ], 'stacked', {usd:enUsdFijoVar});
  }

  var enUsdDonut = document.getElementById('toggleUsdDonut').checked;
  var catTotals = {};
  months.forEach(function(m,i){
    Object.keys(m.fijosPorCat).forEach(function(c){ catTotals[c]=(catTotals[c]||0)+convUsd(m.fijosPorCat[c],i,enUsdDonut); });
    Object.keys(m.variablesPorCat).forEach(function(c){ catTotals[c]=(catTotals[c]||0)+convUsd(m.variablesPorCat[c],i,enUsdDonut); });
  });
  document.getElementById('chartDonut').innerHTML = buildDonutChart(catTotals, {usd:enUsdDonut});

  var enUsdRestante = document.getElementById('toggleUsdRestante').checked;
  document.getElementById('chartRestante').innerHTML = buildLineChart(
    months.map(function(m,i){return convUsd(m.totalRestante,i,enUsdRestante);}), {usd:enUsdRestante}
  );

  // "Evolución del dólar (referencia)": siempre usa el promedio oficial
  // histórico (ArgentinaDatos) para cada mes, haya o no compra propia
  // registrada. Si por algún motivo todavía no está la cotización oficial
  // de ese mes (ej: sin conexión), se completa con la compra propia para
  // no dejar huecos en la línea.
  var valoresRef = [], fuentesRef = [];
  MESES.forEach(function(mes, i){
    var oficial = usdOficialPromedioMes(anioActivo, i);
    if(oficial!==null && oficial!==undefined){ valoresRef.push(oficial); fuentesRef.push('oficial'); return; }
    var v = valores[i];
    if(v!==null && v!==undefined){ valoresRef.push(v); fuentesRef.push('compra'); }
    else { valoresRef.push(null); fuentesRef.push(null); }
  });
  document.getElementById('chartDolarRef').innerHTML = buildDolarRefChart(valoresRef, fuentesRef);


  renderPresupuestoChart();
  renderAhorroChart();
  var enUsdHeatmap = document.getElementById('toggleUsdHeatmap').checked;
  var monthsHeatmap = !enUsdHeatmap ? months : months.map(function(m,i){
    var fijosPorCat={}, variablesPorCat={};
    Object.keys(m.fijosPorCat).forEach(function(c){ fijosPorCat[c]=convUsd(m.fijosPorCat[c],i,true); });
    Object.keys(m.variablesPorCat).forEach(function(c){ variablesPorCat[c]=convUsd(m.variablesPorCat[c],i,true); });
    return Object.assign({}, m, {fijosPorCat:fijosPorCat, variablesPorCat:variablesPorCat});
  });
  document.getElementById('chartHeatmap').innerHTML = buildHeatmapChart(monthsHeatmap, {usd:enUsdHeatmap});

  if(usdOficialFetchState==='idle'){
    fetchUsdOficialHistorico(function(){ renderGraficos(); });
  }

  renderHormiga();
}

/* ----- Tarjetas de gráficos colapsables ----- */
(function setupChartCollapse(){
  var grid = document.querySelector('#view-graficos .chart-grid');
  if(!grid) return;
  grid.addEventListener('click', function(e){
    var head = e.target.closest('[data-chart-toggle]');
    if(!head) return;
    var card = head.closest('.chart-card');
    if(!card) return;
    card.classList.toggle('collapsed');
    var chevron = head.querySelector('.grp-chevron');
    if(chevron) chevron.classList.toggle('is-collapsed', card.classList.contains('collapsed'));
  });
})();

/* ----- Tooltip propio para los gráficos (reemplaza el title nativo del navegador) ----- */
(function setupChartTooltips(){
  var tipEl = document.createElement('div');
  tipEl.className = 'chart-tooltip';
  document.body.appendChild(tipEl);
  function showTip(x, y, text){
    tipEl.textContent = text;
    tipEl.style.left = x+'px';
    tipEl.style.top = (y-10)+'px';
    tipEl.classList.add('show');
  }
  function hideTip(){ tipEl.classList.remove('show'); }
  var graficosView = document.getElementById('view-graficos');
  if(!graficosView) return;
  graficosView.addEventListener('pointermove', function(e){
    var target = e.target.closest('[data-tip]');
    if(target) showTip(e.clientX, e.clientY, target.getAttribute('data-tip'));
    else hideTip();
  });
  graficosView.addEventListener('pointerdown', function(e){
    var target = e.target.closest('[data-tip]');
    if(target) showTip(e.clientX, e.clientY, target.getAttribute('data-tip'));
  });
  graficosView.addEventListener('pointerleave', hideTip);
  document.addEventListener('pointerdown', function(e){
    if(!e.target.closest('[data-tip]')) hideTip();
  });
})();

/* ----- Click en el donut (porción o leyenda): abre la búsqueda filtrada por esa categoría ----- */
function openCategorySearch(cat){
  openSearch();
  searchInput.value = cat;
  renderSearchResults();
  setTimeout(function(){ searchInput.focus(); searchInput.select(); }, 10);
}
(function setupDonutClick(){
  var chartDonut = document.getElementById('chartDonut');
  if(!chartDonut) return;
  chartDonut.addEventListener('click', function(e){
    var target = e.target.closest('[data-cat]');
    if(!target) return;
    openCategorySearch(target.getAttribute('data-cat'));
  });
})();

/* ===================== RENDER ALL ===================== */
/* ===================== RESUMEN LATERAL (sidebar) ===================== */
function renderSidebarSummary(){
  var box = document.getElementById('sideSummary');
  if(!box) return;
  var idx = currentMonthIdxForDisplay();
  if(idx < 0){
    var yearMonths = MESES.map(computeMonth);
    var gastado = yearMonths.reduce(function(s,m){return s+m.totalGastado;},0);
    var restante = yearMonths.reduce(function(s,m){return s+m.totalRestante;},0);
    box.innerHTML =
      '<div class="ss-title">Ejercicio '+escapeHtml(STORE.activeEjercicio)+'</div>'+
      '<div class="ss-row"><span class="ss-label">Gastado</span><span class="ss-value">'+money(gastado)+'</span></div>'+
      '<div class="ss-divider"></div>'+
      '<div class="ss-row"><span class="ss-label">Saldo</span><span class="ss-value '+(restante<0?'neg':'pos')+'">'+money(restante)+'</span></div>';
    return;
  }
  var m = computeMonth(MESES[idx]);
  box.innerHTML =
    '<div class="ss-title">'+MESES[idx]+'</div>'+
    '<div class="ss-row"><span class="ss-label">Gastado</span><span class="ss-value">'+money(m.totalGastado)+'</span></div>'+
    '<div class="ss-divider"></div>'+
    '<div class="ss-row"><span class="ss-label">Saldo</span><span class="ss-value '+(m.totalRestante<0?'neg':'pos')+'">'+money(m.totalRestante)+'</span></div>';
}

function renderAll(){
  renderResumen();
  renderGraficos();
  renderIngresos();
  renderGastos();
  renderDolar();
  renderInversion();
  renderSidebarSummary();
  try{ renderRecoBanner(); }catch(_e){}
}
renderAll();

/* ===================== BUSCADOR GLOBAL ===================== */
var searchOverlay = document.getElementById('searchOverlay');
var searchInput = document.getElementById('searchInput');
var searchResultsEl = document.getElementById('searchResults');
var searchActiveIndex = -1;
var searchCurrentResults = [];

function normalizeSearchText(s){
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function buildSearchIndex(){
  var idx = [];
  DATA.ingresos.forEach(function(x){
    idx.push({kind:'ingresos', id:x.id, mes:x.mes, title:x.tipo, sub:'Ingreso',
      amountText:money(x.monto),
      searchText:normalizeSearchText(x.mes+' '+x.tipo+' ingreso '+x.monto+' '+(x.fecha||''))});
  });
  DATA.gastos.forEach(function(x){
    idx.push({kind:'gastos', id:x.id, mes:x.mes, title:x.cat, sub:(x.desc?x.desc+' · ':'')+x.tipo,
      amountText:money(x.monto),
      searchText:normalizeSearchText(x.mes+' '+x.cat+' '+(x.desc||'')+' '+x.tipo+' gasto '+x.monto+' '+(x.fecha||''))});
  });
  DATA.dolar.forEach(function(x){
    var subtxt = (x.cant!==null && x.cant!==undefined) ? (money(x.cant)+' gastados · cotización '+fmtCot(x.valor)) : 'Carga manual';
    idx.push({kind:'dolar', id:x.id, mes:x.mes, title:'Compra USD', sub:subtxt,
      amountText:usd(x.total),
      searchText:normalizeSearchText(x.mes+' dolar usd compra '+subtxt+' '+x.total)});
  });
  DATA.inversion.forEach(function(x){
    idx.push({kind:'inversion',id:x.id,mes:x.mes,title:x.nombre,sub:invLabels[x.tipo]+' · '+invDate(x),amountText:invMoney(x.monto,x.moneda),searchText:normalizeSearchText(x.mes+' inversion '+x.nombre+' '+x.tipo+' '+x.moneda+' '+(x.nota||''))});
  });
  return idx;
}

function runSearch(query){
  var idx = buildSearchIndex();
  query = normalizeSearchText(query.trim());
  if(!query) return [];
  var terms = query.split(/\s+/).filter(Boolean);
  return idx.filter(function(item){
    return terms.every(function(t){ return item.searchText.indexOf(t)!==-1; });
  }).slice(0,50);
}

function renderSearchResults(){
  var q = searchInput.value;
  var results = runSearch(q);
  searchCurrentResults = results;
  searchActiveIndex = results.length ? 0 : -1;
  if(!q.trim()){
    searchResultsEl.innerHTML = '<div class="search-empty">Empezá a escribir para buscar en ingresos, gastos, dólar e inversión.</div>';
    return;
  }
  if(!results.length){
    searchResultsEl.innerHTML = '<div class="search-empty">Sin resultados para "'+escapeHtml(q)+'".</div>';
    return;
  }
  searchResultsEl.innerHTML = results.map(function(r, i){
    return '<div class="search-result'+(i===0?' active':'')+'" data-idx="'+i+'">'+
      '<span class="search-result-mes">'+r.mes.slice(0,3)+'</span>'+
      '<span class="search-result-main"><span class="search-result-title">'+escapeHtml(r.title)+'</span>'+(r.sub?('<div class="search-result-sub">'+escapeHtml(r.sub)+'</div>'):'')+'</span>'+
      '<span class="search-result-amt">'+r.amountText+'</span>'+
    '</div>';
  }).join('');
}

function setActiveResult(i){
  var rows = searchResultsEl.querySelectorAll('.search-result');
  rows.forEach(function(r){ r.classList.remove('active'); });
  if(rows[i]){ rows[i].classList.add('active'); rows[i].scrollIntoView({block:'nearest'}); }
  searchActiveIndex = i;
}

function goToSearchResult(r){
  closeSearch();
  var navBtn = document.querySelector('.nav-btn[data-tab="'+r.kind+'"]');
  if(navBtn) navBtn.click();
  var key = r.kind+'-'+r.mes;
  collapsedGroups.delete(key);
  renderAll();
  setTimeout(function(){
    var delBtn = document.querySelector('.entry-del[data-kind="'+r.kind+'"][data-id="'+(window.CSS&&CSS.escape?CSS.escape(String(r.id)):String(r.id).replace(/["\\]/g,""))+'"]');
    if(delBtn){
      var row = delBtn.closest('.entry-row');
      row.scrollIntoView({behavior:'smooth', block:'center'});
      row.classList.add('flash-highlight');
      setTimeout(function(){ row.classList.remove('flash-highlight'); }, 1600);
    }
  }, 60);
}

function openSearch(){
  var mobileSidebar = document.querySelector('.sidebar.mobile-open');
  if(mobileSidebar){
    mobileSidebar.classList.remove('mobile-open');
    var backdropEl = document.getElementById('mobileSidebarBackdrop');
    if(backdropEl) backdropEl.classList.remove('open');
    var menuBtn = document.getElementById('btnMobileMenu');
    if(menuBtn) menuBtn.setAttribute('aria-expanded','false');
  }
  searchOverlay.classList.add('open');
  searchInput.value = '';
  renderSearchResults();
  setTimeout(function(){ searchInput.focus(); }, 10);
}
function closeSearch(){
  searchOverlay.classList.remove('open');
}
document.getElementById('btnOpenSearch').addEventListener('click', openSearch);
var btnMobileSearch = document.getElementById('btnMobileSearch');
if(btnMobileSearch){ btnMobileSearch.addEventListener('click', openSearch); }
document.getElementById('btnCloseSearch').addEventListener('click', closeSearch);
searchOverlay.addEventListener('click', function(e){ if(e.target===searchOverlay) closeSearch(); });
searchInput.addEventListener('input', renderSearchResults);
searchResultsEl.addEventListener('click', function(e){
  var row = e.target.closest('.search-result');
  if(!row) return;
  var r = searchCurrentResults[+row.dataset.idx];
  if(r) goToSearchResult(r);
});
document.addEventListener('keydown', function(e){
  var isMac = navigator.platform.toUpperCase().indexOf('MAC')>=0;
  var mod = isMac ? e.metaKey : e.ctrlKey;
  if(mod && (e.key==='k' || e.key==='K')){
    e.preventDefault();
    if(searchOverlay.classList.contains('open')) closeSearch(); else openSearch();
    return;
  }
  if(!searchOverlay.classList.contains('open')) return;
  if(e.key==='Escape'){ closeSearch(); return; }
  if(e.key==='ArrowDown'){
    e.preventDefault();
    if(searchCurrentResults.length) setActiveResult(Math.min(searchActiveIndex+1, searchCurrentResults.length-1));
    return;
  }
  if(e.key==='ArrowUp'){
    e.preventDefault();
    if(searchCurrentResults.length) setActiveResult(Math.max(searchActiveIndex-1,0));
    return;
  }
  if(e.key==='Enter'){
    e.preventDefault();
    var r = searchCurrentResults[searchActiveIndex];
    if(r) goToSearchResult(r);
    return;
  }
});

// Permite que la capa de sincronización (fuera de este closure) aplique
// cambios guardados por otra persona del mismo libro compartido, en vivo.
window.__gastosApplyRemoteStore = function(json){
  var incoming = normalizeStoreObj(json);
  if(!incoming) return;
  var activeYearStillExists = incoming.ejercicios[STORE.activeEjercicio];
  STORE = incoming;
  STORE.activeEjercicio = activeYearStillExists ? STORE.activeEjercicio : Object.keys(STORE.ejercicios).sort()[0];
  DATA = STORE.ejercicios[STORE.activeEjercicio];
  if(cloudMode){ localStorage.setItem(cloudCacheKey(), JSON.stringify(STORE)); }
  renderEjercicioSelect();
  renderAll();
};

/* ===== Revisión UI/UX: helpers ===== */
function flashEntry(kind, antes, editadoId, mesPref){
  var target = editadoId;
  if(!target){
    var arr = DATA[kind] || [], nuevos = [];
    for(var i=0;i<arr.length;i++){ if(!antes.has(arr[i].id)) nuevos.push(arr[i]); }
    if(!nuevos.length) return;
    var pref = nuevos.filter(function(x){ return x.mes===mesPref; })[0] || nuevos[0];
    target = pref.id;
  }
  var it = (DATA[kind]||[]).filter(function(x){return x.id===target;})[0];
  if(it && collapsedGroups.has(kind+'-'+it.mes)){ collapsedGroups.delete(kind+'-'+it.mes); renderAll(); }
  setTimeout(function(){
    var btn = document.querySelector('.entry-edit[data-kind="'+kind+'"][data-id="'+(window.CSS&&CSS.escape?CSS.escape(String(target)):String(target).replace(/["\\]/g,""))+'"]');
    var row = btn && btn.closest('.entry-row');
    if(!row) return;
    row.scrollIntoView({behavior:'smooth', block:'center'});
    row.classList.add('flash-highlight');
    setTimeout(function(){ row.classList.remove('flash-highlight'); }, 1900);
  }, 80);
}
(function(){
  var card = document.getElementById('gasFormCard');
  var head = document.getElementById('gasFormHead');
  if(card && head && !head.__fcBound){
    head.__fcBound = true;
    var setOpen = function(o){ card.classList.toggle('open', o); head.setAttribute('aria-expanded', o ? 'true' : 'false'); };
    window.setGasFormOpen = setOpen;
    setOpen(window.innerWidth > 860);
    head.addEventListener('click', function(){ setOpen(!card.classList.contains('open')); });
    head.addEventListener('keydown', function(e){
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setOpen(!card.classList.contains('open')); }
    });
  }
  if(window.__ctaBound) return;
  window.__ctaBound = true;
  document.addEventListener('click', function(e){
    var b = e.target.closest('.empty-cta');
    if(!b) return;
    var f = document.getElementById(b.getAttribute('data-focus'));
    if(!f) return;
    var fc = f.closest('.form-card');
    if(fc && fc.classList.contains('collapsible') && window.setGasFormOpen) window.setGasFormOpen(true);
    if(fc) fc.scrollIntoView({behavior:'smooth', block:'start'});
    setTimeout(function(){ try{ f.focus(); }catch(err){} }, 350);
  });
})();

checkBackupReminder();


/* ===== Mejoras (movidas dentro de startApp para acceder a DATA, toast, renderGastos, etc.) ===== */
/* ===== Mejoras: modal de texto, carga rápida, duplicar, alerta de tope, fecha→mes ===== */
var ICON_DUP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
function askConfirmSimple(msg){ return askConfirm({title:'Confirmar', paragraphs:[msg], confirmLabel:'Aceptar'}); }
window.askConfirmSimple = askConfirmSimple; /* lo usa también el módulo de cuenta, fuera de startApp */
function askPrompt(o){
  return new Promise(function(resolve){
    var prev=document.activeElement, ov=document.createElement('div');
    ov.className='account-overlay open';
    var box=document.createElement('div'); box.className='account-box confirm-box';
    box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    var h=document.createElement('h3'); h.textContent=o.title; h.style.marginBottom='10px'; box.appendChild(h);
    var f=document.createElement('form'); var l=document.createElement('label'); l.textContent=o.label||'';
    var inp=document.createElement('input'); inp.type='text'; inp.className='prompt-input'; inp.value=o.value||'';
    if(o.inputMode) inp.inputMode=o.inputMode; inp.autocomplete='off';
    l.appendChild(inp); f.appendChild(l);
    var act=document.createElement('div'); act.className='confirm-actions';
    var c=document.createElement('button'); c.type='button'; c.className='ghost-btn'; c.textContent='Cancelar';
    var ok=document.createElement('button'); ok.type='submit'; ok.className='btn'; ok.textContent=o.confirmLabel||'Aceptar';
    act.appendChild(c); act.appendChild(ok); f.appendChild(act); box.appendChild(f); ov.appendChild(box); document.body.appendChild(ov);
    function done(v){ document.removeEventListener('keydown',onKey,true); ov.remove(); if(prev&&prev.focus) prev.focus(); resolve(v); }
    function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); done(null); } }
    document.addEventListener('keydown',onKey,true);
    c.addEventListener('click',function(){ done(null); });
    ov.addEventListener('click',function(e){ if(e.target===ov) done(null); });
    f.addEventListener('submit',function(e){ e.preventDefault(); done(inp.value.trim()||null); });
    inp.focus(); inp.select();
  });
}
function budgetAlert(tipo,cat,mes){
  var tope=DATA.presupuestos && DATA.presupuestos[presuKey(tipo,cat)];
  if(!tope) return;
  var gastado=DATA.gastos.filter(function(g){return g.mes===mes&&g.tipo===tipo&&g.cat===cat;}).reduce(function(a,g){return a+(+g.monto||0);},0);
  var pct=Math.round(gastado/tope*100);
  if(pct>=80) setTimeout(function(){ toast(pct>=100 ? 'Te pasaste del tope de '+cat+' ('+pct+'%)' : 'Ya llevás '+pct+'% del tope de '+cat); },1800);
}
/* La fecha manda: define el mes (en Ingresos y Gastos) */
function syncMesFromFecha(form){
  var f=form.querySelector('input[name=fecha]'), m=form.querySelector('select[name=mes]');
  if(!f||!m||!f.value) return;
  var d=parseFechaLocal(f.value); if(!d||isNaN(d)) return;
  m.value=MESES[d.getMonth()];
}
['formIngreso','formGasto'].forEach(function(id){
  var form=document.getElementById(id); if(!form) return;
  var f=form.querySelector('input[name=fecha]');
  if(f) f.addEventListener('change',function(){ syncMesFromFecha(form); });
});
document.addEventListener('submit',function(e){
  if(e.target&&(e.target.id==='formIngreso'||e.target.id==='formGasto')) syncMesFromFecha(e.target);
},true);
/* Duplicar gasto */
document.getElementById('listGastos').addEventListener('click',function(e){
  var b=e.target.closest('[data-dup]'); if(!b) return;
  if(esSoloLectura()){ toast('Estás en modo solo lectura.'); return; }
  var it=DATA.gastos.filter(function(x){return x.id===b.getAttribute('data-dup');})[0]; if(!it) return;
  DATA.gastos.push({id:uid('gas'),mes:it.mes,fecha:it.fecha||'',tipo:it.tipo,cat:it.cat,desc:it.desc||'',monto:it.monto,autor:currentAutor()});
  saveData(); renderAll(); toast('Gasto duplicado');
});
/* Carga rápida: botón flotante + */
(function(){
  var fab=document.getElementById('qaFab'); if(!fab) return;
  function visible(){ fab.classList.toggle('show', !esSoloLectura()); }
  setInterval(visible,1500); visible();
  fab.addEventListener('click',function(){
    var prev=document.activeElement, ov=document.createElement('div'); ov.className='account-overlay open';
    var box=document.createElement('div'); box.className='account-box confirm-box'; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    box.innerHTML='<h3 style="margin-bottom:10px">Gasto rápido</h3><form id="qaForm"><div class="qa-row">'+
      '<div class="field"><label>Monto</label><input type="text" inputmode="decimal" id="qaMonto" class="money-input" placeholder="0, o 45000/3" required><div class="money-preview" id="qaPrev"></div></div>'+
      '<div class="field"><label>Tipo</label><select id="qaTipo"><option>Variable</option><option>Fijo</option></select></div>'+
      '<div class="field"><label>Categoría</label><select id="qaCat"></select></div>'+
      '<div class="field"><label>Descripción</label><input type="text" id="qaDesc" placeholder="Opcional" autocomplete="off"></div>'+
      '</div><div class="confirm-actions"><button type="button" class="ghost-btn" id="qaCancel">Cancelar</button><button type="submit" class="btn">Guardar</button></div></form>';
    ov.appendChild(box); document.body.appendChild(ov);
    var tipo=box.querySelector('#qaTipo'), cat=box.querySelector('#qaCat'), monto=box.querySelector('#qaMonto');
    function fill(){ cat.innerHTML=catsFor(tipo.value).map(function(c){return '<option>'+escapeHtml(c)+'</option>';}).join(''); }
    fill(); tipo.addEventListener('change',fill);
    var qaDesc=box.querySelector('#qaDesc'), qaManual=false;
    [tipo,cat].forEach(function(el){ el.addEventListener('change',function(){ qaManual=true; }); });
    qaDesc.addEventListener('input',function(){
      if(!qaDesc.value.trim()){ qaManual=false; return; }
      if(qaManual) return;
      var r=window.categorizarGasto(qaDesc.value); if(!r) return;
      if(tipo.value!==r.tipo){ tipo.value=r.tipo; fill(); }
      cat.value=r.cat;
    });
    attachMoneyInput(monto, box.querySelector('#qaPrev'));
    function close(){ document.removeEventListener('keydown',onKey,true); ov.remove(); if(prev&&prev.focus) prev.focus(); }
    function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown',onKey,true);
    box.querySelector('#qaCancel').addEventListener('click',close);
    ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
    box.querySelector('#qaForm').addEventListener('submit',function(e){
      e.preventDefault();
      var v=parseMoneyValue(monto.value); if(isNaN(v)||!cat.value) return;
      var hoy=new Date(), mes=MESES[hoy.getMonth()];
      var y=String(hoy.getFullYear()), mm=String(hoy.getMonth()+1).padStart(2,'0'), dd=String(hoy.getDate()).padStart(2,'0');
      var fecha=(y===String(STORE.activeEjercicio))?(y+'-'+mm+'-'+dd):'';
      DATA.gastos.push({id:uid('gas'),mes:mes,fecha:fecha,tipo:tipo.value,cat:cat.value,desc:box.querySelector('#qaDesc').value.trim(),monto:v,autor:currentAutor()});
      saveData(); updateDescDatalist(); renderAll(); close(); toast('Gasto agregado');
      try{ budgetAlert(tipo.value,cat.value,mes); }catch(_e){}
    });
    monto.focus();
  });
})();

/* ===== Recurrentes, filtros persistentes y orden ===== */
function ordenGasto(g){ return g.fecha ? parseFechaLocal(g.fecha).getTime() : new Date(+STORE.activeEjercicio, Math.max(0,MESES.indexOf(g.mes)), 1).getTime(); }
function gastosSiguientes(it){
  var ref=ordenGasto(it);
  if(it.cuotaGrupoId){
    return DATA.gastos.filter(function(g){ return g.id!==it.id && g.cuotaGrupoId===it.cuotaGrupoId && ordenGasto(g)>ref; });
  }
  var k=function(g){ return g.tipo+'|'+g.cat+'|'+(g.desc||''); }, key=k(it);
  return DATA.gastos.filter(function(g){ return g.id!==it.id && g.recurrente && !g.cuotaGrupoId && k(g)===key && ordenGasto(g)>ref; });
}
function montoComprometidoCuotas(){
  // Solo tiene sentido si estás parado en el ejercicio real en curso: suma las
  // cuotas de meses todavía no transcurridos. En ejercicios pasados o futuros no aplica.
  var hoy = new Date();
  if(String(STORE.activeEjercicio) !== String(hoy.getFullYear())) return null;
  var mesIdxHoy = hoy.getMonth();
  var total = 0, cuotas = 0;
  DATA.gastos.forEach(function(g){
    if(!g.cuotaGrupoId) return;
    var idx = MESES.indexOf(g.mes);
    if(idx > mesIdxHoy){ total += (+g.monto||0); cuotas++; }
  });
  return {total:total, cuotas:cuotas};
}
function gastoPasaFiltrosExtra(g){
  var cat=document.getElementById('filtCat').value, d=document.getElementById('filtDesde').value, h=document.getElementById('filtHasta').value;
  if(cat && g.cat!==cat) return false;
  if(d||h){ if(!g.fecha) return false; if(d && g.fecha<d) return false; if(h && g.fecha>h) return false; }
  return true;
}
function ordenarGrupos(groups){
  var m=document.getElementById('filtOrden').value; if(!m) return;
  Object.keys(groups).forEach(function(mes){
    groups[mes].sort(function(a,b){
      if(m==='mayor') return (+b.monto||0)-(+a.monto||0);
      if(m==='menor') return (+a.monto||0)-(+b.monto||0);
      return (b.fecha||'').localeCompare(a.fecha||'');
    });
  });
}
function fillFiltCat(){
  var sel=document.getElementById('filtCat'), prev=sel.value, set={};
  DATA.gastos.forEach(function(g){ set[g.cat]=1; });
  ['Fijo','Variable'].forEach(function(t){ catsFor(t).forEach(function(c){ set[c]=1; }); });
  var cats=Object.keys(set).sort(function(a,b){return a.localeCompare(b);});
  sel.innerHTML='<option value="">Todas las categorías</option>'+cats.map(function(c){return '<option>'+escapeHtml(c)+'</option>';}).join('');
  sel.value=cats.indexOf(prev)!==-1?prev:'';
}
var _renderGastosBase=renderGastos;
renderGastos=function(){ fillFiltCat(); _renderGastosBase(); };
/* Filtros que se recuerdan al cambiar de pestaña y al recargar */
(function(){
  var ids=['filtIngMes','filtIngTipo','filtMes','filtTipo','filtBusqueda','filtCat','filtDesde','filtHasta','filtOrden','filtUsdMes'], KEY='lg_filtros_v1', mem={};
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(_e){ return mem; } }
  function save(){
    var o={}; ids.forEach(function(id){ var el=document.getElementById(id); if(el) o[id]=el.value; });
    mem=o; try{ localStorage.setItem(KEY,JSON.stringify(o)); }catch(_e){}
  }
  ids.forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    el.addEventListener('change',save); el.addEventListener('input',save);
    if(id==='filtCat'||id==='filtDesde'||id==='filtHasta'||id==='filtOrden') el.addEventListener('change',function(){ renderGastos(); });
  });
  var o=load(); fillFiltCat();
  ids.forEach(function(id){ var el=document.getElementById(id); if(el && o[id]!==undefined) el.value=o[id]; });
  renderAll();
})();

} /* ===== fin de startApp() ===== */


/* =========================================================================
   AUTENTICACIÓN Y SINCRONIZACIÓN EN LA NUBE (Firebase, opcional)
   Si no se configuró Firebase (window.FIREBASE_CONFIG es null), la app
   arranca de inmediato en modo local, exactamente como antes.
   ========================================================================= */
(function(){
  var cfg = window.FIREBASE_CONFIG;
  var configured = !!(cfg && cfg.apiKey && cfg.projectId && cfg.apiKey.indexOf('TU_')!==0);

  if(!configured || typeof firebase === 'undefined'){
    // Sin Firebase configurado (o el SDK no cargó): app 100% local, sin login.
    // La pantalla de carga solo la oculta el flujo de login, así que acá hay que
    // ocultarla a mano; si no, tapa la app para siempre.
    var splashLocal = document.getElementById('authLoading');
    if(splashLocal){
      splashLocal.classList.add('fade-out');
      setTimeout(function(){ splashLocal.style.display = 'none'; }, 350);
    }
    startApp(null);
    return;
  }

  firebase.initializeApp(cfg);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var toastEl2 = document.getElementById('toast');
  function toastEl_fallback(msg){
    if(!toastEl2) return;
    toastEl2.textContent = msg;
    toastEl2.classList.add('show');
    setTimeout(function(){ toastEl2.classList.remove('show'); }, 3200);
  }

  // Habilita caché offline: permite leer/escribir sin conexión (queda guardado
  // localmente en IndexedDB) y sincroniza solo apenas vuelve la señal.
  try{
    db.enablePersistence({synchronizeTabs:true}).catch(function(err){
      if(err.code==='failed-precondition'){
        console.warn('Persistencia offline: ya hay otra pestaña de esta app abierta.');
      } else if(err.code==='unimplemented'){
        console.warn('Este navegador no soporta guardado offline con Firestore.');
      }
    });
  }catch(e){ /* SDK viejo sin soporte, seguimos igual */ }

  var authGate = document.getElementById('authGate');
  var authLoading = document.getElementById('authLoading');
  var splashMsgEl = document.getElementById('splashMsg');
  var SPLASH_MIN_MS = 900;
  var splashShownAt = null;
  function showSplash(msg){
    if(splashMsgEl && msg) splashMsgEl.textContent = msg;
    if(splashShownAt === null) splashShownAt = Date.now();
    authLoading.classList.remove('fade-out');
    authLoading.style.display = 'flex';
  }
  function hideSplash(cb){
    var elapsed = splashShownAt ? (Date.now() - splashShownAt) : SPLASH_MIN_MS;
    var wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    setTimeout(function(){
      authLoading.classList.add('fade-out');
      setTimeout(function(){
        authLoading.style.display = 'none';
        splashShownAt = null;
        if(cb) cb();
      }, 350);
    }, wait);
  }
  var authForm = document.getElementById('authForm');
  var authEmail = document.getElementById('authEmail');
  var authRealEmailField = document.getElementById('authRealEmailField');
  var authRealEmail = document.getElementById('authRealEmail');
  var authPassword = document.getElementById('authPassword');
  var authError = document.getElementById('authError');
  var authSubmitBtn = document.getElementById('authSubmitBtn');
  var authTabLogin = document.getElementById('authTabLogin');
  var authTabSignup = document.getElementById('authTabSignup');
  var authForgotBtn = document.getElementById('authForgotBtn');
  var authIdLabel = document.getElementById('authIdLabel');
  var userBadge = document.getElementById('userBadge');
  var ubEmail = document.getElementById('ubEmail');
  var ubAvatar = document.getElementById('ubAvatar');
  var currentPhotoURL = null;
  function setUbPhoto(url){
    currentPhotoURL = url || null;
    var targets = [ubAvatar, document.getElementById('accAvatarPreview')];
    targets.forEach(function(el){
      if(!el) return;
      if(currentPhotoURL){
        el.style.backgroundImage = 'url("'+currentPhotoURL+'")';
        if(el.firstChild && el.firstChild.nodeType===3) el.firstChild.textContent = '';
      } else {
        el.style.backgroundImage = '';
      }
    });
    var btnRemove = document.getElementById('btnAccPhotoRemove');
    if(btnRemove) btnRemove.style.display = currentPhotoURL ? 'block' : 'none';
    if(!currentPhotoURL) setUbName(ubEmail.textContent);
  }
  function setUbName(txt){
    ubEmail.textContent = txt || '';
    if(!currentPhotoURL){
      var t = (txt||'').trim();
      var letter = (t && t.charAt(0) !== '(') ? t.charAt(0).toUpperCase() : '·';
      [ubAvatar, document.getElementById('accAvatarPreview')].forEach(function(el){
        if(!el) return;
        if(el.firstChild && el.firstChild.nodeType===3) el.firstChild.textContent = letter;
      });
    }
  }
  var syncDot = document.getElementById('syncDot');
  var btnLogout = document.getElementById('btnLogout');
  var btnAccount = document.getElementById('btnAccount');
  var accountOverlay = document.getElementById('accountOverlay');
  var accountClose = document.getElementById('accountClose');
  var accCurrentEmail = document.getElementById('accCurrentEmail');
  var accPhotoMsg = document.getElementById('accPhotoMsg');
  var accAvatarPreview = document.getElementById('accAvatarPreview');
  var accPhotoInput = document.getElementById('accPhotoInput');
  var btnAccPhotoRemove = document.getElementById('btnAccPhotoRemove');
  var accPassForm = document.getElementById('accPassForm');
  var accPassCurrent = document.getElementById('accPassCurrent');
  var accPassNew = document.getElementById('accPassNew');
  var accPassMsg = document.getElementById('accPassMsg');
  var accEmailForm = document.getElementById('accEmailForm');
  var accEmailNew = document.getElementById('accEmailNew');
  var accEmailPass = document.getElementById('accEmailPass');
  var accEmailMsg = document.getElementById('accEmailMsg');
  var accDelForm = document.getElementById('accDelForm');
  var accDelPass = document.getElementById('accDelPass');
  var accDelConfirm = document.getElementById('accDelConfirm');
  var accDelMsg = document.getElementById('accDelMsg');

  var btnShare = document.getElementById('btnShare');
  var shareOverlay = document.getElementById('shareOverlay');
  var shareClose = document.getElementById('shareClose');
  var shareMsg = document.getElementById('shareMsg');
  var shareMembersList = document.getElementById('shareMembersList');
  var shareInviteSection = document.getElementById('shareInviteSection');
  var shareInviteUsername = document.getElementById('shareInviteUsername');
  var shareInviteRole = document.getElementById('shareInviteRole');
  var btnShareInviteUsername = document.getElementById('btnShareInviteUsername');
  var shareCodeSection = document.getElementById('shareCodeSection');
  var shareCodeRole = document.getElementById('shareCodeRole');
  var btnShareGenCode = document.getElementById('btnShareGenCode');
  var shareCodeResult = document.getElementById('shareCodeResult');
  var shareJoinCode = document.getElementById('shareJoinCode');
  var btnShareJoinCode = document.getElementById('btnShareJoinCode');
  var shareLeaveSection = document.getElementById('shareLeaveSection');
  var btnShareLeave = document.getElementById('btnShareLeave');
  var inviteBanner = document.getElementById('inviteBanner');

  // 'username' = la persona escribe un nombre de usuario (sin @). Por dentro, la cuenta
  //              de Firebase usa su email real (que se pide solo al crear la cuenta y
  //              nunca se muestra en el login), y un mapeo usuario→email en Firestore
  //              (colección 'usernameIndex') permite resolver el login y la recuperación
  //              de contraseña sin que el usuario tenga que escribir su email nunca más.
  // 'email'    = login tradicional con email real, sin usuario.
  var AUTH_MODE = (window.AUTH_MODE === 'email') ? 'email' : 'username';

  function usernameIndexRef(username){
    return db.collection('usernameIndex').doc(username);
  }
  function normalizeUsername(raw){
    return String(raw||'').trim().toLowerCase().replace(/[^a-z0-9_.\-]/g,'');
  }

  if(AUTH_MODE === 'username'){
    authIdLabel.textContent = 'Usuario';
    authEmail.type = 'text';
  } else {
    authIdLabel.textContent = 'Email';
    authEmail.type = 'email';
    authEmail.removeAttribute('pattern');
    authEmail.setAttribute('autocomplete','email');
    authEmail.setAttribute('placeholder','');
  }


  var mode = 'login'; // 'login' | 'signup'
  function setMode(m){
    mode = m;
    authTabLogin.classList.toggle('active', m==='login');
    authTabSignup.classList.toggle('active', m==='signup');
    authSubmitBtn.textContent = m==='login' ? 'Iniciar sesión' : 'Crear cuenta';
    authError.style.display = 'none';
    if(AUTH_MODE === 'username'){
      authRealEmailField.style.display = (m==='signup') ? 'block' : 'none';
      authRealEmail.required = (m==='signup');
    }
  }
  authTabLogin.addEventListener('click', function(){ setMode('login'); });
  authTabSignup.addEventListener('click', function(){ setMode('signup'); });

  function showAuthError(msg){
    authError.textContent = msg;
    authError.style.display = 'block';
  }
  var ID_WORD = AUTH_MODE === 'username' ? 'usuario' : 'email';
  var FIREBASE_ERROR_ES = {
    'auth/invalid-email':'El '+ID_WORD+' tiene caracteres inválidos.',
    'auth/user-not-found':'No existe una cuenta con ese '+ID_WORD+'.',
    'auth/wrong-password':'Contraseña incorrecta.',
    'auth/invalid-credential':(AUTH_MODE==='username' ? 'Usuario o contraseña incorrectos.' : 'Email o contraseña incorrectos.'),
    'auth/email-already-in-use':'Ya existe una cuenta con ese '+ID_WORD+'. Probá iniciar sesión.',
    'auth/weak-password':'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests':'Demasiados intentos. Esperá un momento y volvé a probar.',
    'auth/network-request-failed':'Sin conexión con el servidor. Revisá tu internet.'
  };
  function friendlyError(err){
    return FIREBASE_ERROR_ES[err.code] || ('Ocurrió un error: '+err.message);
  }

  authForm.addEventListener('submit', function(e){
    e.preventDefault();
    var rawId = authEmail.value.trim();
    var pass = authPassword.value;
    authError.style.display = 'none';

    if(AUTH_MODE !== 'username'){
      authSubmitBtn.disabled = true;
      var actionEmail = mode==='login'
        ? auth.signInWithEmailAndPassword(rawId, pass)
        : auth.createUserWithEmailAndPassword(rawId, pass);
      actionEmail.catch(function(err){ showAuthError(friendlyError(err)); })
        .finally(function(){ authSubmitBtn.disabled = false; });
      return;
    }

    var username = normalizeUsername(rawId);
    if(username.length < 3){
      showAuthError('El usuario debe tener al menos 3 caracteres.');
      return;
    }
    authSubmitBtn.disabled = true;

    if(mode === 'login'){
      usernameIndexRef(username).get().then(function(doc){
        if(!doc.exists){
          showAuthError('No existe una cuenta con ese usuario.');
          authSubmitBtn.disabled = false;
          return;
        }
        var realEmail = doc.data().email;
        auth.signInWithEmailAndPassword(realEmail, pass).catch(function(err){
          showAuthError(friendlyError(err));
        }).finally(function(){
          authSubmitBtn.disabled = false;
        });
      }).catch(function(err){
        showAuthError(friendlyError(err));
        authSubmitBtn.disabled = false;
      });
      return;
    }

    // Signup en modo username
    var realEmail = authRealEmail.value.trim();
    if(!realEmail){
      showAuthError('Escribí un email real: lo necesitamos solo para poder recuperar tu contraseña si la olvidás.');
      authSubmitBtn.disabled = false;
      return;
    }
    usernameIndexRef(username).get().then(function(doc){
      if(doc.exists){
        showAuthError('Ese usuario ya existe. Probá con otro.');
        authSubmitBtn.disabled = false;
        return;
      }
      return auth.createUserWithEmailAndPassword(realEmail, pass).then(function(cred){
        return Promise.all([
          usernameIndexRef(username).set({ email: realEmail, uid: cred.user.uid }),
          docRef(cred.user.uid).set({ username: username }, { merge: true })
        ]);
      });
    }).catch(function(err){
      showAuthError(friendlyError(err));
    }).finally(function(){
      authSubmitBtn.disabled = false;
    });
  });

  authForgotBtn.addEventListener('click', function(){
    var rawId = authEmail.value.trim();
    if(!rawId){
      showAuthError(AUTH_MODE==='username'
        ? 'Escribí tu usuario arriba y volvé a tocar "¿Olvidaste tu contraseña?".'
        : 'Escribí tu email arriba y volvé a tocar "¿Olvidaste tu contraseña?".');
      return;
    }
    if(AUTH_MODE !== 'username'){
      auth.sendPasswordResetEmail(rawId).then(function(){
        showAuthError('Te enviamos un email para restablecer tu contraseña. Si no lo ves en unos minutos, revisá la carpeta de spam/promociones.');
      }).catch(function(err){
        showAuthError(friendlyError(err));
      });
      return;
    }
    var username = normalizeUsername(rawId);
    usernameIndexRef(username).get().then(function(doc){
      if(!doc.exists){
        showAuthError('No existe una cuenta con ese usuario.');
        return;
      }
      return auth.sendPasswordResetEmail(doc.data().email).then(function(){
        showAuthError('Te enviamos un email para restablecer tu contraseña. Si no lo ves en unos minutos, revisá la carpeta de spam/promociones.');
      });
    }).catch(function(err){
      showAuthError(friendlyError(err));
    });
  });

  function docRef(uid){
    return db.collection('gastosUsuarios').doc(uid);
  }
  // escapeHtml propio: la función homónima de arriba vive dentro de startApp()
  // y no es visible desde este bloque de autenticación/compartir.
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function libroRef(libroId){
    return db.collection('libros').doc(libroId);
  }
  function invitacionRef(codigo){
    return db.collection('invitaciones').doc(codigo);
  }
  function generarCodigoInvitacion(){
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I)
    var out = '';
    var rnd = new Uint32Array(8);
    crypto.getRandomValues(rnd); // 32 caracteres divide justo 2^32: sin sesgo
    for(var i=0;i<8;i++){ out += chars[rnd[i] % chars.length]; }
    return out;
  }

  // ---- Sincronización con debounce (evita escribir en cada tecla) ----
  var syncTimer = null;
  var currentUid = null;
  var appStarted = false;
  var isSyncing = false;

  // ---- Estado del libro compartido ----
  var currentLibroId = null;     // id del libro (documento en la colección "libros") activo
  var currentUsername = null;
  var currentRol = 'owner';      // 'owner' | 'editor' | 'lector'
  var libroUnsub = null;         // cancela el listener en tiempo real al cambiar de libro/salir
  var lastAppliedStoreJson = null; // evita re-render cuando el snapshot es eco de nuestro propio guardado

  function updateConnStatus(){
    if(!syncDot || isSyncing) return;
    if(!navigator.onLine){
      syncDot.className = 'sync-dot offline';
      syncDot.title = 'Sin conexión — los cambios se guardan y se sincronizan solos cuando vuelva internet';
    } else {
      syncDot.className = 'sync-dot ok';
      syncDot.title = 'Sincronizado';
    }
  }
  window.addEventListener('online', updateConnStatus);
  window.addEventListener('offline', updateConnStatus);

  // Tocar el avatar (donde está el punto) muestra el estado de sincronización.
  // En el celular el tooltip (title) no aparece, por eso se avisa con el toast.
  if(ubAvatar){
    ubAvatar.addEventListener('click', function(){
      if(syncDot) toastEl_fallback(syncDot.title || 'Estado de sincronización');
    });
  }

  function scheduleSync(store){
    if(!currentUid || !currentLibroId) return;
    if(currentRol === 'lector') return; // solo lectura: no escribe en el libro compartido
    if(syncDot){
      isSyncing = true;
      syncDot.className = navigator.onLine ? 'sync-dot syncing' : 'sync-dot offline';
      syncDot.title = navigator.onLine ? 'Guardando…' : 'Sin conexión — se guardó localmente, se va a sincronizar solo';
    }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function(){
      var json = JSON.stringify(store);
      lastAppliedStoreJson = json;
      libroRef(currentLibroId).set({
        store: json,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedByUid: currentUid,
        updatedByUsername: currentUsername || null
      }, { merge: true })
        .then(function(){ isSyncing = false; updateConnStatus(); })
        .catch(function(err){
          isSyncing = false;
          if(syncDot){ syncDot.className = 'sync-dot err'; syncDot.title = 'Error al sincronizar'; }
          console.error('Error sincronizando con Firestore:', err);
        });
    }, 800);
  }

  function manejarErrorInicio(err){
    hideSplash();
    console.error('Error iniciando el libro compartido:', err);
    toastEl_fallback('No se pudo cargar tu libro. Reintentá más tarde.');
  }

  auth.onAuthStateChanged(function(user){
    if(user){
      currentUid = user.uid;
      authGate.classList.remove('show');
      userBadge.style.display = 'flex';
      if(AUTH_MODE !== 'username'){
        setUbName(user.email || '');
      }
      if(appStarted){
        window.__gastosCloudSync = scheduleSync;
        return;
      }
      showSplash('Cargando tu libro…');
      var gotDoc = docRef(user.uid).get();
      var timeoutFallback = new Promise(function(resolve){
        setTimeout(function(){ resolve({__timeout:true}); }, 7000);
      });
      Promise.race([gotDoc, timeoutFallback]).then(function(userDoc){
        if(userDoc && userDoc.__timeout){
          hideSplash();
          if(AUTH_MODE === 'username'){ setUbName('(usuario)'); }
          toastEl_fallback('Sin conexión: se muestran los últimos datos guardados en este dispositivo.');
          window.__gastosCloudSync = scheduleSync;
          appStarted = true;
          startApp(null, true, user.uid);
          updateConnStatus();
          return;
        }
        var userData = (userDoc.exists && userDoc.data()) ? userDoc.data() : {};
        setUbPhoto(userData.photoURL || null);

        function conUsernameResuelto(resolvedUsername){
          if(AUTH_MODE === 'username'){ setUbName(resolvedUsername || '(usuario)'); }

          function conLibro(libroId){
            currentLibroId = libroId;
            currentUsername = resolvedUsername;
            window.__gastosCurrentUsername = resolvedUsername;
            libroRef(libroId).get().then(function(libroDoc){
              var libroData = (libroDoc.exists && libroDoc.data()) ? libroDoc.data() : {};
              var miembros = libroData.miembros || {};
              currentRol = (miembros[user.uid] && miembros[user.uid].rol) || 'owner';
              window.__gastosCurrentRol = currentRol;
              // Auto-reparo: libros creados antes de la función "Compartir" no tienen
              // el campo miembros, lo que hace que las reglas de Firestore les nieguen
              // el acceso a su propio libro. Si sos el dueño y falta, lo completamos una vez.
              if(libroId === user.uid && !miembros[user.uid]){
                var fix = {};
                fix['miembros.'+user.uid] = { username: resolvedUsername || null, rol: 'owner' };
                if(!libroData.ownerUid) fix.ownerUid = user.uid;
                libroRef(libroId).set(fix, { merge: true }).catch(function(err){
                  console.error('No se pudo reparar el campo miembros del libro:', err);
                });
              }
              var preloaded = libroData.store || null;
              lastAppliedStoreJson = preloaded;
              hideSplash();
              window.__gastosCloudSync = scheduleSync;
              appStarted = true;
              startApp(preloaded, true, user.uid);
              updateConnStatus();
              watchLibroChanges();
              checkPendingInvites();
            }).catch(function(err){
              if(libroId !== user.uid && err && err.code === 'permission-denied'){
                // Te quitaron del libro compartido: volvemos a tu libro personal
                docRef(user.uid).set({ libroId: user.uid }, { merge: true })
                  .then(function(){ location.reload(); })
                  .catch(manejarErrorInicio);
                return;
              }
              manejarErrorInicio(err);
            });
          }

          if(userData.libroId){
            conLibro(userData.libroId);
            return;
          }

          var libroIdNuevo = user.uid;
          var miembrosIniciales = {};
          miembrosIniciales[user.uid] = { username: resolvedUsername || null, rol: 'owner' };
          libroRef(libroIdNuevo).set({
            ownerUid: user.uid,
            ownerUsername: resolvedUsername || null,
            store: userData.store || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedByUid: user.uid,
            updatedByUsername: resolvedUsername || null,
            miembros: miembrosIniciales
          }, { merge: true }).then(function(){
            return docRef(user.uid).set({ libroId: libroIdNuevo }, { merge: true });
          }).then(function(){
            conLibro(libroIdNuevo);
          }).catch(manejarErrorInicio);
        }

        var savedUsername = userData.username || null;
        if(savedUsername || AUTH_MODE !== 'username'){
          conUsernameResuelto(savedUsername);
        } else {
          db.collection('usernameIndex').where('uid', '==', user.uid).limit(1).get().then(function(qs){
            var recovered = !qs.empty ? qs.docs[0].id : null;
            if(recovered){
              docRef(user.uid).set({ username: recovered }, { merge: true }).catch(function(e){
                console.error('No se pudo restaurar el username:', e);
              });
            }
            conUsernameResuelto(recovered);
          }).catch(function(e){
            console.error('No se pudo buscar el username en usernameIndex:', e);
            conUsernameResuelto(null);
          });
        }
      }).catch(function(err){
        hideSplash();
        if(AUTH_MODE === 'username'){ setUbName('(usuario)'); }
        console.error('No se pudo leer Firestore, arrancando en modo local:', err);
        window.__gastosCloudSync = null;
        appStarted = true;
        startApp(null, true, user.uid);
      });
    } else {
      currentUid = null;
      currentLibroId = null;
      currentUsername = null;
      currentRol = 'owner';
      setUbPhoto(null);
      if(libroUnsub){ libroUnsub(); libroUnsub = null; }
      window.__gastosCloudSync = null;
      userBadge.style.display = 'none';
      if(inviteBanner){ inviteBanner.style.display = 'none'; }
      hideSplash(function(){
        if(!appStarted){
          authGate.classList.add('show');
          setTimeout(function(){ authEmail.focus(); }, 50);
        }
      });
    }
  });

  btnLogout.addEventListener('click', async function(){
    if(!(await askConfirmSimple('¿Cerrar sesión?'))) return;
    auth.signOut().then(function(){
      location.reload();
    });
  });

  var ROLE_LABEL = { owner:'Dueño/a', editor:'Puede editar', lector:'Solo puede ver' };

  // ---- Escucha en vivo los cambios que haga la otra persona en el mismo libro ----
  function watchLibroChanges(){
    if(libroUnsub){ libroUnsub(); libroUnsub = null; }
    if(!currentLibroId) return;
    libroUnsub = libroRef(currentLibroId).onSnapshot(function(doc){
      if(!doc.exists) return;
      var data = doc.data();
      var miembros = data.miembros || {};
      var nuevoRol = (miembros[currentUid] && miembros[currentUid].rol) || currentRol;
      if(nuevoRol !== currentRol){
        currentRol = nuevoRol;
        window.__gastosCurrentRol = currentRol;
      }
      if(data.store && data.store !== lastAppliedStoreJson){
        lastAppliedStoreJson = data.store;
        // No pisamos nuestro propio guardado recién hecho (updatedByUid === currentUid
        // ya coincide con lastAppliedStoreJson, así que esto solo dispara con cambios ajenos).
        if(window.__gastosApplyRemoteStore) window.__gastosApplyRemoteStore(data.store);
      }
      if(shareOverlay.classList.contains('open')) renderShareMembers(data);
      updateShareBadges(miembros);
    }, function(err){
      console.error('Error escuchando cambios del libro compartido:', err);
    });
  }

  // ---- Invitaciones pendientes (recibidas por nombre de usuario) ----
  function checkPendingInvites(){
    if(!currentUid) return;
    db.collection('invitaciones')
      .where('destinoUid', '==', currentUid)
      .where('estado', '==', 'pendiente')
      .limit(1).get().then(function(qs){
        if(qs.empty){ inviteBanner.style.display = 'none'; return; }
        var doc = qs.docs[0];
        var inv = doc.data();
        inviteBanner.innerHTML =
          '<span>'+escapeHtml(inv.creadoPorUsername||'Alguien')+' te invitó a compartir su libro de gastos como <strong>'+escapeHtml(ROLE_LABEL[inv.rol]||inv.rol)+'</strong>.</span>'+
          '<span class="invite-banner-actions">'+
            '<button class="btn" id="btnInviteAceptar">Aceptar</button>'+
            '<button class="ghost-btn" id="btnInviteRechazar">Rechazar</button>'+
          '</span>';
        inviteBanner.style.display = 'flex';
        document.getElementById('btnInviteAceptar').addEventListener('click', function(){
          aceptarInvitacion(doc.id, inv);
        });
        document.getElementById('btnInviteRechazar').addEventListener('click', function(){
          invitacionRef(doc.id).set({estado:'rechazada'}, {merge:true}).then(function(){
            inviteBanner.style.display = 'none';
          });
        });
      }).catch(function(err){ console.error('No se pudieron revisar las invitaciones pendientes:', err); });
  }

  function unirseALibro(libroId, rol, invitacionId){
    if(!confirm('Al unirte vas a ver y compartir los datos de ese libro. Tu libro actual queda guardado y podés volver a él saliendo desde el mismo menú. ¿Continuar?')) return;
    var miembroUpdate = {};
    miembroUpdate['miembros.'+currentUid] = { username: currentUsername || null, rol: rol, invitacion: invitacionId || null };
    libroRef(libroId).set(miembroUpdate, { merge: true }).then(function(){
      return docRef(currentUid).set({ libroId: libroId }, { merge: true });
    }).then(function(){
      if(invitacionId){ return invitacionRef(invitacionId).set({estado:'aceptada'}, {merge:true}); }
    }).then(function(){
      location.reload();
    }).catch(function(err){
      toastEl_fallback('No se pudo unir al libro: '+(err.message||err));
    });
  }
  function aceptarInvitacion(invitacionId, inv){
    unirseALibro(inv.libroId, inv.rol, invitacionId);
  }

  // ---- Badge de "cuántas personas más" en los botones de compartir ----
  function updateShareBadges(miembros){
    var otros = Math.max(0, Object.keys(miembros||{}).length - 1);
    document.querySelectorAll('.share-badge').forEach(function(b){
      if(otros > 0){ b.textContent = otros; b.style.display = 'block'; }
      else { b.style.display = 'none'; }
    });
  }

  // ---- Modal "Compartir este libro" ----
  function renderShareMembers(libroData){
    var miembros = libroData.miembros || {};
    var esOwner = currentRol === 'owner';
    var html = Object.keys(miembros).map(function(uidM){
      var m = miembros[uidM];
      var esYo = uidM === currentUid;
      return '<div class="member-row">'+
        '<span>'+escapeHtml(m.username || '(usuario)')+(esYo?' (vos)':'')+'</span>'+
        '<span class="role-pill">'+escapeHtml(ROLE_LABEL[m.rol]||m.rol)+'</span>'+
        (esOwner && !esYo ? '<button class="ghost-btn member-remove" data-uid="'+escapeHtml(uidM)+'">Quitar</button>' : '')+
      '</div>';
    }).join('');
    shareMembersList.innerHTML = html || '<div class="empty-state">Sin miembros.</div>';
    shareMembersList.querySelectorAll('.member-remove').forEach(function(btn){
      btn.addEventListener('click', async function(){
        if(!(await askConfirmSimple('¿Quitar a esta persona del libro compartido?'))) return;
        var upd = {}; upd['miembros.'+btn.dataset.uid] = firebase.firestore.FieldValue.delete();
        libroRef(currentLibroId).set(upd, {merge:true}).then(function(){
          return docRef(btn.dataset.uid).set({ libroId: btn.dataset.uid }, { merge: true });
        }).catch(function(err){ console.error('No se pudo quitar al miembro:', err); });
      });
    });
    shareInviteSection.style.display = esOwner ? 'block' : 'none';
    shareCodeSection.style.display = esOwner ? 'block' : 'none';
    shareLeaveSection.style.display = esOwner ? 'none' : 'block';
  }
  function openShareModal(){
    if(!currentLibroId) return;
    shareMsg.className = 'account-msg';
    shareMsg.textContent = '';
    shareCodeResult.style.display = 'none';
    shareMembersList.innerHTML = '<div class="empty-state">Cargando…</div>';
    libroRef(currentLibroId).get().then(function(doc){
      renderShareMembers(doc.exists ? doc.data() : {});
    }).catch(function(err){
      console.error('No se pudo abrir "Compartir este libro":', err);
      shareMembersList.innerHTML = '';
      shareMsg.className = 'account-msg err';
      shareMsg.textContent = 'No se pudo cargar la información para compartir (' + (err.message || err) + '). Si el problema persiste, puede ser un tema de permisos en Firestore.';
    });
    shareOverlay.classList.add('open');
  }
  function closeShareModal(){ shareOverlay.classList.remove('open'); }
  document.querySelectorAll('.share-trigger-btn').forEach(function(b){
    b.addEventListener('click', openShareModal);
  });
  shareClose.addEventListener('click', closeShareModal);
  shareOverlay.addEventListener('click', function(e){ if(e.target===shareOverlay) closeShareModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && shareOverlay.classList.contains('open')) closeShareModal();
  });

  btnShareInviteUsername.addEventListener('click', function(){
    var username = normalizeUsername(shareInviteUsername.value);
    var rol = shareInviteRole.value;
    shareMsg.className = 'account-msg'; shareMsg.textContent = '';
    if(username.length < 3){ shareMsg.className='account-msg err'; shareMsg.textContent='Escribí un nombre de usuario válido.'; return; }
    usernameIndexRef(username).get().then(function(doc){
      if(!doc.exists){ shareMsg.className='account-msg err'; shareMsg.textContent='No existe una cuenta con ese usuario.'; return; }
      var destinoUid = doc.data().uid;
      if(destinoUid === currentUid){ shareMsg.className='account-msg err'; shareMsg.textContent='Ese sos vos.'; return; }
      var codigo = generarCodigoInvitacion();
      return invitacionRef(codigo).set({
        libroId: currentLibroId, rol: rol,
        creadoPorUid: currentUid, creadoPorUsername: currentUsername || null,
        destinoUid: destinoUid, destinoUsername: username,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        estado: 'pendiente'
      }).then(function(){
        shareMsg.className='account-msg ok';
        shareMsg.textContent = 'Invitación enviada a '+username+'. La va a ver la próxima vez que entre.';
        shareInviteUsername.value = '';
      });
    }).catch(function(err){ shareMsg.className='account-msg err'; shareMsg.textContent = 'Ocurrió un error: '+(err.message||err); });
  });

  btnShareGenCode.addEventListener('click', function(){
    var rol = shareCodeRole.value;
    var codigo = generarCodigoInvitacion();
    invitacionRef(codigo).set({
      libroId: currentLibroId, rol: rol,
      creadoPorUid: currentUid, creadoPorUsername: currentUsername || null,
      destinoUid: null, destinoUsername: null,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      estado: 'pendiente'
    }).then(function(){
      shareCodeResult.style.display = 'block';
      shareCodeResult.innerHTML = 'Código: <strong style="letter-spacing:2px;">'+codigo+'</strong><br><small style="color:var(--text-faint);">Compartíselo a quien quieras invitar como '+(ROLE_LABEL[rol]||rol).toLowerCase()+'. Lo usa en "Unirme con un código".</small>';
    }).catch(function(err){ shareMsg.className='account-msg err'; shareMsg.textContent = 'No se pudo generar el código: '+(err.message||err); });
  });

  btnShareJoinCode.addEventListener('click', function(){
    var codigo = (shareJoinCode.value||'').trim().toUpperCase();
    shareMsg.className = 'account-msg'; shareMsg.textContent = '';
    if(!codigo){ shareMsg.className='account-msg err'; shareMsg.textContent='Escribí un código.'; return; }
    invitacionRef(codigo).get().then(function(doc){
      if(!doc.exists || doc.data().estado !== 'pendiente'){
        shareMsg.className='account-msg err'; shareMsg.textContent='Ese código no es válido o ya se usó.';
        return;
      }
      var inv = doc.data();
      if(inv.destinoUid && inv.destinoUid !== currentUid){
        shareMsg.className='account-msg err'; shareMsg.textContent='Ese código es para otra cuenta.';
        return;
      }
      closeShareModal();
      unirseALibro(inv.libroId, inv.rol, doc.id);
    }).catch(function(err){ shareMsg.className='account-msg err'; shareMsg.textContent = 'Ocurrió un error: '+(err.message||err); });
  });

  btnShareLeave.addEventListener('click', async function(){
    if(!(await askConfirmSimple('¿Salir de este libro compartido? Vas a volver a ver tu propio libro personal.'))) return;
    var upd = {}; upd['miembros.'+currentUid] = firebase.firestore.FieldValue.delete();
    libroRef(currentLibroId).set(upd, {merge:true}).then(function(){
      return docRef(currentUid).set({ libroId: currentUid }, { merge: true });
    }).then(function(){
      location.reload();
    }).catch(function(err){ shareMsg.className='account-msg err'; shareMsg.textContent = 'No se pudo salir: '+(err.message||err); });
  });

  // ---- Modal de Cuenta (cambiar contraseña / email / eliminar cuenta) ----
  function clearAccountMsgs(){
    [accPassMsg, accEmailMsg, accDelMsg, accPhotoMsg].forEach(function(el){
      el.className = 'account-msg';
      el.textContent = '';
    });
  }
  function openAccountModal(){
    if(!auth.currentUser) return;
    accCurrentEmail.textContent = auth.currentUser.email || '';
    accPassForm.reset();
    accEmailForm.reset();
    accDelForm.reset();
    clearAccountMsgs();
    accountOverlay.classList.add('open');
  }
  function closeAccountModal(){
    accountOverlay.classList.remove('open');
  }
  btnAccount.addEventListener('click', openAccountModal);
  accountClose.addEventListener('click', closeAccountModal);
  accountOverlay.addEventListener('click', function(e){ if(e.target===accountOverlay) closeAccountModal(); });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && accountOverlay.classList.contains('open')) closeAccountModal();
  });

  // ---- Foto de perfil: recorte cuadrado + compresión en canvas antes de guardar ----
  var ACC_PHOTO_SIZE = 256; // lado del cuadrado final, en px
  function recortarYComprimirImagen(file, cb){
    var reader = new FileReader();
    reader.onerror = function(){ cb(null, 'No se pudo leer el archivo.'); };
    reader.onload = function(){
      var img = new Image();
      img.onerror = function(){ cb(null, 'El archivo no parece ser una imagen válida.'); };
      img.onload = function(){
        var side = Math.min(img.naturalWidth, img.naturalHeight);
        var sx = (img.naturalWidth - side) / 2;
        var sy = (img.naturalHeight - side) / 2;
        var canvas = document.createElement('canvas');
        canvas.width = ACC_PHOTO_SIZE;
        canvas.height = ACC_PHOTO_SIZE;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, ACC_PHOTO_SIZE, ACC_PHOTO_SIZE);
        // Bajamos la calidad JPEG solo si hiciera falta, para no pasarnos del límite de Firestore.
        var quality = 0.9;
        var dataUrl = canvas.toDataURL('image/jpeg', quality);
        while(dataUrl.length > 350000 && quality > 0.4){
          quality -= 0.15;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        cb(dataUrl, null);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  if(accPhotoInput){
    accPhotoInput.addEventListener('change', function(){
      var file = accPhotoInput.files && accPhotoInput.files[0];
      accPhotoInput.value = '';
      if(!file) return;
      if(file.type.indexOf('image/') !== 0){
        accPhotoMsg.className = 'account-msg err';
        accPhotoMsg.textContent = 'Elegí un archivo de imagen (jpg, png, etc.).';
        return;
      }
      accPhotoMsg.className = 'account-msg';
      accPhotoMsg.textContent = 'Procesando imagen…';
      recortarYComprimirImagen(file, function(dataUrl, err){
        if(err || !dataUrl){
          accPhotoMsg.className = 'account-msg err';
          accPhotoMsg.textContent = err || 'No se pudo procesar la imagen.';
          return;
        }
        if(!currentUid){
          accPhotoMsg.className = 'account-msg err';
          accPhotoMsg.textContent = 'No se pudo identificar la cuenta actual.';
          return;
        }
        docRef(currentUid).set({ photoURL: dataUrl }, { merge: true }).then(function(){
          setUbPhoto(dataUrl);
          accPhotoMsg.className = 'account-msg ok';
          accPhotoMsg.textContent = 'Foto actualizada.';
        }).catch(function(err2){
          accPhotoMsg.className = 'account-msg err';
          accPhotoMsg.textContent = 'No se pudo guardar la foto: '+(err2.message||err2);
        });
      });
    });
  }
  if(btnAccPhotoRemove){
    btnAccPhotoRemove.addEventListener('click', function(){
      if(!currentUid) return;
      docRef(currentUid).set({ photoURL: null }, { merge: true }).then(function(){
        setUbPhoto(null);
        accPhotoMsg.className = 'account-msg ok';
        accPhotoMsg.textContent = 'Foto eliminada.';
      }).catch(function(err2){
        accPhotoMsg.className = 'account-msg err';
        accPhotoMsg.textContent = 'No se pudo quitar la foto: '+(err2.message||err2);
      });
    });
  }

  // Handlers de los formularios: se completan en los próximos pasos
  // (cambiar contraseña, cambiar email, eliminar cuenta).
  accPassForm.addEventListener('submit', function(e){
    e.preventDefault();
    var user = auth.currentUser;
    if(!user) return;
    var current = accPassCurrent.value;
    var nueva = accPassNew.value;
    accPassMsg.className = 'account-msg';
    accPassMsg.textContent = '';
    var submitBtn = accPassForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    var cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
    user.reauthenticateWithCredential(cred).then(function(){
      return user.updatePassword(nueva);
    }).then(function(){
      accPassMsg.className = 'account-msg ok';
      accPassMsg.textContent = 'Contraseña actualizada correctamente.';
      accPassForm.reset();
    }).catch(function(err){
      accPassMsg.className = 'account-msg err';
      accPassMsg.textContent = friendlyError(err);
    }).finally(function(){
      submitBtn.disabled = false;
    });
  });
  accEmailForm.addEventListener('submit', function(e){
    e.preventDefault();
    var user = auth.currentUser;
    if(!user) return;
    var nuevoEmail = accEmailNew.value.trim();
    var current = accEmailPass.value;
    accEmailMsg.className = 'account-msg';
    accEmailMsg.textContent = '';
    if(nuevoEmail.toLowerCase() === (user.email||'').toLowerCase()){
      accEmailMsg.className = 'account-msg err';
      accEmailMsg.textContent = 'Ese ya es tu email actual.';
      return;
    }
    var submitBtn = accEmailForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    var cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
    user.reauthenticateWithCredential(cred).then(function(){
      return user.verifyBeforeUpdateEmail(nuevoEmail);
    }).then(function(){
      accEmailMsg.className = 'account-msg ok';
      accEmailMsg.textContent = 'Te enviamos un link de confirmación a '+nuevoEmail+'. El email de tu cuenta cambia recién cuando lo confirmes desde ese correo. Si no lo ves en unos minutos, revisá la carpeta de spam/promociones.';
      accEmailForm.reset();
    }).catch(function(err){
      accEmailMsg.className = 'account-msg err';
      accEmailMsg.textContent = friendlyError(err);
    }).finally(function(){
      submitBtn.disabled = false;
    });
  });
  accDelForm.addEventListener('submit', async function(e){
    e.preventDefault();
    var user = auth.currentUser;
    if(!user) return;
    var current = accDelPass.value;
    var confirmEmail = accDelConfirm.value.trim();
    accDelMsg.className = 'account-msg';
    accDelMsg.textContent = '';
    if(confirmEmail.toLowerCase() !== (user.email||'').toLowerCase()){
      accDelMsg.className = 'account-msg err';
      accDelMsg.textContent = 'El email escrito no coincide con el de tu cuenta.';
      return;
    }
    if(!(await askConfirmSimple('Esto borra tu cuenta y todos tus datos guardados en la nube, sin vuelta atrás. ¿Confirmás?'))) return;
    var submitBtn = accDelForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    var cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
    var uid = user.uid;
    user.reauthenticateWithCredential(cred).then(function(){
      return docRef(uid).delete();
    }).then(function(){
      return user.delete();
    }).then(function(){
      location.reload();
    }).catch(function(err){
      accDelMsg.className = 'account-msg err';
      accDelMsg.textContent = friendlyError(err);
      submitBtn.disabled = false;
    });
  });

  showSplash('Conectando…');
})();

})();

