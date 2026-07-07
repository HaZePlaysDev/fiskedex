// Datalag: all kommunikasjon med Supabase samlet på ett sted
/* global supabase */
import { SUPABASE_URL, SUPABASE_KEY, GROUP_EMAIL } from './config.js';

export const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// Tom GPS blir noen ganger tolket som 0,0. Ikke lagre det som en ekte fangstposisjon.
function cleanPosition(lat, lng){
  if(lat===null || lat===undefined || lat==='' || lng===null || lng===undefined || lng==='') return {lat:null,lng:null};
  const latitude=Number(lat), longitude=Number(lng);
  if(!Number.isFinite(latitude) || !Number.isFinite(longitude)) return {lat:null,lng:null};
  if(latitude===0 && longitude===0) return {lat:null,lng:null};
  if(latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return {lat:null,lng:null};
  return {lat:latitude,lng:longitude};
}

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
  // profile_photo kom til i v22. Fall tilbake til gamle medlemmer-tabeller
  // dersom SQL-en ikke er kjørt ennå, slik at appen fortsatt åpner normalt.
  const [sp, ca] = await Promise.all([
    sb.from('species').select('*'),
    sb.from('catches').select('*'),
  ]);
  // v28: hver fisk kan ha flere fangster. Tabellen er valgfri helt til
  // migreringen er kjørt, slik at gamle installasjoner fortsatt åpner.
  let ce = await sb.from('catch_entries').select('*').order('created_at', {ascending:false});
  if(ce.error && /(catch_entries|does not exist|schema cache|PGRST205)/i.test(String(ce.error.message||''))){
    ce = { data: [] };
  }
  let me = await sb.from('members').select('name,profile_photo').order('name');
  if(me.error && /profile_photo/i.test(String(me.error.message||''))){
    me = await sb.from('members').select('name').order('name');
  }
  if(sp.error || me.error || ca.error || ce.error) throw (sp.error || me.error || ca.error || ce.error);

  // Hent småbilder samtidig med resten. Dette gjør at artskortene får bilder med en gang
  // når siden åpnes, i stedet for at hvert kort må vente på eget Supabase-kall.
  let ph = await sb.from('photos').select('species_id,member,thumb,data');
  if(ph.error && /thumb/i.test(String(ph.error.message||''))){
    ph = await sb.from('photos').select('species_id,member,data');
  }
  if(ph.error) ph = { data: [] };

  return { speciesRows: sp.data, memberRows: me.data, catchRows: ca.data, catchEntryRows: ce.data || [], photoRows: ph.data || [] };
}
export async function seedSpecies(rows){
  const r = await sb.from('species').insert(rows).select();
  if(r.error) throw r.error;
  return r.data;
}

/* ---------- skriving ---------- */
export async function upsertCatch(id, mem, e){
  const position = cleanPosition(e.lat, e.lng);
  const row = {
    species_id:id, member:mem, dato:e.dato||'', sted:e.sted||'',
    lengde:e.lengde||'', vekt:e.vekt||'', kommentar:e.kommentar||'',
    has_photo:!!e.hasPhoto, lat:position.lat, lng:position.lng,
    weather_summary:e.weather||'', tide_summary:e.tide||'', reactions:e.reactions||{},
  };
  let r = await sb.from('catches').upsert(row);
  if(r.error && /weather_summary|tide_summary|reactions/i.test(String(r.error.message||''))){
    const {weather_summary, tide_summary, reactions, ...oldRow} = row;
    r = await sb.from('catches').upsert(oldRow);
  }
  return !r.error;
}

// v28: En fangstlogg-rad per faktisk fangst. Den gamle catches-tabellen beholdes
// som en rask oppsummering/beste fangst for Dex-kort, statistikk og bakoverkompatibilitet.
export async function addCatchEntry(id, mem, e, photo={}){
  const position = cleanPosition(e.lat, e.lng);
  const row = {
    species_id:id, member:mem,
    dato:e.dato||'', sted:e.sted||'', lengde:e.lengde||'', vekt:e.vekt||'',
    kommentar:e.kommentar||'', has_photo:!!e.hasPhoto,
    lat:position.lat, lng:position.lng,
    weather_summary:e.weather||'', tide_summary:e.tide||'', reactions:e.reactions||{},
    photo_data:photo.full || null, photo_thumb:photo.thumb || photo.full || null,
  };
  const r = await sb.from('catch_entries').insert(row).select().single();
  return r.error ? {ok:false, error:r.error, data:null} : {ok:true, error:null, data:r.data};
}

export async function updateCatchEntry(entryId, e){
  const position = cleanPosition(e.lat, e.lng);
  const row = {
    dato:e.dato||'', sted:e.sted||'', lengde:e.lengde||'', vekt:e.vekt||'',
    kommentar:e.kommentar||'', has_photo:!!e.hasPhoto,
    lat:position.lat, lng:position.lng,
    weather_summary:e.weather||'', tide_summary:e.tide||'', reactions:e.reactions||{},
  };
  const r = await sb.from('catch_entries').update(row).eq('id',entryId).select().single();
  return r.error ? {ok:false, error:r.error, data:null} : {ok:true, error:null, data:r.data};
}

export async function deleteCatchEntry(entryId){
  const r = await sb.from('catch_entries').delete().eq('id',entryId);
  return !r.error;
}

export async function removeCatch(id, mem){
  await sb.from('photos').delete().match({species_id:id, member:mem});
  await sb.from('catch_gallery').delete().match({species_id:id, member:mem});
  await sb.from('catch_entries').delete().match({species_id:id, member:mem});
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
  await sb.from('catch_entries').delete().eq('species_id', id);
  await sb.from('catches').delete().eq('species_id', id);
  const r = await sb.from('species').delete().eq('id', id);
  return !r.error;
}
export async function addMemberRow(name){
  const r = await sb.from('members').upsert({name});
  return !r.error;
}

// Profilbilder lagres komprimert i members-tabellen. Bildet er med vilje lite
// (miniutgaven fra compressImage), så det går raskt å laste på mobil.
export async function saveMemberProfilePhoto(name, dataUrl){
  const r = await sb.from('members').update({profile_photo:dataUrl}).eq('name', name);
  return { ok: !r.error, error: r.error || null };
}
export async function deleteMemberProfilePhoto(name){
  const r = await sb.from('members').update({profile_photo:null}).eq('name', name);
  return { ok: !r.error, error: r.error || null };
}
export async function removeMemberRows(name){
  await sb.from('photos').delete().eq('member', name);
  await sb.from('catch_entries').delete().eq('member', name);
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
      .on('postgres_changes',{event:'*',schema:'public',table:'catch_entries'},onChange)
      .subscribe();
  }catch(e){ console.warn('realtime utilgjengelig', e); }
}
