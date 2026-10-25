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
    return{onglets:Array.isArray(l.onglets)?l.onglets:null,ongletsOff:Array.isArray(l.ongletsOff)?l.ongletsOff:null,ongletsNoms:l.ongletsNoms||null,modules:Array.isArray(l.modules)?l.modules:null,
      google:{clientId:String(g.clientId||dg||'').trim(),email:String(g.email||'').trim().toLowerCase()},
      sav:(l.sav&&l.sav.on&&(!l.sav.until||new Date(l.sav.until)>new Date())&&!(d.sav&&d.sav.visible===false))?{until:l.sav.until||l.expire||null,contact:d.sav||{}}:null}}
  function applyData(x){if(!x)return;
    try{const old=localStorage.getItem('licData_'+PRODUIT)||'',nv=JSON.stringify(x);if(old!==nv)localStorage.setItem('licData_'+PRODUIT,nv);
      const g=x.google||{};
      // Client ID Google partagé (COVO Pro et ses satellites lisent tous « gdrive_client_id »)
      if(g.clientId&&localStorage.getItem('gdrive_client_id')!==g.clientId)localStorage.setItem('gdrive_client_id',g.clientId);
      if(g.email&&localStorage.getItem('gdrive_hint_email')!==g.email)localStorage.setItem('gdrive_hint_email',g.email);
    }catch(e){}
    window.LICENCE_DATA=x;try{dispatchEvent(new CustomEvent('licence:data',{detail:x}))}catch(e){}savUI(x);tabLock(x)}
  try{const c=JSON.parse(localStorage.getItem('licData_'+PRODUIT)||'null');if(c){window.LICENCE_DATA=c;setTimeout(()=>tabLock(c),0)}}catch(e){}

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
  let fbBase=null,pollT=null,pollBusy=false;
  async function fbUrl(){if(fbBase)return fbBase;try{const d=await (await fetch(SRC+'?t='+Date.now(),{cache:'no-store'})).json();fbBase=(d.firebase||FB_DEF).replace(/\/+$/,'')}catch(e){fbBase=FB_DEF}return fbBase}
  const getReq=()=>{try{return JSON.parse(localStorage.getItem(RKEY)||'null')}catch(e){return null}};
  // ── Fenêtre de licence : design responsive (mobile, tablette, ordinateur) · clair / sombre ──
  const LIC_CSS=`
#lic-overlay{--p1:#6366f1;--p2:#8b5cf6;--p3:#06b6d4;--ok:#10b981;--ko:#e11d48;--bg:#f4f6ff;--card:rgba(255,255,255,.92);--txt:#0f172a;--mut:#64748b;--bd:#e2e8f0;--in:#f8fafc;--chip:#eef2ff;
  position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));overflow-y:auto;-webkit-overflow-scrolling:touch;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Inter",system-ui,sans-serif;color:var(--txt);box-sizing:border-box;
  background:radial-gradient(900px 600px at 10% -10%,rgba(99,102,241,.35),transparent 60%),radial-gradient(700px 500px at 110% 10%,rgba(6,182,212,.28),transparent 60%),radial-gradient(800px 600px at 50% 120%,rgba(236,72,153,.18),transparent 60%),var(--bg);animation:licFade .3s ease}
@media (prefers-color-scheme:dark){#lic-overlay{--bg:#0b1020;--card:rgba(18,24,43,.9);--txt:#eef2ff;--mut:#94a3b8;--bd:rgba(255,255,255,.1);--in:rgba(255,255,255,.05);--chip:rgba(99,102,241,.18)}}
#lic-overlay *{box-sizing:border-box}
@keyframes licFade{from{opacity:0}}@keyframes licUp{from{opacity:0;transform:translateY(18px) scale(.98)}}@keyframes licSpin{to{transform:rotate(360deg)}}
#lic-overlay .lic-card{width:min(440px,100%);margin:auto;background:var(--card);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid var(--bd);border-radius:26px;padding:26px 24px 20px;box-shadow:0 30px 80px rgba(15,23,42,.25),0 2px 0 rgba(255,255,255,.4) inset;animation:licUp .4s cubic-bezier(.2,.9,.3,1)}
#lic-overlay .lic-hd{display:flex;align-items:center;gap:14px;margin-bottom:18px}
#lic-overlay .lic-logo{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;font-size:26px;color:#fff;flex-shrink:0;background:linear-gradient(135deg,var(--p1),var(--p2) 55%,var(--p3));box-shadow:0 10px 24px rgba(99,102,241,.4)}
#lic-overlay .lic-hd h2{margin:0;font-size:1.25rem;font-weight:800;letter-spacing:-.02em;line-height:1.2}
#lic-overlay .lic-hd p{margin:3px 0 0;font-size:.85rem;color:var(--mut)}
#lic-overlay .lic-chip{display:inline-block;margin-left:6px;padding:2px 9px;border-radius:99px;background:var(--chip);color:var(--p1);font-size:.72rem;font-weight:700;vertical-align:middle}
#lic-overlay .lic-tabs{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--in);border:1px solid var(--bd);margin-bottom:18px}
#lic-overlay .lic-tabs button{flex:1;min-width:0;padding:10px 6px;border:0;border-radius:10px;background:transparent;color:var(--mut);font-weight:600;font-size:.82rem;font-family:inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:.2s}
#lic-overlay .lic-tabs button.on{background:var(--card);color:var(--txt);box-shadow:0 2px 10px rgba(15,23,42,.12)}
#lic-overlay .lic-lead{margin:0 0 16px;font-size:.9rem;line-height:1.5;color:var(--mut)}
#lic-overlay .lic-f{display:block;margin-bottom:12px}
#lic-overlay .lic-f>span{display:block;font-size:.75rem;font-weight:700;color:var(--mut);margin:0 0 6px 2px;letter-spacing:.02em}
#lic-overlay .lic-w{position:relative}
#lic-overlay .lic-in{width:100%;min-height:50px;padding:13px 15px;border-radius:14px;border:1.5px solid var(--bd);background:var(--in);color:var(--txt);font-size:16px;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none}
#lic-overlay textarea.lic-in{min-height:84px;resize:vertical;line-height:1.45}
#lic-overlay .lic-in:focus{border-color:var(--p1);box-shadow:0 0 0 4px rgba(99,102,241,.18)}
#lic-overlay .lic-key{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase}
#lic-overlay .lic-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:var(--mut);font-size:17px;cursor:pointer}
#lic-overlay .lic-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#lic-overlay .lic-sep{margin:16px 0 10px;font-size:.75rem;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:10px}
#lic-overlay .lic-sep::after{content:"";flex:1;height:1px;background:var(--bd)}
#lic-overlay .lic-btn{width:100%;min-height:52px;margin-top:6px;padding:14px;border:0;border-radius:15px;color:#fff;font-weight:700;font-size:1rem;font-family:inherit;cursor:pointer;background:linear-gradient(135deg,var(--p1),var(--p2) 55%,var(--p3));box-shadow:0 12px 26px rgba(99,102,241,.35);transition:transform .15s,box-shadow .2s,opacity .2s}
#lic-overlay .lic-btn:hover{transform:translateY(-1px);box-shadow:0 16px 32px rgba(99,102,241,.45)}
#lic-overlay .lic-btn:active{transform:scale(.99)}#lic-overlay .lic-btn:disabled{opacity:.6;cursor:default;transform:none}
#lic-overlay .lic-alt{width:100%;min-height:48px;margin-top:10px;padding:12px;border-radius:15px;border:1.5px dashed var(--p2);background:transparent;color:var(--p2);font-weight:700;font-size:.92rem;font-family:inherit;cursor:pointer}
#lic-overlay .lic-ln{display:block;margin:14px auto 0;padding:6px;border:0;background:none;color:var(--p1);font-weight:600;font-size:.86rem;font-family:inherit;cursor:pointer}
#lic-overlay .lic-ln.ko{color:var(--ko)}
#lic-overlay .lic-err{min-height:0;margin-top:10px;font-size:.86rem;font-weight:600;color:var(--ko)}
#lic-overlay .lic-err:not(:empty){padding:10px 12px;border-radius:12px;background:rgba(225,29,72,.08)}
#lic-overlay .lic-st{padding:16px;border-radius:16px;border:1px solid var(--bd);background:var(--in);margin-bottom:12px}
#lic-overlay .lic-st b{display:flex;align-items:center;gap:10px;font-size:1rem}
#lic-overlay .lic-st p{margin:8px 0 0;font-size:.86rem;color:var(--mut);line-height:1.5}
#lic-overlay .lic-st.ko{border-color:rgba(225,29,72,.35);background:rgba(225,29,72,.06)}
#lic-overlay .lic-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid var(--chip);border-top-color:var(--p1);animation:licSpin .9s linear infinite;flex-shrink:0}
#lic-overlay .lic-mini{font-size:.8rem;color:var(--mut);text-align:center;margin-top:8px}
#lic-overlay .lic-ft{margin-top:18px;padding-top:14px;border-top:1px solid var(--bd);text-align:center;font-size:.72rem;color:var(--mut)}
@media (max-width:540px){
  #lic-overlay{align-items:flex-end;padding:0}
  #lic-overlay .lic-card{width:100%;max-height:100%;min-height:min(640px,100%);overflow-y:auto;border-radius:26px 26px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom));border-left:0;border-right:0;border-bottom:0}
  #lic-overlay .lic-row{grid-template-columns:1fr}
  #lic-overlay .lic-tabs button{font-size:.76rem;padding:10px 4px}
}
@media (max-height:560px) and (min-width:541px){#lic-overlay{align-items:flex-start}}`;
  function licCss(){if(document.getElementById('lic-css'))return;const st=document.createElement('style');st.id='lic-css';st.textContent=LIC_CSS;(document.head||document.documentElement).appendChild(st)}
  const ICON=(PRODUIT.match(/\p{Extended_Pictographic}/u)||[])[0]||'🔑';
  function shell(){if(overlay)return;licCss();overlay=document.createElement('div');overlay.id='lic-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
    overlay.innerHTML='<div class="lic-card"></div>';(document.body||document.documentElement).appendChild(overlay)}
  // tab : 'key' | 'req' | 'ins' | null (pas d'onglets)
  function box(html,tab,sub){if(!overlay)return;const c=overlay.querySelector('.lic-card');
    const tabs=tab?`<div class="lic-tabs" role="tablist"><button data-tab="key" class="${tab==='key'?'on':''}">🔑 J'ai une clé</button>${canInscr()?`<button data-tab="ins" class="${tab==='ins'?'on':''}">🆕 Inscription</button>`:''}<button data-tab="req" class="${tab==='req'?'on':''}">📨 Demander</button></div>`:'';
    c.innerHTML=`<div class="lic-hd"><div class="lic-logo">${ICON}</div><div><h2>${esc(PRODUIT)}${MODULE?`<span class="lic-chip">${esc(MODULE)}</span>`:''}</h2><p>${esc(sub||'Licence logicielle')}</p></div></div>`+tabs+html+
      `<div class="lic-ft">🔒 Connexion sécurisée · vos données restent sur cet appareil</div>`;
    c.querySelectorAll('.lic-tabs button').forEach(b=>b.onclick=()=>{const t=b.dataset.tab;if(t==='key')showKey();else if(t==='req')showRequestForm();else{inscrDepuisApp=false;showInscription()}});
    c.querySelectorAll('.lic-eye').forEach(b=>b.onclick=()=>{const i=b.previousElementSibling;i.type=i.type==='password'?'text':'password';b.textContent=i.type==='password'?'👁':'🙈'});
    const k=c.querySelector('.lic-key');if(k)k.addEventListener('input',()=>{const p=k.selectionStart===k.value.length;const v=k.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20);k.value=v.match(/.{1,4}/g)?.join('-')||'';if(p)k.selectionStart=k.selectionEnd=k.value.length});
    c.scrollTop=0}
  const F=(lbl,input)=>`<label class="lic-f"><span>${lbl}</span>${input}</label>`;
  const PW=(id,ph,ac)=>`<div class="lic-w"><input id="${id}" class="lic-in" type="password" placeholder="${ph}" autocomplete="${ac}" style="padding-right:52px"><button type="button" class="lic-eye" aria-label="Afficher">👁</button></div>`;
  function showRequestForm(err){clearInterval(pollT);const s=get();
    box(`<p class="lic-lead">Demandez votre licence : elle s'installera <b>automatiquement</b> sur cet appareil dès qu'elle sera accordée.</p>
      ${F('Nom et prénom','<input id="rn" class="lic-in" maxlength="80" autocomplete="name" placeholder="Jean Dupont">')}
      <div class="lic-row">${F('E-mail',`<input id="rm" class="lic-in" type="email" inputmode="email" autocapitalize="off" maxlength="120" autocomplete="email" placeholder="vous@exemple.fr" value="${esc(s.mail||'')}">`)}${F('Téléphone <i style="font-weight:500">(facultatif)</i>','<input id="rt" class="lic-in" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="06 12 34 56 78">')}</div>
      ${F('Message','<textarea id="rx" class="lic-in" rows="3" maxlength="1000" placeholder="Entreprise, besoin, nombre d\'appareils…"></textarea>')}
      <button id="rs" class="lic-btn">Envoyer la demande</button><div id="re" class="lic-err">${esc(err||'')}</div>`,'req','Demande de licence');
    overlay.querySelector('#rs').onclick=async()=>{const nom=overlay.querySelector('#rn').value.trim(),mail=overlay.querySelector('#rm').value.trim().toLowerCase(),tel=overlay.querySelector('#rt').value.trim(),msg=overlay.querySelector('#rx').value.trim(),b=overlay.querySelector('#rs'),e=overlay.querySelector('#re');
      if(!nom)return e.textContent='Indiquez votre nom';if(!/^\S+@\S+\.\S+$/.test(mail))return e.textContent='E-mail invalide';
      b.textContent='Envoi…';b.disabled=true;e.textContent='';
      const rid=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
      const body={nom,email:mail,produit:PRODUIT,t:Date.now(),statut:'attente',ua:UA(),page:location.origin+location.pathname};if(tel)body.tel=tel;if(msg)body.message=msg;if(MODULE)body.module=MODULE;
      try{const r=await fetch(`${await fbUrl()}/requests/${rid}.json`,{method:'PUT',body:JSON.stringify(body)});if(!r.ok)throw new Error(r.status);
        localStorage.setItem(RKEY,JSON.stringify({rid,mail,t:body.t}));showWaiting()}
      catch(x){b.textContent='Envoyer la demande';b.disabled=false;e.textContent='Envoi impossible ('+(x.message||'réseau')+'). Réessayez plus tard.'}};
  }
  // ── Inscription d'un nouveau client : compte créé par la page + demande envoyée à Licence Pro ──
  const canInscr=()=>typeof window.licInscription==='function';
  let inscrDepuisApp=false;
  function showInscription(err,v){clearInterval(pollT);v=v||{};const s=get();
    box(`<p class="lic-lead">Créez votre compte : dès que l'administrateur l'accepte, <b>l'application s'ouvre toute seule</b> sur cet appareil.</p>
      ${F('Nom et prénom',`<input id="in" class="lic-in" maxlength="60" autocomplete="name" placeholder="Jean Dupont" value="${esc(v.nom||'')}">`)}
      <div class="lic-row">${F('E-mail',`<input id="im" class="lic-in" type="email" inputmode="email" autocapitalize="off" maxlength="120" autocomplete="email" placeholder="vous@exemple.fr" value="${esc(v.email||s.mail||'')}">`)}${F('Téléphone <i style="font-weight:500">(facultatif)</i>',`<input id="it" class="lic-in" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="06 12 34 56 78" value="${esc(v.tel||'')}">`)}</div>
      <div class="lic-sep">Vos identifiants</div>
      ${F('Identifiant',`<input id="ii" class="lic-in" maxlength="30" autocapitalize="none" autocomplete="username" spellcheck="false" placeholder="jean.dupont" value="${esc(v.ident||'')}">`)}
      <div class="lic-row">${F('Mot de passe',PW('ip','6 caractères min.','new-password'))}${F('Confirmation',PW('ip2','Retapez-le','new-password'))}</div>
      ${F('Message <i style="font-weight:500">(facultatif)</i>',`<textarea id="ix" class="lic-in" rows="2" maxlength="1000" placeholder="Entreprise, service…">${esc(v.message||'')}</textarea>`)}
      <button id="is" class="lic-btn">Créer mon compte</button><div id="ie" class="lic-err">${esc(err||'')}</div>
      ${inscrDepuisApp?'<button id="ib" class="lic-ln">Annuler</button>':''}`,inscrDepuisApp?null:'ins','Nouveau compte');
    const g=id=>overlay.querySelector('#'+id);
    if(g('ib'))g('ib').onclick=()=>{overlay.remove();overlay=null;inscrDepuisApp=false;recheck(true)};
    g('is').onclick=async()=>{const d={nom:g('in').value.trim(),email:g('im').value.trim().toLowerCase(),tel:g('it').value.trim(),ident:g('ii').value.trim().toLowerCase(),pwd:g('ip').value,message:g('ix').value.trim()},e=g('ie'),b=g('is');
      if(!d.nom)return e.textContent='Indiquez votre nom';if(!/^\S+@\S+\.\S+$/.test(d.email))return e.textContent='E-mail invalide';
      if(!/^[a-z0-9._-]{3,30}$/.test(d.ident))return e.textContent='Identifiant : 3 à 30 caractères (lettres minuscules, chiffres, . _ -)';
      if(d.pwd.length<6)return e.textContent='Mot de passe trop court (6 caractères minimum)';if(d.pwd!==g('ip2').value)return e.textContent='Les deux mots de passe sont différents';
      b.textContent='Création du compte…';b.disabled=true;e.textContent='';
      const rid=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
      let acc;try{acc=await window.licInscription({...d,rid})}catch(x){const keep={...d};delete keep.pwd;return showInscription(x.message||'Inscription impossible',keep)}
      b.textContent='Envoi de la demande…';
      const body={type:'inscription',nom:d.nom,email:d.email,produit:PRODUIT,t:Date.now(),statut:'attente',ident:acc.ident,uid:acc.uid,cid:acc.cid,ua:UA(),page:location.origin+location.pathname};
      if(d.tel)body.tel=d.tel;if(d.message)body.message=d.message;if(MODULE)body.module=MODULE;
      try{const r=await fetch(`${await fbUrl()}/requests/${rid}.json`,{method:'PUT',body:JSON.stringify(body)});if(!r.ok)throw new Error(r.status);
        localStorage.setItem(RKEY,JSON.stringify({rid,mail:d.email,t:body.t,type:'inscription',ident:acc.ident}));showWaiting()}
      catch(x){b.textContent='Créer mon compte';b.disabled=false;e.textContent='Votre compte est créé mais la demande n\'a pas pu être envoyée ('+(x.message||'réseau')+'). Prévenez l\'administrateur : il verra votre inscription dans ses clients.'}};
  }
  window.licOuvrirInscription=function(){if(!canInscr())return;inscrDepuisApp=!overlay;shell();showInscription()};
  function showWaiting(info){const q=getReq();if(!q)return showRequestForm();
    box(`<div class="lic-st"><b><span class="lic-spin"></span>${q.type==='inscription'?'Inscription envoyée':'Demande envoyée'}</b>
        <p>Le ${new Date(q.t).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})} pour <b style="display:inline">${esc(q.mail)}</b>${q.ident?` · identifiant <b style="display:inline">${esc(q.ident)}</b>`:''}.<br>${q.type==='inscription'?'Dès qu\'elle sera acceptée, l\'application s\'ouvrira automatiquement':'Dès qu\'elle sera accordée, votre licence s\'installera automatiquement'}. Vous pouvez laisser cette page ouverte ou revenir plus tard.</p></div>
      <div id="rw" class="lic-mini">${esc(info||'Vérification en cours…')}</div>
      <button id="rk" class="lic-ln">J'ai déjà une clé de licence</button>
      <button id="rc" class="lic-ln ko">Annuler la demande</button>`,null,'En attente de validation');
    overlay.querySelector('#rk').onclick=()=>{clearInterval(pollT);showKey()};
    overlay.querySelector('#rc').onclick=()=>{if(!confirm('Annuler cette demande ?'))return;localStorage.removeItem(RKEY);q.type==='inscription'&&canInscr()?showInscription():showRequestForm()};
    clearInterval(pollT);pollReq();pollT=setInterval(pollReq,10000);
  }
  async function pollReq(){const q=getReq();if(!q||!overlay)return clearInterval(pollT);if(pollBusy)return;pollBusy=true;const w=overlay.querySelector('#rw');
    try{const r=await (await fetch(`${await fbUrl()}/requests/${q.rid}.json?t=${Date.now()}`,{cache:'no-store'})).json();
      if(!r){localStorage.removeItem(RKEY);clearInterval(pollT);return showRequestForm('Votre demande a été clôturée. Vous pouvez en envoyer une nouvelle.')}
      if(r.statut==='refusee'){localStorage.removeItem(RKEY);clearInterval(pollT);const m='Votre demande a été refusée'+(r.motif?' : '+r.motif:'.')+' Vous pouvez contacter le vendeur.';return q.type==='inscription'&&canInscr()?showInscription(m):showRequestForm(m)}
      if(q.type==='inscription'&&r.statut==='accordee'&&!r.cle){clearInterval(pollT);localStorage.removeItem(RKEY);overlay.remove();overlay=null;inscrDepuisApp=false;try{window.licInscriptionOk&&window.licInscriptionOk(q.ident)}catch(e){}return}
      if(r.statut==='accordee'&&r.cle){clearInterval(pollT);if(w)w.textContent='✅ Licence accordée — installation…';
        Object.keys(localStorage).filter(x=>x.startsWith('licSlot_')).forEach(x=>localStorage.removeItem(x));
        const v=await verif(r.email||q.mail,r.cle);
        if(v.ok){save(r.email||q.mail,r.cle,v.expire);applyData(v.data);localStorage.removeItem(RKEY);overlay.remove();overlay=null;inscrDepuisApp=false;watch(v.expire);
          if(q.type==='inscription'){try{window.licInscriptionOk&&window.licInscriptionOk(q.ident)}catch(e){}return}
          licToast('✅ Licence '+PRODUIT+' activée');return}
        return showRefusInstall(r,q,v.msg)}
      if(w)w.textContent='Toujours en attente — dernière vérification à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    }catch(e){if(w)w.textContent='Hors ligne — nouvelle tentative dans quelques secondes'}
    finally{pollBusy=false}
  }
  // Licence accordée mais refusée à l'installation (ex. limite d'appareils) : écran fixe, réessai uniquement à la demande
  function showRefusInstall(r,q,msg){clearInterval(pollT);
    box(`<div class="lic-st ko"><b>⚠️ Licence accordée, mais non activée ici</b><p><b style="display:inline;color:var(--ko)">${esc(msg||'Validation impossible')}</b><br>Le vendeur doit autoriser cet appareil (ou augmenter le nombre d'appareils de la licence), puis appuyez sur « Réessayer ».</p></div>
      <button id="ry" class="lic-btn">Réessayer</button>
      <div id="rw" class="lic-mini"></div>
      <button id="rk" class="lic-ln">J'ai déjà une clé de licence</button>
      <button id="rn2" class="lic-ln ko">Faire une nouvelle demande</button>`,null,'Installation bloquée');
    overlay.querySelector('#ry').onclick=async()=>{const b=overlay.querySelector('#ry');b.textContent='Vérification…';b.disabled=true;
      Object.keys(localStorage).filter(x=>x.startsWith('licSlot_')).forEach(x=>localStorage.removeItem(x));
      const v=await verif(r.email||q.mail,r.cle);
      if(v.ok){save(r.email||q.mail,r.cle,v.expire);applyData(v.data);localStorage.removeItem(RKEY);overlay.remove();overlay=null;watch(v.expire);licToast('✅ Licence '+PRODUIT+' activée');return}
      b.textContent='Réessayer';b.disabled=false;overlay.querySelector('#rw').textContent='Toujours refusée : '+(v.msg||'')+' ('+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+')'};
    overlay.querySelector('#rk').onclick=()=>showKey();
    overlay.querySelector('#rn2').onclick=()=>{localStorage.removeItem(RKEY);showRequestForm()};
  }
  function licToast(t){licCss();const d=document.createElement('div');d.textContent=t;d.style.cssText='position:fixed;left:50%;top:max(18px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483647;background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;padding:13px 20px;border-radius:16px;font:600 14px -apple-system,system-ui,sans-serif;box-shadow:0 14px 34px rgba(16,185,129,.4);max-width:calc(100vw - 32px);animation:licUp .4s';(document.body||document.documentElement).appendChild(d);setTimeout(()=>d.remove(),4000)}
  // Écran principal : saisie de la clé
  function showKey(msg){clearInterval(pollT);const s=get();
    box(`<p class="lic-lead">Saisissez l'e-mail et la clé reçus pour débloquer l'application sur cet appareil.</p>
      ${F('E-mail',`<input id="lm" class="lic-in" type="email" inputmode="email" autocapitalize="off" autocomplete="email" placeholder="vous@exemple.fr" value="${esc(s.mail||'')}">`)}
      ${F('Clé de licence','<input id="lk" class="lic-in lic-key" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX">')}
      <button id="lb" class="lic-btn">Activer la licence</button>
      <div id="le" class="lic-err">${esc(msg||'')}</div>
      <button id="li" class="lic-alt" style="display:none">🆕 Nouveau client ? Créer mon compte</button>
      <button id="lr" class="lic-ln" style="display:none">Pas encore de licence ? Faire une demande en ligne</button>`,'key','Activation de la licence');
    const g=id=>overlay.querySelector('#'+id);
    g('lr').onclick=()=>showRequestForm();g('li').onclick=()=>{inscrDepuisApp=false;showInscription()};
    if(!canInscr())addEventListener('load',()=>{if(overlay&&canInscr()&&g('lk'))showKey(g('le')&&g('le').textContent)},{once:true});
    const go=async()=>{const m=g('lm').value,k=g('lk').value,b=g('lb');if(!m.trim()||!k.trim())return g('le').textContent='Renseignez l\'e-mail et la clé';
      b.textContent='Vérification…';b.disabled=true;g('le').textContent='';Object.keys(localStorage).filter(x=>x.startsWith('licSlot_')).forEach(x=>localStorage.removeItem(x));const r=await verif(m,k);b.textContent='Activer la licence';b.disabled=false;
      if(r.ok){save(m,k,r.expire);applyData(r.data);overlay.remove();overlay=null;watch(r.expire);licToast('✅ Licence '+PRODUIT+' activée')}
      else g('le').textContent=r.msg};
    g('lb').onclick=go;g('lk').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  }
  function lock(msg,skipReq){
    clearInterval(timer);if(overlay)return;shell();
    if(!skipReq&&getReq())return showWaiting();
    showKey(msg);
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

  // ── Onglets non inclus dans la licence : grisés + 🔒 + « Demander l'accès » ──
  let TOFF=[],TNOMS={},tTimer=null;
  const tSel=id=>id==='__print'?'[onclick*="print" i],[onclick*="imprim" i],[data-action*="print" i]':['Tab','Mobile','View','Page','Section','Screen'].flatMap(f=>[`[onclick*="${f}('${id}'"]`,`[onclick*='${f}("${id}"']`]).concat([`[data-tab="${id}"]`,`[data-view="${id}"]`,`#tab-btn-${id}`]).join(',');
  const tName=id=>id==='__print'?'Imprimer':TNOMS[id]||id.replace(/^tab-/,'').replace(/[-_]/g,' ').replace(/^./,c=>c.toUpperCase());
  function tabLock(x){TOFF=(x&&Array.isArray(x.ongletsOff))?x.ongletsOff.filter(i=>/^[\w-]{1,60}$/.test(i)):[];TNOMS=(x&&x.ongletsNoms)||{};tabPaint()}
  function tabPaint(){if(!document.head)return setTimeout(tabPaint,200);
    let st=document.getElementById('licTabCss');if(!st){st=document.createElement('style');st.id='licTabCss';document.head.appendChild(st)}
    st.textContent=(TOFF.length?TOFF.map(id=>tSel(id)+'{filter:grayscale(1)!important;opacity:.5!important;position:relative!important;cursor:not-allowed!important}').join('\n'):'')+
      (TOFF.includes('__print')?'@media print{body>*{display:none!important}body::after{content:"🔒 L\'impression n\'est pas incluse dans votre licence '+PRODUIT.replace(/"/g,'')+'.";display:block;font:20px system-ui,sans-serif;padding:40px;text-align:center}}':'')+
      '.lic-lockb{position:absolute;top:-5px;right:-5px;font-size:10px;line-height:1;background:#111827;border:1px solid #475569;border-radius:99px;padding:2px 3px;pointer-events:none;z-index:3;filter:none}'+
      '.lic-tab-locked{position:relative!important;min-height:240px}.lic-tab-locked>*:not(.lic-tab-ov){filter:blur(4px) grayscale(1);pointer-events:none!important;user-select:none}'+
      '.lic-tab-ov{position:absolute;inset:0;z-index:60;display:flex;justify-content:center;align-items:flex-start;padding:60px 16px;font-family:system-ui,sans-serif}';
    document.querySelectorAll('.lic-lockb').forEach(b=>{if(!TOFF.some(id=>b.parentElement&&b.parentElement.matches(tSel(id))))b.remove()});
    document.querySelectorAll('.lic-tab-locked').forEach(c=>{if(!TOFF.includes(c.dataset.licTab)){c.classList.remove('lic-tab-locked');const o=c.querySelector(':scope>.lic-tab-ov');if(o)o.remove()}});
    TOFF.forEach(id=>{document.querySelectorAll(tSel(id)).forEach(b=>{if(!b.querySelector(':scope>.lic-lockb')){const s=document.createElement('span');s.className='lic-lockb';s.textContent='🔒';b.appendChild(s)}});
      const c=[document.getElementById(id),document.getElementById('tab-'+id)].find(e=>e&&!e.matches(tSel(id))&&!/^(BUTTON|A|LI)$/.test(e.tagName));
      if(c&&!c.querySelector(':scope>.lic-tab-ov')){c.classList.add('lic-tab-locked');c.dataset.licTab=id;const o=document.createElement('div');o.className='lic-tab-ov';
        o.innerHTML=`<div style="max-width:340px;text-align:center;background:#111827;color:#eef2ff;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.35)"><div style="font-size:30px">🔒</div><b style="display:block;margin:6px 0">« ${esc(tName(id))} » n'est pas inclus</b><div style="font-size:13px;color:#94a3b8;margin-bottom:14px">Cet onglet n'est pas compris dans votre licence ${esc(PRODUIT)}.</div><button type="button" style="padding:11px 16px;border:0;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer">Demander l'accès</button></div>`;
        o.querySelector('button').onclick=()=>askTab(id);c.appendChild(o)}})}
  // Impression bloquée : window.print() et Ctrl/Cmd+P
  (function(){const _p=window.print;window.print=function(){if(TOFF.includes('__print'))return askTab('__print');return _p.apply(window,arguments)}})();
  addEventListener('keydown',e=>{if(TOFF.includes('__print')&&(e.ctrlKey||e.metaKey)&&(e.key==='p'||e.key==='P')){e.preventDefault();e.stopImmediatePropagation();askTab('__print')}},true);
  document.addEventListener('click',e=>{if(!TOFF.length||!e.target.closest)return;const t=e.target.closest('[onclick],[data-tab],[data-view],[data-action],[id^="tab-btn-"]');if(!t)return;
    const id=TOFF.find(i=>t.matches(tSel(i)));if(!id)return;e.preventDefault();e.stopImmediatePropagation();askTab(id)},true);
  try{new MutationObserver(()=>{if(!TOFF.length)return;clearTimeout(tTimer);tTimer=setTimeout(tabPaint,250)}).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}
  function askTab(id){const s=get(),k='licTabReq_'+PRODUIT+'_'+id,sent=+(localStorage.getItem(k)||0),nm=tName(id);
    const ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(7,11,22,.7);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif';
    const inp='width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #334155;background:#0b1220;color:#fff;font:16px system-ui,sans-serif;margin-top:8px';
    ov.innerHTML=`<div style="width:min(440px,100%);background:#111827;color:#eef2ff;border:1px solid rgba(255,255,255,.1);border-radius:22px 22px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom))">
      <div style="display:flex;gap:10px;align-items:center"><div style="font-size:28px">🔒</div><div style="flex:1"><b style="font-size:16px">${id==='__print'?'L\'impression n\'est pas incluse':'« '+esc(nm)+' » n\'est pas inclus'}</b><div style="font-size:12px;color:#8b93b0">${esc(PRODUIT)} · demande d'accès</div></div><button data-x style="background:rgba(255,255,255,.08);border:0;color:#fff;width:34px;height:34px;border-radius:10px;cursor:pointer">✕</button></div>
      ${sent&&Date.now()-sent<864e5?'<p style="margin:16px 0 0;font-size:14px;color:#6ee7b7">✔ Votre demande a déjà été envoyée. L\'accès se débloquera automatiquement dès qu\'il sera accordé.</p>':`
      <p style="font-size:13px;color:#cbd5e1;margin:14px 0 4px">Choisissez les accès à demander : ils se débloqueront automatiquement dès qu'ils seront ajoutés à votre licence.</p>
      <div data-l style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">${TOFF.map(i=>`<label style="display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;border:1px solid #334155;background:#0b1220;font-size:13px;cursor:pointer"><input type="checkbox" value="${esc(i)}" ${i===id?'checked':''} style="accent-color:#7c3aed">${i==='__print'?'🖨️ ':'🔒 '}${esc(tName(i))}</label>`).join('')}</div>
      <input data-n placeholder="Nom et prénom" maxlength="80" style="${inp}"><input data-t type="tel" placeholder="Téléphone (facultatif)" maxlength="30" style="${inp}">
      <textarea data-m rows="3" maxlength="1000" placeholder="Message (facultatif)" style="${inp};resize:vertical">Bonjour, je souhaite obtenir cet accès dans ${esc(PRODUIT)}.</textarea>
      <button data-go style="width:100%;margin-top:12px;padding:13px;border:0;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;font:700 15px system-ui,sans-serif;cursor:pointer">Demander l'accès</button><div data-r style="margin-top:10px;font-size:13px;text-align:center"></div>`}</div>`;
    document.body.appendChild(ov);const q=x=>ov.querySelector(x);ov.onclick=e=>{if(e.target===ov)ov.remove()};q('[data-x]').onclick=()=>ov.remove();
    if(q('[data-go]'))q('[data-go]').onclick=async()=>{const ids=[...ov.querySelectorAll('[data-l] input:checked')].map(i=>i.value);
      if(!ids.length){q('[data-r]').style.color='#fda4af';q('[data-r]').textContent='Cochez au moins un accès.';return}
      q('[data-go]').disabled=true;q('[data-go]').textContent='Envoi…';
      try{for(const oid of ids){const rid=[...crypto.getRandomValues(new Uint8Array(12))].map(b=>b.toString(16).padStart(2,'0')).join('');
        const r=await fetch(`${await fbUrl()}/requests/${rid}.json`,{method:'PUT',body:JSON.stringify({email:s.mail||'',nom:q('[data-n]').value.trim().slice(0,80)||undefined,tel:q('[data-t]').value.trim().slice(0,30),produit:PRODUIT,module:MODULE||'',t:Date.now(),message:q('[data-m]').value.trim().slice(0,1000),onglet:oid,ongletNom:tName(oid),statut:'attente',ua:UA(),page:location.href.split('#')[0].slice(0,200)})});
        if(!r.ok)throw 0;localStorage.setItem('licTabReq_'+PRODUIT+'_'+oid,Date.now())}q('[data-r]').style.color='#6ee7b7';q('[data-r]').textContent='✔ Demande envoyée. L\'accès se débloquera automatiquement dès qu\'il sera accordé.';q('[data-go]').textContent='Envoyée'}
      catch(e){q('[data-r]').style.color='#fda4af';q('[data-r]').textContent='Envoi impossible pour le moment. Réessayez plus tard.';q('[data-go]').disabled=false;q('[data-go]').textContent='Réessayer'}}}
  window.licenceAskTab=askTab;

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