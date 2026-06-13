// Visninger: dashboard, toppliste, rekorder, fangstkart, fangstside og gjesteside
/* global React, htm, L */
import { store, update, useStore, toast, catchers, memberName, catOrder, canEdit, latestCatch } from '../store.js';
import { CATS } from '../data.js';
import { FELLES, KARMOY } from '../config.js';
import * as db from '../db.js';
import { esc, parseWeightKg, parseLengthCm, fmtKg, fmtCm, makeThumbFromDataUrl } from '../utils.js';

const html = htm.bind(React.createElement);
const { useState, useEffect, useRef } = React;

function allCatchRows(){
  const rows = [];
  for(const s of store.species){
    for(const m of catchers(s)){
      if(store.member && m!==store.member) continue;
      const c = s.catches[m];
      rows.push({ t:(c.created||c.dato||''), species:s, member:m, catch:c });
    }
  }
  rows.sort((a,b)=> b.t>a.t?1 : b.t<a.t?-1 : 0);
  return rows;
}

function reactionTotal(c){
  return Object.values(c.reactions||{}).reduce((a,n)=>a+(Number(n)||0),0);
}

function leaderboardRows(){
  const mems = [...store.members];
  if(store.species.some(s=>s.catches && s.catches[FELLES]) && !mems.includes(FELLES)) mems.push(FELLES);
  return mems.map(m=>{
    let count=0, heaviest=null, longest=null, last=null, reactions=0;
    for(const s of store.species){
      const c = s.catches && s.catches[m]; if(!c) continue;
      count++;
      reactions += reactionTotal(c);
      const w = parseWeightKg(c.vekt); if(w!=null && (!heaviest||w>heaviest.w)) heaviest={w, art:s.name};
      const l = parseLengthCm(c.lengde); if(l!=null && (!longest||l>longest.l)) longest={l, art:s.name};
      const t = c.created || c.dato || '';
      if(t && (!last || t>last.t)) last={t, dato:c.dato, art:s.name};
    }
    return {m, count, heaviest, longest, last, reactions};
  }).sort((a,b)=>b.count-a.count || b.reactions-a.reactions);
}

function firstSentence(text){
  return (text||'').split(/[.!?]/)[0].trim();
}

