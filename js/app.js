// Rot-appen: skall, dashboard, faner, sanntid og oppstart
/* global React, ReactDOM, htm */
import { store, update, useStore, reload, isCaught, anyModalOpen, catOrder, canEdit } from './store.js';
import { CATS } from './data.js';
import * as db from './db.js';
import { fetchWeather } from './weather.js';
import { DexGrid } from './components/dex-grid.js';
import { DetailModal } from './components/detail-modal.js';
import { DashboardView, StatsView, MapView, LogView, RecordsView, GuestView, ProfileView } from './components/views.js';
import { LoginGate, AddSpeciesModal, AddMemberModal, RegisterCatchModal } from './components/modals.js';

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
    ['dashboard','⌂ Hjem'],
    ['dex','◈ Dex'],
    ['fangster','📜 Fangster'],
    ['map','🗺️ Kart'],
    ['profiles','👤 Profil'],
  ];
  return html`<nav className="main-nav app-primary-nav" aria-label="Hovedmeny">
    ${nav.map(([key,label])=>html`<button key=${key} className=${'nav-tab'+(store.view===key?' active':'')} onClick=${()=>update(s=>{
      s.view = key;
      if(key==='profiles' && !s.profileMember) s.profileMember=s.member||s.members[0]||null;
    })}>${label}</button>`)}
  </nav>`;
}

function clearDexFilters(){
  update(s=>{
    s.q=''; s.filterCaught=null; s.filterPhoto=null; s.filterMystery=false;
    s.filterGps=false; s.filterRecord=false; s.filterMine=false; s.sortBy='dex';
  });
}

function openOrderEditor(){
  update(s=>{
    s.view='dex'; s.orderOpen=true; s.dexFiltersOpen=false;
    const cats = catOrder();
    const chosen = (s.filterCat && s.filterCat !== 'ALL') ? s.filterCat : (s.orderCat || cats[0]);
    if(chosen){ s.orderCat=chosen; s.filterCat=chosen; }
  });
}

function DexTools(){
  useStore();
  const editable = canEdit();
  const counts = { ALL: store.species.length };
  for(const c in CATS) counts[c] = store.species.filter(s=>s.cat===c).length;
  const tabs = [{key:'ALL', name:'Alle', cnt:counts.ALL}, ...catOrder().map(c=>({key:c, name:CATS[c].name, cnt:counts[c]||0}))];
  const activeFilters = [store.filterCaught!==null, store.filterPhoto===true, store.filterMystery, store.filterGps, store.filterMine, store.sortBy!=='dex'].filter(Boolean).length;
  const pickTab = key => update(s=>{ s.filterCat=key; s.view='dex'; if(s.orderOpen && key!=='ALL') s.orderCat=key; });

  return html`<div className="dex-tools dex-tools-clean">
    <div className="tabs cat-tabs" aria-label="Velg kategori">
      ${tabs.map(t=>html`<button key=${t.key} className=${'tab'+(store.filterCat===t.key?' active':'')} onClick=${()=>pickTab(t.key)}>${t.name}<span className="cnt">${t.cnt}</span></button>`)}
    </div>
    <label className="mobile-category-select">
      <span>Kategori</span>
      <select aria-label="Velg kategori" value=${store.filterCat} onChange=${e=>pickTab(e.target.value)}>
        ${tabs.map(t=>html`<option key=${t.key} value=${t.key}>${t.name} (${t.cnt})</option>`)}
      </select>
    </label>
    <div className="dex-search-row">
      <div className="search">🔎<input type="search" placeholder="Søk etter art, sted eller kommentar …" aria-label="Søk i FiskeDex" value=${store.q} onChange=${e=>update(s=>{s.q=e.target.value.trim().toLowerCase();})}/></div>
      <button className=${'chip filter-toggle'+(store.dexFiltersOpen?' active':'')} aria-expanded=${store.dexFiltersOpen?'true':'false'} onClick=${()=>update(s=>{s.dexFiltersOpen=!s.dexFiltersOpen;})}>☷ Filter${activeFilters ? ' ('+activeFilters+')' : ''}</button>
      ${editable && html`<button className="btn-add clean-new-species" onClick=${()=>update(s=>{s.addOpen=true;})}>+ Ny art</button>`}
    </div>
    ${store.dexFiltersOpen && html`<div className="dex-filter-panel">
      <div className="filter-group">
        <span>Vis</span>
        <button className=${'chip'+(store.filterCaught===true?' active':'')} onClick=${()=>update(s=>{s.filterCaught=s.filterCaught===true?null:true;})}>✓ Fanget</button>
        <button className=${'chip'+(store.filterCaught===false?' active':'')} onClick=${()=>update(s=>{s.filterCaught=s.filterCaught===false?null:false;})}>Mangler</button>
        <button className=${'chip'+(store.filterPhoto?' active':'')} onClick=${()=>update(s=>{s.filterPhoto=!s.filterPhoto;})}>📷 Med bilde</button>
        <button className=${'chip'+(store.filterMystery?' active':'')} onClick=${()=>update(s=>{s.filterMystery=!s.filterMystery;})}>❔ Mystery</button>
        <button className=${'chip'+(store.filterGps?' active':'')} onClick=${()=>update(s=>{s.filterGps=!s.filterGps;})}>📍 GPS</button>
        ${store.member && html`<button className=${'chip'+(store.filterMine?' active':'')} onClick=${()=>update(s=>{s.filterMine=!s.filterMine;})}>Bare ${store.member}</button>`}
      </div>
      <div className="filter-group filter-sort-group">
        <label>Sorter <select className="dex-sort" value=${store.sortBy} aria-label="Sorter dex" onChange=${e=>update(s=>{s.sortBy=e.target.value;})}><option value="dex">Dex-rekkefølge</option><option value="name">A–Å</option><option value="newest">Nyest fanget</option><option value="reactions">Flest reaksjoner</option></select></label>
        ${activeFilters || store.q ? html`<button className="chip clear-filters" onClick=${clearDexFilters}>Nullstill</button>` : null}
        ${editable && html`<button className="chip order-chip" onClick=${openOrderEditor}>↕ Endre rekkefølge</button>`}
      </div>
    </div>`}
  </div>`;
}

