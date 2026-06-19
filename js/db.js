// Datalag: all kommunikasjon med Supabase samlet på ett sted
/* global supabase */
import { SUPABASE_URL, SUPABASE_KEY, GROUP_EMAIL } from './config.js';

export const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- innlogging ---------- */
export async function hasSession(){
  try{
    const { data } = await sb.auth.getSession();
    return !!(data && data.session);
  }catch(e){ return false; }
}
export async function login(password){
  const { error } = await sb.auth.signInWithPassword({ email: GROUP_EMAIL, password });
  return !error;
}
export async function logout(){ await sb.auth.signOut(); }

/* ---------- lesing ---------- */
export async function fetchAll(){
  const [sp, me, ca] = await Promise.all([
    sb.from('species').select('*'),
    sb.from('members').select('name').order('name'),
    sb.from('catches').select('*'),
  ]);
  if(sp.error || me.error || ca.error) throw (sp.error || me.error || ca.error);

  // Hent småbilder samtidig med resten. Dette gjør at artskortene får bilder med en gang
  // når siden åpnes, i stedet for at hvert kort må vente på eget Supabase-kall.
  let ph = await sb.from('photos').select('species_id,member,thumb,data');
  if(ph.error && /thumb/i.test(String(ph.error.message||''))){
    ph = await sb.from('photos').select('species_id,member,data');
  }
  if(ph.error) ph = { data: [] };

  return { speciesRows: sp.data, memberRows: me.data, catchRows: ca.data, photoRows: ph.data || [] };
}
export async function seedSpecies(rows){
  const r = await sb.from('species').insert(rows).select();
  if(r.error) throw r.error;
  return r.data;
}

/* ---------- skriving ---------- */
export async function upsertCatch(id, mem, e){
  const row = {
    species_id:id, member:mem, dato:e.dato||'', sted:e.sted||'',
    lengde:e.lengde||'', vekt:e.vekt||'', kommentar:e.kommentar||'',
    has_photo:!!e.hasPhoto, lat:(e.lat!=null?e.lat:null), lng:(e.lng!=null?e.lng:null),
    weather_summary:e.weather||'', tide_summary:e.tide||'', reactions:e.reactions||{},
  };
  let r = await sb.from('catches').upsert(row);
  if(r.error && /weather_summary|tide_summary|reactions/i.test(String(r.error.message||''))){
    const {weather_summary, tide_summary, reactions, ...oldRow} = row;
    r = await sb.from('catches').upsert(oldRow);
  }
  return !r.error;
}
export async function removeCatch(id, mem){
  await sb.from('photos').delete().match({species_id:id, member:mem});
  await sb.from('catch_gallery').delete().match({species_id:id, member:mem});
  const r = await sb.from('catches').delete().match({species_id:id, member:mem});
  photoCache.delete(id+':'+mem); thumbCache.delete(id+':'+mem);
  return !r.error;
}
export async function addSpeciesRow(id, name, cat, details={}){
  const row = {
    id, name, cat, custom:true,
    info:(details.info||'').trim(),
    min:(details.min||'').trim(),
    fredet:!!details.fredet,
  };
  let r = await sb.from('species').insert(row);
  // Hvis databasen ikke har fått artsinfo-kolonnene ennå, legg arten til uten ekstra felter.
  // Kjør SQL-filen i pakken for å aktivere lagring av artsinfo.
  if(r.error && /info|min|fredet/i.test(String(r.error.message||''))){
    r = await sb.from('species').insert({id, name, cat, custom:true});
  }
  return !r.error;
}
export async function updateSpeciesInfo(id, details={}){
  const r = await sb.from('species').update({
    info:(details.info||'').trim(),
    min:(details.min||'').trim(),
    fredet:!!details.fredet,
  }).eq('id', id);
  return !r.error;
}

export async function updateSpeciesOrder(rows){
  // rows = [{id, sort_order}]. Oppdateres en og en for å være lett å feilsøke.
  for(const row of rows){
    const r = await sb.from('species').update({sort_order: row.sort_order}).eq('id', row.id);
    if(r.error) return {ok:false, error:r.error};
  }
  return {ok:true};
}
export async function deleteSpeciesRow(id){
  await sb.from('photos').delete().eq('species_id', id);
  await sb.from('catches').delete().eq('species_id', id);
  const r = await sb.from('species').delete().eq('id', id);
  return !r.error;
}
export async function addMemberRow(name){
  const r = await sb.from('members').upsert({name});
  return !r.error;
}
export async function removeMemberRows(name){
  await sb.from('photos').delete().eq('member', name);
  await sb.from('catches').delete().eq('member', name);
  const r = await sb.from('members').delete().eq('name', name);
  for(const k of [...photoCache.keys()]) if(k.endsWith(':'+name)) photoCache.delete(k);
  for(const k of [...thumbCache.keys()]) if(k.endsWith(':'+name)) thumbCache.delete(k);
  return !r.error;
}
export async function updateSil(id, sil){
  const r = await sb.from('species').update({sil}).eq('id', id);
  return !r.error;
}

