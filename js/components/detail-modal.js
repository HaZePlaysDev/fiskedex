// Artskortet: fangstregistrering per fisker, bilder, galleri, silhuett og posisjon
/* global React, htm, L */
import { store, update, useStore, sp, toast, catchers, memberName, canEdit } from '../store.js';
import { ARTSINFO } from '../data.js';
import { fetchAutoSpeciesInfo } from '../species-info.js';
import { FELLES, KARMOY } from '../config.js';
import * as db from '../db.js';
import { compressImage, traceSilhouette } from '../utils.js';

const html = htm.bind(React.createElement);
const { useState, useEffect, useRef } = React;

const smallBtn = { fontSize:'13px', padding:'8px 14px' };

export function DetailModal(){
  useStore();
  const id = store.detailId;
  const s = id ? sp(id) : null;
  const editable = canEdit();

  const [fisher, setFisher] = useState(FELLES);
  const [caught, setCaught] = useState(false);
  const [form, setForm] = useState({dato:'',sted:'',lengde:'',vekt:'',kommentar:''});
  const [curPos, setCurPos] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [gallery, setGallery] = useState([]);
  const [galleryRows, setGalleryRows] = useState([]);
  const [photoDelArmed, setPhotoDelArmed] = useState(false);
  const [saveMsg, setSaveMsg] = useState(false);
  const [infoSaveMsg, setInfoSaveMsg] = useState(false);
  const [delArmed, setDelArmed] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [infoForm, setInfoForm] = useState({info:'', min:'', fredet:false});
  const [autoInfoLoading, setAutoInfoLoading] = useState(false);
  const armTimer = useRef(null);
  const fisherRef = useRef(fisher); fisherRef.current = fisher;

  const entry = ()=> (s && s.catches && s.catches[fisher]) || null;

  // når kortet åpnes: velg valgt fisker, eller første ekte fisker som har fanget arten.
  // Felles er bare historikk/visning, ikke et sted man skal registrere nye fangster.
  useEffect(()=>{
    if(!id || !s) return;
    const who = catchers(s);
    const realCatchers = who.filter(m=>m!==FELLES);
    const best = store.member && store.member!==FELLES && (s.catches||{})[store.member]
      ? store.member
      : (realCatchers[0] || store.members[0] || (who.includes(FELLES) ? FELLES : ''));
    setFisher(best);
    setInfoForm({info:s.info||'', min:s.min||'', fredet:!!s.fredet});
  }, [id]);

  // last skjema når art eller fisker endres
  useEffect(()=>{
    if(!id || !s) return;
    setDelArmed(false); setResetArmed(false); setSaveMsg(false);
    const c = entry();
    setCaught(!!c);
    setForm({
      dato: c?c.dato:'', sted: c?c.sted:'', lengde: c?c.lengde:'',
      vekt: c?c.vekt:'', kommentar: c?c.kommentar:'',
    });
    setCurPos((c && c.lat!=null && c.lng!=null) ? {lat:c.lat, lng:c.lng} : null);
    setPhotoUrl(undefined);

    const m = fisher;
    if(c && m){
      // Prøv alltid å hente bildet. Gamle data kan ha bilde selv om hasPhoto-flagget er feil.
      db.loadPhoto(id, m).then(u=>{
        if(store.detailId===id && fisherRef.current===m){
          setPhotoUrl(u || null);
          if(u && s.catches && s.catches[m] && !s.catches[m].hasPhoto){
            update(()=>{ s.catches[m].hasPhoto = true; });
          }
        }
      });
    } else {
      setPhotoUrl(null);
    }

    setGallery([]);
    setGalleryRows([]);
    if(c && m){ db.fetchGallery(id, m).then(rows=>{ if(store.detailId===id && fisherRef.current===m) setGalleryRows(rows); }); }
    const allCatchers = catchers(s);
    if(allCatchers.length>1){
      allCatchers.forEach(async m2=>{
        const u = await db.loadPhoto(id, m2);
        if(u && store.detailId===id) setGallery(g=>[...g.filter(x=>x.m!==m2), {m:m2, url:u}]);
      });
    }
  }, [id, fisher]);

  if(!s) return null;

  const baseInfo = ARTSINFO[s.id] || null;
  const ownInfo = (s.info || s.min || s.fredet) ? {info:s.info, min:s.min, fredet:!!s.fredet} : null;
  const info = ownInfo ? {...(baseInfo||{}), ...ownInfo, fredet:!!(ownInfo.fredet || (baseInfo && baseInfo.fredet))} : baseInfo;
  const canEditInfo = editable && s.custom;
  const close = ()=>update(st=>{ st.detailId = null; });

  function readonlyToast(){ toast('Gjestemodus: du kan bare se, ikke endre.'); }
  function validFisherForEdit(){
    if(!fisher){ toast('Legg til eller velg en fisker først.'); return false; }
    if(fisher===FELLES){ toast('«Felles» er bare gammel visning. Du kan slette gamle fellesfangster, men ikke redigere eller lage nye.'); return false; }
    return true;
  }
  const canWriteThisCatch = editable && fisher && fisher!==FELLES;

  function toggleCaught(){
    if(!editable){ readonlyToast(); return; }
    if(!validFisherForEdit()) return;
    setCaught(c=>{
      const on = !c;
      if(on && !form.dato) setForm(f=>({...f, dato:new Date().toISOString().slice(0,10)}));
      return on;
    });
  }

  async function save(){
    if(!editable){ readonlyToast(); return; }
    if(!validFisherForEdit()) return;
    const mem = fisher;
    let ok;
    if(caught){
      const prev = (s.catches && s.catches[mem]) || {};
      const e = {
        dato:form.dato, sted:form.sted.trim(), lengde:form.lengde.trim(),
        vekt:form.vekt.trim(), kommentar:form.kommentar.trim(),
        hasPhoto:!!prev.hasPhoto, created:prev.created||'',
        lat:(curPos?curPos.lat:null), lng:(curPos?curPos.lng:null),
        weather:prev.weather || store.weather.replace(/<[^>]+>/g,''), tide:prev.tide || '', reactions:prev.reactions || {},
      };
      update(()=>{ s.catches = s.catches||{}; s.catches[mem] = e; });
      ok = await db.upsertCatch(s.id, mem, e);
    } else {
      update(()=>{ if(s.catches) delete s.catches[mem]; });
      ok = await db.removeCatch(s.id, mem);
    }
    if(ok){ setSaveMsg(true); setTimeout(()=>setSaveMsg(false), 1800); }
    else toast('Kunne ikke lagre \u2013 prøv igjen');
  }

  async function saveInfo(){
    if(!canEditInfo) return;
    const details = {info:infoForm.info, min:infoForm.min, fredet:infoForm.fredet};
    const ok = await db.updateSpeciesInfo(s.id, details);
    if(ok){
      update(()=>{ s.info = details.info.trim(); s.min = details.min.trim(); s.fredet = !!details.fredet; });
      setInfoSaveMsg(true); setTimeout(()=>setInfoSaveMsg(false), 1800);
    } else toast('Kunne ikke lagre artsinfo. Har du kjørt SQL-filen for nye kolonner?');
  }

  async function autofillInfo(){
    if(!canEditInfo) return;
    setAutoInfoLoading(true);
    const found = await fetchAutoSpeciesInfo(s.name);
    setAutoInfoLoading(false);
    if(!found){ toast('Fant ikke automatisk artsinfo. Skriv inn manuelt.'); return; }
    setInfoForm(f=>({
      info: f.info.trim() ? f.info : (found.info || ''),
      min: f.min.trim() ? f.min : (found.min || ''),
      fredet: !!(f.fredet || found.fredet),
    }));
    toast('Artsinfo hentet automatisk');
  }

  async function onPhoto(ev){
    if(!editable){ ev.target.value=''; readonlyToast(); return; }
    if(!validFisherForEdit()){ ev.target.value=''; return; }
    const f = ev.target.files[0]; ev.target.value=''; if(!f) return;
    const mem = fisher;
    try{
      const img = await compressImage(f);
      const url = typeof img === 'string' ? img : img.full;
      const thumb = typeof img === 'string' ? img : (img.thumb || img.full);
      if(!(await db.savePhoto(s.id, mem, url, thumb))){ toast('Bildet kunne ikke lagres'); return; }
      update(()=>{
        s.catches = s.catches || {};
        if(!s.catches[mem]){
          s.catches[mem] = {dato:new Date().toISOString().slice(0,10),sted:'',lengde:'',vekt:'',kommentar:'',hasPhoto:true,lat:null,lng:null,created:''};
        } else s.catches[mem].hasPhoto = true;
      });
      await db.upsertCatch(s.id, mem, s.catches[mem]);
      setCaught(true);
      setPhotoUrl(url);
      if(!form.dato) setForm(fm=>({...fm, dato:s.catches[mem].dato}));
    }catch(err){
      toast(err && err.message==='decode'
        ? 'Bildeformatet støttes ikke \u2013 prøv JPG eller PNG'
        : 'Kunne ikke lese bildet \u2013 prøv et annet');
    }
  }


  async function deleteMainPhoto(){
    if(!editable){ readonlyToast(); return; }
    if(!validFisherForEdit()) return;
    if(!photoDelArmed){ setPhotoDelArmed(true); setTimeout(()=>setPhotoDelArmed(false), 4000); return; }
    setPhotoDelArmed(false);
    const ok = await db.deletePhoto(s.id, fisher);
    if(ok){
      update(()=>{ if(s.catches && s.catches[fisher]) s.catches[fisher].hasPhoto = false; });
      setPhotoUrl(null);
      await db.upsertCatch(s.id, fisher, {...(s.catches[fisher]||{}), hasPhoto:false});
      toast('Bildet ble slettet');
    } else toast('Kunne ikke slette bildet');
  }

  async function onGalleryPhoto(ev){
    if(!editable){ ev.target.value=''; readonlyToast(); return; }
    if(!validFisherForEdit()){ ev.target.value=''; return; }
    const f = ev.target.files[0]; ev.target.value=''; if(!f) return;
    try{
      const img = await compressImage(f);
      const row = await db.addGalleryPhoto(s.id, fisher, img.full, img.thumb);
      if(row){ setGalleryRows(rows=>[...rows,row]); toast('Ekstra bilde lagt til'); }
      else toast('Kunne ikke lagre ekstra bilde. Kjør nyeste SQL først.');
    }catch(e){ toast('Kunne ikke lese bildet'); }
  }

  async function delGallery(rowId){
    if(!editable){ readonlyToast(); return; }
    if(await db.deleteGalleryPhoto(rowId)){ setGalleryRows(rows=>rows.filter(r=>r.id!==rowId)); toast('Ekstra bilde slettet'); }
  }

  async function react(emoji){
    if(!entry()) return;
    const reactions = {...(entry().reactions||{})};
    reactions[emoji] = (reactions[emoji]||0) + 1;
    update(()=>{ s.catches[fisher].reactions = reactions; });
    await db.saveReactions(s.id, fisher, reactions);
  }

  async function onSil(ev){
    if(!editable){ ev.target.value=''; readonlyToast(); return; }
    const f = ev.target.files[0]; ev.target.value=''; if(!f) return;
    toast('Lager silhuett …');
    try{
      const sil = await traceSilhouette(f);
      update(()=>{ s.sil = sil; });
      await db.updateSil(s.id, sil);
      toast('Silhuett laget!');
    }catch(e){
      toast('Klarte ikke skille motivet fra bakgrunnen \u2013 prøv et bilde med renere bakgrunn');
    }
  }

  function arm(setter){
    setter(true);
    clearTimeout(armTimer.current);
    armTimer.current = setTimeout(()=>setter(false), 4000);
  }
  async function resetCatch(){
    if(!editable){ readonlyToast(); return; }
    if(!entry()) return;
    if(!resetArmed){ arm(setResetArmed); return; }
    setResetArmed(false);
    const mem = fisher;
    update(()=>{ delete s.catches[mem]; });
    await db.removeCatch(s.id, mem);
    setCaught(false);
    setForm({dato:'',sted:'',lengde:'',vekt:'',kommentar:''});
    setCurPos(null); setPhotoUrl(null);
    toast('Fangsten ble slettet \u2013 arten ligger fortsatt i dexen');
  }
  async function delSpecies(){
    if(!editable){ readonlyToast(); return; }
    if(!delArmed){ arm(setDelArmed); return; }
    setDelArmed(false);
    update(st=>{ st.species = st.species.filter(x=>x.id!==s.id); st.detailId = null; });
    await db.deleteSpeciesRow(s.id);
    toast('Arten ble slettet');
  }

  /* ---- posisjonsvelger (Leaflet, initieres ved første åpning) ---- */
  const pickMap = useRef(null);
  const pickMarker = useRef(null);
  const pickLatLng = useRef(null);
  function openPick(){
    if(!editable){ readonlyToast(); return; }
    if(!validFisherForEdit()) return;
    if(typeof L==='undefined'){ toast('Kartet fikk ikke lastet \u2013 sjekk nettet'); return; }
    setPickOpen(true);
    setTimeout(()=>{
      if(!pickMap.current){
        pickMap.current = L.map('mapPick').setView(curPos?[curPos.lat,curPos.lng]:KARMOY, curPos?13:10);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'\u00a9 OpenStreetMap'}).addTo(pickMap.current);
        pickMap.current.on('click', e=>{
          pickLatLng.current = {lat:e.latlng.lat, lng:e.latlng.lng};
          if(pickMarker.current) pickMarker.current.setLatLng(e.latlng);
          else pickMarker.current = L.marker(e.latlng).addTo(pickMap.current);
        });
      } else {
        pickMap.current.invalidateSize();
        if(curPos) pickMap.current.setView([curPos.lat,curPos.lng],13);
      }
      pickLatLng.current = curPos ? {...curPos} : null;
      if(pickLatLng.current){
        if(pickMarker.current) pickMarker.current.setLatLng(pickLatLng.current);
        else pickMarker.current = L.marker(pickLatLng.current).addTo(pickMap.current);
      }
    }, 80);
  }
  function savePick(){
    if(pickLatLng.current) setCurPos(pickLatLng.current);
    setPickOpen(false);
  }
  // rydd opp Leaflet-instansen når kortet lukkes (elementet forsvinner fra DOM)
  useEffect(()=>()=>{
    if(pickMap.current){ pickMap.current.remove(); pickMap.current=null; pickMarker.current=null; }
  }, [id]);

  const realOptions = [...store.members, ...catchers(s).filter(m=>m!==FELLES)];
  const fisherOptions = [...new Set([...realOptions, ...(s.catches && s.catches[FELLES] ? [FELLES] : [])])];

  return html`
  <div className="overlay open" onClick=${e=>{ if(e.target===e.currentTarget) close(); }}>
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-head">
        <div>
          <div className="eyebrow">${s.id}</div>
          <h2>${s.name}</h2>
        </div>
        <button className="x" aria-label="Lukk" onClick=${close}>\u00d7</button>
      </div>
      <div className="modal-body detail-layout">

        <section className="detail-section"><h3>Artsinfo</h3>
        ${info && html`
          <div className="art-info">
            ${info.fredet && html`<span className="ai-badge fredet">⛔ Fredet / kun observasjon</span>`}
            ${info.min && html`<span className="ai-badge">📏 Minstemål: ${info.min}</span>`}
            <span className="ai-text">${info.info}</span>
            ${(info.fredet || info.min) && html`<span className="ai-disc">Sjekk fiskeridir.no for gjeldende regler.</span>`}
          </div>`}
        ${!info && html`<p className="muted">Ingen artsinfo ennå.</p>`}

        ${canEditInfo && html`
          <div className="art-info edit-info">
            <div className="field full"><label>Artsinfo for egen art</label>
              <textarea value=${infoForm.info} placeholder="Kort kjennetegn, størrelse eller viktig regel …"
                        onChange=${e=>setInfoForm({...infoForm, info:e.target.value})}></textarea></div>
            <div className="field"><label>Minstemål / regel</label>
              <input type="text" value=${infoForm.min} placeholder="f.eks. 30 cm"
                     onChange=${e=>setInfoForm({...infoForm, min:e.target.value})}/></div>
            <div className="field"><label>Fredet?</label>
              <label className="checkline"><input type="checkbox" checked=${infoForm.fredet}
                     onChange=${e=>setInfoForm({...infoForm, fredet:e.target.checked})}/> Kun observasjon</label></div>
            <div className="modal-actions" style=${{marginTop:'4px'}}>
              <button className="btn ghost" style=${smallBtn} onClick=${autofillInfo} disabled=${autoInfoLoading}>${autoInfoLoading ? 'Henter …' : '✨ Hent automatisk'}</button>
              <button className="btn ghost" style=${smallBtn} onClick=${saveInfo}>Lagre artsinfo</button>
              <span className=${'savemsg'+(infoSaveMsg?' show':'')}>Lagret ✓</span>
            </div>
          </div>`}
        </section>

        <section className="detail-section"><h3>Bilder</h3>
        <label className=${'photo-zone'+(photoUrl?' has':'')+(canWriteThisCatch?'':' read-only')} htmlFor=${canWriteThisCatch ? 'photoInput' : null} title=${canWriteThisCatch?'Last opp bilde':(editable && fisher===FELLES?'Gammel Felles-fangst kan bare slettes':'Gjestemodus')}>
          ${photoUrl
            ? html`<img src=${photoUrl} alt="Fangstbilde"/>`
            : html`<span className="hint">${photoUrl===undefined ? 'Henter fangstbilde …' : (canWriteThisCatch ? '📷 Trykk for å laste opp bilde av fangsten' : (fisher===FELLES ? 'Gammel Felles-fangst: kan slettes, men ikke redigeres' : 'Ingen fangstbilde for valgt fisker'))}</span>`}
        </label>
        ${canWriteThisCatch && html`<input type="file" id="photoInput" accept="image/*" className="vh" onChange=${onPhoto}/>`}

        <div className="flex flex-wrap gap-2 mt-2">
          ${photoUrl && html`<button className="btn ghost" style=${smallBtn}
                onClick=${()=>update(st=>{ st.lightboxUrl = photoUrl; })}>🔍 Vis bildet i full størrelse</button>`}
          ${photoUrl && canWriteThisCatch && html`<button className="btn ghost" style=${photoDelArmed ? {...smallBtn, background:'var(--boye)', color:'#fff'} : smallBtn} onClick=${deleteMainPhoto}>${photoDelArmed?'Sikker?':'🗑 Slett hovedbilde'}</button>`}
          ${canWriteThisCatch && html`<label className="btn ghost" htmlFor="galleryInput" style=${smallBtn}>➕ Ekstra bilde</label>`}
          ${canWriteThisCatch && html`<input type="file" id="galleryInput" accept="image/*" className="vh" onChange=${onGalleryPhoto}/>`}
          ${editable && html`<label className="btn ghost" htmlFor="silInput" style=${smallBtn}>✂ Lag silhuett fra et bilde</label>`}
          ${editable && html`<input type="file" id="silInput" accept="image/*" className="vh" onChange=${onSil}/>`}
        </div>

        ${galleryRows.length>0 && html`
          <div className="photo-gallery">
            <span className="gal-lbl">Ekstra bilder av denne fangsten</span>
            ${galleryRows.map(g=>html`
              <div key=${g.id} className="gal-thumb">
                <img src=${g.thumb || g.data} alt="" onClick=${()=>update(st=>{ st.lightboxUrl = g.data; })}/><span>Ekstra</span>
                ${canWriteThisCatch && html`<button className="mini-x" onClick=${()=>delGallery(g.id)}>×</button>`}
              </div>`)}
          </div>`}

        ${gallery.length>0 && html`
          <div className="photo-gallery">
            <span className="gal-lbl">Alle fangstbilder av arten</span>
            ${gallery.map(g=>html`
              <div key=${g.m} className="gal-thumb" onClick=${()=>update(st=>{ st.lightboxUrl = g.url; })}>
                <img src=${g.url} alt=""/><span>${memberName(g.m)}</span>
              </div>`)}
          </div>`}
        </section>

        <section className="detail-section"><h3>Fangst</h3>
        <div className="field" style=${{marginTop:'14px'}}>
          <label>Fisker</label>
          <select value=${fisher} onChange=${e=>setFisher(e.target.value)}>
            ${!fisher && html`<option value="">Velg fisker</option>`}
            ${fisherOptions.map(m=>html`<option key=${m} value=${m}>${memberName(m)}${m===FELLES?' (gammel – kan slettes)':''}</option>`)}
          </select>
        </div>

        <div className="caught-row">
          <div className=${'toggle'+(caught?' on':'')+(editable?'':' disabled-toggle')} onClick=${toggleCaught} role="switch" aria-checked=${caught}><i></i></div>
          <span>${caught ? 'Fanget!' : 'Ikke fanget ennå'}</span>
        </div>

        <div className=${'fields'+(caught?'':' disabled')}>
          <div className="field"><label>Dato</label>
            <input type="date" disabled=${!canWriteThisCatch} value=${form.dato} onChange=${e=>setForm({...form, dato:e.target.value})}/></div>
          <div className="field"><label>Sted</label>
            <input type="text" disabled=${!canWriteThisCatch} value=${form.sted} placeholder="f.eks. Åkrehamn" onChange=${e=>setForm({...form, sted:e.target.value})}/></div>
          <div className="field"><label>Lengde</label>
            <input type="text" disabled=${!canWriteThisCatch} value=${form.lengde} placeholder="f.eks. 42 cm" onChange=${e=>setForm({...form, lengde:e.target.value})}/></div>
          <div className="field"><label>Vekt</label>
            <input type="text" disabled=${!canWriteThisCatch} value=${form.vekt} placeholder="f.eks. 1,2 kg" onChange=${e=>setForm({...form, vekt:e.target.value})}/></div>
          <div className="field full"><label>Posisjon</label>
            <div className="flex items-center gap-2 flex-wrap">
              ${canWriteThisCatch && html`<button className="btn ghost" type="button" style=${smallBtn} onClick=${openPick}>📍 Velg på kart</button>`}
              <span style=${{fontSize:'12.5px', color:'var(--blek)'}}>
                ${curPos ? curPos.lat.toFixed(4)+', '+curPos.lng.toFixed(4) : 'Ingen posisjon valgt'}
              </span>
              ${canWriteThisCatch && curPos && html`<button className="btn ghost" type="button"
                  style=${{fontSize:'12px', padding:'6px 10px'}} onClick=${()=>setCurPos(null)}>\u2715 Fjern</button>`}
            </div>
          </div>
          ${(form.weather || (entry() && entry().weather)) && html`<div className="field full"><label>Vær da fangsten ble lagret</label><div className="readonly-box">${(entry()&&entry().weather)||form.weather}</div></div>`}
          <div className="field full"><label>Kommentarer</label>
            <textarea disabled=${!canWriteThisCatch} value=${form.kommentar} placeholder="Agn, vær, historien bak …"
                      onChange=${e=>setForm({...form, kommentar:e.target.value})}></textarea></div>
        </div>

        </section>

        <section className="detail-section"><h3>Reaksjoner</h3>
        <div className="reactions"><span>Reaksjoner:</span> ${['🔥','😂','👑','🐟','😮'].map(e=>html`<button onClick=${()=>react(e)}>${e} ${(entry()&&entry().reactions&&entry().reactions[e])||''}</button>`)}</div>

        </section>

        <div className="modal-actions">
          ${editable ? html`
            ${canWriteThisCatch && html`<button className="btn primary" onClick=${save}>Lagre fangst</button>`}
            ${canWriteThisCatch && html`<span className=${'savemsg'+(saveMsg?' show':'')}>Lagret ✓</span>`}
            ${fisher===FELLES && entry() && html`<span className="guest-note">Gammel Felles-fangst: kan slettes, men ikke redigeres.</span>`}
            ${entry() && html`<button className="btn ghost"
                style=${resetArmed ? {background:'var(--boye)', color:'#fff', borderColor:'var(--boye)'} : null}
                onClick=${resetCatch}>${resetArmed ? 'Sikker? Trykk igjen' : 'Slett fangst'}</button>`}
            <button className="btn danger"
                style=${delArmed ? {background:'var(--stamp)', color:'#fff'} : null}
                onClick=${delSpecies}>${delArmed ? 'Sikker? Trykk igjen for å slette' : 'Slett art'}</button>`
          : html`<span className="guest-note">Gjestemodus: lesetilgang uten endringer.</span>`}
        </div>
      </div>
    </div>

    <div className="overlay open" style=${{zIndex:60, display: pickOpen?'flex':'none'}}
         onClick=${e=>{ if(e.target===e.currentTarget) setPickOpen(false); }}>
      <div className="modal" style=${{maxWidth:'680px'}}>
        <div className="modal-head">
          <h2 style=${{fontSize:'24px'}}>Velg fangststed</h2>
          <button className="x" aria-label="Lukk" onClick=${()=>setPickOpen(false)}>\u00d7</button>
        </div>
        <div className="modal-body">
          <div id="mapPick" style=${{height:'55vh', borderRadius:'8px', overflow:'hidden'}}></div>
          <p style=${{fontSize:'12.5px', color:'var(--blek)', marginTop:'8px'}}>Trykk på kartet der fangsten ble tatt.</p>
          <div className="modal-actions">
            <button className="btn primary" onClick=${savePick}>Bruk denne posisjonen</button>
            <button className="btn ghost" onClick=${()=>setPickOpen(false)}>Avbryt</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
