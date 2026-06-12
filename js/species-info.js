// Automatisk artsinfo for manuelt lagde arter.
// Først prøver vi appens egen artsliste, deretter norsk Wikipedia via åpent API.
import { SEED, ARTSINFO } from './data.js';

function norm(s){
  return String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

const LOCAL_BY_NAME = new Map(SEED.map(([id,name])=>[norm(name), {id, name}]));

function shortClean(text){
  return String(text||'')
    .replace(/\s+/g,' ')
    .replace(/\s*\([^)]*lytt[^)]*\)/gi,'')
    .trim();
}

export async function fetchAutoSpeciesInfo(name){
  const q = String(name||'').trim();
  if(!q) return null;

  const local = LOCAL_BY_NAME.get(norm(q));
  if(local && ARTSINFO[local.id]){
    const i = ARTSINFO[local.id];
    return {
      info: i.info || '',
      min: i.min || '',
      fredet: !!i.fredet,
      source: 'FiskeDex'
    };
  }

  try{
    // Norsk Wikipedia har CORS-støtte via origin=*. Vi henter bare kort ingress.
    const url = 'https://no.wikipedia.org/w/api.php?action=query&origin=*&format=json&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=' + encodeURIComponent(q);
    const r = await fetch(url);
    if(!r.ok) return null;
    const d = await r.json();
    const pages = d && d.query && d.query.pages ? Object.values(d.query.pages) : [];
    const page = pages.find(p=>p && !p.missing && p.extract);
    if(!page) return null;
    let extract = shortClean(page.extract);
    if(!extract) return null;
    if(extract.length > 420) extract = extract.slice(0, 420).replace(/\s+\S*$/, '') + ' …';
    return {
      info: extract + ' Kilde: norsk Wikipedia. Dobbeltsjekk regler og minstemål før fisken beholdes.',
      min: '',
      fredet: false,
      source: 'Wikipedia'
    };
  }catch(e){
    return null;
  }
}