/* ---------- bilder (base64 i photos-tabellen, cachet lokalt) ---------- */
const photoCache = new Map();
const thumbCache = new Map();

export function primePhotoCache(rows){
  for(const row of rows || []){
    if(!row || !row.species_id || !row.member) continue;
    const key = row.species_id + ':' + row.member;
    if(row.data) photoCache.set(key, row.data);
    if(row.thumb || row.data) thumbCache.set(key, row.thumb || row.data);
  }
}

export function cachedPhotoThumb(id, mem){
  const key = id + ':' + mem;
  return thumbCache.has(key) ? thumbCache.get(key) : undefined;
}

export async function loadPhoto(id, mem){
  const key = id+':'+mem;
  if(photoCache.has(key)) return photoCache.get(key);
  const r = await sb.from('photos').select('data').match({species_id:id, member:mem}).maybeSingle();
  const url = (r.data && r.data.data) ? r.data.data : null;
  photoCache.set(key, url);
  return url;
}

export async function loadPhotoThumb(id, mem){
  const key = id+':'+mem;
  if(thumbCache.has(key)) return thumbCache.get(key);
  let r = await sb.from('photos').select('thumb,data').match({species_id:id, member:mem}).maybeSingle();
  // Hvis SQL-en for thumb-kolonnen ikke er kjørt ennå, fall tilbake til gamle data-kolonnen.
  if(r.error && /thumb/i.test(String(r.error.message||''))){
    r = await sb.from('photos').select('data').match({species_id:id, member:mem}).maybeSingle();
  }
  const url = (r.data && (r.data.thumb || r.data.data)) ? (r.data.thumb || r.data.data) : null;
  thumbCache.set(key, url);
  return url;
}

export async function deletePhoto(id, mem){
  const r = await sb.from('photos').delete().match({species_id:id, member:mem});
  if(!r.error){ photoCache.delete(id+':'+mem); thumbCache.delete(id+':'+mem); }
  return !r.error;
}

export async function savePhoto(id, mem, dataUrl, thumbUrl){
  const row = {species_id:id, member:mem, data:dataUrl, thumb:thumbUrl || dataUrl};
  let r = await sb.from('photos').upsert(row);
  // Bakoverkompatibel hvis databasen mangler thumb-kolonnen.
  if(r.error && /thumb/i.test(String(r.error.message||''))){
    r = await sb.from('photos').upsert({species_id:id, member:mem, data:dataUrl});
  }
  if(!r.error){
    photoCache.set(id+':'+mem, dataUrl);
    thumbCache.set(id+':'+mem, thumbUrl || dataUrl);
  }
  return !r.error;
}

export async function fetchAllPhotos(){
  const r = await sb.from('photos').select('*');
  return r.error ? null : r.data;
}

export async function fetchGallery(id, mem){
  const r = await sb.from('catch_gallery').select('*').match({species_id:id, member:mem}).order('created_at');
  return r.error ? [] : (r.data || []);
}
export async function addGalleryPhoto(id, mem, dataUrl, thumbUrl){
  const r = await sb.from('catch_gallery').insert({species_id:id, member:mem, data:dataUrl, thumb:thumbUrl || dataUrl}).select().single();
  return r.error ? null : r.data;
}
export async function deleteGalleryPhoto(rowId){
  const r = await sb.from('catch_gallery').delete().eq('id', rowId);
  return !r.error;
}

export async function saveReactions(id, mem, reactions){
  const r = await sb.from('catches').update({reactions:reactions||{}}).match({species_id:id, member:mem});
  return !r.error;
}

export async function savePhotoThumb(id, mem, thumbUrl){
  const r = await sb.from('photos').update({thumb:thumbUrl}).match({species_id:id, member:mem});
  if(!r.error) thumbCache.set(id+':'+mem, thumbUrl);
  return !r.error;
}

/* ---------- sanntid ---------- */
export function subscribeRealtime(onChange){
  try{
    sb.channel('dex-endringer')
      .on('postgres_changes',{event:'*',schema:'public',table:'catches'},onChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'species'},onChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'members'},onChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'catch_gallery'},onChange)
      .subscribe();
  }catch(e){ console.warn('realtime utilgjengelig', e); }
}
