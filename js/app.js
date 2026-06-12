// Rot-appen: skall (header/verktøylinje), visningsbytte, sanntid og oppstart
/* global React, ReactDOM, htm */
import { store, update, useStore, reload, isCaught, memberName, anyModalOpen, catOrder } from './store.js';
import { CATS } from './data.js';
import * as db from './db.js';
import { fetchWeather } from './weather.js';
import { DexGrid } from './components/dex-grid.js';
import { DetailModal } from './components/detail-modal.js';
import { StatsView, MapView, LogView } from './components/views.js';
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

function App(){
  useStore();

  // oppstart: sjekk eksisterende innlogging + globale lyttere
  useEffect(()=>{
    (async ()=>{
      if(await db.hasSession()){
        update(s=>{ s.authed = true; });
        await init();
      }
    })();
    const onVis = ()=>{ if(!document.hidden && store.authed && !anyModalOpen()) reload(true); };
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
    update(s=>{ s.authed = true; });
    await init();
  }

  if(!store.authed){
    return html`<${React.Fragment}>
      <${LoginGate} onAuthed=${onAuthed}/>
      <div className=${'toast'+(store.toastMsg?' show':'')}>${store.toastMsg}</div>
    <//>`;
  }

  const counts = { ALL: store.species.length };
  for(const c in CATS) counts[c] = store.species.filter(s=>s.cat===c).length;
  const tabs = [{key:'ALL', name:'Alle', cnt:counts.ALL},
    ...catOrder().map(c=>({key:c, name:CATS[c].name, cnt:counts[c]||0}))];

  const tot = store.species.length;
  const caughtCount = store.species.filter(isCaught).length;
  const pct = tot ? (100*caughtCount/tot) : 0;

  const pickTab = key => update(s=>{ s.filterCat = key; s.view = 'dex'; });
  const toggleView = v => update(s=>{ s.view = s.view===v ? 'dex' : v; });

  return html`<${React.Fragment}>

    ${store.showCover && html`
      <div id="cover">
        <img src="img/forside.jpg" alt="Karm\u00f8y Fishing Championship-plakat"/>
        <h2>KARM\u00d8Y FISHING<br/>CHAMPIONSHIP</h2>
        <p>Under overflaten finnes en verden de fleste aldri ser. Noen arter er vanlige. Andre er legender. V\u00e5rt oppdrag er \u00e5 finne dem alle.</p>
        <button className="btn-add" onClick=${()=>update(s=>{ s.showCover = false; })}>\u00c5pne Pok\u00e9dexen</button>
      </div>`}

    <header>
      <svg className="depth" viewBox="0 0 1200 260" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,200 C200,170 380,230 600,205 C820,180 1000,235 1200,210" fill="none" stroke="#2a4d5c" strokeWidth="1.5"/>
        <path d="M0,160 C220,130 420,185 640,160 C860,135 1020,190 1200,165" fill="none" stroke="#2a4d5c" strokeWidth="1.5"/>
        <path d="M0,120 C240,95 460,140 680,118 C900,96 1040,145 1200,122" fill="none" stroke="#2a4d5c" strokeWidth="1.2"/>
        <path d="M0,80 C260,60 500,98 720,80 C940,62 1060,100 1200,82" fill="none" stroke="#2a4d5c" strokeWidth="1"/>
      </svg>
      <div className="head-inner">
        <div className="eyebrow">Haugalandet \u00b7 Under overflaten</div>
        <h1>KARM<span className="o">\u00d8</span>Y FISHING CHAMPIONSHIP</h1>
        <div className="tagline">V\u00e5rt oppdrag er \u00e5 finne dem alle \u2013 \u00e9n art om gangen. Trykk p\u00e5 en art for \u00e5 registrere fangst.</div>
        <div className="progress-wrap">
          <div className="progress-num"><span>${caughtCount}</span>/<span>${tot}</span><small>ARTER KARTLAGT</small></div>
          <div className="progress-bar"><div className="progress-fill" style=${{width: pct+'%'}}></div></div>
        </div>
      </div>
    </header>

    ${store.weather && html`<div className="weather-bar" dangerouslySetInnerHTML=${{__html: store.weather}}/>`}

    <div className="toolbar">
      <div className="tabs">
        ${tabs.map(t=>html`
          <button key=${t.key} className=${'tab'+(store.filterCat===t.key && store.view==='dex' ? ' active':'')}
                  onClick=${()=>pickTab(t.key)}>${t.name}<span className="cnt">${t.cnt}</span></button>`)}
      </div>
      <div className="filter-caught">
        <button className=${'chip'+(store.filterCaught===true?' active':'')}
                onClick=${()=>update(s=>{ s.filterCaught = s.filterCaught===true ? null : true; })}>\u2713 Fanget</button>
        <button className=${'chip'+(store.filterCaught===false?' active':'')}
                onClick=${()=>update(s=>{ s.filterCaught = s.filterCaught===false ? null : false; })}>Mangler</button>
      </div>
      <div className="search">\U0001F50E<input type="search" placeholder="S\u00f8k etter art \u2026" aria-label="S\u00f8k"
           value=${store.q} onChange=${e=>update(s=>{ s.q = e.target.value.trim().toLowerCase(); })}/></div>
      <button className="btn-add" onClick=${()=>update(s=>{ s.addOpen = true; })}>+ Ny art</button>
      <button className="tab" title="Hent kompisenes siste fangster" onClick=${()=>reload(false)}>\u21bb Oppdater</button>
      <button className=${'tab'+(store.view==='stats'?' active':'')} onClick=${()=>toggleView('stats')}>\U0001F4CA Toppliste</button>
      <button className=${'tab'+(store.view==='map'?' active':'')} onClick=${()=>toggleView('map')}>\U0001F5FA\uFE0F Kart</button>
      <button className=${'tab'+(store.view==='logg'?' active':'')} onClick=${()=>toggleView('logg')}>\U0001F4DC Logg</button>
    </div>

    <div className="members-bar">
      <span className="mlabel">Fisker:</span>
      <button className=${'mchip'+(store.member===null?' active':'')}
              onClick=${()=>update(s=>{ s.member = null; })}>\U0001F465 Alle</button>
      ${store.members.map(m=>html`
        <button key=${m} className=${'mchip'+(store.member===m?' active':'')}
                onClick=${()=>update(s=>{ s.member = m; })}>${m}</button>`)}
      <button className="mchip add" onClick=${()=>update(s=>{ s.memberOpen = true; })}>+ Fisker</button>
    </div>

    <main>
      ${!store.loaded
        ? html`<div className="empty-state">Henter dexen \u2026</div>`
        : store.view==='stats' ? html`<${StatsView}/>`
        : store.view==='map'   ? html`<${MapView}/>`
        : store.view==='logg'  ? html`<${LogView}/>`
        : html`<${DexGrid}/>`}
    </main>

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
