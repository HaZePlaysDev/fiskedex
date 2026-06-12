// Visninger: 📊 toppliste, 🗺️ fangstkart og 📜 fangstlogg
/* global React, htm, L */
import { store, update, useStore, toast, catchers, memberName, catOrder, canEdit } from '../store.js';
import { CATS } from '../data.js';
import { FELLES, KARMOY } from '../config.js';
import * as db from '../db.js';
import { esc, parseWeightKg, parseLengthCm, fmtKg, fmtCm } from '../utils.js';

const html = htm.bind(React.createElement);
const { useState, useEffect, useRef } = React;

/* ---------- 📊 Toppliste ---------- */
export function StatsView(){
  useStore();
  const [delArmed, setDelArmed] = useState(null);
  const editable = canEdit();
  const armTimer = useRef(null);

  const catRows = catOrder().map(c=>{
    const grp = store.species.filter(s=>s.cat===c);
    const cc = grp.filter(s=>catchers(s).length>0).length;
    return { name: CATS[c].name, c: cc, tot: grp.length, pct: grp.length?Math.round(100*cc/grp.length):0 };
  }).filter(r=>r.tot>0);

  const totals = {
    tot: store.species.length,
    caught: store.species.filter(s=>catchers(s).length>0).length,
  };

  let recH=null, recL=null;
  for(const s of store.species){
    for(const m of catchers(s)){
      const c = s.catches[m];
      const w = parseWeightKg(c.vekt); if(w!=null && (!recH||w>recH.w)) recH={w, art:s.name, m};
      const l = parseLengthCm(c.lengde); if(l!=null && (!recL||l>recL.l)) recL={l, art:s.name, m};
    }
  }

  const mems = [...store.members];
  if(store.species.some(s=>s.catches && s.catches[FELLES]) && !mems.includes(FELLES)) mems.push(FELLES);
  const leaderboard = mems.map(m=>{
    let count=0, heaviest=null, longest=null, last=null;
    for(const s of store.species){
      const c = s.catches && s.catches[m]; if(!c) continue;
      count++;
      const w = parseWeightKg(c.vekt); if(w!=null && (!heaviest||w>heaviest.w)) heaviest={w, art:s.name};
      const l = parseLengthCm(c.lengde); if(l!=null && (!longest||l>longest.l)) longest={l, art:s.name};
      if(c.dato && (!last || c.dato>last.dato)) last={dato:c.dato, art:s.name};
    }
    return {m, count, heaviest, longest, last};
  }).sort((a,b)=>b.count-a.count);

  const medal = i => i===0?'\u{1F947}':i===1?'\u{1F948}':i===2?'\u{1F949}':(i+1)+'.';

  async function delMember(name){
    if(delArmed!==name){
      setDelArmed(name);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(()=>setDelArmed(null), 4000);
      return;
    }
    setDelArmed(null);
    const ok = await db.removeMemberRows(name);
    if(ok){
      update(st=>{
        st.members = st.members.filter(x=>x!==name);
        for(const s of st.species){ if(s.catches) delete s.catches[name]; }
        if(st.member===name) st.member=null;
      });
      toast(`${name} og alle fangstene deres er slettet`);
    } else toast('Kunne ikke slette fiskeren');
  }

  async function doExport(withPhotos){
    toast('Lager backup \u2026');
    const payload = { app:'FiskeDex', eksportert:new Date().toISOString(),
                      members:[...store.members], species: JSON.parse(JSON.stringify(store.species)) };
    if(withPhotos){
      const ph = await db.fetchAllPhotos();
      if(ph) payload.photos = ph;
    }
    const blob = new Blob([JSON.stringify(payload,null,1)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fiskedex-backup-'+new Date().toISOString().slice(0,10)+(withPhotos?'-med-bilder':'')+'.json';
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function logoutNow(){ await db.logout(); location.reload(); }

  return html`
  <div className="stats-wrap">
    <div className="stats-card">
      <h3>Gjengens fremgang</h3>
      <div className="record-line" style=${{marginBottom:'10px'}}>
        <b style=${{fontFamily:'Staatliches', fontSize:'26px'}}>${totals.caught}/${totals.tot}</b>\u00a0arter kartlagt totalt
      </div>
      <div className="cat-progress">
        ${catRows.map(r=>html`
          <div key=${r.name} className="row">
            <span className="lbl">${r.name}</span>
            <span className="bar"><i style=${{width: r.pct+'%'}}></i></span>
            <span className="num">${r.c}/${r.tot}</span>
          </div>`)}
      </div>
      ${recH && html`<div className="record-line"><span className="rl-icon">\u{1F3C6}</span>\u00a0Tyngste fangst: <b>${recH.art}</b>\u00a0p\u00e5 ${fmtKg(recH.w)} (${memberName(recH.m)})</div>`}
      ${recL && html`<div className="record-line"><span className="rl-icon">\u{1F4CF}</span>\u00a0Lengste fangst: <b>${recL.art}</b>\u00a0p\u00e5 ${fmtCm(recL.l)} (${memberName(recL.m)})</div>`}
    </div>

    <div className="stats-card" style=${{paddingBottom:'8px'}}><h3>Toppliste</h3></div>
    ${!leaderboard.length && html`<div className="empty-state">Ingen fiskere enn\u00e5 \u2013 legg til gjengen med \u00ab+ Fisker\u00bb-knappen!</div>`}
    ${leaderboard.map((st,i)=>html`
      <div key=${st.m} className=${'lb-row'+(i===0&&st.count>0?' gold':'')}>
        <span className="lb-rank">${medal(i)}</span>
        <span className="lb-name">${memberName(st.m)}</span>
        ${editable && st.m!==FELLES && html`<button className="lb-del" onClick=${()=>delMember(st.m)}>
          ${delArmed===st.m ? 'Sikker? Trykk igjen' : 'Slett fisker'}</button>`}
        <span className="lb-count">${st.count} ${st.count===1?'art':'arter'}</span>
        ${(st.heaviest||st.longest||st.last) && html`<span className="lb-details">
          ${st.heaviest && html`<span>\u2696\uFE0F Tyngst: ${st.heaviest.art} (${fmtKg(st.heaviest.w)})</span>`}
          ${st.longest && html`<span>\u00b7</span><span>\u{1F4CF} Lengst: ${st.longest.art} (${fmtCm(st.longest.l)})</span>`}
          ${st.last && html`<span>\u00b7</span><span>\u{1F553} Siste: ${st.last.art} ${st.last.dato}</span>`}
        </span>`}
      </div>`)}

    ${editable ? html`<div className="stats-card">
      <h3>Backup og konto</h3>
      <div className="flex flex-wrap gap-2">
        <button className="btn ghost" onClick=${()=>doExport(false)}>📦 Last ned backup</button>
        <button className="btn ghost" onClick=${()=>doExport(true)}>📦 Backup med bilder (stor)</button>
        <button className="btn ghost" onClick=${logoutNow}>Logg ut</button>
      </div>
    </div>` : html`<div className="stats-card"><h3>Gjestemodus</h3><p style=${{fontSize:'13.5px', color:'var(--blek)'}}>Du kan se fangster, bilder, kart og logg, men ikke endre noe.</p></div>`}
  </div>`;
}

/* ---------- 🗺️ Fangstkart ---------- */
export function MapView(){
  useStore();
  useEffect(()=>{
    if(typeof L==='undefined'){
      document.getElementById('mapBox').innerHTML = '<p style="padding:20px">Kartbiblioteket fikk ikke lastet \u2013 sjekk nettet.</p>';
      return;
    }
    const map = L.map('mapBox').setView(KARMOY, 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'\u00a9 OpenStreetMap'}).addTo(map);
    const pts = [];
    for(const s of store.species){
      for(const m of catchers(s)){
        if(store.member && m!==store.member) continue;
        const c = s.catches[m];
        if(c.lat!=null && c.lng!=null){
          L.marker([c.lat,c.lng]).addTo(map)
            .bindPopup(`<b>${esc(s.name)}</b><br>${esc(memberName(m))}${c.dato?' \u00b7 '+esc(c.dato):''}${c.vekt?'<br>\u2696\uFE0F '+esc(c.vekt):''}${c.sted?'<br>\u{1F4CD} '+esc(c.sted):''}`);
          pts.push([c.lat,c.lng]);
        }
      }
    }
    if(pts.length) map.fitBounds(pts,{padding:[40,40],maxZoom:13});
    return ()=>{ map.remove(); };
  }, [store.member]);

  return html`
  <div className="stats-card" style=${{marginTop:'18px'}}>
    <h3>Fangstkart</h3>
    <div id="mapBox" style=${{height:'62vh', borderRadius:'8px', overflow:'hidden'}}></div>
    <p style=${{fontSize:'12.5px', color:'var(--blek)', marginTop:'8px'}}>
      Posisjoner legges til i artskortet med \u{1F4CD}-knappen.
      Viser ${store.member ? memberName(store.member)+'s' : 'alle'} fangster.
    </p>
  </div>`;
}

/* ---------- 📜 Fangstlogg ---------- */
export function LogView(){
  useStore();
  const rows = [];
  for(const s of store.species){
    for(const m of catchers(s)){
      const c = s.catches[m];
      rows.push({ t:(c.created||c.dato||''), s, m, c });
    }
  }
  rows.sort((a,b)=> b.t>a.t?1 : b.t<a.t?-1 : 0);
  const shown = rows.slice(0,150);

  const dateOf = r => r.c.dato || (r.c.created||'').slice(0,10) || '?';
  const extraOf = r => [r.c.sted?'ved '+r.c.sted:'', r.c.vekt||'', r.c.lengde||''].filter(Boolean).join(' \u00b7 ');
  async function showPhoto(r, ev){
    ev.stopPropagation();
    const url = await db.loadPhoto(r.s.id, r.m);
    if(url) update(st=>{ st.lightboxUrl = url; });
  }

  return html`
  <div className="stats-wrap">
    <div className="stats-card" style=${{paddingBottom:'8px'}}><h3>Fangstlogg</h3></div>
    ${!shown.length && html`<div className="empty-state">Ingen fangster registrert enn\u00e5 \u2013 f\u00f8rste kast gjenst\u00e5r!</div>`}
    ${shown.map((r,i)=>html`
      <div key=${r.s.id+'|'+r.m} className="log-row" onClick=${()=>update(st=>{ st.detailId = r.s.id; })}>
        <span className="log-date">${dateOf(r)}</span>
        <span className="log-text"><b>${memberName(r.m)}</b> fanget <b>${r.s.name}</b>${extraOf(r)?' \u2013 '+extraOf(r):''}</span>
        ${r.c.hasPhoto && html`<button className="log-cam" title="Se bildet" onClick=${e=>showPhoto(r,e)}>📷</button>`}
      </div>`)}
  </div>`;
}
