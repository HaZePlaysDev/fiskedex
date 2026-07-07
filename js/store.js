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
  view: 'dashboard',     // dashboard | dex | fangster | map | stats | records | guests
  filterCat: 'ALL',
  filterCaught: null,
  filterPhoto: null,
  filterMystery: false,
  filterGps: false,
  filterRecord: false,
  filterMine: false,
  dexFiltersOpen: false,
  memberMenuOpen: false,
  sortBy: 'dex',
  orderOpen: false,       // viser sortering av fisk i Dex
  orderCat: 'F',
  q: '',
  detailId: null,
  addOpen: false,
  memberOpen: false,
  lightboxUrl: null,
  catchOpen: false,
  catchPresetSpeciesId: '',
  catchPresetMember: '',
  profileMember: null,
  // { navn: dataURL }. Holdes separat fra navnene, så gammel data fortsatt virker.
  profilePhotos: {},
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
    let { speciesRows, memberRows, catchRows, catchEntryRows, photoRows } = await db.fetchAll();
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
        weather:c.weather_summary||'', tide:c.tide_summary||'', reactions:c.reactions||{},
        entryId:null,
      };
    }

    // catchEntries inneholder alle enkeltfangster. Etter v28-SQL-en er kjørt,
    // kopieres også gamle catches hit én gang slik at historikken blir komplett.
    const entryMap = {};
    for(const c of (catchEntryRows||[])){
      const item = {
        id:c.id, entryId:c.id,
        dato:c.dato||'', sted:c.sted||'', lengde:c.lengde||'', vekt:c.vekt||'',
        kommentar:c.kommentar||'',
        hasPhoto:!!c.has_photo || !!c.photo_data || !!c.photo_thumb,
        photoData:c.photo_data||null, photoThumb:c.photo_thumb||c.photo_data||null,
        lat:(c.lat!=null?c.lat:null), lng:(c.lng!=null?c.lng:null), created:c.created_at||'',
        weather:c.weather_summary||'', tide:c.tide_summary||'', reactions:c.reactions||{},
      };
      const bySpecies = entryMap[c.species_id] = entryMap[c.species_id] || {};
      (bySpecies[c.member] = bySpecies[c.member] || []).push(item);
    }
    // La den største fangsten være Dex-oppsummeringen for hver fisker/art.
    for(const [speciesId, byMember] of Object.entries(entryMap)){
      cmap[speciesId] = cmap[speciesId] || {};
      for(const [member, entries] of Object.entries(byMember)){
        const best = bestCatch(entries);
        if(best) cmap[speciesId][member] = best;
      }
    }
    update(s=>{
      const catRank = c => (CATS[c] ? CATS[c].order : 999);
      s.species = speciesRows.map((r,i)=>({
        id:r.id, name:r.name, cat:r.cat, custom:!!r.custom, sil:r.sil||null,
        info:r.info||'', min:r.min||'', fredet:!!r.fredet,
        sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : i * 10,
        catches:cmap[r.id]||{},
        catchEntries:entryMap[r.id]||{},
      })).sort((a,b)=>{
        const ca = catRank(a.cat), cb = catRank(b.cat);
        if(ca !== cb) return ca - cb;
        const oa = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 999999;
        const ob = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 999999;
        if(oa !== ob) return oa - ob;
        return a.id.localeCompare(b.id, 'nb');
      });
      s.members = memberRows.map(r=>r.name);
      s.profilePhotos = Object.fromEntries(
        memberRows.filter(r=>r && r.name && r.profile_photo).map(r=>[r.name, r.profile_photo])
      );
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
// En fangst kan ha manglende GPS i databasen. Da kan Supabase/JS ende opp
// med å tolke tomme verdier som 0,0. 0,0 er ute i Atlanterhavet og skal aldri
// vises som en fangstposisjon i FiskeDex.
export function hasValidGps(c){
  if(!c || c.lat===null || c.lat===undefined || c.lat==='' || c.lng===null || c.lng===undefined || c.lng==='') return false;
  const lat=Number(c.lat), lng=Number(c.lng);
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if(lat===0 && lng===0) return false;
  return lat>=-90 && lat<=90 && lng>=-180 && lng<=180;
}


function numberFromCatch(value){
  const match = String(value||'').replace(',', '.').match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? Number(match[0]) : null;
}

// Største fisk vinner Dex-bildet: vekt først, deretter lengde, så nyeste dato.
export function isBetterCatch(candidate, current){
  if(!candidate) return false;
  if(!current) return true;
  const cw=numberFromCatch(candidate.vekt), ow=numberFromCatch(current.vekt);
  if(cw!=null || ow!=null){
    if(cw!=null && ow==null) return true;
    if(cw==null && ow!=null) return false;
    if(cw!==ow) return cw>ow;
  }
  const cl=numberFromCatch(candidate.lengde), ol=numberFromCatch(current.lengde);
  if(cl!=null || ol!=null){
    if(cl!=null && ol==null) return true;
    if(cl==null && ol!=null) return false;
    if(cl!==ol) return cl>ol;
  }
  const ct=Date.parse(String(candidate.created||candidate.dato||'').replace(/\s/g,'T'))||0;
  const ot=Date.parse(String(current.created||current.dato||'').replace(/\s/g,'T'))||0;
  return ct>ot;
}

export function bestCatch(rows){
  let best=null;
  for(const row of (rows||[])) if(isBetterCatch(row,best)) best=row;
  return best;
}

// Returnerer alle fangster for en art/fisker. Før v28-SQL-en finnes bare
// den gamle oppsummeringen i catches, derfor faller vi pent tilbake til den.
export function catchEntriesFor(s, member){
  const rows = s && s.catchEntries && s.catchEntries[member];
  if(rows && rows.length) return rows;
  const legacy = s && s.catches && s.catches[member];
  return legacy ? [{...legacy, id:legacy.entryId || ('legacy:'+s.id+':'+member), legacy:true}] : [];
}

export function allCatchEntriesForSpecies(s){
  const members = new Set([...(Object.keys((s&&s.catches)||{})), ...(Object.keys((s&&s.catchEntries)||{}))]);
  const rows=[];
  for(const member of members){
    for(const entry of catchEntriesFor(s, member)) rows.push({member, catch:entry});
  }
  return rows;
}

function catchIsSpeciesRecord(s, member){
  const current = s.catches && s.catches[member];
  if(!current) return false;
  const entries = allCatchEntriesForSpecies(s).map(row=>row.catch).filter(Boolean);
  const weight = numberFromCatch(current.vekt);
  const length = numberFromCatch(current.lengde);
  const weights = entries.map(c=>numberFromCatch(c.vekt)).filter(v=>v!=null);
  const lengths = entries.map(c=>numberFromCatch(c.lengde)).filter(v=>v!=null);
  return (weight!=null && weights.length && weight === Math.max(...weights)) ||
         (length!=null && lengths.length && length === Math.max(...lengths));
}

export function visibleSpecies(){
  const filtered = store.species.filter(s=>{
    if(store.filterCat!=='ALL' && s.cat!==store.filterCat) return false;
    const c = isCaught(s);
    if(store.filterCaught===true && !c) return false;
    if(store.filterCaught===false && c) return false;
    const hasPhoto = allCatchEntriesForSpecies(s).some(row=>row.catch && row.catch.hasPhoto);
    if(store.filterPhoto===true && !hasPhoto) return false;
    if(store.filterPhoto===false && hasPhoto) return false;
    if(store.filterMystery && c) return false;
    const scope = store.member ? [store.member] : catchers(s);
    if(store.filterMine){
      if(!store.member || !(s.catches && s.catches[store.member])) return false;
    }
    if(store.filterGps && !scope.some(m=>catchEntriesFor(s,m).some(hasValidGps))) return false;
    if(store.filterRecord && !scope.some(m=>catchIsSpeciesRecord(s,m))) return false;
    if(store.q){
      const q = store.q.toLowerCase();
      const catchText = allCatchEntriesForSpecies(s).map(row=>{ const e=row.catch||{}; return [memberName(row.member),e.sted,e.dato,e.vekt,e.lengde,e.kommentar,e.weather,e.tide].join(' '); }).join(' ').toLowerCase();
      const infoText = [s.info,s.min].join(' ').toLowerCase();
      if(!s.name.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q) && !catchText.includes(q) && !infoText.includes(q)) return false;
    }
    return true;
  });
  const latestTime = s => Math.max(0, ...allCatchEntriesForSpecies(s).map(row=>Date.parse((row.catch.created || row.catch.dato || '').replace(/\s/g,'T')) || 0));
  if(store.sortBy==='name') filtered.sort((a,b)=>a.name.localeCompare(b.name,'nb'));
  if(store.sortBy==='newest') filtered.sort((a,b)=>latestTime(b)-latestTime(a) || a.name.localeCompare(b.name,'nb'));
  if(store.sortBy==='reactions') filtered.sort((a,b)=>{
    const total = x=>allCatchEntriesForSpecies(x).reduce((n,row)=>n+Object.values(row.catch.reactions||{}).reduce((a,v)=>a+(Number(v)||0),0),0);
    return total(b)-total(a) || a.name.localeCompare(b.name,'nb');
  });
  return filtered;
}
export function catOrder(){
  return Object.keys(CATS).sort((a,b)=>CATS[a].order-CATS[b].order);
}
export function canEdit(){
  return store.authed && !store.guest;
}
export function anyModalOpen(){
  return !!(store.detailId || store.addOpen || store.memberOpen || store.catchOpen);
}

export function latestCatch(){
  let best = null;
  for(const s of store.species){
    for(const row of allCatchEntriesForSpecies(s)){
      if(store.member && row.member!==store.member) continue;
      const c=row.catch;
      const t=c.created || c.dato || '';
      const item={species:s, member:row.member, catch:c, t};
      if(!best || item.t > best.t) best=item;
    }
  }
  return best;
}
