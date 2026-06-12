// Dex-visningen: kategoribannere + artskort
/* global React, htm */
import { store, update, useStore, visibleSpecies, isCaught, catchers, memberName, catOrder } from '../store.js';
import { CATS, COVERS } from '../data.js';
import { silFor } from '../silhouettes.js';
import { loadPhoto } from '../db.js';
import { FELLES } from '../config.js';

const html = htm.bind(React.createElement);
const { useState, useEffect, useRef } = React;

export function SpeciesCard({ s, photoUrl }){
  const caught = isCaught(s);
  let meta = 'Ikke registrert';
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
      <div className=${'img' + (photoUrl?'':' empty')}>
        ${photoUrl
          ? html`<img src=${photoUrl} alt=""/>`
          : html`<span dangerouslySetInnerHTML=${{__html: silFor(s)}}/>`}
      </div>
      <div className="body">
        <div className="id">${s.id}</div>
        <div className="name">${s.name}</div>
        <div className="meta">${meta}</div>
      </div>
      ${caught && html`<div className="stamp">Fanget</div>`}
    </div>`;
}

export function DexGrid(){
  useStore();
  const [photoUrls, setPhotoUrls] = useState({});
  const cacheKeys = useRef({});   // artId -> 'artId|fisker' som er hentet

  const list = visibleSpecies();

  // hent kortbilder for synlige arter (riktig fisker prioriteres)
  useEffect(()=>{
    let alive = true;
    for(const s of list){
      let mem = null;
      if(store.member){
        const c = s.catches && s.catches[store.member];
        if(c && c.hasPhoto) mem = store.member;
      } else {
        mem = catchers(s).find(m=>s.catches[m].hasPhoto) || null;
      }
      if(!mem){
        if(cacheKeys.current[s.id]){ delete cacheKeys.current[s.id]; setPhotoUrls(p=>({...p,[s.id]:null})); }
        continue;
      }
      const key = s.id + '|' + mem;
      if(cacheKeys.current[s.id] === key) continue;
      cacheKeys.current[s.id] = key;
      loadPhoto(s.id, mem).then(url=>{ if(alive) setPhotoUrls(p=>({...p,[s.id]:url})); });
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
