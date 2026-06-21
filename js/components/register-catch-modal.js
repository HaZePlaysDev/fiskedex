// Rask fangstregistrering: fisker først, deretter art, bilde og posisjon.
/* global React, htm, L */
import { store, update, useStore, toast, canEdit } from '../store.js';
import { CATS } from '../data.js';
import { KARMOY } from '../config.js';
import * as db from '../db.js';
import { compressImage } from '../utils.js';

const html = htm.bind(React.createElement);
const { useEffect, useRef, useState } = React;

function today(){ return new Date().toISOString().slice(0,10); }

function gpsErrorText(err){
  if(err && err.code===1) return 'GPS ble avvist. Gi nettsiden posisjonstilgang og prøv igjen.';
  if(err && err.code===2) return 'Fant ikke GPS-posisjon akkurat nå.';
  if(err && err.code===3) return 'GPS brukte for lang tid. Prøv igjen ute med bedre signal.';
  return 'Kunne ikke hente GPS-posisjon.';
}

export function RegisterCatchModal(){
  useStore();
  const [fisher, setFisher] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [form, setForm] = useState({dato:today(), sted:'', lengde:'', vekt:'', kommentar:''});
  const [position, setPosition] = useState(null);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const pickMap = useRef(null);
  const pickMarker = useRef(null);
  const picked = useRef(null);

  const open = !!store.catchOpen;
  const selected = store.species.find(s=>s.id===speciesId) || null;
  const existing = selected && fisher ? selected.catches && selected.catches[fisher] : null;

  useEffect(()=>{
    if(!open) return;
    setFisher(store.member || '');
    setSpeciesId('');
    setForm({dato:today(), sted:'', lengde:'', vekt:'', kommentar:''});
    setPosition(null);
    setFile(null);
  }, [open]);

  useEffect(()=>()=>{
    if(pickMap.current){ pickMap.current.remove(); pickMap.current=null; pickMarker.current=null; }
  }, []);

  if(!open) return null;

  const close = ()=>{
    setPickOpen(false);
    if(pickMap.current){ pickMap.current.remove(); pickMap.current=null; pickMarker.current=null; }
    update(s=>{ s.catchOpen = false; });
  };

  function useGps(){
    if(!navigator.geolocation){ toast('GPS støttes ikke i denne nettleseren.'); return; }
    toast('Henter GPS-posisjon …');
    navigator.geolocation.getCurrentPosition(pos=>{
      setPosition({lat:pos.coords.latitude, lng:pos.coords.longitude});
      toast('GPS-posisjon lagt inn.');
    }, err=>toast(gpsErrorText(err)), {enableHighAccuracy:true, timeout:12000, maximumAge:30000});
  }

  function putMarker(latlng, zoom=15){
    picked.current = {lat:latlng.lat, lng:latlng.lng};
    if(!pickMap.current) return;
    const ll = [latlng.lat,latlng.lng];
    pickMap.current.setView(ll, zoom);
    if(pickMarker.current) pickMarker.current.setLatLng(ll);
    else pickMarker.current = L.marker(ll).addTo(pickMap.current);
  }

  function openMap(){
    if(typeof L==='undefined'){ toast('Kartet fikk ikke lastet – sjekk nettet.'); return; }
    setPickOpen(true);
    setTimeout(()=>{
      if(!pickMap.current){
        pickMap.current = L.map('quickMapPick').setView(position ? [position.lat,position.lng] : KARMOY, position ? 14 : 10);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(pickMap.current);
        pickMap.current.on('click', e=>putMarker({lat:e.latlng.lat,lng:e.latlng.lng}));
      } else pickMap.current.invalidateSize();
      picked.current = position ? {...position} : null;
      if(picked.current) putMarker(picked.current, 14);
      setTimeout(()=>pickMap.current && pickMap.current.invalidateSize(), 100);
    }, 50);
  }

  function closeMap(){
    setPickOpen(false);
    if(pickMap.current){ pickMap.current.remove(); pickMap.current=null; pickMarker.current=null; }
  }

  function mapGps(){
    if(!navigator.geolocation){ toast('GPS støttes ikke i denne nettleseren.'); return; }
    toast('Henter GPS-posisjon …');
    navigator.geolocation.getCurrentPosition(pos=>{
      putMarker({lat:pos.coords.latitude,lng:pos.coords.longitude},16);
      toast('GPS-posisjon valgt på kartet.');
    }, err=>toast(gpsErrorText(err)), {enableHighAccuracy:true, timeout:12000, maximumAge:30000});
  }

  function useMapPosition(){
    if(picked.current) setPosition({...picked.current});
    closeMap();
  }

  async function save(){
    if(!canEdit()) { toast('Gjestemodus: du kan ikke registrere fangster.'); return; }
    if(!fisher){ toast('Velg fisker først.'); return; }
    if(!selected){ toast('Velg hvilken art som ble fanget.'); return; }
    if(saving) return;
    setSaving(true);
    try{
      const previous = existing || {};
      let hasPhoto = !!previous.hasPhoto;
      if(file){
        const compressed = await compressImage(file);
        const full = typeof compressed === 'string' ? compressed : compressed.full;
        const thumb = typeof compressed === 'string' ? compressed : (compressed.thumb || compressed.full);
        const savedPhoto = await db.savePhoto(selected.id, fisher, full, thumb);
        if(!savedPhoto) throw new Error('photo');
        hasPhoto = true;
      }
      const entry = {
        dato: form.dato || today(),
        sted: form.sted.trim(),
        lengde: form.lengde.trim(),
        vekt: form.vekt.trim(),
        kommentar: form.kommentar.trim(),
        hasPhoto,
        lat: position ? position.lat : null,
        lng: position ? position.lng : null,
        weather: previous.weather || store.weather.replace(/<[^>]+>/g,''),
        tide: previous.tide || '',
        reactions: previous.reactions || {},
        created: previous.created || new Date().toISOString(),
      };
      const ok = await db.upsertCatch(selected.id, fisher, entry);
      if(!ok) throw new Error('catch');
      update(s=>{
        const target = s.species.find(x=>x.id===selected.id);
        if(target){ target.catches = target.catches || {}; target.catches[fisher] = entry; }
        s.member = fisher;
        s.detailId = selected.id;
        s.catchOpen = false;
      });
      toast(`${selected.name} registrert på ${fisher} 🎉`);
    }catch(err){
      console.error(err);
      toast(err && err.message==='photo' ? 'Bildet kunne ikke lagres.' : 'Kunne ikke lagre fangsten – prøv igjen.');
    }finally{ setSaving(false); }
  }

  return html`<${React.Fragment}>
    <div className="overlay open quick-catch-overlay" onClick=${e=>{ if(e.target===e.currentTarget) close(); }}>
      <div className="modal quick-catch-modal" role="dialog" aria-modal="true" aria-label="Registrer fangst">
        <div className="modal-head">
          <div><div className="eyebrow">Ny fangst</div><h2>Registrer fangst</h2></div>
          <button className="x" aria-label="Lukk" onClick=${close}>×</button>
        </div>
        <div className="modal-body quick-catch-body">
          <div className="quick-catch-step"><span>1</span><div><b>Hvem fanget?</b><small>Dette må velges først, så fangsten havner på riktig person.</small></div></div>
          <div className="field full required-field"><label>Fisker</label>
            <select value=${fisher} onChange=${e=>setFisher(e.target.value)}>
              <option value="">Velg fisker …</option>
              ${store.members.map(m=>html`<option key=${m} value=${m}>${m}</option>`)}
            </select>
          </div>

          <div className="quick-catch-step"><span>2</span><div><b>Hva ble fanget?</b><small>Velg art og legg inn det dere vet om fangsten.</small></div></div>
          <div className="field full required-field"><label>Art</label>
            <select value=${speciesId} onChange=${e=>setSpeciesId(e.target.value)}>
              <option value="">Velg art …</option>
              ${Object.keys(CATS).sort((a,b)=>CATS[a].order-CATS[b].order).map(cat=>html`<optgroup key=${cat} label=${CATS[cat].name}>
                ${store.species.filter(s=>s.cat===cat).map(s=>html`<option key=${s.id} value=${s.id}>${s.name} (${s.id})</option>`)}
              </optgroup>`)}
            </select>
          </div>
          ${existing && html`<div className="quick-catch-warning">ℹ️ ${fisher} har allerede en registrering på ${selected.name}. Når du lagrer, oppdateres den eksisterende registreringen.</div>`}

          <div className="form-grid">
            <div className="field"><label>Dato</label><input type="date" value=${form.dato} onChange=${e=>setForm({...form,dato:e.target.value})}/></div>
            <div className="field"><label>Sted</label><input value=${form.sted} placeholder="f.eks. Skudeneshavn" onChange=${e=>setForm({...form,sted:e.target.value})}/></div>
            <div className="field"><label>Lengde</label><input value=${form.lengde} placeholder="f.eks. 48 cm" onChange=${e=>setForm({...form,lengde:e.target.value})}/></div>
            <div className="field"><label>Vekt</label><input value=${form.vekt} placeholder="f.eks. 1,2 kg" onChange=${e=>setForm({...form,vekt:e.target.value})}/></div>
            <div className="field full"><label>Kommentar</label><textarea value=${form.kommentar} placeholder="Hvordan var fangsten?" onChange=${e=>setForm({...form,kommentar:e.target.value})}></textarea></div>
          </div>

          <div className="quick-catch-extras">
            <label className="btn ghost quick-file" htmlFor="quickCatchPhoto">📷 ${file ? file.name : 'Legg til bilde'}</label>
            <input id="quickCatchPhoto" className="vh" type="file" accept="image/*" onChange=${e=>setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}/>
            <button className="btn ghost" onClick=${useGps}>📡 Bruk GPS</button>
            <button className="btn ghost" onClick=${openMap}>🗺️ Velg på kart</button>
          </div>
          ${position && html`<div className="gps-ok">📍 Posisjon er valgt (${Number(position.lat).toFixed(5)}, ${Number(position.lng).toFixed(5)})</div>`}

          <div className="modal-actions quick-catch-actions">
            <button className="btn ghost" onClick=${close}>Avbryt</button>
            <button className="btn primary" disabled=${saving} onClick=${save}>${saving ? 'Lagrer …' : '🎣 Registrer fangst'}</button>
          </div>
        </div>
      </div>
    </div>
    ${pickOpen && html`<div className="overlay open map-picker-overlay" onClick=${e=>{if(e.target===e.currentTarget) closeMap();}}>
      <div className="modal map-picker-modal">
        <div className="modal-head"><h2 style=${{fontSize:'24px'}}>Velg fangststed</h2><button className="x" aria-label="Lukk" onClick=${closeMap}>×</button></div>
        <div className="modal-body map-picker-body">
          <div id="quickMapPick" className="map-pick-box"></div>
          <p style=${{fontSize:'12.5px',color:'var(--blek)',marginTop:'8px'}}>Trykk på kartet der fangsten ble tatt, eller bruk GPS.</p>
          <div className="modal-actions"><button className="btn ghost" onClick=${mapGps}>📡 Bruk min GPS-posisjon</button><button className="btn primary" onClick=${useMapPosition}>Bruk denne posisjonen</button><button className="btn ghost" onClick=${closeMap}>Avbryt</button></div>
        </div>
      </div>
    </div>`}
  <//>`;
}
