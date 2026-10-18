// Usage : <script src="https://aliand0810.github.io/licences/licence_check.js" data-produit="COVO Pro" data-module="Caisse"></script>
// data-module est facultatif (uniquement pour les satellites)
(function(){
  const DS=(document.currentScript&&document.currentScript.dataset)||{};
  const PRODUIT=DS.produit||'COVO Pro', MODULE=DS.module||'';
  const SRC='https://raw.githubusercontent.com/aliand0810/licences/main/licences.json';
  const KEY='licOK_'+PRODUIT;
  const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const get=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}}};
  const notExpired=e=>!e||new Date(e)>new Date();
  let overlay=null,timer=null;

  // Renvoie {ok, expire, msg}
  async function verif(mail,key){
    mail=mail.trim().toLowerCase();key=key.trim().toUpperCase();
    try{
      const d=await (await fetch(SRC+'?t='+Date.now(),{cache:'no-store'})).json();
      if((d.bannis||[]).includes(mail))return{ok:false,msg:'Accès interdit pour cette adresse'};
      const h=await sha(mail+'|'+PRODUIT+'|'+key);
      const l=d.licences.find(x=>x.email===mail&&x.produit===PRODUIT&&x.hash===h);
      if(!l)return{ok:false,msg:'Licence invalide'};
      if(!l.actif)return{ok:false,msg:'Licence révoquée'};
      if(!notExpired(l.expire))return{ok:false,msg:'Licence expirée'};
      if(MODULE&&Array.isArray(l.modules)&&!l.modules.includes(MODULE))return{ok:false,msg:`Le module « ${MODULE} » n'est pas inclus dans votre licence`};
      return{ok:true,expire:l.expire||null};
    }catch(e){ // hors ligne : dernière validation, 7 jours max, sans dépasser l'expiration
      const s=get();
      const ok=s.mail===mail&&s.key===key&&Date.now()-s.t<7*864e5&&notExpired(s.expire);
      return{ok,expire:s.expire,msg:ok?'':'Connexion impossible et licence non vérifiée'};
    }
  }

  function save(mail,key,expire){localStorage.setItem(KEY,JSON.stringify({mail:mail.trim().toLowerCase(),key:key.trim().toUpperCase(),expire,t:Date.now()}))}

  // Bloque l'app à l'expiration (contrôle chaque seconde) et revérifie la révocation toutes les 20 s
  let busy=false,last=0;
  async function recheck(force){
    if(overlay||busy||(!force&&Date.now()-last<20000))return;
    busy=true;last=Date.now();
    const s=get();const r=await verif(s.mail,s.key);busy=false;
    if(r.ok){save(s.mail,s.key,r.expire);curExp=r.expire}else lock(r.msg);
  }
  let curExp=null;
  function watch(expire){
    curExp=expire;clearInterval(timer);
    timer=setInterval(()=>{if(!notExpired(curExp))return lock('Votre période d\'essai / licence a expiré');recheck()},1000);
  }
  document.addEventListener('visibilitychange',()=>document.visibilityState==='visible'&&recheck(true));
  addEventListener('focus',()=>recheck(true));
  addEventListener('online',()=>recheck(true));

  function lock(msg){
    clearInterval(timer);if(overlay)return;
    overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(7,11,22,.97);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    overlay.innerHTML=`<div style="background:#111827;border:1px solid rgba(255,255,255,.1);padding:28px;border-radius:20px;width:min(380px,90vw);color:#eef2ff;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="font-size:2rem">🔑</div><h2 style="margin:8px 0 4px">${PRODUIT}${MODULE?' · '+MODULE:''}</h2>
      <p style="color:#8b93b0;margin:0 0 16px;font-size:.9rem">Entrez votre licence pour continuer</p>
      <input id="lm" type="email" placeholder="E-mail" style="width:100%;padding:12px;margin-bottom:8px;box-sizing:border-box;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff">
      <input id="lk" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" style="width:100%;padding:12px;box-sizing:border-box;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff;font-family:monospace">
      <button id="lb" style="width:100%;margin-top:14px;padding:13px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;border:0;border-radius:10px;font-weight:700;cursor:pointer">Activer</button>
      <div id="le" style="color:#fda4af;margin-top:10px;font-size:.88rem">${msg||''}</div></div>`;
    (document.body||document.documentElement).appendChild(overlay);
    const s=get();if(s.mail)overlay.querySelector('#lm').value=s.mail;
    overlay.querySelector('#lb').onclick=async()=>{
      const m=overlay.querySelector('#lm').value,k=overlay.querySelector('#lk').value,b=overlay.querySelector('#lb');
      b.textContent='Vérification…';const r=await verif(m,k);b.textContent='Activer';
      if(r.ok){save(m,k,r.expire);overlay.remove();overlay=null;watch(r.expire)}
      else overlay.querySelector('#le').textContent=r.msg;
    };
  }

  // ── Transfert de licence entre domaines (COVO Pro ⇄ satellites) ──
  const TRUST=/(^|\.)aliand0810\.github\.io$|(^|\.)covo-trv\.(store|fr)$/i;
  const enc=s=>btoa(unescape(encodeURIComponent(s))).replace(/=+$/,'');
  const dec=s=>decodeURIComponent(escape(atob(s)));
  // 1) À l'arrivée : lire #lic=… , l'enregistrer puis l'effacer de l'adresse
  (function(){const m=location.hash.match(/[#&]lic=([A-Za-z0-9+/_-]+)/);if(!m)return;
    try{const [mail,key]=dec(m[1]).split('|');if(mail&&key)save(mail,key,null)}catch(e){}
    const h=location.hash.replace(/[#&]lic=[^&]*/,'').replace(/^&/,'#');
    history.replaceState(null,'',location.pathname+location.search+(h==='#'?'':h));
  })();
  // 2) Au départ : ajouter la licence aux liens vers les autres domaines de confiance
  function withLic(url){try{const u=new URL(url,location.href);const s=get();
    if(!s.mail||u.origin===location.origin||!TRUST.test(u.hostname))return url;
    const t='lic='+enc(s.mail+'|'+s.key);u.hash=u.hash&&u.hash.length>1?u.hash+'&'+t:t;return u.href}catch(e){return url}}
  window.licenceLink=withLic;
  document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(a&&!overlay){const o=a.href,n=withLic(o);if(n!==o){a.href=n;setTimeout(()=>a.href=o,500)}}},true);
  const _open=window.open;window.open=function(u,...r){return _open.call(window,u?withLic(String(u)):u,...r)};

  (async()=>{
    const s=get();
    if(s.mail){const r=await verif(s.mail,s.key);if(r.ok){save(s.mail,s.key,r.expire);return watch(r.expire)}lock(r.msg)}
    else lock();
  })();
})();
