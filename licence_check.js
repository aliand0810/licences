// Usage : <script src="https://aliand0810.github.io/licences/licence_check.js" data-produit="COVO Pro"></script>
(async function(){
  const PRODUIT=(document.currentScript&&document.currentScript.dataset.produit)||'COVO Pro';
  const URL='https://raw.githubusercontent.com/aliand0810/licences/main/licences.json';
  const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');

  async function verif(mail,key){
    mail=mail.trim().toLowerCase();key=key.trim().toUpperCase();
    try{
      const d=await (await fetch(URL+'?t='+Date.now())).json();
      const h=await sha(mail+'|'+PRODUIT+'|'+key);
      const l=d.licences.find(x=>x.email===mail&&x.produit===PRODUIT&&x.hash===h);
      return !!l&&l.actif&&(!l.expire||new Date(l.expire)>=new Date());
    }catch(e){ // hors ligne : on garde la dernière validation (7 jours max)
      const s=JSON.parse(localStorage.getItem('licOK')||'{}');
      return s.mail===mail&&s.key===key&&Date.now()-s.t<7*864e5;
    }
  }

  const s=JSON.parse(localStorage.getItem('licOK')||'{}');
  if(s.mail&&await verif(s.mail,s.key)){localStorage.setItem('licOK',JSON.stringify({...s,t:Date.now()}));return;}

  const o=document.createElement('div');
  o.style.cssText='position:fixed;inset:0;z-index:99999;background:#0f172a;display:flex;align-items:center;justify-content:center;font-family:system-ui';
  o.innerHTML=`<div style="background:#1e293b;padding:24px;border-radius:12px;width:min(360px,90vw);color:#e2e8f0">
    <h2 style="margin-top:0">🔑 ${PRODUIT}</h2>
    <input id="lm" placeholder="E-mail" style="width:100%;padding:10px;margin-bottom:8px;box-sizing:border-box">
    <input id="lk" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" style="width:100%;padding:10px;box-sizing:border-box">
    <button id="lb" style="width:100%;margin-top:12px;padding:11px;background:#22c55e;border:0;border-radius:8px;font-weight:700">Activer</button>
    <div id="le" style="color:#ef4444;margin-top:8px"></div></div>`;
  document.body.appendChild(o);
  o.querySelector('#lb').onclick=async()=>{
    const m=o.querySelector('#lm').value,k=o.querySelector('#lk').value;
    if(await verif(m,k)){localStorage.setItem('licOK',JSON.stringify({mail:m.trim().toLowerCase(),key:k.trim().toUpperCase(),t:Date.now()}));o.remove();}
    else o.querySelector('#le').textContent='Licence invalide, expirée ou révoquée';
  };
})();
