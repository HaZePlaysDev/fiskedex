// Butikken: appens tilstand + abonnement for React (useSyncExternalStore)
/* global React */
import { SEED, CATS } from './data.js';
import { FELLES } from './config.js';
import * as db from './db.js';

export const store = {
  authed: false,
  guest: false,          // true = lesemodus uten passord
  loaded: false,
  showCover: true,
  coverClosing: false,
  species: [],          // [{id,name,cat,custom,sil,catches:{medlem:{...}}}]
  members: [],
  member: null,          // valgt fisker (null = alle)
  view: 'dex',           // dex | stats | map | logg
  filterCat: 'ALL',
  filterCaught: null,
  q: '',
  detailId: null,
  addOpen: false,
  memberOpen: false,
  lightboxUrl: null,
  toastMsg: '',
  weather: '',
};

const listeners = new Set();
let version = 0;

/** Endre tilstanden og varsle alle komponenter. */
export function update(fn){
  if(fn) fn(store);
  version++;
  listeners.forEach(l=>l());
}

/** React-hook: abonner på butikken (re-render ved hver endring). */
export function useStore(){
  return React.useSyncExternalStore(
    cb=>{ listeners.add(cb); return ()=>listeners.delete(cb); },
    ()=>version,
    ()=>version,
  );
}

let toastTimer = null;
export function toast(msg){
  update(s=>{ s.toastMsg = msg; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>update(s=>{ s.toastMsg=''; }), 2600);
}

/* ---------- lasting ---------- */
export async function reload(quiet){
  try{
    let { speciesRows, memberRows, catchRows, photoRows } = await db.fetchAll();
    if(!speciesRows.length){
      const rows = SEED.map(([id,name])=>({id,name,cat:id[0],custom:false}));
      speciesRows = (await db.seedSpecies(rows)).sort((a,b)=>a.id<b.id?-1:1);
    }
    // Prim bilde-cache før kortene tegnes, så fangstbilder kommer opp med en gang.
    const photoSet = new Set();
    if(photoRows && photoRows.length){
      db.primePhotoCache(photoRows);
      for(const p of photoRows){
        if(p && p.species_id && p.member && (p.thumb || p.data)) photoSet.add(p.species_id + ':' + p.member);
      }
    }

    const cmap = {};
    for(const c of catchRows){
      (cmap[c.species_id] = cmap[c.species_id]||{})[c.member] = {
        dato:c.dato||'', sted:c.sted||'', lengde:c.lengde||'', vekt:c.vekt||'',
        kommentar:c.kommentar||'', hasPhoto:!!c.has_photo || photoSet.has(c.species_id + ':' + c.member),
        lat:(c.lat!=null?c.lat:null), lng:(c.lng!=null?c.lng:null), created:c.created_at||'',
      };
    }
    update(s=>{
      s.species = speciesRows.map(r=>({
        id:r.id, name:r.name, cat:r.cat, custom:!!r.custom, sil:r.sil||null,
        info:r.info||'', min:r.min||'', fredet:!!r.fredet,
        catches:cmap[r.id]||{},
      }));
      s.members = memberRows.map(r=>r.name);
      if(s.member && !s.members.includes(s.member)) s.member = null;
      s.loaded = true;
    });
    if(!quiet) toast('Oppdatert med siste fangster');
    return true;
  }catch(e){
    console.error(e);
    toast('Klarte ikke hente data \u2013 sjekk nettet');
    return false;
  }
}

/* ---------- hjelpere ---------- */
export function sp(id){ return store.species.find(s=>s.id===id); }
export function catchers(s){ return Object.keys(s.catches||{}); }
export function memberName(m){ return m===FELLES ? 'Felles' : m; }
export function isCaught(s){
  return store.member ? !!(s.catches && s.catches[store.member]) : catchers(s).length>0;
}
export function nextId(cat){
  const nums = store.species.filter(s=>s.cat===cat)
    .map(s=>parseInt(s.id.slice(1),10)).filter(n=>!isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return cat + String(n).padStart(3,'0');
}
export function visibleSpecies(){
  return store.species.filter(s=>{
    if(store.filterCat!=='ALL' && s.cat!==store.filterCat) return false;
    const c = isCaught(s);
    if(store.filterCaught===true && !c) return false;
    if(store.filterCaught===false && c) return false;
    if(store.q && !s.name.toLowerCase().includes(store.q) && !s.id.toLowerCase().includes(store.q)) return false;
    return true;
  });
}
export function catOrder(){
  return Object.keys(CATS).sort((a,b)=>CATS[a].order-CATS[b].order);
}
export function canEdit(){
  return store.authed && !store.guest;
}
export function anyModalOpen(){
  return !!(store.detailId || store.addOpen || store.memberOpen);
}