function FishersMenu(){
  useStore();
  const editable = canEdit();
  const choose = member => update(s=>{ s.member=member; s.memberMenuOpen=false; s.filterMine=false; });
  const openProfile = member => update(s=>{ s.member=member; s.profileMember=member; s.memberMenuOpen=false; s.view='profiles'; });
  return html`<div className="member-menu-root">
    <button className="member-menu-trigger" aria-label="Velg fisker" aria-expanded=${store.memberMenuOpen?'true':'false'} onClick=${()=>update(s=>{s.memberMenuOpen=!s.memberMenuOpen;})}>
      <span className="member-menu-icon">👤</span><span>${store.member || 'Alle'}</span><span className="member-menu-caret">⌄</span>
    </button>
    ${store.memberMenuOpen && html`<div className="member-drawer-backdrop" onClick=${()=>update(s=>{s.memberMenuOpen=false;})}>
      <aside className="member-drawer" aria-label="Velg fisker" onClick=${e=>e.stopPropagation()}>
        <div className="member-drawer-head"><div><span className="eyebrow">FiskeDex</span><h2>Velg fisker</h2><p>Dette velger hvem dere ser fangster for.</p></div><button aria-label="Lukk meny" onClick=${()=>update(s=>{s.memberMenuOpen=false;})}>×</button></div>
        <button className=${'member-drawer-item all'+(store.member===null?' active':'')} onClick=${()=>choose(null)}><span className="drawer-avatar">👥</span><span><b>Alle fiskere</b><small>Felles oversikt for hele gjengen</small></span><i>${store.member===null?'✓':''}</i></button>
        <div className="member-drawer-list">
          ${store.members.map(m=>html`<div key=${m} className=${'member-drawer-person'+(store.member===m?' active':'')}>
            <button className="member-drawer-item" onClick=${()=>choose(m)}>
              ${store.profilePhotos && store.profilePhotos[m] ? html`<img className="drawer-avatar photo" src=${store.profilePhotos[m]} alt=""/>` : html`<span className="drawer-avatar">${m.slice(0,1).toUpperCase()}</span>`}
              <span><b>${m}</b><small>${store.member===m?'Valgt fisker':'Velg som fisker'}</small></span><i>${store.member===m?'✓':''}</i>
            </button>
            <button className="drawer-profile-link" aria-label=${'Åpne profil for '+m} onClick=${()=>openProfile(m)}>Profil</button>
          </div>`)}
        </div>
        ${editable && html`<button className="member-add-drawer" onClick=${()=>update(s=>{s.memberMenuOpen=false;s.memberOpen=true;})}>+ Legg til fisker</button>`}
      </aside>
    </div>`}
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
        s.lightboxUrl = null; s.detailId = null; s.addOpen = false; s.memberOpen = false; s.catchOpen = false; s.memberMenuOpen = false; s.dexFiltersOpen = false;
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
        <img src="img/forside.jpg" width="1000" height="999" alt="Karmøy Fishing Championship-plakat" decoding="async" fetchPriority="high"/>
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
          <div className="progress-bar"><div className="progress-fill" style=${{transform:`scaleX(${Math.max(0, Math.min(1, pct/100))})`}}></div></div>
        </div>
      </div>
    </header>

    <${FishersMenu}/>

    ${store.weather && html`<div className="weather-bar" dangerouslySetInnerHTML=${{__html: store.weather}}/>`}

    <div className="toolbar main-toolbar app-toolbar-v24">
      <${MainNav}/>
      <div className="app-toolbar-actions">
        ${editable && html`<button className="btn-add catch-cta" onClick=${()=>update(s=>{ s.catchOpen=true; })}>🎣 Registrer fangst</button>`}
        <button className="tab toolbar-quiet" title="Hent siste fangster" onClick=${()=>reload(false)}>↻</button>
        ${editable && html`<button className="tab order-toolbar-btn toolbar-secondary" title="Dra fiskene i ønsket rekkefølge" onClick=${()=>update(s=>{
          s.view='dex';
          s.orderOpen=true;
          const cats = catOrder();
          const chosen = (s.filterCat && s.filterCat !== 'ALL') ? s.filterCat : (s.orderCat || cats[0]);
          if(chosen){ s.orderCat=chosen; s.filterCat=chosen; }
        })}>↕ Sorter</button>`}
        ${store.guest && html`<button className="tab guest-login" onClick=${leaveGuest}>Logg inn</button>`}
      </div>
    </div>

    ${store.view==='dex' && html`<${DexTools}/>`}

    <main>
      ${!store.loaded
        ? html`<div className="empty-state">Henter dexen …</div>`
        : store.view==='dashboard' ? html`<${DashboardView}/>`
        : store.view==='stats'     ? html`<${StatsView}/>`
        : store.view==='profiles'  ? html`<${ProfileView}/>`
        : store.view==='records'   ? html`<${RecordsView}/>`
        : store.view==='map'       ? html`<${MapView}/>`
        : store.view==='fangster'  ? html`<${LogView}/>`
        : store.view==='guests'    ? html`<${GuestView}/>`
        : html`<${DexGrid}/>`}
    </main>

    <div className=${'mobile-bottom-nav '+(editable?'has-catch':'guest-nav')}>
      <button className=${store.view==='dashboard'?'active':''} onClick=${()=>update(s=>{s.view='dashboard';})}>⌂<span>Hjem</span></button>
      <button className=${store.view==='dex'?'active':''} onClick=${()=>update(s=>{s.view='dex';})}>◈<span>Dex</span></button>
      ${editable
        ? html`<button className="mobile-catch-btn" onClick=${()=>update(s=>{s.catchOpen=true;})}>＋<span>Fangst</span></button>`
        : html`<button className=${store.view==='fangster'?'active':''} onClick=${()=>update(s=>{s.view='fangster';})}>📜<span>Fangster</span></button>`}
      <button className=${store.view==='map'?'active':''} onClick=${()=>update(s=>{s.view='map';})}>🗺️<span>Kart</span></button>
      <button className=${store.view==='profiles'?'active':''} onClick=${()=>update(s=>{s.profileMember=s.profileMember||s.member||s.members[0]||null;s.view='profiles';})}>👤<span>Profil</span></button>
    </div>

    ${store.detailId && html`<${DetailModal}/>`}
    <${AddSpeciesModal}/>
    <${AddMemberModal}/>
    <${RegisterCatchModal}/>

    ${store.lightboxUrl && html`
      <div className="overlay open" style=${{zIndex:70, alignItems:'center'}}
           onClick=${()=>update(s=>{ s.lightboxUrl = null; })}>
        <img src=${store.lightboxUrl} alt="Fangstbilde"
             style=${{maxWidth:'96vw', maxHeight:'92vh', borderRadius:'10px', margin:'auto', boxShadow:'0 24px 80px rgba(0,0,0,.5)'}}/>
      </div>`}

    <div className=${'toast'+(store.toastMsg?' show':'')}>${store.toastMsg}</div>
  <//>`;
}

class AppErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error:null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error){ console.error('FiskeDex oppstartsfeil:', error); }
  render(){
    if(this.state.error){
      return html`<div className="boot-error"><h1>FiskeDex kunne ikke starte</h1><p>Prøv å laste siden på nytt. Hvis problemet fortsetter, slett nettstedsdata/cache for fiskedex.no og åpne siden igjen.</p><button className="btn primary" onClick=${()=>location.reload()}>Last inn på nytt</button></div>`;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('app')).render(
  React.createElement(AppErrorBoundary, null, React.createElement(App))
);
