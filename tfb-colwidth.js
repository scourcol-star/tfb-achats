/* TFB - Pilotage achats : largeurs de colonnes figees (tfb-colwidth.js)
 * ---------------------------------------------------------------------
 * Chaque tableau passe en "table-layout:fixed". La largeur de chaque colonne
 * est mesuree UNE FOIS sur le jeu de donnees complet puis verrouillee via un
 * <colgroup>. Resultat : taper dans un filtre de colonne (loupe), trier ou
 * masquer des lignes ne deplace plus les colonnes.
 * Les largeurs sont uniquement recalculees si le tableau recoit PLUS de lignes
 * qu'auparavant (nouvelles donnees) ou si la fenetre est redimensionnee.
 * Script partage par toutes les pages de l'app (aucune config a faire).
 */
(function () {
  'use strict';
  if (window.__tfbColWidth) return;
  window.__tfbColWidth = true;

  var FILTER_ROW = /(^|\s)(cf-row|colfilt|colf-row|filter-row)(\s|$)/;
  var MIN_COL = 28;
  var PAD = 2; /* marge anti "..." reservee aux tableaux a defilement horizontal */
  var store = Object.create(null);
  var lastVW = window.innerWidth;
  var timer = null;

  function injectCss() {
    if (document.getElementById('tfb-colwidth-css')) return;
    var s = document.createElement('style');
    s.id = 'tfb-colwidth-css';
    s.textContent =
      'table.tfb-fixed{table-layout:fixed}' +
      'table.tfb-fixed>thead>tr>th{overflow:hidden;text-overflow:ellipsis}' +
      'table.tfb-fixed>tbody>tr>td{overflow:hidden;text-overflow:ellipsis}' +
      'table.tfb-fixed>tbody>tr>td[colspan]{overflow:visible}' +
      'table.tfb-fixed>thead>tr>th[colspan]{overflow:visible}';
    (document.head || document.documentElement).appendChild(s);
  }

  /* Premiere ligne d'en-tete "reelle" (on ignore la ligne des filtres) */
  function headerRow(t) {
    if (!t.tHead) return null;
    var rows = t.tHead.rows;
    for (var i = 0; i < rows.length; i++) {
      if (!FILTER_ROW.test(rows[i].className || '')) return rows[i];
    }
    return null;
  }

  /* On ne touche pas aux tableaux imbriques (lignes de detail) */
  function isNested(t) {
    for (var p = t.parentNode; p && p.nodeType === 1; p = p.parentNode) {
      if (p.tagName === 'TABLE') return true;
    }
    return false;
  }

  function hasColspan(tr) {
    for (var i = 0; i < tr.cells.length; i++) if (tr.cells[i].colSpan > 1) return true;
    return false;
  }

  function rowCount(t) {
    var n = 0;
    for (var i = 0; i < t.tBodies.length; i++) n += t.tBodies[i].rows.length;
    return n;
  }

  function sum(w) {
    var s = 0, i;
    for (i = 0; i < w.length; i++) s += w[i];
    return s;
  }

  function keyOf(t, hr) {
    var l = [];
    for (var i = 0; i < hr.cells.length; i++) l.push((hr.cells[i].textContent || '').trim());
    return (t.id || t.className || 'tbl') + '#' + hr.cells.length + '#' + l.join('~');
  }

  function currentWidths(t) {
    var cg = t.querySelector('colgroup[data-tfb]');
    if (!cg) return null;
    var w = [], i;
    for (i = 0; i < cg.children.length; i++) w.push(parseFloat(cg.children[i].style.width) || 0);
    return w;
  }

  function sameWidths(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.6) return false;
    return true;
  }

  function unlock(t) {
    var cg = t.querySelector('colgroup[data-tfb]');
    if (cg && cg.parentNode) cg.parentNode.removeChild(cg);
    t.classList.remove('tfb-fixed');
    t.style.width = '';
    t.style.minWidth = '';
    void t.offsetWidth; /* force le recalcul en mode auto */
  }

  function measure(hr) {
    var w = [], i, x;
    for (i = 0; i < hr.cells.length; i++) {
      x = hr.cells[i].getBoundingClientRect().width;
      w.push(Math.max(MIN_COL, Math.ceil(x)));
    }
    return w;
  }

  /* Les largeurs mesurees sont arrondies vers le haut (Math.ceil) et la barre de
     defilement verticale peut apparaitre apres la mesure : la somme des colonnes
     depasse alors le conteneur de quelques pixels, ce qui fait surgir une barre de
     defilement horizontale inutile. On rend ce surplus a la colonne la plus large,
     un pixel a la fois, pour ne jamais ecraser une petite colonne. */
  function trimToFit(w, avail) {
    if (!avail || !w.length) return w;
    var over = Math.round(sum(w) - avail), guard = 0, i, bi, bv;
    while (over > 0 && guard++ < 600) {
      bi = -1; bv = MIN_COL;
      for (i = 0; i < w.length; i++) if (w[i] > bv) { bv = w[i]; bi = i; }
      if (bi < 0) break;
      w[bi] -= 1;
      over -= 1;
    }
    return w;
  }

  /* Verification apres coup : si le conteneur defile encore horizontalement de
     quelques pixels, on absorbe l'ecart et on reverrouille. */
  function fitAfterLock(t, rec) {
    var p = t.parentNode;
    if (!p || !rec || !rec.fit || !rec.w.length) return;
    var over = p.scrollWidth - p.clientWidth;
    if (over <= 0 || over > 60) return;
    rec.w = trimToFit(rec.w.slice(), sum(rec.w) - over);
    lock(t, rec.w, true);
  }

  function lock(t, w, fit) {
    var cg = t.querySelector('colgroup[data-tfb]'), i, col;
    if (!cg) {
      cg = document.createElement('colgroup');
      cg.setAttribute('data-tfb', '1');
      t.insertBefore(cg, t.firstChild);
    }
    while (cg.children.length > w.length) cg.removeChild(cg.lastChild);
    for (i = 0; i < w.length; i++) {
      col = cg.children[i];
      if (!col) { col = document.createElement('col'); cg.appendChild(col); }
      col.style.width = w[i] + 'px';
    }
    t.classList.add('tfb-fixed');
    if (fit) {
      /* le tableau tenait dans son conteneur : on reste a 100% (pas de debordement) */
      t.style.width = '100%';
      t.style.minWidth = '';
    } else {
      /* tableau plus large que son conteneur : on conserve le defilement horizontal */
      t.style.width = Math.round(sum(w)) + 'px';
      t.style.minWidth = '100%';
    }
  }

  function process(t) {
    var hr = headerRow(t);
    if (!hr || !hr.cells.length) return;
    if (isNested(t) || hasColspan(hr)) return;
    if (!t.getClientRects().length) return; /* onglet masque : on attendra */

    var k = keyOf(t, hr);
    var n = rowCount(t);
    var rec = store[k];

    if (!rec || n > rec.n) {
      unlock(t);
      var nat = measure(hr);
      if (!sum(nat)) return;
      var natW = t.getBoundingClientRect().width;
      var avail = t.parentNode && t.parentNode.clientWidth ? t.parentNode.clientWidth : 0;
      var fit = !(avail && natW > avail + 2);
      var w = nat, i;
      if (!fit) { w = []; for (i = 0; i < nat.length; i++) w.push(nat[i] + PAD); }
      else { w = trimToFit(nat.slice(), avail); }
      store[k] = rec = { w: w, n: n, fit: fit };
    } else if (t.classList.contains('tfb-fixed') && sameWidths(currentWidths(t), rec.w)) {
      fitAfterLock(t, rec);
      return; /* deja verrouille : rien a faire */
    }
    lock(t, rec.w, rec.fit);
    fitAfterLock(t, rec);
  }

  function run() {
    injectCss();
    var ts = document.getElementsByTagName('table');
    for (var i = 0; i < ts.length; i++) {
      try { process(ts[i]); } catch (e) { /* ignore */ }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; run(); }, 80);
  }

  if (window.MutationObserver) {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('resize', function () {
    if (Math.abs(window.innerWidth - lastVW) < 2) return;
    lastVW = window.innerWidth;
    store = Object.create(null);
    var ts = document.getElementsByTagName('table');
    for (var i = 0; i < ts.length; i++) { try { unlock(ts[i]); } catch (e) {} }
    schedule();
  });

  /* changement d'onglet / de vue : les tableaux masques deviennent mesurables */
  document.addEventListener('click', schedule, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
  setTimeout(schedule, 600);
  setTimeout(schedule, 2000);
})();


