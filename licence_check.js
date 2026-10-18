// Usage : <script src="https://aliand0810.github.io/licences/licence_check.js" data-produit="COVO Pro"></script>
(function(){
  const PRODUIT=(document.currentScript&&document.currentScript.dataset.produit)||'COVO Pro';
  const URL='https://raw.githubusercontent.com/aliand0810/licences/main/licences.json';
  const KEY='licOK_'+PRODUIT;
  const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const get=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}}};
  const notExpired=e=>!e||new Date(e)>new Date();
  let overlay=null,timer=null;

  // Renvoie {ok, expire, msg}
  async function verif(mail,key){
    mail=mail.trim().toLowerCase();key=key.trim().toUpperCase();
    try{
      const d=await (await fetch(URL+'?t='+Date.now(),{cache:'no-store'})).json();
      const h=await sha(mail+'|'+PRODUIT+'|'+key);
      const l=d.licences.find(x=>x.email===mail&&x.produit===PRODUIT&&x.hash===h);
      if(!l)return{ok:false,msg:'Licence invalide'};
      if(!l.actif)return{ok:false,msg:'Licence révoquée'};
      if(!notExpired(l.expire))return{ok:false,msg:'Licence expirée'};
      return{ok:true,expire:l.expire||null};
    }catch(e){ // hors ligne : dernière validation, 7 jours max, sans dépasser l'expiration
      const s=get();
      const ok=s.mail===mail&&s.key===key&&Date.now()-s.t<7*864e5&&notExpired(s.expire);
      return{ok,expire:s.expire,msg:ok?'':'Connexion impossible et licence non vérifiée'};
    }
  }

  function save(mail,key,expire){localStorage.setItem(KEY,JSON.stringify({mail:mail.trim().toLowerCase(),key:key.trim().toUpperCase(),expire,t:Date.now()}))}

  // Bloque l'app automatiquement à l'expiration + revérifie toutes les 5 min (révocation)
  function watch(expire){
    clearInterval(timer);
    timer=setInterval(async()=>{
      if(!notExpired(expire))return lock('Votre période d\'essai / licence a expiré');
      const s=get();if(Date.now()-s.t>3e5){const r=await verif(s.mail,s.key);if(r.ok)save(s.mail,s.key,r.expire);else lock(r.msg)}
    },15000);
  }

  function lock(msg){
    clearInterval(timer);if(overlay)return;
    overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(7,11,22,.97);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    overlay.innerHTML=`<div style="background:#111827;border:1px solid rgba(255,255,255,.1);padding:28px;border-radius:20px;width:min(380px,90vw);color:#eef2ff;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="font-size:2rem">🔑</div><h2 style="margin:8px 0 4px">${PRODUIT}</h2>
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

  (async()=>{
    const s=get();
    if(s.mail){const r=await verif(s.mail,s.key);if(r.ok){save(s.mail,s.key,r.expire);return watch(r.expire)}lock(r.msg)}
    else lock();
  })();
})();
