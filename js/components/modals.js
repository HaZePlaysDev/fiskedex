// Småmodaler: innlogging, ny art, ny fisker
/* global React, htm */
import { store, update, useStore, toast, nextId } from '../store.js';
import { CATS } from '../data.js';
import { FELLES } from '../config.js';
import * as db from '../db.js';

const html = htm.bind(React.createElement);
const { useState } = React;

export function LoginGate({ onAuthed }){
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
    <div className="modal" style=${{maxWidth:'380px'}}>
      <div className="modal-head"><h2 style=${{fontSize:'26px'}}>\U0001F3A3 FiskeDex</h2></div>
      <div className="modal-body">
        <p style=${{fontSize:'13.5px', color:'var(--blek)', marginBottom:'12px'}}>Dexen er privat \u2013 skriv inn gjengens passord.</p>
        <div className="fields">
          <div className="field full"><label>Passord</label>
            <input type="password" value=${pass} autoComplete="current-password"
                   onChange=${e=>setPass(e.target.value)}
                   onKeyDown=${e=>{ if(e.key==='Enter') tryLogin(); }}/>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick=${tryLogin}>Logg inn</button>
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
  if(!store.addOpen) return null;
  const cats = Object.entries(CATS).map(([k,v])=>({k, name:v.name}));
  const close = ()=>update(st=>{ st.addOpen = false; });
  async function create(){
    const nm = name.trim();
    if(!nm) return;
    const id = nextId(cat);
    if(await db.addSpeciesRow(id, nm, cat)){
      update(st=>{
        st.species.push({id, name:nm, cat, custom:true, sil:null, catches:{}});
        st.filterCat = cat;
        st.view = 'dex';
        st.addOpen = false;
        st.detailId = id;
      });
      toast(`${id} \u2013 ${nm} lagt til!`);
      setName('');
    } else toast('Kunne ikke legge til arten');
  }
  return html`
  <div className="overlay open" onClick=${e=>{ if(e.target===e.currentTarget) close(); }}>
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-head"><h2 style=${{fontSize:'26px'}}>Ny art</h2><button className="x" aria-label="Lukk" onClick=${close}>\u00d7</button></div>
      <div className="modal-body">
        <div className="fields">
          <div className="field full"><label>Artsnavn</label>
            <input type="text" value=${name} placeholder="f.eks. M\u00e5nefisk"
                   onChange=${e=>setName(e.target.value)}
                   onKeyDown=${e=>{ if(e.key==='Enter') create(); }}/></div>
          <div className="field full"><label>Kategori</label>
            <select value=${cat} onChange=${e=>setCat(e.target.value)}>
              ${cats.map(c=>html`<option key=${c.k} value=${c.k}>${c.name}</option>`)}
            </select></div>
        </div>
        <p style=${{fontSize:'13px', color:'var(--blek)', marginTop:'10px'}}>Arten f\u00e5r automatisk neste ledige nummer i kategorien.</p>
        <div className="modal-actions">
          <button className="btn primary" onClick=${create}>Legg til i Pok\u00e9dexen</button>
          <button className="btn ghost" onClick=${close}>Avbryt</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function AddMemberModal(){
  useStore();
  const [name, setName] = useState('');
  if(!store.memberOpen) return null;
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
        <p style=${{fontSize:'13px', color:'var(--blek)', marginTop:'10px'}}>Hver fisker f\u00e5r sin egen Pok\u00e9dex med egne fangster og bilder. \u00abAlle\u00bb viser den felles samlingen der alles fangster teller.</p>
        <div className="modal-actions">
          <button className="btn primary" onClick=${create}>Legg til fisker</button>
          <button className="btn ghost" onClick=${close}>Avbryt</button>
        </div>
      </div>
    </div>
  </div>`;
}