/* =============================================================================
 * AJOUT — Couche « persistance & rafraichissement non destructif » (persist-v1)
 *
 * Pourquoi ici et pas dans un fichier a part : chaque app<horodatage>.html
 * charge deja /tfb-colwidth.js. En greffant la couche a la fin de ce fichier,
 * le correctif s applique a la page publiee sans toucher au monolithe de
 * 500 Ko, et il survivra automatiquement aux prochaines publications.
 *
 * Pour desactiver : supprimer tout ce qui suit cette entete.
 * ========================================================================== */

/* ============================================================================
   TFB — Couche « persistance & rafraichissement non destructif »  (persist-v1)

   Corrige quatre symptomes lies entre eux :

   1. LE TABLEAU SE VIDE. fetchRange() remet S.orders / S.allProducts a vide
      AVANT d attendre le reseau, puis appelle applyFilters() : pendant toute
      la duree du chargement la page affiche « 0 commandes / Aucune commande »
      alors que les tuiles gardent les anciens totaux. On ne repeint plus un
      etat vide par dessus un etat rempli tant qu un chargement est en cours.

   2. LE CACHE NE SE SAUVEGARDAIT PAS. localStorage etait sature (4,93 Mo sur
      ~5 Mo de limite), dont 2,55 Mo pour tfbc:commandes-pool-v1, un format
      abandonne. Chaque ecriture d instantane levait QuotaExceededError, avale
      en silence par le catch de __lsSet : aucun instantane n etait conserve,
      donc rechargement reseau complet a chaque ouverture. Les instantanes
      passent en IndexedDB (quota ~10 Go au lieu de 5 Mo), les formats morts
      sont purges, et localStorage ne garde plus que l etat d interface.

   3. LES FILTRES SE REMETTAIENT A ZERO. initLoad() force f-period a « ytd » a
      chaque demarrage et rien ne memorisait le groupe, le site, l onglet, les
      fournisseurs coches, le tri ni la page. Tout est desormais sauvegarde et
      restaure avant le chargement, donc sans aller-retour visible.

   4. LA SAISIE ETAIT ECRASEE. Le rafraichissement de fond (toutes les 30 min)
      reconstruit le tableau par innerHTML. Il est maintenant reporte tant qu un
      champ est en cours d edition dans un tableau ou dans la fiche, et reprend
      au blur.

   Cette couche est purement additive : elle enveloppe les fonctions globales
   existantes (cacheGet, cacheSet, applyFilters, populateFourns, setDot, boot,
   doLoad, refreshIncremental) sans en modifier une ligne. Pour la desactiver,
   il suffit de supprimer ce bloc <script>.
   ========================================================================== */
