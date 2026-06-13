// Dex-visningen: kategoribannere + artskort
/* global React, htm */
import { store, update, useStore, visibleSpecies, isCaught, catchers, memberName, catOrder } from '../store.js';
import { CATS, COVERS } from '../data.js';
import { silFor } from '../silhouettes.js';
import { cachedPhotoThumb, loadPhotoThumb } from '../db.js';
import { FELLES } from '../config.js';

const html = htm.bind(React.createElement);
const { useState, useEffect, useRef } = React;

export function SpeciesCard({ s, photoUrl }){
  const caught = isCaught(s);
  const photoLoading = caught && photoUrl === undefined;
  let meta = 'Ikke registrert';
  const hint = !caught ? ((s.min ? 'Kan ha minstemål: '+s.min : '') || (s.info ? s.info.split(/[.!?]/)[0] : 'Trykk for hint og artsinfo')) : '';
  if(caught){
    if(store.member){
      const c = s.catches[store.member];
      meta = [c.dato, c.vekt, c.lengde].filter(Boolean).join(' \u00b7 ') || 'Fanget';
    } else {
      const who = catchers(s);
      if(who.length===1 && who[0]===FELLES){
        const c = s.catches[FELLES];
        meta = [c.dato, c.vekt, c.lengde].filter(Boolean).join(' \u00b7 ') || 'Fanget';
      } else {
        meta = 'Fanget av ' + who.map(memberName).join(', ');
      }
    }
  }
  const open = ()=>update(st=>{ st.detailId = s.id; });
  return html`
    <div className=${'card' + (caught?'':' uncaught')} role="button" tabIndex="0"
         onClick=${open}
         onKeyDown=${e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } }}>
      <div className=${'img' + (photoUrl?'':' empty') + (photoLoading?' loading-photo':'')}>
        ${photoUrl
          ? html`<img src=${photoUrl} alt=""/>`
          : photoLoading
            ? html`<span className="photo-wait">Henter bilde …</span>`
            : html`<span dangerouslySetInnerHTML=${{__html: silFor(s)}}/>`}
      </div>
      <div className="body">
        <div className="id">${s.id}</div>
        <div className="name">${s.name}</div>
        <div className="meta">${meta}</div>
        ${!caught && html`<div className="mystery-hint">❔ ${hint}</div>`}
      </div>
      ${caught && html`<div className="stamp">Fanget</div>`}
    </div>`;
}

export function DexGrid(){
  useStore();
  const [photoUrls, setPhotoUrls] = useState({});
  const cacheKeys = useRef({});   // artId -> 'artId|fisker' som er hentet

  const list = visibleSpecies();

  // hent kortbilder for synlige arter.
  // Før prøver vi valgt fisker, deretter andre som har fanget arten.
  // Vi prøver også selv om hasPhoto-flagget er feil, fordi gamle data kan være litt ute av sync.
  useEffect(()=>{
    let alive = true;
    for(const s of list){
      const who = catchers(s);
      let candidates = [];
      if(store.member && (s.catches||{})[store.member]) candidates.push(store.member);
      candidates.push(...who.filter(m=>!candidates.includes(m) && s.catches[m].hasPhoto));
      candidates.push(...who.filter(m=>!candidates.includes(m)));

      if(!candidates.length){
        if(cacheKeys.current[s.id]){ delete cacheKeys.current[s.id]; setPhotoUrls(p=>({...p,[s.id]:null})); }
        continue;
      }
      const key = s.id + '|' + candidates.map(m=>m+':' + (s.catches[m].hasPhoto?'1':'0')).join(',');
      if(cacheKeys.current[s.id] === key) continue;
      cacheKeys.current[s.id] = key;
      // Bruk cache med en gang hvis oppstarten allerede har hentet bildene.
      let cachedUrl = null;
      let cachedMem = null;
      for(const mem of candidates){
        const u = cachedPhotoThumb(s.id, mem);
        if(u){ cachedUrl = u; cachedMem = mem; break; }
      }
      if(cachedUrl){
        setPhotoUrls(p=>({...p,[s.id]:cachedUrl}));
        if(cachedMem && s.catches && s.catches[cachedMem] && !s.catches[cachedMem].hasPhoto){
          update(()=>{ s.catches[cachedMem].hasPhoto = true; });
        }
        continue;
      }

      // undefined betyr: vi leter etter bilde. Da viser ikke kortet silhuett først.
      setPhotoUrls(p=>({...p,[s.id]:undefined}));
      (async()=>{
        let url = null;
        let foundMem = null;
        for(const mem of candidates){
          url = await loadPhotoThumb(s.id, mem);
          if(url){ foundMem = mem; break; }
        }
        if(alive){
          if(url && foundMem && s.catches && s.catches[foundMem] && !s.catches[foundMem].hasPhoto){
            update(()=>{ s.catches[foundMem].hasPhoto = true; });
          }
          setPhotoUrls(p=>({...p,[s.id]:url || null}));
        }
      })();
    }
    return ()=>{ alive = false; };
  });

  // grupper per kategori
  let groups = [];
  if(store.filterCat!=='ALL'){
    if(list.length) groups = [{cat: store.filterCat, items: list}];
  } else {
    for(const c of catOrder()){
      const items = list.filter(s=>s.cat===c);
      if(items.length) groups.push({cat: c, items});
    }
    const other = list.filter(s=>!CATS[s.cat]);
    if(other.length) groups.push({cat: null, items: other});
  }
  const bannerFor = (cat)=>{
    const grp = store.species.filter(s=>s.cat===cat);
    return {
      name: CATS[cat] ? CATS[cat].name : 'Annet',
      img: COVERS[cat] || null,
      tot: grp.length,
      c: grp.filter(isCaught).length,
    };
  };

  if(!groups.length){
    return html`<div className="empty-state">
      Ingen treff her ute. Kast p\u00e5 nytt med et annet s\u00f8k \u2013 eller legg til en ny art.
    </div>`;
  }
  return html`<${React.Fragment}>
    ${groups.map(g=>{
      const b = g.cat ? bannerFor(g.cat) : null;
      return html`<${React.Fragment} key=${g.cat || 'annet'}>
        ${b ? html`
          <div className="cat-banner">
            ${b.img && html`<img className="cover" src=${b.img} alt=${b.name}/>`}
            <div className="inner">
              <h2>${b.name}</h2>
              <span className="cnt">${b.c}/${b.tot} FANGET</span>
            </div>
          </div>`
        : html`<div className="section-h">Annet</div>`}
        <div className="grid">
          ${g.items.map(s=>html`<${SpeciesCard} key=${s.id} s=${s} photoUrl=${photoUrls[s.id]}/>`)}
        </div>
      <//>`;
    })}
  <//>`;
}
