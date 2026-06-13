// Småmodaler: innlogging, ny art, ny fisker
/* global React, htm */
import { store, update, useStore, toast, nextId, canEdit } from '../store.js';
import { CATS } from '../data.js';
import { fetchAutoSpeciesInfo } from '../species-info.js';
import { FELLES } from '../config.js';
import * as db from '../db.js';

const html = htm.bind(React.createElement);
const { useState } = React;

export function LoginGate({ onAuthed, onGuest }){
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  async function tryLogin(){
    if(!pass) return;
    setErr('');
    if(await db.login(pass)) onAuthed();
    else setErr('Feil passord \u2013 pr\u00f8v igjen');
  }
  return html`
  <div className="overlay open" style=${{zIndex:80, background:'var(--hav-dyp)'}}>
    <div className="modal" style=${{maxWidth:'420px'}}>
      <div className="modal-head"><h2 style=${{fontSize:'30px'}}>🎣 FiskeDex</h2></div>
      <div className="modal-body">
        <p style=${{fontSize:'13.5px', color:'var(--blek)', marginBottom:'12px'}}>Skriv inn passord for å registrere fangster, eller gå inn som gjest for å bare se.</p>
        <div className="fields">
          <div className="field full"><label>Passord</label>
            <input type="password" value=${pass} autoComplete="current-password"
                   onChange=${e=>setPass(e.target.value)}
                   onKeyDown=${e=>{ if(e.key==='Enter') tryLogin(); }}/>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick=${tryLogin}>Logg inn</button>
          <button className="btn ghost" onClick=${onGuest}>Se som gjest</button>
          <span style=${{fontSize:'13px', color:'var(--stamp)'}}>${err}</span>
        </div>
      </div>
    </div>
  </div>`;
}

