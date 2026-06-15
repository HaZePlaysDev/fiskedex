// Rot-appen: skall, dashboard, faner, sanntid og oppstart
/* global React, ReactDOM, htm */
import { store, update, useStore, reload, isCaught, anyModalOpen, catOrder, canEdit } from './store.js';
import { CATS } from './data.js';
import * as db from './db.js';
import { fetchWeather } from './weather.js';
import { DexGrid } from './components/dex-grid.js';
import { DetailModal } from './components/detail-modal.js';
import { DashboardView, StatsView, MapView, LogView, RecordsView, GuestView } from './components/views.js';
import { LoginGate, AddSpeciesModal, AddMemberModal } from './components/modals.js';

const html = htm.bind(React.createElement);
const { useEffect } = React;

let rtTimer = null;
async function init(){
  await reload(true);
  db.subscribeRealtime(()=>{
    clearTimeout(rtTimer);
    rtTimer = setTimeout(()=>{ if(!anyModalOpen()) reload(true); }, 600);
  });
  fetchWeather();
}

function MainNav(){
  useStore();
  const nav = [
    ['dashboard','🏠 Dashboard'],
    ['dex','🐟 Dex'],
    ['fangster','📜 Fangster'],
    ['map','🗺️ Kart'],
    ['stats','📊 Toppliste'],
    ['records','🏆 Rekorder'],
    ['guests','👀 Gjester'],
  ];
  return html`<nav className="main-nav" aria-label="Hovedmeny">
    ${nav.map(([key,label])=>html`<button key=${key} className=${'nav-tab'+(store.view===key?' active':'')} onClick=${()=>update(s=>{ s.view = key; })}>${label}</button>`)}
  </nav>`;
}

function DexTools(){
  useStore();
  const editable = canEdit();
  const counts = { ALL: store.species.length };
  for(const c in CATS) counts[c] = store.species.filter(s=>s.cat===c).length;
  const tabs = [{key:'ALL', name:'Alle', cnt:counts.ALL},
    ...catOrder().map(c=>({key:c, name:CATS[c].name, cnt:counts[c]||0}))];
  const pickTab = key => update(s=>{ s.filterCat = key; s.view = 'dex'; });

  return html`<div className="dex-tools">
    <div className="tabs cat-tabs">
      ${tabs.map(t=>html`
        <button key=${t.key} className=${'tab'+(store.filterCat===t.key ? ' active':'')}
                onClick=${()=>pickTab(t.key)}>${t.name}<span className="cnt">${t.cnt}</span></button>`)}
    </div>
    <div className="filter-caught">
      <button className=${'chip'+(store.filterCaught===true?' active':'')}
              onClick=${()=>update(s=>{ s.filterCaught = s.filterCaught===true ? null : true; })}>✓ Fanget</button>
      <button className=${'chip'+(store.filterCaught===false?' active':'')}
              onClick=${()=>update(s=>{ s.filterCaught = s.filterCaught===false ? null : false; })}>Mangler</button>
      <button className=${'chip'+(store.filterPhoto===true?' active':'')}
              onClick=${()=>update(s=>{ s.filterPhoto = s.filterPhoto===true ? null : true; })}>📷 Med bilde</button>
      <button className=${'chip'+(store.filterMystery?' active':'')}
              onClick=${()=>update(s=>{ s.filterMystery = !s.filterMystery; })}>❔ Mystery</button>
    </div>
    <div className="search">🔎<input type="search" placeholder="Søk etter art, sted eller kommentar …" aria-label="Søk"
         value=${store.q} onChange=${e=>update(s=>{ s.q = e.target.value.trim().toLowerCase(); })}/></div>
    ${editable && html`<button className="btn-add" onClick=${()=>update(s=>{ s.addOpen = true; })}>+ Ny art</button>`}
  </div>`;
}

function MembersBar(){
  useStore();
  const editable = canEdit();
  return html`<div className="members-bar">
    <span className="mlabel">Fisker:</span>
    <button className=${'mchip'+(store.member===null?' active':'')}
            onClick=${()=>update(s=>{ s.member = null; })}>👥 Alle</button>
    ${store.members.map(m=>html`
      <button key=${m} className=${'mchip'+(store.member===m?' active':'')}
              onClick=${()=>update(s=>{ s.member = m; })}>${m}</button>`)}
    ${editable && html`<button className="mchip add" onClick=${()=>update(s=>{ s.memberOpen = true; })}>+ Fisker</button>`}
  </div>`;
}

