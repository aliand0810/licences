// Usage : <script src="https://aliand0810.github.io/licences/licence_check.js" data-produit="COVO Pro" data-module="Caisse"></script>
// data-module est facultatif (uniquement pour les satellites)
// Après validation, les réglages de la licence (onglets autorisés, Client ID Google, compte Google associé)
// sont enregistrés dans localStorage « licData_<produit> » et envoyés à l'appli via l'événement « licence:data ».
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
    mail=String(mail||'').trim().toLowerCase();key=String(key||'').trim().toUpperCase();
    if(!mail||!key)return{ok:false,msg:''};
    try{
      const d=await (await fetch(SRC+'?t='+Date.now(),{cache:'no-store'})).json();
      if((d.bannis||[]).includes(mail))return{ok:false,msg:'Accès interdit pour cette adresse'};
      const h=await sha(mail+'|'+PRODUIT+'|'+key);
      const l=d.licences.find(x=>x.email===mail&&x.produit===PRODUIT&&x.hash===h);
      if(!l)return{ok:false,msg:'Licence invalide'};
      if(!l.actif)return{ok:false,msg:'Licence révoquée'};
      if(!notExpired(l.expire))return{ok:false,msg:'Licence expirée'};
      if(MODULE&&Array.isArray(l.modules)&&!l.modules.includes(MODULE))return{ok:false,msg:`Le module « ${MODULE} » n'est pas inclus dans votre licence`};
      if(l.maxDevices&&d.firebase){const r=await device(d.firebase,l);if(!r.ok)return r}
      return{ok:true,expire:l.expire||null,data:extra(l,d)};
    }catch(e){ // hors ligne : dernière validation, 7 jours max, sans dépasser l'expiration
      const s=get();
      const ok=s.mail===mail&&s.key===key&&Date.now()-s.t<7*864e5&&notExpired(s.expire);
      return{ok,expire:s.expire,msg:ok?'':'Connexion impossible et licence non vérifiée'};
    }
  }

  // ── Limite d'appareils (Firebase) ──
  // Empreinte de l'appareil : identique sur COVO Pro et tous ses satellites (même navigateur)
  async function devId(){const n=navigator,sc=screen,w=Math.min(sc.width,sc.height),h=Math.max(sc.width,sc.height);
    let tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}
    return (await sha([n.userAgent,n.platform,n.hardwareConcurrency,n.deviceMemory,w+'x'+h,sc.colorDepth,tz].join('|'))).slice(0,24)}
  const UA=()=>navigator.userAgent.replace(/^Mozilla\/5\.0 /,'').slice(0,120);
  // Adresse IP publique + ville approximative (mise en cache 10 min)
  async function netInfo(){try{const c=JSON.parse(sessionStorage.getItem('licNet')||'null');if(c&&c.ip&&Date.now()-c.at<6e5)return c}catch(e){}
    const get=u=>Promise.race([fetch(u,{cache:'no-store'}).then(r=>{if(!r.ok)throw 0;return r.json()}),new Promise((_,j)=>setTimeout(()=>j(0),4000))]);
    const src=[['https://get.geojs.io/v1/ip/geo.json',j=>({ip:j.ip,loc:[j.city,j.country_code].filter(Boolean).join(', ')})],
      ['https://ipwho.is/?fields=ip,city,country_code',j=>({ip:j.ip,loc:[j.city,j.country_code].filter(Boolean).join(', ')})],
      ['https://ipinfo.io/json',j=>({ip:j.ip,loc:[j.city,j.country].filter(Boolean).join(', ')})],
      ['https://api.ipify.org?format=json',j=>({ip:j.ip,loc:''})],
      ['https://api64.ipify.org?format=json',j=>({ip:j.ip,loc:''})]];
    let n=null;for(const[u,f]of src){try{const r=f(await get(u));if(r.ip){n=r;break}}catch(e){}}
    n=n||{ip:'',loc:'',err:1};n.at=Date.now();if(n.ip)try{sessionStorage.setItem('licNet',JSON.stringify(n))}catch(e){}return n}
  async function device(fb,l){
    fb=fb.replace(/\/+$/,'');const me=await devId(),flag='licSlot_'+l.id;
    let list;try{list=await (await fetch(`${fb}/devices/${l.id}.json`,{cache:'no-store'})).json()||{}}catch(e){return{ok:true}} // Firebase injoignable : on tolère
    const k0=Object.keys(list).find(k=>list[k]&&list[k].id===me);
    if(k0){const d=list[k0];if(!d.lastIp||Date.now()-(d.seen||0)>6e5){const n=await netInfo();
        const hist=[{t:Date.now(),ip:n.ip,loc:n.loc},...(Array.isArray(d.hist)?d.hist:[])].slice(0,15);
        fetch(`${fb}/devices/${l.id}/${k0}.json`,{method:'PUT',body:JSON.stringify({...d,seen:Date.now(),lastIp:n.ip,lastLoc:n.loc,ua:UA(),hist})}).catch(()=>{})}
      return{ok:true}}
    if(localStorage.getItem(flag))return{ok:false,msg:'Cet appareil a été retiré de la licence'};
    const n=await netInfo();
    for(let i=0;i<l.maxDevices;i++){const k=String(i).padStart(2,'0');if(list[k])continue;
      const r=await fetch(`${fb}/devices/${l.id}/${k}.json`,{method:'PUT',body:JSON.stringify({id:me,t:Date.now(),seen:Date.now(),ua:UA(),ip:n.ip,loc:n.loc,lastIp:n.ip,lastLoc:n.loc,hist:[{t:Date.now(),ip:n.ip,loc:n.loc}]})});
      if(r.ok){localStorage.setItem(flag,k);return{ok:true}}}
    // Licence en trop : on signale la tentative au vendeur (avec IP)
    try{await fetch(`${fb}/excess/${l.id}/${me}.json`,{method:'PUT',body:JSON.stringify({t:Date.now(),ua:UA(),ip:n.ip,loc:n.loc})})}catch(e){}
    return{ok:false,msg:`Licence en trop : ce code est déjà utilisé sur ${l.maxDevices} appareil${l.maxDevices>1?'s':''}. Contactez le vendeur.`};
  }

  // ── Réglages injectés par Licence Pro ──
  function extra(l,d){const g=l.google||{},dg=(d.google||{})[PRODUIT]||'';
    return{onglets:Array.isArray(l.onglets)?l.onglets:null,modules:Array.isArray(l.modules)?l.modules:null,
      google:{clientId:String(g.clientId||dg||'').trim(),email:String(g.email||'').trim().toLowerCase()},
      sav:(l.sav&&l.sav.on&&(!l.sav.until||new Date(l.sav.until)>new Date())&&!(d.sav&&d.sav.visible===false))?{until:l.sav.until||l.expire||null,contact:d.sav||{}}:null}}
  function applyData(x){if(!x)return;
    try{const old=localStorage.getItem('licData_'+PRODUIT)||'',nv=JSON.stringify(x);if(old!==nv)localStorage.setItem('licData_'+PRODUIT,nv);
      const g=x.google||{};
      // Client ID Google partagé (COVO Pro et ses satellites lisent tous « gdrive_client_id »)
      if(g.clientId&&localStorage.getItem('gdrive_client_id')!==g.clientId)localStorage.setItem('gdrive_client_id',g.clientId);
      if(g.email&&localStorage.getItem('gdrive_hint_email')!==g.email)localStorage.setItem('gdrive_hint_email',g.email);
    }catch(e){}
    window.LICENCE_DATA=x;try{dispatchEvent(new CustomEvent('licence:data',{detail:x}))}catch(e){}savUI(x)}
  try{const c=JSON.parse(localStorage.getItem('licData_'+PRODUIT)||'null');if(c)window.LICENCE_DATA=c}catch(e){}

  function save(mail,key,expire){localStorage.setItem(KEY,JSON.stringify({mail:mail.trim().toLowerCase(),key:key.trim().toUpperCase(),expire,t:Date.now()}))}

  // Bloque l'app à l'expiration (contrôle chaque seconde) et revérifie la révocation toutes les 20 s
  let busy=false,last=0;
  async function recheck(force){
    if(overlay||busy||(!force&&Date.now()-last<20000))return;
    busy=true;last=Date.now();
    const s=get();const r=await verif(s.mail,s.key);busy=false;
    if(r.ok){save(s.mail,s.key,r.expire);applyData(r.data);curExp=r.expire}else lock(r.msg);
  }
  let curExp=null;
  function watch(expire){
    curExp=expire;clearInterval(timer);
    timer=setInterval(()=>{if(!notExpired(curExp))return lock('Votre période d\'essai / licence a expiré');recheck()},1000);
  }
  document.addEventListener('visibilitychange',()=>document.visibilityState==='visible'&&recheck(true));
  addEventListener('focus',()=>recheck(true));
  addEventListener('online',()=>recheck(true));


  // ── Demande de licence en ligne (Firebase « requests ») + réception automatique ──
  const FB_DEF='https://covo-licences-default-rtdb.europe-west1.firebasedatabase.app';
  const RKEY='licReq_'+PRODUIT;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let fbBase=null,pollT=null;
  async function fbUrl(){if(fbBase)return fbBase;try{const d=await (await fetch(SRC+'?t='+Date.now(),{cache:'no-store'})).json();fbBase=(d.firebase||FB_DEF).replace(/\/+$/,'')}catch(e){fbBase=FB_DEF}return fbBase}
  const getReq=()=>{try{return JSON.parse(localStorage.getItem(RKEY)||'null')}catch(e){return null}};
  const inp='width:100%;padding:12px;margin-bottom:8px;box-sizing:border-box;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff;font-family:inherit';
  const btn='width:100%;margin-top:6px;padding:13px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;border:0;border-radius:10px;font-weight:700;cursor:pointer';
  const lnk='display:block;margin:12px auto 0;background:none;border:0;color:#93c5fd;cursor:pointer;font-size:.86rem;text-decoration:underline';
  function box(html){if(!overlay)return;overlay.firstElementChild.innerHTML=`<div style="font-size:2rem">🔑</div><h2 style="margin:8px 0 4px">${esc(PRODUIT)}${MODULE?' · '+esc(MODULE):''}</h2>`+html}
  function showRequestForm(err){clearInterval(pollT);const s=get();
    box(`<p style="color:#8b93b0;margin:0 0 14px;font-size:.9rem">Demandez votre licence : elle sera installée automatiquement sur cet appareil dès qu'elle sera accordée.</p>
      <input id="rn" placeholder="Nom et prénom" maxlength="80" style="${inp}">
      <input id="rm" type="email" placeholder="E-mail" maxlength="120" style="${inp}" value="${esc(s.mail||'')}">
      <input id="rt" type="tel" placeholder="Téléphone (facultatif)" maxlength="30" style="${inp}">
      <textarea id="rx" rows="3" maxlength="1000" placeholder="Message (entreprise, besoin, nombre d'appareils…)" style="${inp};resize:vertical"></textarea>
      <button id="rs" style="${btn}">Envoyer la demande</button>
      <div id="re" style="color:#fda4af;margin-top:10px;font-size:.88rem">${esc(err||'')}</div>
      <button id="rb" style="${lnk}">J'ai déjà une clé de licence</button>`);
    overlay.querySelector('#rb').onclick=()=>{overlay.remove();overlay=null;lock()};
    overlay.querySelector('#rs').onclick=async()=>{const nom=overlay.querySelector('#rn').value.trim(),mail=overlay.querySelector('#rm').value.trim().toLowerCase(),tel=overlay.querySelector('#rt').value.trim(),msg=overlay.querySelector('#rx').value.trim(),b=overlay.querySelector('#rs'),e=overlay.querySelector('#re');
      if(!nom)return e.textContent='Indiquez votre nom';if(!/^\S+@\S+\.\S+$/.test(mail))return e.textContent='E-mail invalide';
      b.textContent='Envoi…';b.disabled=true;
      const rid=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
      const body={nom,email:mail,produit:PRODUIT,t:Date.now(),statut:'attente',ua:UA(),page:location.origin+location.pathname};if(tel)body.tel=tel;if(msg)body.message=msg;if(MODULE)body.module=MODULE;
      try{const r=await fetch(`${await fbUrl()}/requests/${rid}.json`,{method:'PUT',body:JSON.stringify(body)});if(!r.ok)throw new Error(r.status);
        localStorage.setItem(RKEY,JSON.stringify({rid,mail,t:body.t}));showWaiting()}
      catch(x){b.textContent='Envoyer la demande';b.disabled=false;e.textContent='Envoi impossible ('+(x.message||'réseau')+'). Réessayez plus tard.'}};
  }
  function showWaiting(info){const q=getReq();if(!q)return showRequestForm();
    box(`<div style="margin:6px 0 14px;padding:14px;border-radius:12px;background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.35)">
        <div style="font-weight:700">⏳ Demande envoyée</div>
        <div style="color:#8b93b0;font-size:.86rem;margin-top:4px">le ${new Date(q.t).toLocaleString('fr-FR')} pour <b style="color:#eef2ff">${esc(q.mail)}</b>.<br>Dès qu'elle sera accordée, votre licence s'installera automatiquement : laissez cette page ouverte ou revenez plus tard.</div></div>
      <div id="rw" style="color:#8b93b0;font-size:.82rem">${esc(info||'Vérification en cours…')}</div>
      <button id="rk" style="${lnk}">J'ai déjà une clé de licence</button>
      <button id="rc" style="${lnk};color:#fda4af">Annuler la demande</button>`);
    overlay.querySelector('#rk').onclick=()=>{clearInterval(pollT);overlay.remove();overlay=null;lock(null,true)};
    overlay.querySelector('#rc').onclick=()=>{if(!confirm('Annuler cette demande ?'))return;localStorage.removeItem(RKEY);showRequestForm()};
    clearInterval(pollT);pollReq();pollT=setInterval(pollReq,10000);
  }
  let pollBusy=false;
  async function pollReq(){const q=getReq();if(!q||!overlay)return clearInterval(pollT);if(pollBusy)return;pollBusy=true;const w=overlay.querySelector('#rw');
    try{const r=await (await fetch(`${await fbUrl()}/requests/${q.rid}.json?t=${Date.now()}`,{cache:'no-store'})).json();
      if(!r){localStorage.removeItem(RKEY);clearInterval(pollT);return showRequestForm('Votre demande a été clôturée. Vous pouvez en envoyer une nouvelle.')}
      if(r.statut==='refusee'){localStorage.removeItem(RKEY);clearInterval(pollT);return showRequestForm('Votre demande a été refusée'+(r.motif?' : '+r.motif:'.')+' Vous pouvez contacter le vendeur.')}
      if(r.statut==='accordee'&&r.cle){clearInterval(pollT);if(w)w.textContent='✅ Licence accordée — installation…';
        Object.keys(localStorage).filter(x=>x.startsWith('licSlot_')).forEach(x=>localStorage.removeItem(x));
        const v=await verif(r.email||q.mail,r.cle);
        if(v.ok){save(r.email||q.mail,r.cle,v.expire);applyData(v.data);localStorage.removeItem(RKEY);overlay.remove();overlay=null;watch(v.expire);
          const t=document.createElement('div');t.textContent='✅ Licence '+PRODUIT+' activée';t.style.cssText='position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483647;background:#10b981;color:#fff;padding:12px 18px;border-radius:12px;font:600 14px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.3)';document.body.appendChild(t);setTimeout(()=>t.remove(),4000);return}
        return showRefusInstall(r,q,v.msg)}
      if(w)w.textContent='Toujours en attente — dernière vérification à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    }catch(e){if(w)w.textContent='Hors ligne — nouvelle tentative dans quelques secondes'}
    finally{pollBusy=false}
  }
  // Licence accordée mais refusée à l'installation (ex. limite d'appareils) : écran fixe, réessai uniquement à la demande
  function showRefusInstall(r,q,msg){clearInterval(pollT);
    box(`<div style="margin:6px 0 14px;padding:14px;border-radius:12px;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.4)">
        <div style="font-weight:700">⚠️ Licence accordée, mais non activée sur cet appareil</div>
        <div style="color:#fda4af;font-size:.88rem;margin-top:6px">${esc(msg||'Validation impossible')}</div>
        <div style="color:#8b93b0;font-size:.82rem;margin-top:8px">Le vendeur doit autoriser cet appareil (ou augmenter le nombre d'appareils de la licence). Appuyez ensuite sur « Réessayer ».</div></div>
      <button id="ry" style="${btn}">Réessayer</button>
      <div id="rw" style="color:#8b93b0;font-size:.82rem;margin-top:8px"></div>
      <button id="rk" style="${lnk}">J'ai déjà une clé de licence</button>
      <button id="rn2" style="${lnk};color:#fda4af">Faire une nouvelle demande</button>`);
    overlay.querySelector('#ry').onclick=async()=>{const b=overlay.querySelector('#ry');b.textContent='Vérification…';b.disabled=true;
      Object.keys(localStorage).filter(x=>x.startsWith('licSlot_')).forEach(x=>localStorage.removeItem(x));
      const v=await verif(r.email||q.mail,r.cle);
      if(v.ok){save(r.email||q.mail,r.cle,v.expire);applyData(v.data);localStorage.removeItem(RKEY);overlay.remove();overlay=null;watch(v.expire);return}
      b.textContent='Réessayer';b.disabled=false;overlay.querySelector('#rw').textContent='Toujours refusée : '+(v.msg||'')+' ('+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+')'};
    overlay.querySelector('#rk').onclick=()=>{overlay.remove();overlay=null;lock(null,true)};
    overlay.querySelector('#rn2').onclick=()=>{localStorage.removeItem(RKEY);showRequestForm()};
  }
  function lock(msg,skipReq){
    clearInterval(timer);if(overlay)return;
    overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(7,11,22,.97);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    overlay.innerHTML=`<div style="background:#111827;border:1px solid rgba(255,255,255,.1);padding:28px;border-radius:20px;width:min(380px,90vw);color:#eef2ff;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="font-size:2rem">🔑</div><h2 style="margin:8px 0 4px">${PRODUIT}${MODULE?' · '+MODULE:''}</h2>
      <p style="color:#8b93b0;margin:0 0 16px;font-size:.9rem">Entrez votre licence pour continuer</p>
      <input id="lm" type="email" placeholder="E-mail" style="width:100%;padding:12px;margin-bottom:8px;box-sizing:border-box;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff">
      <input id="lk" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" style="width:100%;padding:12px;box-sizing:border-box;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff;font-family:monospace">
      <button id="lb" style="width:100%;margin-top:14px;padding:13px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;border:0;border-radius:10px;font-weight:700;cursor:pointer">Activer</button>
      <div id="le" style="color:#fda4af;margin-top:10px;font-size:.88rem">${msg||''}</div>
      <button id="lr" style="display:block;margin:14px auto 0;background:none;border:0;color:#93c5fd;cursor:pointer;font-size:.86rem;text-decoration:underline">Pas encore de licence ? Faire une demande en ligne</button></div>`;
    (document.body||document.documentElement).appendChild(overlay);
    const s=get();if(s.mail)overlay.querySelector('#lm').value=s.mail;
    overlay.querySelector('#lr').onclick=()=>showRequestForm();
    if(!skipReq&&getReq())return showWaiting();
    overlay.querySelector('#lb').onclick=async()=>{
      const m=overlay.querySelector('#lm').value,k=overlay.querySelector('#lk').value,b=overlay.querySelector('#lb');
      b.textContent='Vérification…';Object.keys(localStorage).filter(x=>x.startsWith('licSlot_')).forEach(x=>localStorage.removeItem(x));const r=await verif(m,k);b.textContent='Activer';
      if(r.ok){save(m,k,r.expire);applyData(r.data);overlay.remove();overlay=null;watch(r.expire)}
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

  // ── Service après-vente : bouton 🛟 visible uniquement si le SAV est inclus dans la licence ──
  // Conversation dans l'application (Firebase « support/<id>/msgs ») + WhatsApp / e-mail / téléphone
  let savBtn=null,savPanel=null,savPoll=null,savBg=null,savView='home',savTid=null;
  const SKEY='licSav_'+PRODUIT,myT=()=>{try{return JSON.parse(localStorage.getItem(SKEY)||'[]')}catch(e){return[]}},
    seen=t=>+(localStorage.getItem('licSavSeen_'+t)||0),markSeen=t=>localStorage.setItem('licSavSeen_'+t,Date.now());
  const waNum=v=>{let d=String(v||'').replace(/[^\d]/g,'');if(/^0\d{9}$/.test(d))d='33'+d.slice(1);return d};
  const fmt=t=>new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  async function getT(tid){try{return await (await fetch(`${await fbUrl()}/support/${tid}.json?t=${Date.now()}`,{cache:'no-store'})).json()}catch(e){return null}}
  const msgsOf=t=>[{from:'client',text:t.message,t:t.t},...Object.values(t.msgs||{})].filter(m=>m&&m.text).sort((a,b)=>a.t-b.t);
  async function unread(){let n=0;for(const tid of myT()){const t=await getT(tid);if(t)n+=msgsOf(t).filter(m=>m.from==='sav'&&m.t>seen(tid)).length}return n}
  function setBadge(n){if(!savBtn)return;savBtn.textContent=n?`🛟 SAV · ${n} nouveau${n>1?'x':''} message${n>1?'s':''}`:'🛟 SAV';savBtn.style.animation=n?'licPulse 1.6s infinite':''}
  // Bouton déplaçable (doigt ou souris), aimanté au bord le plus proche, position mémorisée par logiciel
  const PKEY='licSavPos_'+PRODUIT;
  function placeSav(b,p){const w=innerWidth,h=innerHeight,bw=b.offsetWidth||90,bh=b.offsetHeight||38,m=8;
    const y=Math.min(Math.max(p.y*h,m),h-bh-m);b.style.bottom='auto';b.style.top=y+'px';
    if(p.side==='r'){b.style.left='auto';b.style.right=m+'px'}else{b.style.right='auto';b.style.left=m+'px'}}
  function dragSav(b){let pos=null;try{pos=JSON.parse(localStorage.getItem(PKEY)||'null')}catch(e){}
    if(pos)placeSav(b,pos);addEventListener('resize',()=>{if(pos)placeSav(b,pos)});
    b.style.touchAction='none';b.title='Service après-vente — maintenez et glissez pour déplacer';
    let sx,sy,ox,oy,moved=false,down=false;
    b.addEventListener('pointerdown',e=>{down=true;moved=false;b._drag=false;sx=e.clientX;sy=e.clientY;const r=b.getBoundingClientRect();ox=sx-r.left;oy=sy-r.top;try{b.setPointerCapture(e.pointerId)}catch(_){}});
    b.addEventListener('pointermove',e=>{if(!down)return;if(!moved&&Math.hypot(e.clientX-sx,e.clientY-sy)<6)return;
      moved=true;b._drag=true;b.style.transition='none';b.style.opacity='.75';b.style.right='auto';b.style.bottom='auto';
      b.style.left=Math.min(Math.max(e.clientX-ox,0),innerWidth-b.offsetWidth)+'px';b.style.top=Math.min(Math.max(e.clientY-oy,0),innerHeight-b.offsetHeight)+'px'});
    const up=e=>{if(!down)return;down=false;b.style.opacity='.95';if(!moved)return;
      const r=b.getBoundingClientRect();pos={side:r.left+r.width/2>innerWidth/2?'r':'l',y:r.top/innerHeight};
      b.style.transition='left .25s,right .25s,top .25s';placeSav(b,pos);try{localStorage.setItem(PKEY,JSON.stringify(pos))}catch(_){}
      setTimeout(()=>{b._drag=false},50)};
    b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up)}
  function savUI(x){const on=x&&x.sav;
    if(!on){clearInterval(savBg);if(savBtn){savBtn.remove();savBtn=null}if(savPanel){savPanel.remove();savPanel=null}return}
    if(savBtn){savBtn._x=x;return}
    const mount=()=>{if(!document.body)return setTimeout(mount,200);
      if(!document.getElementById('licSavCss')){const st=document.createElement('style');st.id='licSavCss';st.textContent='@keyframes licPulse{50%{box-shadow:0 0 0 8px rgba(124,58,237,.25)}}';document.head.appendChild(st)}
      savBtn=document.createElement('button');savBtn._x=x;savBtn.type='button';savBtn.textContent='🛟 SAV';savBtn.title='Service après-vente';
      savBtn.style.cssText='position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483600;padding:9px 14px;border:0;border-radius:999px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;font:700 13px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer;opacity:.95';
      savBtn.onclick=e=>{if(savBtn._drag){e.preventDefault();return}openSav(savBtn._x)};document.body.appendChild(savBtn);dragSav(savBtn);
      const bg=async()=>setBadge(await unread());bg();clearInterval(savBg);savBg=setInterval(bg,60000)};mount()}
  const IN='width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #334155;background:#0b1220;color:#fff;font:16px system-ui,sans-serif;margin-top:6px';
  const BTN='padding:12px;border:0;border-radius:12px;font:700 14px system-ui,sans-serif;cursor:pointer;color:#fff';
  function openSav(x,view,tid){savView=view||'home';savTid=tid||null;if(savPanel)savPanel.remove();clearInterval(savPoll);
    savPanel=document.createElement('div');savPanel._x=x;
    savPanel.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(7,11,22,.7);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif';
    savPanel.innerHTML='<div data-box style="width:min(480px,100%);height:min(88vh,760px);display:flex;flex-direction:column;background:#111827;color:#eef2ff;border:1px solid rgba(255,255,255,.1);border-radius:22px 22px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.5);overflow:hidden"></div>';
    savPanel.onclick=e=>{if(e.target===savPanel)closeSav()};document.body.appendChild(savPanel);renderSav()}
  function closeSav(){clearInterval(savPoll);if(savPanel){savPanel.remove();savPanel=null}unread().then(setBadge)}
  async function renderSav(){if(!savPanel)return;const x=savPanel._x,c=(x.sav&&x.sav.contact)||{},box=savPanel.querySelector('[data-box]'),until=x.sav.until?new Date(x.sav.until).toLocaleDateString('fr-FR'):'';
    const head=(title,back)=>`<div style="display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)">${back?'<button data-back style="background:rgba(255,255,255,.08);border:0;color:#fff;width:34px;height:34px;border-radius:10px;font-size:16px;cursor:pointer">←</button>':'<div style="font-size:26px">🛟</div>'}<div style="flex:1;min-width:0"><b style="font-size:16px">${title}</b><div style="font-size:12px;color:#8b93b0">${esc(PRODUIT)}${until?' · SAV inclus jusqu\'au '+until:' · SAV inclus'}</div></div><button data-x style="background:rgba(255,255,255,.08);border:0;color:#fff;width:34px;height:34px;border-radius:10px;font-size:16px;cursor:pointer">✕</button></div>`;
    const wa=waNum(c.whatsapp),ch=(ic,t,h)=>`<a href="${h}" target="_blank" rel="noopener" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border-radius:12px;background:rgba(255,255,255,.06);color:#eef2ff;text-decoration:none;font-size:12px"><span style="font-size:20px">${ic}</span>${t}</a>`;
    const chans=`<div style="display:flex;gap:6px">${wa?ch('💬','WhatsApp','https://wa.me/'+wa+'?text='+encodeURIComponent('Bonjour, je vous contacte au sujet du SAV '+PRODUIT+'.')):''}${c.tel?ch('📞','Appeler','tel:'+String(c.tel).replace(/\s/g,'')):''}${c.email?ch('✉️','E-mail','mailto:'+c.email+'?subject='+encodeURIComponent('SAV '+PRODUIT)):''}</div>`;
    if(savView==='home'){const ids=myT(),list=[];for(const tid of ids){const t=await getT(tid);if(t)list.push({tid,...t})}list.sort((a,b)=>b.t-a.t);
      box.innerHTML=head('Service après-vente')+`<div style="flex:1;overflow:auto;padding:16px 18px">
        ${c.message?`<p style="font-size:13px;color:#cbd5e1;line-height:1.5;margin:0 0 12px;white-space:pre-wrap">${esc(c.message)}</p>`:''}${chans}${c.horaires?`<div style="font-size:12px;color:#8b93b0;margin-top:8px;text-align:center">🕘 ${esc(c.horaires)}</div>`:''}
        <button data-new style="${BTN};width:100%;margin-top:16px;background:linear-gradient(135deg,#7c3aed,#06b6d4)">✍️ Nouvelle demande d'assistance</button>
        ${list.length?`<div style="margin-top:18px;font-size:12px;color:#8b93b0;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Mes échanges</div>`+list.map(t=>{const m=msgsOf(t),last=m[m.length-1],nu=m.filter(k=>k.from==='sav'&&k.t>seen(t.tid)).length;
          return `<button data-open="${t.tid}" style="display:block;width:100%;text-align:left;margin-top:8px;padding:12px;border-radius:14px;border:1px solid ${nu?'#7c3aed':'rgba(255,255,255,.08)'};background:${nu?'rgba(124,58,237,.15)':'rgba(255,255,255,.04)'};color:#eef2ff;cursor:pointer;font-family:inherit">
            <div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:14px">${esc(t.sujet||'Demande')}</b><span style="font-size:11px;color:${t.statut==='traite'?'#6ee7b7':t.statut==='repondu'?'#67e8f9':'#fcd34d'}">${t.statut==='traite'?'Résolue':t.statut==='repondu'?'Réponse reçue':'En cours'}</span></div>
            <div style="font-size:12px;color:#8b93b0;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${last.from==='sav'?'🛟 ':'Vous : '}${esc(last.text)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${fmt(last.t)}${nu?` · <b style="color:#c4b5fd">${nu} nouveau${nu>1?'x':''}</b>`:''}</div></button>`}).join(''):''}</div>`}
    else if(savView==='new'){box.innerHTML=head('Nouvelle demande',1)+`<div style="flex:1;overflow:auto;padding:16px 18px">
        <select data-s style="${IN}"><option>Problème technique</option><option>Question d'utilisation</option><option>Facturation / licence</option><option>Autre demande</option></select>
        <textarea data-m rows="7" maxlength="2000" placeholder="Décrivez votre demande…" style="${IN};resize:vertical"></textarea>
        <input data-t type="tel" placeholder="Téléphone / WhatsApp (facultatif)" style="${IN}">
        <button data-go style="${BTN};width:100%;margin-top:12px;background:linear-gradient(135deg,#7c3aed,#06b6d4)">Envoyer au SAV</button><div data-r style="margin-top:10px;font-size:13px;text-align:center"></div></div>`}
    else{const t=await getT(savTid);if(!t){savView='home';return renderSav()}const m=msgsOf(t);markSeen(savTid);
      box.innerHTML=head(esc(t.sujet||'Demande SAV'),1)+`<div data-th style="flex:1;overflow:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:8px">
        ${m.map(k=>{const me=k.from==='client';return `<div style="align-self:${me?'flex-end':'flex-start'};max-width:82%"><div style="padding:9px 12px;border-radius:${me?'14px 14px 4px 14px':'14px 14px 14px 4px'};background:${me?'linear-gradient(135deg,#7c3aed,#4f46e5)':'#1f2937'};font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word">${esc(k.text)}</div><div style="font-size:10.5px;color:#64748b;margin:3px 4px;text-align:${me?'right':'left'}">${me?'Vous':'🛟 SAV'}${k.via&&k.via!=='app'?' · via '+({whatsapp:'WhatsApp','e-mail':'e-mail'}[k.via]||esc(k.via)):''} · ${fmt(k.t)}</div></div>`}).join('')}
        ${t.statut==='traite'?'<div style="text-align:center;font-size:12px;color:#6ee7b7;margin:6px 0">✓ Demande marquée comme résolue — vous pouvez répondre pour la rouvrir</div>':''}</div>
        <div style="display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.08)"><textarea data-rep rows="1" maxlength="2000" placeholder="Votre message…" style="${IN};margin:0;resize:none;max-height:120px"></textarea><button data-send style="${BTN};background:linear-gradient(135deg,#7c3aed,#06b6d4);padding:0 16px">➤</button></div>`;
      const th=box.querySelector('[data-th]');th.scrollTop=th.scrollHeight;
      box.querySelector('[data-send]').onclick=async()=>{const ta=box.querySelector('[data-rep]'),v=ta.value.trim();if(!v)return;ta.disabled=true;
        const mid='m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),fb=await fbUrl();
        try{const r=await fetch(`${fb}/support/${savTid}/msgs/${mid}.json`,{method:'PUT',body:JSON.stringify({from:'client',text:v.slice(0,2000),t:Date.now(),via:'app'})});if(!r.ok)throw 0;
          fetch(`${fb}/support/${savTid}/statut.json`,{method:'PUT',body:'"nouveau"'}).catch(()=>{});renderSav()}catch(e){ta.disabled=false;alert('Envoi impossible, réessayez.')}};
      clearInterval(savPoll);savPoll=setInterval(async()=>{const n=await getT(savTid);if(n&&msgsOf(n).length!==m.length&&savView==='thread'&&!box.querySelector('[data-rep]').value)renderSav()},10000)}
    const q=k=>box.querySelector(k);q('[data-x]').onclick=closeSav;if(q('[data-back]'))q('[data-back]').onclick=()=>{clearInterval(savPoll);savView='home';renderSav()};
    if(q('[data-new]'))q('[data-new]').onclick=()=>{savView='new';renderSav()};
    box.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{savView='thread';savTid=b.dataset.open;renderSav()});
    if(q('[data-go]'))q('[data-go]').onclick=async()=>{const s=get(),msg=q('[data-m]').value.trim();if(msg.length<5){q('[data-r]').style.color='#fda4af';q('[data-r]').textContent='Merci de décrire votre demande.';return}
      q('[data-go]').disabled=true;q('[data-go]').textContent='Envoi…';const tid=[...crypto.getRandomValues(new Uint8Array(12))].map(b=>b.toString(16).padStart(2,'0')).join('');
      try{const r=await fetch(`${await fbUrl()}/support/${tid}.json`,{method:'PUT',body:JSON.stringify({email:s.mail||'',produit:PRODUIT,module:MODULE||'',t:Date.now(),sujet:q('[data-s]').value,message:msg.slice(0,2000),tel:q('[data-t]').value.trim().slice(0,30),ua:UA(),page:location.href.split('#')[0].slice(0,200),statut:'nouveau'})});
        if(!r.ok)throw 0;localStorage.setItem(SKEY,JSON.stringify([tid,...myT()].slice(0,30)));markSeen(tid);savView='thread';savTid=tid;renderSav()}
      catch(e){q('[data-r]').style.color='#fda4af';q('[data-r]').textContent='Envoi impossible. Contactez-nous par WhatsApp, téléphone ou e-mail.';q('[data-go]').disabled=false;q('[data-go]').textContent='Réessayer'}}}

  (async()=>{
    const s=get();
    if(s.mail){const r=await verif(s.mail,s.key);if(r.ok){save(s.mail,s.key,r.expire);applyData(r.data);return watch(r.expire)}lock(r.msg)}
    else lock();
  })();
})();