(function(){
  if(window.__TFB_PERSIST_V1__) return;
  window.__TFB_PERSIST_V1__ = true;

  /* ==========================================================================
     0) MENAGE — formats de cache abandonnes qui saturaient localStorage
     ========================================================================== */
  try{
    ['tfbc:commandes-pool-v1','tfbc:commandes-pool-v2'].forEach(function(k){
      localStorage.removeItem(k);
    });
    Object.keys(localStorage).forEach(function(k){
      if(k.indexOf('tfbc:commandes-v2inact-')===0) localStorage.removeItem(k);
    });
  }catch(e){}

  /* ==========================================================================
     1) STOCKAGE — les instantanes vont en IndexedDB, pas en localStorage
     ========================================================================== */
  var HAS_IDB = (function(){ try{ return !!window.indexedDB; }catch(e){ return false; } })();
  var DB_NAME='tfb-cache', DB_STORE='snap', __db=null, __dbP=null;

  function db(){
    if(__db) return Promise.resolve(__db);
    if(__dbP) return __dbP;
    __dbP = new Promise(function(res,rej){
      var rq = indexedDB.open(DB_NAME,1);
      rq.onupgradeneeded = function(){
        var d=rq.result;
        if(!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE);
      };
      rq.onsuccess = function(){ __db=rq.result; res(__db); };
      rq.onerror   = function(){ rej(rq.error); };
      rq.onblocked = function(){ rej(new Error('idb bloquee')); };
    });
    __dbP.catch(function(){ __dbP=null; });
    return __dbP;
  }
  function idbGet(key){
    return db().then(function(d){ return new Promise(function(res,rej){
      var rq = d.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(key);
      rq.onsuccess=function(){ res(rq.result||null); };
      rq.onerror  =function(){ rej(rq.error); };
    }); });
  }
  function idbSet(key,val){
    return db().then(function(d){ return new Promise(function(res,rej){
      var t = d.transaction(DB_STORE,'readwrite');
      t.objectStore(DB_STORE).put(val,key);
      t.oncomplete=function(){ res(true); };
      t.onerror   =function(){ rej(t.error); };
      t.onabort   =function(){ rej(t.error||new Error('idb abort')); };
    }); });
  }

  /* Filet de securite : si une ecriture localStorage passe encore par __lsSet
     (autres pages, mode degrade), on evince les instantanes vraiment perimes
     plutot que d avaler l erreur de quota en silence. */
  var WEEK = 7*24*3600*1000;
  window.__lsSet = function(key,b64){
    var val = JSON.stringify({t:Date.now(), d:b64});
    try{ localStorage.setItem('tfbc:'+key, val); return; }catch(e){}
    try{
      Object.keys(localStorage).forEach(function(k){
        if(k.indexOf('tfbc:')!==0 || k==='tfbc:'+key) return;
        var t=0; try{ t=(JSON.parse(localStorage.getItem(k))||{}).t||0; }catch(_e){}
        if(Date.now()-t > WEEK) localStorage.removeItem(k);
      });
      localStorage.setItem('tfbc:'+key, val);
    }catch(e){ console.warn('cache local sature — instantane conserve en IndexedDB seulement'); }
  };

  /* la page ne definit pas .dot.warn (pastille ambre) : on l ajoute */
  try{
    var st=document.createElement('style');
    st.textContent='.dot.warn{background:var(--amber,#d97706)}';
    document.head.appendChild(st);
  }catch(e){}

  /* Ce fichier est charge par toutes les pages qui incluent tfb-colwidth.js.
     Hors de la page de pilotage achats, on s arrete apres le menage. */
  var PT   = window.__tfbPool || null;          /* {pool,hydrate,fetchRange,covers,save,slice} */
  var POOL = window.__POOL   || (PT && PT.pool) || null;
  if(!PT || !POOL || typeof window.S==='undefined'){ return; }

  var TTL = 30*60*1000;   /* au dela, on rafraichit en fond (sans vider l ecran) */

  function pullServer(key){
    return fetch('/api/cache?key='+encodeURIComponent(key), {cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if(!j || !j.dataB64) return null;
        if(HAS_IDB) idbSet(key,{t:Date.now(), d:j.dataB64}).catch(function(){});
        try{ return __decodeSnap(j.dataB64); }catch(e){ return null; }
      })
      .catch(function(){ return null; });
  }

  /* Lecture « cache-first » : on rend immediatement la copie locale si elle
     existe — l ancienne version attendait la reponse de /api/cache avant de
     peindre quoi que ce soit, d ou l ecran de chargement a chaque ouverture. */
  window.cacheGet = async function(key){
    var rec = null;
    if(HAS_IDB){ try{ rec = await idbGet(key); }catch(e){} }

    /* migration : premiere ouverture apres la mise a jour, l instantane est
       encore en localStorage. On le recopie en IndexedDB et on libere la place. */
    if(!rec){
      try{
        var raw = localStorage.getItem('tfbc:'+key);
        if(raw){
          var o = JSON.parse(raw);
          if(o && o.d){
            rec = {t:o.t||0, d:o.d};
            if(HAS_IDB) idbSet(key,rec).then(function(){
              try{ localStorage.removeItem('tfbc:'+key); }catch(_e){}
            }).catch(function(){});
          }
        }
      }catch(e){}
    }

    if(rec && rec.d){
      var fresh = (Date.now()-(rec.t||0)) < TTL;
      window.__CACHE_FRESH_LOCAL__ = fresh;
      var snap = null;
      try{ snap = __decodeSnap(rec.d); }catch(e){ snap = null; }
      if(snap){
        if(!fresh) pullServer(key);          /* on remet a jour la copie locale en fond */
        return snap;                          /* ... mais on peint tout de suite */
      }
    }
    window.__CACHE_FRESH_LOCAL__ = false;
    return await pullServer(key);
  };

  window.cacheSet = async function(key,obj){
    var b64;
    try{
      var gz = pako.gzip(JSON.stringify(obj)), bin='', CH=0x8000;
      for(var i=0;i<gz.length;i+=CH){ bin += String.fromCharCode.apply(null, gz.subarray(i,i+CH)); }
      b64 = btoa(bin);
    }catch(e){ console.warn('cacheSet encode', e); return false; }

    var okLocal = false;
    if(HAS_IDB){ try{ await idbSet(key,{t:Date.now(), d:b64}); okLocal=true; }catch(e){ console.warn('cacheSet idb', e); } }
    if(!okLocal){ try{ window.__lsSet(key,b64); okLocal=true; }catch(e){} }

    try{
      var r = await fetch('/api/cache?key='+encodeURIComponent(key), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({dataB64:b64})
      });
      return r.ok;
    }catch(e){ return okLocal; }
  };

  /* ==========================================================================
     2) ETAT D INTERFACE — sauvegarde et restaure sans aller-retour visible
     ========================================================================== */
  var UI_KEY = 'tfb:ui-v1';

  function val(id){ var e=document.getElementById(id); return e ? e.value : null; }

  function uiSave(){
    try{
      localStorage.setItem(UI_KEY, JSON.stringify({
        period:   val('f-period'),
        dateStart:val('date-start'),
        dateEnd:  val('date-end'),
        site:     val('f-site'),
        src:      val('f-src'),
        q:        val('f-q'),
        group:    S.group,
        tab:      S.tab,
        fournSel: (S.fournSel && S.fournSel.size) ? Array.prototype.slice.call(S.fournSel) : [],
        amountMode:S.amountMode,
        hideTrf:  !!S.hideTrf,
        sortK:S.sortK,  sortD:S.sortD,
        sortKM:S.sortKM, sortDM:S.sortDM,
        sortKF:S.sortKF, sortDF:S.sortDF,
        sortKS:S.sortKS, sortDS:S.sortDS,
        page:     S.page,
        t: Date.now()
      }));
    }catch(e){}
  }

  var saveT=null;
  function uiSaveSoon(){ clearTimeout(saveT); saveT=setTimeout(uiSave, 500); }

  function applyTab(tab){
    var el = document.querySelector('.tab[data-tab="'+tab+'"]');
    if(!el) return;
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
    el.classList.add('active');
    S.tab = tab;
    ['commandes','matieres','fourns','sites','charts','dashfourn','reception'].forEach(function(t){
      var e=document.getElementById('tab-'+t);
      if(e) e.style.display = (t===tab ? 'block' : 'none');
    });
  }

  function uiRestore(){
    var u=null;
    try{ u = JSON.parse(localStorage.getItem(UI_KEY)||'null'); }catch(e){}
    if(!u) return;

    /* periode — seulement si l option existe encore (les mois sont generes) */
    try{
      var p=document.getElementById('f-period');
      if(p && u.period && Array.prototype.some.call(p.options, function(o){ return o.value===u.period; })){
        p.value = u.period;
        var cd=document.getElementById('custom-dates');
        if(u.period==='custom'){
          if(u.dateStart){ var ds=document.getElementById('date-start'); if(ds) ds.value=u.dateStart; }
          if(u.dateEnd){   var de=document.getElementById('date-end');   if(de) de.value=u.dateEnd; }
          if(cd) cd.style.display='flex';
        }else if(cd) cd.style.display='none';
      }
    }catch(e){}

    /* groupe de sites (chips « Tous / Paris / Bordeaux… ») */
    try{
      if(u.group){
        S.group = u.group;
        var box=document.getElementById('grp-btns');
        if(box) box.querySelectorAll('.fgb').forEach(function(b){
          b.classList.toggle('active', b.dataset.grp===u.group);
        });
      }
    }catch(e){}

    /* site precis (chips OB / SD / SF…) */
    try{
      if(u.site){
        var fs=document.getElementById('f-site'); if(fs) fs.value=u.site;
        var sb=document.getElementById('site-btns');
        if(sb) sb.querySelectorAll('.fgb2').forEach(function(b){
          b.classList.toggle('active', b.dataset.site===u.site);
        });
      }
    }catch(e){}

    try{ if(u.src){ var e1=document.getElementById('f-src'); if(e1) e1.value=u.src; } }catch(e){}
    try{ if(u.q){   var e2=document.getElementById('f-q');   if(e2) e2.value=u.q;   } }catch(e){}

    try{ if(u.fournSel && u.fournSel.length) S.fournSel = new Set(u.fournSel); }catch(e){}
    try{ if(u.amountMode) S.amountMode = u.amountMode; }catch(e){}
    try{ if(typeof u.hideTrf==='boolean') S.hideTrf = u.hideTrf; }catch(e){}

    ['sortK','sortD','sortKM','sortDM','sortKF','sortDF','sortKS','sortDS'].forEach(function(k){
      try{ if(u[k]!=null && u[k]!=='') S[k]=u[k]; }catch(e){}
    });
    try{ if(typeof u.page==='number' && u.page>0){ S.page=u.page; S.__gardePage=true; } }catch(e){}
    try{ if(u.tab) applyTab(u.tab); }catch(e){}
  }

  /* ==========================================================================
     3) RENDU NON DESTRUCTIF
        - on ne peint jamais un etat vide par dessus un etat rempli pendant
          un chargement ;
        - on ne reconstruit pas un tableau dans lequel l utilisateur ecrit.
     ========================================================================== */
  var loading  = 0;          /* > 0 : un chargement est en vol */
  var pending  = false;      /* un rendu a ete refuse, a rejouer */
  var lastGood = {orders:[], allProducts:[]};
  var lastDetail = '';

  var O = {
    applyFilters:   window.applyFilters,
    populateFourns: window.populateFourns,
    setDot:         window.setDot,
    switchTab:      window.switchTab,
    changePage:     window.changePage,
    boot:           window.boot,
    doLoad:         window.doLoad,
    refreshIncremental: window.refreshIncremental
  };

  function isEmpty(){ return !S.orders || !S.orders.length; }
  function hadData(){ return !!(lastGood.orders && lastGood.orders.length); }

  /* Un champ est-il en cours d edition dans une zone qui sera reconstruite ?
     Les champs de la barre de filtres survivent au rendu : ils ne bloquent pas. */
  function editing(){
    var a = document.activeElement;
    if(!a) return false;
    if(!(a.isContentEditable || a.tagName==='INPUT' || a.tagName==='TEXTAREA')) return false;
    var ty=(a.type||'').toLowerCase();
    if(ty==='checkbox'||ty==='radio'||ty==='button'||ty==='submit') return false;
    return !!(a.closest && a.closest('table, #drawer, .dbody, .cd-tbl, .det-tbl'));
  }

  window.applyFilters = function(){
    /* rendu vide pendant un chargement : on garde l affichage courant */
    if(loading>0 && isEmpty() && hadData()){ pending=true; return; }
    /* rafraichissement de fond pendant une saisie : on repeindra au blur */
    if(loading>0 && editing()){ pending=true; return; }
    var r = O.applyFilters.apply(this, arguments);
    if(!isEmpty()){ lastGood = {orders:S.orders, allProducts:S.allProducts}; }
    uiSaveSoon();
    return r;
  };

  window.populateFourns = function(){
    /* la liste des fournisseurs se reconstruit depuis S.orders : vide pendant
       un chargement, elle effacerait les cases cochees */
    if(loading>0 && isEmpty() && hadData()){ return; }
    return O.populateFourns.apply(this, arguments);
  };

  window.setDot = function(c,s,d){
    if(d) lastDetail = d;
    /* pendant un chargement, ne pas annoncer « Pret — 0 commandes » alors que
       la page affiche encore les donnees precedentes */
    if(loading>0 && isEmpty() && hadData()){
      return O.setDot.call(this, 'spin', 'Actualisation en arriere-plan…', d||lastDetail||'');
    }
    return O.setDot.apply(this, arguments);
  };

  window.switchTab = function(el){
    var r = O.switchTab.apply(this, arguments);
    uiSaveSoon();
    return r;
  };
  if(typeof O.changePage==='function'){
    window.changePage = function(){
      var r = O.changePage.apply(this, arguments);
      uiSaveSoon();
      return r;
    };
  }

  /* rejeu du rendu refuse, des que la saisie est terminee */
  function flush(){
    if(!pending || loading>0 || editing()) return;
    pending = false;
    try{ window.applyFilters(); }catch(e){}
  }
  document.addEventListener('focusout', function(){ setTimeout(flush, 150); }, true);
  document.addEventListener('click',    function(){ uiSaveSoon(); }, true);
  window.addEventListener('pagehide',   uiSave);
  document.addEventListener('visibilitychange', function(){ if(document.hidden) uiSave(); });
  setInterval(flush, 4000);

  /* ==========================================================================
     4) CHARGEMENTS — encadres, avec repli sur les donnees precedentes
     ========================================================================== */
  function periodEnd(r){
    var e = r.endDate;
    try{ var pe = tfbPeriodEff(); if(pe && pe.endEff>e) e = pe.endEff; }catch(_e){}
    return e;
  }

  /* Si le chargement echoue, S reste vide (hydrate n est jamais appele).
     On re-tranche depuis le pool s il a des donnees, sinon on remet
     l affichage precedent : mieux vaut une donnee datee qu un ecran vide. */
  function recover(){
    if(!isEmpty() || !hadData()) return false;
    var pool = window.__tfbPool;
    if(pool && pool.pool && pool.pool.orders && pool.pool.orders.length){
      try{
        var r = getPeriodDates();
        pool.hydrate(r.startDate, periodEnd(r), true);
        return false;              /* hydrate a deja repeint */
      }catch(e){}
    }
    S.orders      = lastGood.orders;
    S.allProducts = lastGood.allProducts;
    S.__ordDeduped = false;
    try{ O.setDot('warn', S.orders.length+' commandes (donnees en cache)', 'reseau indisponible — reessayez avec Actualiser'); }catch(e){}
    return true;
  }

  function wrapLoad(fn){
    return async function(){
      loading++;
      try{
        return await fn.apply(this, arguments);
      }finally{
        loading--;
        if(loading===0){
          if(recover()) pending = true;
          flush();
          uiSaveSoon();
        }
      }
    };
  }

  /* --------------------------------------------------------------------------
     LE DEFAUT PRINCIPAL. window.doLoad() enchaine fetchRange() puis hydrate().
     fetchRange() remplit S depuis l API, mais hydrate() RE-TRANCHE depuis le
     pool P via sliceRange(). Or rien ne versait S dans P entre les deux :
     absorb() n etait appele que par saveSnapshot(), donc apres hydrate.
     Consequence : un mois que le pool ne couvrait pas etait bien telecharge,
     puis immediatement jete — S.orders=[] — d ou le « Pret : 0 commandes /
     Aucune commande » avec des tuiles restees sur les totaux precedents.
     Cela ne se voyait pas quand le pool revenait du cache... mais le cache
     n etait plus jamais ecrit, faute de place dans localStorage. Les deux
     defauts se tenaient mutuellement.

     On reecrit donc les deux chargements en appelant saveSnapshot()
     — c est a dire absorb() puis la persistance du pool — AVANT hydrate().
     ------------------------------------------------------------------------ */
  function pad2(n){ return n<10 ? ('0'+n) : (''+n); }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
  function yearStart(){ return today().slice(0,4)+'-01-01'; }

  /* meme elargissement que le pool : annee en cours, etendue a la plage deja
     connue pour ne jamais retrecir le pool */
  function widen(s,e){
    var a=s, b=e, y0=yearStart(), y1=today();
    if(y0<a) a=y0;
    if(y1>b) b=y1;
    if(POOL.orders.length && POOL.s){ if(POOL.s<a) a=POOL.s; if(POOL.e>b) b=POOL.e; }
    return {s:a, e:b};
  }

  async function chargePeriode(hard){
    var r=null;
    try{ r=getPeriodDates(); }catch(e){}
    if(!r) return O.doLoad ? O.doLoad({force:!!hard}) : undefined;
    var eEff = periodEnd(r);

    /* deja en cache : on peint sans toucher au reseau */
    if(!hard && PT.covers(r.startDate, r.endDate)){
      PT.hydrate(r.startDate, eEff, true);
      try{ window.completerLignesManquantes(); }catch(e){}
      return;
    }

    var w  = hard ? {s:r.startDate, e:r.endDate} : widen(r.startDate, r.endDate);
    var ok = await PT.fetchRange(w.s, w.e, hard);
    if(!ok) return;                         /* recover() remettra l affichage */

    try{ window.saveSnapshot(); }catch(e){}  /* absorb() + ecriture du pool */
    PT.hydrate(r.startDate, eEff, false);
  }

  window.doLoad = wrapLoad(function(opt){
    return chargePeriode(!!(opt && opt.force===true));
  });
  window.reloadWithPeriod = async function(){ return window.doLoad(); };

  /* Le rafraichissement de fond (toutes les 30 min) ne doit jamais tomber au
     milieu d une saisie : on le repousse d une minute et demie. */
  var refresh = wrapLoad(function(){ return chargePeriode(false); });
  window.refreshIncremental = function(){
    if(editing()){
      setTimeout(function(){ try{ window.refreshIncremental(); }catch(e){} }, 90000);
      return Promise.resolve();
    }
    return refresh.apply(this, arguments);
  };

  /* L etat d interface est restaure AVANT le premier chargement : la periode
     enregistree est donc celle utilisee par getPeriodDates(), sans rechargement
     ni clignotement. */
  if(typeof O.boot==='function'){
    window.boot = async function(){
      try{ uiRestore(); }catch(e){}
      loading++;
      try{
        return await O.boot.apply(this, arguments);
      }finally{
        loading--;
        if(loading===0){
          if(recover()) pending = true;
          flush();
          /* la page restauree a ete honoree : les rendus suivants repartent
             de la page 1 comme avant */
          setTimeout(function(){ S.__gardePage=false; }, 0);
        }
      }
    };
  }

  console.log('TFB persist-v1 actif — instantanes en IndexedDB, etat d interface conserve, rendu non destructif.');
})();