function App(){
  useStore();

  // oppstart: sjekk eksisterende innlogging + globale lyttere
  useEffect(()=>{
    (async ()=>{
      if(await db.hasSession()){
        update(s=>{ s.authed = true; s.guest = false; });
        await init();
      }
    })();
    const onVis = ()=>{ if(!document.hidden && (store.authed || store.guest) && !anyModalOpen()) reload(true); };
    const onKey = e=>{
      if(e.key==='Escape') update(s=>{
        s.lightboxUrl = null; s.detailId = null; s.addOpen = false; s.memberOpen = false;
      });
    };
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('keydown', onKey);
    if('serviceWorker' in navigator){ try{ navigator.serviceWorker.register('sw.js'); }catch(e){} }
    return ()=>{
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  async function onAuthed(){
    update(s=>{ s.authed = true; s.guest = false; s.loaded = false; });
    await init();
  }
  async function onGuest(){
    update(s=>{ s.guest = true; s.authed = false; s.loaded = false; });
    await init();
  }
  async function leaveGuest(){
    update(s=>{ s.guest = false; s.loaded = false; });
  }

  if(!store.authed && !store.guest){
    return html`<${React.Fragment}>
      <${LoginGate} onAuthed=${onAuthed} onGuest=${onGuest}/>
      <div className=${'toast'+(store.toastMsg?' show':'')}>${store.toastMsg}</div>
    <//>`;
  }

  const editable = canEdit();
  const tot = store.species.length;
  const caughtCount = store.species.filter(isCaught).length;
  const pct = tot ? (100*caughtCount/tot) : 0;

  const openFiskedex = ()=>{
    update(s=>{ s.coverClosing = true; });
    setTimeout(()=>update(s=>{ s.showCover = false; s.coverClosing = false; }), 1250);
  };

  return html`<${React.Fragment}>

    ${store.showCover && html`
      <div id="cover" className=${store.coverClosing ? 'hide' : ''}>
        <img src="img/forside.jpg" alt="Karmøy Fishing Championship-plakat"/>
        <h2>KARMØY FISHING<br/>CHAMPIONSHIP</h2>
        <p>Under overflaten finnes en verden de fleste aldri ser. Noen arter er vanlige. Andre er legender. Vårt oppdrag er å finne dem alle.</p>
        <button className="btn-add" onClick=${openFiskedex}>Åpne FiskeDex</button>
      </div>`}

    <header>
      <svg className="depth" viewBox="0 0 1200 260" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,200 C200,170 380,230 600,205 C820,180 1000,235 1200,210" fill="none" stroke="#2a4d5c" strokeWidth="1.5"/>
        <path d="M0,160 C220,130 420,185 640,160 C860,135 1020,190 1200,165" fill="none" stroke="#2a4d5c" strokeWidth="1.5"/>
        <path d="M0,120 C240,95 460,140 680,118 C900,96 1040,145 1200,122" fill="none" stroke="#2a4d5c" strokeWidth="1.2"/>
        <path d="M0,80 C260,60 500,98 720,80 C940,62 1060,100 1200,82" fill="none" stroke="#2a4d5c" strokeWidth="1"/>
      </svg>
      <div className="head-inner">
        <div className="eyebrow">Haugalandet · Under overflaten</div>
        <h1 className="hero-title">KARM<span className="o">Ø</span>Y FISHING CHAMPIONSHIP</h1>
        <div className="tagline">${editable ? 'Konkurranse-dashboard, fangster, kart og rekorder for gjengen.' : 'Gjestemodus: du kan se fangstene, men ikke endre noe.'}</div>
        <div className="progress-wrap">
          <div className="progress-num"><span>${caughtCount}</span>/<span>${tot}</span><small>ARTER KARTLAGT</small></div>
          <div className="progress-bar"><div className="progress-fill" style=${{width: pct+'%'}}></div></div>
        </div>
      </div>
    </header>

    ${store.weather && html`<div className="weather-bar" dangerouslySetInnerHTML=${{__html: store.weather}}/>`}

    <div className="toolbar main-toolbar">
      <${MainNav}/>
      <button className="tab" title="Hent kompisenes siste fangster" onClick=${()=>reload(false)}>↻ Oppdater</button>
      ${store.guest && html`<button className="tab guest-login" onClick=${leaveGuest}>Logg inn for å redigere</button>`}
    </div>

    <${MembersBar}/>
    ${store.view==='dex' && html`<${DexTools}/>`}

    <main>
      ${!store.loaded
        ? html`<div className="empty-state">Henter dexen …</div>`
        : store.view==='dashboard' ? html`<${DashboardView}/>`
        : store.view==='stats'     ? html`<${StatsView}/>`
        : store.view==='records'   ? html`<${RecordsView}/>`
        : store.view==='map'       ? html`<${MapView}/>`
        : store.view==='fangster'  ? html`<${LogView}/>`
        : store.view==='guests'    ? html`<${GuestView}/>`
        : html`<${DexGrid}/>`}
    </main>

    <div className="mobile-bottom-nav">
      <button className=${store.view==='dashboard'?'active':''} onClick=${()=>update(s=>{s.view='dashboard';})}>🏠<span>Start</span></button>
      <button className=${store.view==='dex'?'active':''} onClick=${()=>update(s=>{s.view='dex';})}>🐟<span>Dex</span></button>
      <button className=${store.view==='fangster'?'active':''} onClick=${()=>update(s=>{s.view='fangster';})}>📜<span>Fangster</span></button>
      <button className=${store.view==='map'?'active':''} onClick=${()=>update(s=>{s.view='map';})}>🗺️<span>Kart</span></button>
      <button className=${store.view==='stats'?'active':''} onClick=${()=>update(s=>{s.view='stats';})}>📊<span>Toppen</span></button>
    </div>

    ${store.detailId && html`<${DetailModal}/>`}
    <${AddSpeciesModal}/>
    <${AddMemberModal}/>

    ${store.lightboxUrl && html`
      <div className="overlay open" style=${{zIndex:70, alignItems:'center'}}
           onClick=${()=>update(s=>{ s.lightboxUrl = null; })}>
        <img src=${store.lightboxUrl} alt="Fangstbilde"
             style=${{maxWidth:'96vw', maxHeight:'92vh', borderRadius:'10px', margin:'auto', boxShadow:'0 24px 80px rgba(0,0,0,.5)'}}/>
      </div>`}

    <div className=${'toast'+(store.toastMsg?' show':'')}>${store.toastMsg}</div>
  <//>`;
}

ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(App));