function mysterySpecies(){
  const missing = store.species.filter(s=>catchers(s).length===0);
  if(!missing.length) return null;
  const d = new Date();
  const seed = Number(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`);
  return missing[seed % missing.length];
}

function Thumb({species, member, className='dash-photo', fallback='🐟'}){
  const [url, setUrl] = useState(null);
  useEffect(()=>{
    let alive = true;
    setUrl(null);
    if(species && member){
      db.loadPhotoThumb(species.id, member).then(u=>{ if(alive) setUrl(u); });
    }
    return ()=>{ alive = false; };
  }, [species ? species.id : '', member || '']);
  return html`<div className=${className}>${url ? html`<img src=${url} alt=""/>` : html`<span>${fallback}</span>`}</div>`;
}

function MiniLeaderboard(){
  const rows = leaderboardRows().filter(r=>r.count>0).slice(0,3);
  const medal = i => i===0?'🥇':i===1?'🥈':'🥉';
  if(!rows.length) return html`<p className="muted">Ingen fangster ennå.</p>`;
  return html`<div className="mini-lb">
    ${rows.map((r,i)=>html`<button key=${r.m} onClick=${()=>update(s=>{ s.view='stats'; s.member=r.m===FELLES?null:r.m; })}>
      <span className="rank">${medal(i)}</span><b>${memberName(r.m)}</b><span>${r.count} arter</span>
    </button>`)}
  </div>`;
}

export function DashboardView(){
  useStore();
  const rows = allCatchRows();
  const latest = latestCatch();
  const tot = store.species.length;
  const caught = store.species.filter(s=>catchers(s).length>0).length;
  const pct = tot ? Math.round(caught*100/tot) : 0;
  const mystery = mysterySpecies();
  const newest = rows[0] || null;

  return html`<div className="dashboard">
    <section className="dash-hero-card wide">
      <div>
        <div className="eyebrow">Dashboard</div>
        <h2>${caught}/${tot} arter kartlagt</h2>
        <p>Her får dere siste fangst, lederlista, dagens mystery-art og raske snarveier.</p>
      </div>
      <div className="big-progress"><span>${pct}%</span><i><b style=${{width:pct+'%'}}></b></i></div>
    </section>

    <section className="dash-card latest-dash" onClick=${()=>latest && update(s=>{ s.detailId = latest.species.id; })}>
      <div className="dash-card-head"><span>Siste fangst</span><button onClick=${e=>{e.stopPropagation(); update(s=>{s.view='fangster';});}}>Se alle</button></div>
      ${latest ? html`<div className="dash-latest-body">
        <${Thumb} species=${latest.species} member=${latest.member}/>
        <div><h3>${latest.species.name}</h3><p><b>${memberName(latest.member)}</b>${latest.catch.sted?' · '+latest.catch.sted:''}</p><small>${[latest.catch.dato, latest.catch.vekt, latest.catch.lengde].filter(Boolean).join(' · ')}</small></div>
      </div>` : html`<p className="muted">Ingen fangster registrert ennå.</p>`}
    </section>

    <section className="dash-card">
      <div className="dash-card-head"><span>Mini-toppliste</span><button onClick=${()=>update(s=>{s.view='stats';})}>Åpne</button></div>
      <${MiniLeaderboard}/>
    </section>

    <section className="dash-card mystery-card" onClick=${()=>mystery && update(s=>{ s.detailId = mystery.id; })}>
      <div className="dash-card-head"><span>Dagens mystery-art</span><button onClick=${e=>{e.stopPropagation(); update(s=>{s.view='dex'; s.filterMystery=true;});}}>Finn flere</button></div>
      ${mystery ? html`<div className="mystery-big"><div className="mystery-mark">?</div><div><h3>???</h3><p>${firstSentence(mystery.info) || (mystery.min ? 'Har regel/minstemål: '+mystery.min : 'Ukjent art i dexen')}</p><small>${CATS[mystery.cat] ? CATS[mystery.cat].name : 'Annet'} · ${mystery.id}</small></div></div>` : html`<p className="muted">Alle arter er fanget. Sykt.</p>`}
    </section>

    <section className="dash-card quick-card">
      <div className="dash-card-head"><span>Snarveier</span></div>
      <div className="quick-grid">
        <button onClick=${()=>update(s=>{s.view='dex';})}>🐟 Åpne dex</button>
        <button onClick=${()=>update(s=>{s.view='records';})}>🏆 Rekorder</button>
        <button onClick=${()=>update(s=>{s.view='map';})}>🗺️ Kart</button>
        <button onClick=${()=>update(s=>{s.view='fangster';})}>📜 Fangster</button>
      </div>
    </section>

    ${newest && html`<section className="dash-card wide story-card">
      <div className="dash-card-head"><span>Siste historie</span></div>
      <p><b>${memberName(newest.member)}</b> registrerte <b>${newest.species.name}</b>${newest.catch.sted?' ved '+newest.catch.sted:''}${newest.catch.kommentar?' – “'+newest.catch.kommentar+'”':''}</p>
    </section>`}
  </div>`;
}

/* ---------- 📊 Toppliste ---------- */
export function StatsView(){
  useStore();
  const [delArmed, setDelArmed] = useState(null);
  const [thumbBusy, setThumbBusy] = useState(false);
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

  const leaderboard = leaderboardRows();
  const medal = i => i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.';

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
    toast('Lager backup …');
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

  async function rebuildThumbs(){
    if(thumbBusy) return;
    setThumbBusy(true);
    toast('Lager raske miniatyrbilder av gamle bilder …');
    try{
      const rows = await db.fetchAllPhotos();
      if(!rows){ toast('Kunne ikke hente bildene'); return; }
      let made = 0;
      for(const ph of rows){
        if(!ph || !ph.data || ph.thumb) continue;
        const thumb = await makeThumbFromDataUrl(ph.data);
        if(await db.savePhoto(ph.species_id, ph.member, ph.data, thumb)) made++;
      }
      toast(made ? `Laget ${made} raske miniatyrbilder` : 'Alle bilder hadde allerede miniatyrbilder');
    }catch(e){
      toast('Klarte ikke lage miniatyrbilder. Kjør nyeste SQL først.');
    }finally{ setThumbBusy(false); }
  }
  async function logoutNow(){ await db.logout(); location.reload(); }

  return html`
  <div className="stats-wrap">
    <div className="stats-card">
      <h3>Gjengens fremgang</h3>
      <div className="record-line" style=${{marginBottom:'10px'}}>
        <b style=${{fontFamily:'Staatliches', fontSize:'26px'}}>${totals.caught}/${totals.tot}</b> arter kartlagt totalt
      </div>
      <div className="cat-progress">
        ${catRows.map(r=>html`
          <div key=${r.name} className="row">
            <span className="lbl">${r.name}</span>
            <span className="bar"><i style=${{width: r.pct+'%'}}></i></span>
            <span className="num">${r.c}/${r.tot}</span>
          </div>`)}
      </div>
      ${recH && html`<div className="record-line"><span className="rl-icon">🏆</span> Tyngste fangst: <b>${recH.art}</b> på ${fmtKg(recH.w)} (${memberName(recH.m)})</div>`}
      ${recL && html`<div className="record-line"><span className="rl-icon">📏</span> Lengste fangst: <b>${recL.art}</b> på ${fmtCm(recL.l)} (${memberName(recL.m)})</div>`}
    </div>

    <div className="stats-card" style=${{paddingBottom:'8px'}}><h3>Toppliste</h3></div>
    ${!leaderboard.length && html`<div className="empty-state">Ingen fiskere ennå – legg til gjengen med «+ Fisker»-knappen!</div>`}
    <div className="leader-card-grid">
      ${leaderboard.map((st,i)=>html`
        <div key=${st.m} className=${'leader-card'+(i===0&&st.count>0?' gold':'')}>
          <div className="leader-rank">${medal(i)}</div>
          <div className="leader-main"><h3>${memberName(st.m)}</h3><p>${st.count} ${st.count===1?'art':'arter'} · ${st.reactions} reaksjoner</p></div>
          ${editable && st.m!==FELLES && html`<button className="lb-del" onClick=${()=>delMember(st.m)}>${delArmed===st.m ? 'Sikker? Trykk igjen' : 'Slett'}</button>`}
          <div className="leader-facts">
            ${st.heaviest && html`<span>⚖️ Tyngst: ${st.heaviest.art} (${fmtKg(st.heaviest.w)})</span>`}
            ${st.longest && html`<span>📏 Lengst: ${st.longest.art} (${fmtCm(st.longest.l)})</span>`}
            ${st.last && html`<span>🕓 Siste: ${st.last.art}</span>`}
          </div>
        </div>`)}
    </div>

    ${editable ? html`<div className="stats-card">
      <h3>Backup og konto</h3>
      <div className="flex flex-wrap gap-2">
        <button className="btn ghost" onClick=${()=>doExport(false)}>📦 Last ned backup</button>
        <button className="btn ghost" onClick=${()=>doExport(true)}>📦 Backup med bilder (stor)</button>
        <button className="btn ghost" onClick=${rebuildThumbs} disabled=${thumbBusy}>${thumbBusy ? 'Lager …' : '⚡ Gjør gamle bilder raskere'}</button>
        <button className="btn ghost" onClick=${logoutNow}>Logg ut</button>
      </div>
    </div>` : html`<div className="stats-card"><h3>Gjestemodus</h3><p className="muted">Du kan se fangster, bilder, kart og logg, men ikke endre noe.</p></div>`}
  </div>`;
}

export function RecordsView(){
  useStore();
  const rows = allCatchRows();
  let heaviest=null, longest=null, mostReacted=null, latestSpecies=null;
  for(const r of rows){
    const w = parseWeightKg(r.catch.vekt); if(w!=null && (!heaviest || w>heaviest.value)) heaviest={value:w,row:r};
    const l = parseLengthCm(r.catch.lengde); if(l!=null && (!longest || l>longest.value)) longest={value:l,row:r};
    const rt = reactionTotal(r.catch); if(rt>0 && (!mostReacted || rt>mostReacted.value)) mostReacted={value:rt,row:r};
  }
  if(rows.length) latestSpecies = rows[0];
  const photoRows = rows.filter(r=>r.catch.hasPhoto).length;

  function RecCard({icon,title,main,sub,row}){
    return html`<div className="record-card" onClick=${()=>row && update(s=>{s.detailId=row.species.id;})}>
      <div className="rec-icon">${icon}</div><div><span>${title}</span><h3>${main || 'Ingen data ennå'}</h3>${sub && html`<p>${sub}</p>`}</div>
    </div>`;
  }
  const rowText = r => `${r.species.name} · ${memberName(r.member)}${r.catch.sted?' · '+r.catch.sted:''}`;
  return html`<div className="records-grid">
    <${RecCard} icon="⚖️" title="Tyngste fisk" main=${heaviest ? `${heaviest.row.species.name} – ${fmtKg(heaviest.value)}` : ''} sub=${heaviest ? rowText(heaviest.row) : ''} row=${heaviest&&heaviest.row}/>
    <${RecCard} icon="📏" title="Lengste fisk" main=${longest ? `${longest.row.species.name} – ${fmtCm(longest.value)}` : ''} sub=${longest ? rowText(longest.row) : ''} row=${longest&&longest.row}/>
    <${RecCard} icon="🆕" title="Nyeste fangst" main=${latestSpecies ? latestSpecies.species.name : ''} sub=${latestSpecies ? rowText(latestSpecies) : ''} row=${latestSpecies}/>
    <${RecCard} icon="🔥" title="Mest reagert på" main=${mostReacted ? `${mostReacted.row.species.name} – ${mostReacted.value} reaksjoner` : ''} sub=${mostReacted ? rowText(mostReacted.row) : ''} row=${mostReacted&&mostReacted.row}/>
    <div className="record-card"><div className="rec-icon">📷</div><div><span>Bilder</span><h3>${photoRows} fangster med bilde</h3><p>Galleribilder kommer i tillegg.</p></div></div>
    <div className="record-card"><div className="rec-icon">🧭</div><div><span>Fangststeder</span><h3>${rows.filter(r=>r.catch.lat!=null && r.catch.lng!=null).length} fangster på kart</h3><p>Legg posisjon i artskortet.</p></div></div>
  </div>`;
}

/* ---------- 🗺️ Fangstkart ---------- */
export function MapView(){
  useStore();
  useEffect(()=>{
    if(typeof L==='undefined'){
      document.getElementById('mapBox').innerHTML = '<p style="padding:20px">Kartbiblioteket fikk ikke lastet – sjekk nettet.</p>';
      return;
    }
    const map = L.map('mapBox').setView(KARMOY, 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
    const pts = [];
    for(const s of store.species){
      for(const m of catchers(s)){
        if(store.member && m!==store.member) continue;
        const c = s.catches[m];
        if(c.lat!=null && c.lng!=null){
          L.circle([c.lat,c.lng],{radius:260,color:'#e8612c',fillOpacity:.12,weight:1}).addTo(map);
          L.marker([c.lat,c.lng]).addTo(map)
            .bindPopup(`<b>${esc(s.name)}</b><br>${esc(memberName(m))}${c.dato?' · '+esc(c.dato):''}${c.vekt?'<br>⚖️ '+esc(c.vekt):''}${c.sted?'<br>📍 '+esc(c.sted):''}`);
          pts.push([c.lat,c.lng]);
        }
      }
    }
    if(pts.length) map.fitBounds(pts,{padding:[40,40],maxZoom:13});
    return ()=>{ map.remove(); };
  }, [store.member, store.species.length]);

  return html`
  <div className="stats-card" style=${{marginTop:'18px'}}>
    <h3>Fangstkart + heatmap</h3>
    <div id="mapBox" style=${{height:'62vh', borderRadius:'8px', overflow:'hidden'}}></div>
    <p className="muted" style=${{marginTop:'8px'}}>
      Oransje sirkler viser fangst-tetthet/heatmap. Posisjoner legges til i artskortet med 📍-knappen.
      Viser ${store.member ? memberName(store.member)+'s' : 'alle'} fangster.
    </p>
  </div>`;
}

function CatchCard({r}){
  const [url,setUrl] = useState(null);
  useEffect(()=>{
    let alive = true;
    setUrl(null);
    if(r.catch.hasPhoto) db.loadPhotoThumb(r.species.id, r.member).then(u=>{ if(alive) setUrl(u); });
    return ()=>{ alive=false; };
  }, [r.species.id, r.member, r.catch.hasPhoto]);
  const extra = [r.catch.sted, r.catch.vekt, r.catch.lengde, r.catch.weather].filter(Boolean).join(' · ');
  return html`<article className="catch-card" onClick=${()=>update(st=>{ st.detailId = r.species.id; })}>
    <div className="catch-photo">${url ? html`<img src=${url} alt=""/>` : html`<span>${r.catch.hasPhoto?'📷':'🐟'}</span>`}</div>
    <div className="catch-body"><div className="eyebrow">${r.catch.dato || (r.catch.created||'').slice(0,10) || 'Ukjent dato'}</div><h3>${r.species.name}</h3>
      <p><b>${memberName(r.member)}</b>${extra?' · '+extra:''}</p>
      ${r.catch.kommentar && html`<p className="catch-comment">“${r.catch.kommentar}”</p>`}
      ${r.catch.reactions && Object.keys(r.catch.reactions).length>0 && html`<div className="catch-reacts">${Object.entries(r.catch.reactions).map(([e,n])=>html`<span key=${e}>${e} ${n}</span>`)}</div>`}
    </div>
  </article>`;
}

/* ---------- 📜 Fangstside ---------- */
export function LogView(){
  useStore();
  const rows = allCatchRows().slice(0,150);
  return html`
  <div className="catch-page">
    <div className="section-title-row"><div><div className="eyebrow">Fangster</div><h2>Alle registrerte fangster</h2></div><button className="btn ghost" onClick=${()=>reload(false)}>↻ Oppdater</button></div>
    ${!rows.length && html`<div className="empty-state">Ingen fangster registrert ennå – første kast gjenstår!</div>`}
    <div className="catch-grid">
      ${rows.map(r=>html`<${CatchCard} key=${r.species.id+'|'+r.member} r=${r}/>`)}
    </div>
  </div>`;
}

export function GuestView(){
  useStore();
  return html`<div className="stats-wrap">
    <div className="stats-card guest-panel">
      <h3>Gjesteside</h3>
      <p>Gjester kan åpne FiskeDex uten passord og se arter, bilder, fangster, kart, toppliste og rekorder.</p>
      <p>De kan ikke legge til, redigere eller slette noe.</p>
      ${store.guest ? html`<button className="btn primary" onClick=${()=>update(s=>{s.guest=false;})}>Logg inn for å redigere</button>` : html`<p className="muted">Du er innlogget som redaktør nå.</p>`}
    </div>
    <div className="stats-card">
      <h3>Anbefalt deling</h3>
      <p className="muted">Send vanlig lenke til siden. De kan velge “Se som gjest” på innloggingen.</p>
    </div>
  </div>`;
}
