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
    sb.from('species').select('*').order('id'),
    sb.from('members').select('name').order('name'),
    sb.from('catches').select('*'),
  ]);
  if(sp.error || me.error || ca.error) throw (sp.error || me.error || ca.error);
  return { speciesRows: sp.data, memberRows: me.data, catchRows: ca.data };
}
export async function seedSpecies(rows){
  const r = await sb.from('species').insert(rows).select();
  if(r.error) throw r.error;
  return r.data;
}

/* ---------- skriving ---------- */
export async function upsertCatch(id, mem, e){
  const r = await sb.from('catches').upsert({
    species_id:id, member:mem, dato:e.dato||'', sted:e.sted||'',
    lengde:e.lengde||'', vekt:e.vekt||'', kommentar:e.kommentar||'',
    has_photo:!!e.hasPhoto, lat:(e.lat!=null?e.lat:null), lng:(e.lng!=null?e.lng:null),
  });
  return !r.error;
}
export async function removeCatch(id, mem){
  await sb.from('photos').delete().match({species_id:id, member:mem});
  const r = await sb.from('catches').delete().match({species_id:id, member:mem});
  photoCache.delete(id+':'+mem);
  return !r.error;
}
export async function addSpeciesRow(id, name, cat){
  const r = await sb.from('species').insert({id, name, cat, custom:true});
  return !r.error;
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
  return !r.error;
}
export async function updateSil(id, sil){
  const r = await sb.from('species').update({sil}).eq('id', id);
  return !r.error;
}

/* ---------- bilder (base64 i photos-tabellen, cachet lokalt) ---------- */
const photoCache = new Map();
export async function loadPhoto(id, mem){
  const key = id+':'+mem;
  if(photoCache.has(key)) return photoCache.get(key);
  const r = await sb.from('photos').select('data').match({species_id:id, member:mem}).maybeSingle();
  const url = (r.data && r.data.data) ? r.data.data : null;
  photoCache.set(key, url);
  return url;
}
export async function savePhoto(id, mem, dataUrl){
  const r = await sb.from('photos').upsert({species_id:id, member:mem, data:dataUrl});
  if(!r.error) photoCache.set(id+':'+mem, dataUrl);
  return !r.error;
}
export async function fetchAllPhotos(){
  const r = await sb.from('photos').select('*');
  return r.error ? null : r.data;
}

/* ---------- sanntid ---------- */
export function subscribeRealtime(onChange){
  try{
    sb.channel('dex-endringer')
      .on('postgres_changes',{event:'*',schema:'public',table:'catches'},onChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'species'},onChange)
      .on('postgres_changes',{event:'*',schema:'public',table:'members'},onChange)
      .subscribe();
  }catch(e){ console.warn('realtime utilgjengelig', e); }
}
