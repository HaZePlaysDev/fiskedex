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

function cleanText(text){
  return String(text||'')
    .replace(/\s*\([^)]*lytt[^)]*\)/gi,'')
    .replace(/\[[^\]]*\]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}

function splitSentences(text){
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map(s=>s.trim())
    .filter(Boolean);
}

function shortenInfo(text){
  const sentences = splitSentences(text);
  if(!sentences.length) return '';

  const useful = sentences.filter(s=>/(kjennetegn|farge|rygg|buk|finn|hal|munn|skjegg|flekk|stripe|prikk|lang|stor|kan bli|blir|vokser|vekt|cm|meter|kg)/i.test(s));
  let picked = (useful.length ? useful : sentences).slice(0, 2).join(' ');

  // Hold teksten veldig kort: helst kjennetegn + størrelse, ikke lang Wikipedia-tekst.
  if(picked.length > 170) picked = picked.slice(0, 170).replace(/\s+\S*$/, '') + ' …';
  return picked;
}

export async function fetchAutoSpeciesInfo(name){
  const q = String(name||'').trim();
  if(!q) return null;

  const local = LOCAL_BY_NAME.get(norm(q));
  if(local && ARTSINFO[local.id]){
    const i = ARTSINFO[local.id];
    return {
      info: shortenInfo(i.info || ''),
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
    const info = shortenInfo(page.extract);
    if(!info) return null;
    return {
      info,
      // Minstemål/regler er ikke trygt å gjette fra Wikipedia. Legges bare inn automatisk når appen allerede kjenner regelen.
      min: '',
      fredet: false,
      source: 'Wikipedia'
    };
  }catch(e){
    return null;
  }
}