export function AddSpeciesModal(){
  useStore();
  const [name, setName] = useState('');
  const [cat, setCat] = useState('F');
  const [info, setInfo] = useState('');
  const [min, setMin] = useState('');
  const [fredet, setFredet] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  if(!store.addOpen || !canEdit()) return null;
  const cats = Object.entries(CATS).map(([k,v])=>({k, name:v.name}));
  const close = ()=>update(st=>{ st.addOpen = false; });
  async function autofillInfo(){
    const nm = name.trim();
    if(!nm){ toast('Skriv artsnavn først'); return null; }
    setAutoLoading(true);
    const found = await fetchAutoSpeciesInfo(nm);
    setAutoLoading(false);
    if(!found){ toast('Fant ikke automatisk artsinfo. Du kan skrive inn manuelt.'); return null; }
    if(!info.trim()) setInfo(found.info || '');
    if(!min.trim()) setMin(found.min || '');
    if(!fredet && found.fredet) setFredet(true);
    toast('Artsinfo hentet automatisk');
    return found;
  }

  async function create(){
    const nm = name.trim();
    if(!nm) return;
    const id = nextId(cat);
    let details = {info:info.trim(), min:min.trim(), fredet:!!fredet};
    // Hvis du ikke har skrevet artsinfo, prøver appen å fylle inn automatisk før den lagrer.
    if(!details.info){
      const found = await fetchAutoSpeciesInfo(nm);
      if(found){
        details = {
          info: details.info || found.info || '',
          min: details.min || found.min || '',
          fredet: details.fredet || !!found.fredet,
        };
      }
    }
    if(await db.addSpeciesRow(id, nm, cat, details)){
      update(st=>{
        st.species.push({id, name:nm, cat, custom:true, sil:null, info:details.info, min:details.min, fredet:!!details.fredet, catches:{}});
        st.filterCat = cat;
        st.view = 'dex';
        st.addOpen = false;
        st.detailId = id;
      });
      toast(`${id} \u2013 ${nm} lagt til!`);
      setName(''); setInfo(''); setMin(''); setFredet(false);
    } else toast('Kunne ikke legge til arten');
  }
  return html`
  <div className="overlay open" onClick=${e=>{ if(e.target===e.currentTarget) close(); }}>
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-head"><h2 style=${{fontSize:'26px'}}>Ny art</h2><button className="x" aria-label="Lukk" onClick=${close}>\u00d7</button></div>
      <div className="modal-body">
        <div className="fields">
          <div className="field full"><label>Artsnavn</label>
            <input type="text" value=${name} placeholder="f.eks. Månefisk"
                   onChange=${e=>setName(e.target.value)}
                   onKeyDown=${e=>{ if(e.key==='Enter') create(); }}/></div>
          <div className="field full"><label>Kategori</label>
            <select value=${cat} onChange=${e=>setCat(e.target.value)}>
              ${cats.map(c=>html`<option key=${c.k} value=${c.k}>${c.name}</option>`)}
            </select></div>
          <div className="field"><label>Minstemål / regel</label>
            <input type="text" value=${min} placeholder="f.eks. 30 cm"
                   onChange=${e=>setMin(e.target.value)}/></div>
          <div className="field"><label>Fredet?</label>
            <label className="checkline"><input type="checkbox" checked=${fredet} onChange=${e=>setFredet(e.target.checked)}/> Kun observasjon</label></div>
          <div className="field full"><label>Artsinfo</label>
            <textarea value=${info} placeholder="Kort kjennetegn, størrelse eller viktig regel …"
                      onChange=${e=>setInfo(e.target.value)}></textarea></div>
        </div>
        <div className="modal-actions" style=${{marginTop:'10px'}}>
          <button className="btn ghost" onClick=${autofillInfo} disabled=${autoLoading}>${autoLoading ? 'Henter …' : '✨ Hent artsinfo automatisk'}</button>
        </div>
        <p style=${{fontSize:'13px', color:'var(--blek)', marginTop:'10px'}}>Arten får automatisk neste ledige nummer i kategorien. Hvis artsinfo står tomt, prøver appen å hente kort info automatisk. Minstemål/regler må dobbeltsjekkes før fisken beholdes.</p>
        <div className="modal-actions">
          <button className="btn primary" onClick=${create}>Legg til i FiskeDexen</button>
          <button className="btn ghost" onClick=${close}>Avbryt</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function AddMemberModal(){
  useStore();
  const [name, setName] = useState('');
  if(!store.memberOpen || !canEdit()) return null;
  const close = ()=>update(st=>{ st.memberOpen = false; });
  async function create(){
    const nm = name.trim();
    if(!nm) return;
    if(nm===FELLES || nm.toLowerCase()==='felles'){ toast('Det navnet er reservert'); return; }
    if(store.members.includes(nm)){ toast('Fiskeren finnes allerede'); close(); return; }
    if(await db.addMemberRow(nm)){
      update(st=>{
        st.members.push(nm);
        st.member = nm;
        st.memberOpen = false;
      });
      toast(`${nm} er med i konkurransen!`);
      setName('');
    } else toast('Kunne ikke legge til fiskeren');
  }
  return html`
  <div className="overlay open" onClick=${e=>{ if(e.target===e.currentTarget) close(); }}>
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-head"><h2 style=${{fontSize:'26px'}}>Ny fisker</h2><button className="x" aria-label="Lukk" onClick=${close}>\u00d7</button></div>
      <div className="modal-body">
        <div className="fields">
          <div className="field full"><label>Navn</label>
            <input type="text" value=${name} placeholder="f.eks. Ola"
                   onChange=${e=>setName(e.target.value)}
                   onKeyDown=${e=>{ if(e.key==='Enter') create(); }}/></div>
        </div>
        <p style=${{fontSize:'13px', color:'var(--blek)', marginTop:'10px'}}>Hver fisker får sin egen FiskeDex med egne fangster og bilder. «Alle» viser den felles samlingen der alles fangster teller.</p>
        <div className="modal-actions">
          <button className="btn primary" onClick=${create}>Legg til fisker</button>
          <button className="btn ghost" onClick=${close}>Avbryt</button>
        </div>
      </div>
    </div>
  </div>`;
}
