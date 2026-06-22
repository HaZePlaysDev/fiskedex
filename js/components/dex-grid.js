// Dex-visningen: kategoribannere + artskort
/* global React, htm */
import { store, update, useStore, visibleSpecies, isCaught, catchers, memberName, catOrder, canEdit, toast, reload } from '../store.js';
import { CATS, COVERS } from '../data.js';
import { silFor } from '../silhouettes.js';
import { cachedPhotoThumb, loadPhotoThumb, updateSpeciesOrder } from '../db.js';
import { FELLES } from '../config.js';

const html = htm.bind(React.createElement);
const { useState, useEffect, useRef } = React;

export function SpeciesCard({ s, photoUrl }){
  const caught = isCaught(s);
  const photoLoading = caught && photoUrl === undefined;
  let meta = 'Ikke registrert';
  const hint = !caught ? ((s.min ? 'Kan ha minstemål: '+s.min : '') || (s.info ? s.info.split(/[.!?]/)[0] : 'Trykk for hint og artsinfo')) : '';
  const reactionSum = catchers(s).reduce((sum,m)=>{
    const r = (s.catches[m] && s.catches[m].reactions) || {};
    return sum + Object.values(r).reduce((a,n)=>a+(Number(n)||0),0);
  },0);
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
    <div className=${'card cat-'+s.cat + (caught?'':' uncaught mystery-locked')} role="button" tabIndex="0"
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
        <div className="card-kicker"><span className="id">${s.id}</span><span className="card-category">${CATS[s.cat] ? CATS[s.cat].name : 'Annet'}</span></div>
        <div className="name">${s.name}</div>
        <div className="meta">${meta}</div>
        ${reactionSum>0 && html`<div className="card-reacts">🔥 ${reactionSum} reaksjoner</div>`}
        ${!caught && html`<div className="mystery-hint"><b>??? Mystery-art</b><span>${hint}</span></div>`}
      </div>
      ${caught && html`<div className="stamp">Fanget</div>`}
    </div>`;
}

function ReorderPanel(){
  useStore();
  const [ids, setIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dropHint, setDropHint] = useState(null); // {id, after}
  const dragRef = useRef({id:null, pointerId:null});

  const cats = catOrder();
  const activeCat = (store.orderCat && CATS[store.orderCat]) ? store.orderCat : (cats[0] || 'F');
  const items = store.species.filter(s=>s.cat===activeCat);
  const originalIds = items.map(s=>s.id);
  const signature = activeCat + '|' + items.map(s=>s.id + ':' + (s.sort_order ?? '')).join(',');
  const changed = ids.join('|') !== originalIds.join('|');

  useEffect(()=>{
    setIds(items.map(s=>s.id));
    setDraggingId(null);
    setDropHint(null);
    dragRef.current = {id:null, pointerId:null};
  }, [signature]);

  if(!canEdit() || !store.orderOpen) return null;

  const byId = id => store.species.find(s=>s.id===id);
  const ordered = ids.map(byId).filter(Boolean);

  const reorderNear = (dragId, targetId, after)=>{
    if(!dragId || !targetId || dragId === targetId) return;
    setIds(old=>{
      const from = old.indexOf(dragId);
      const targetRaw = old.indexOf(targetId);
      if(from < 0 || targetRaw < 0) return old;

      let insertAt = targetRaw + (after ? 1 : 0);
      const next = old.filter(id=>id !== dragId);
      if(from < insertAt) insertAt -= 1;
      insertAt = Math.max(0, Math.min(next.length, insertAt));

      if(next[insertAt] === dragId) return old;
      const before = next.slice(0, insertAt);
      const afterList = next.slice(insertAt);
      const result = [...before, dragId, ...afterList];
      return result.join('|') === old.join('|') ? old : result;
    });
  };

  const moveToTop = id=>{
    setIds(old=>{
      const next = old.filter(x=>x!==id);
      return [id, ...next];
    });
  };
  const moveToBottom = id=>{
    setIds(old=>{
      const next = old.filter(x=>x!==id);
      return [...next, id];
    });
  };

  const updateFromPointer = e=>{
    const dragId = dragRef.current.id;
    if(!dragId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el && el.closest ? el.closest('[data-order-id]') : null;
    if(row){
      const targetId = row.getAttribute('data-order-id');
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      setDropHint({id:targetId, after});
      reorderNear(dragId, targetId, after);
    }

    // På mobil: rull siden litt automatisk hvis fingeren er nær topp/bunn.
    if(e.clientY < 90) window.scrollBy(0, -16);
    if(e.clientY > window.innerHeight - 90) window.scrollBy(0, 16);
  };

  const startPointerDrag = (e, id)=>{
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {id, pointerId:e.pointerId};
    setDraggingId(id);
    setDropHint({id, after:false});
    try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_e){}
  };
  const movePointerDrag = e=>{
    if(dragRef.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    updateFromPointer(e);
  };
  const endPointerDrag = e=>{
    if(dragRef.current.pointerId !== e.pointerId) return;
    try{ e.currentTarget.releasePointerCapture(e.pointerId); }catch(_e){}
    dragRef.current = {id:null, pointerId:null};
    setDraggingId(null);
    setDropHint(null);
  };

  const reset = ()=>setIds(items.map(s=>s.id));
  async function save(){
    if(saving) return;
    setSaving(true);
    const rows = ids.map((id,i)=>({id, sort_order:(i+1)*10}));
    const res = await updateSpeciesOrder(rows);
    setSaving(false);
    if(!res.ok){
      toast('Kunne ikke lagre rekkefølge. Kjør SQL-filen for sort_order først.');
      return;
    }
    update(st=>{
      for(const row of rows){
        const sp = st.species.find(x=>x.id===row.id);
        if(sp) sp.sort_order = row.sort_order;
      }
      st.species.sort((a,b)=>{
        const ca = CATS[a.cat] ? CATS[a.cat].order : 999;
        const cb = CATS[b.cat] ? CATS[b.cat].order : 999;
        if(ca !== cb) return ca - cb;
        const oa = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 999999;
        const ob = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 999999;
        if(oa !== ob) return oa - ob;
        return a.id.localeCompare(b.id, 'nb');
      });
    });
    toast('Rekkefølgen er lagret');
    await reload(true);
  }

  return html`<section className=${'order-panel'+(draggingId?' is-dragging':'')}>
    <div className="order-head">
      <div>
        <h3>Dra fiskene i riktig rekkefølge</h3>
        <p>Velg kategori, dra i håndtaket til venstre, og trykk lagre. Dette endrer rekkefølgen for alle.</p>
      </div>
      <button className="btn ghost" onClick=${()=>update(s=>{ s.orderOpen = false; })}>Lukk</button>
    </div>
    <div className="order-cats">
      ${cats.map(c=>html`<button key=${c} className=${'order-cat'+(activeCat===c?' active':'')}
        onClick=${()=>update(s=>{ s.orderCat = c; s.filterCat = c; })}>${CATS[c].name}</button>`)}
    </div>
    <div className="order-tip">☰ Dra med fingeren eller musa. Slipp når fisken ligger der du vil.</div>
    <div className="order-list">
      ${ordered.map((sp,idx)=>html`<div key=${sp.id}
        data-order-id=${sp.id}
        className=${'order-row draggable-row'
          + (draggingId===sp.id?' dragging':'')
          + (dropHint && dropHint.id===sp.id ? (dropHint.after?' drop-after':' drop-before') : '')}>
        <button className="drag-handle" type="button" aria-label=${'Dra ' + sp.name + ' til ny plass'}
          onPointerDown=${e=>startPointerDrag(e, sp.id)}
          onPointerMove=${movePointerDrag}
          onPointerUp=${endPointerDrag}
          onPointerCancel=${endPointerDrag}>☰</button>
        <div className="order-pos">${idx+1}</div>
        <div className="order-name"><b>${sp.name}</b><span>${sp.id}</span></div>
        <div className="order-actions order-actions-compact">
          <button title="Flytt øverst" disabled=${idx===0} onClick=${()=>moveToTop(sp.id)}>Øverst</button>
          <button title="Flytt nederst" disabled=${idx===ids.length-1} onClick=${()=>moveToBottom(sp.id)}>Nederst</button>
        </div>
      </div>`)}
    </div>
    <div className="order-savebar">
      <button className="btn primary" onClick=${save} disabled=${saving || !changed}>${saving ? 'Lagrer …' : changed ? 'Lagre rekkefølge' : 'Ingen endringer'}</button>
      <button className="btn ghost" onClick=${reset} disabled=${saving || !changed}>Angre endringer</button>
      <span>${changed ? 'Du har ulagrede endringer.' : 'Rekkefølgen er lik den som er lagret.'}</span>
    </div>
  </section>`;
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
    <${ReorderPanel}/>
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
