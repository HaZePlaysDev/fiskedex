// Visninger: dashboard, toppliste, rekorder, fangstkart, fangstside og gjesteside
/* global React, htm, L */
import { store, update, useStore, toast, catchers, memberName, catOrder, canEdit, latestCatch, hasValidGps } from '../store.js';
import { CATS } from '../data.js';
import { FELLES, KARMOY } from '../config.js';
import * as db from '../db.js';
import { esc, parseWeightKg, parseLengthCm, fmtKg, fmtCm, makeThumbFromDataUrl, compressImage } from '../utils.js';

const html = htm.bind(React.createElement);
const { useState, useEffect, useRef } = React;

function allCatchRows(memberFilter = store.member){
  const rows = [];
  for(const s of store.species){
    for(const m of catchers(s)){
      if(memberFilter && m!==memberFilter) continue;
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

function dashboardGreeting(){
  const hour = new Date().getHours();
  if(hour < 6) return 'God natt';
  if(hour < 12) return 'God morgen';
  if(hour < 18) return 'God dag';
  return 'God kveld';
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
    ${rows.map((r,i)=>html`<button key=${r.m} onClick=${()=>update(s=>{ s.profileMember=r.m===FELLES?null:r.m; s.view=r.m===FELLES?'stats':'profiles'; })}>
      <span className="rank">${medal(i)}</span><b>${memberName(r.m)}</b><span>${r.count} arter</span>
    </button>`)}
  </div>`;
}

function catProgressRows(){
  return catOrder().map(cat=>{
    const list = store.species.filter(s=>s.cat===cat);
    const caught = list.filter(s=>catchers(s).length>0).length;
    return {cat, total:list.length, caught, pct:list.length?Math.round(100*caught/list.length):0};
  }).filter(r=>r.total);
}

export function DashboardView(){
  useStore();
  const rows = allCatchRows();
  const latest = latestCatch();
  const leaders = leaderboardRows().filter(r=>r.count>0);
  const leader = leaders[0] || null;
  const tot = store.species.length;
  const caught = store.species.filter(s=>catchers(s).length>0).length;
  const pct = tot ? Math.round(caught*100/tot) : 0;
  const mystery = mysterySpecies();
  const geoCount = rows.filter(r=>hasValidGps(r.catch)).length;
  const photoCount = rows.filter(r=>r.catch.hasPhoto).length;
  const progress = catProgressRows();
  const next = [...progress].sort((a,b)=>a.pct-b.pct || a.caught-b.caught)[0] || null;
  const welcomeName = store.member ? memberName(store.member) : 'gjengen';

  return html`<div className="dashboard dashboard-v20 dashboard-v23">
    <section className="dash-hero-card wide dash-command-card">
      <div className="dash-welcome">
        <div className="eyebrow">Dagens oversikt</div>
        <h2>${dashboardGreeting()}, ${welcomeName} <span aria-hidden="true">👋</span></h2>
        <p><b>${caught}/${tot} arter</b> er kartlagt. ${tot-caught ? `${tot-caught} mangler fortsatt — neste kategori: ${next ? CATS[next.cat].name : 'utforsk dexen'}.` : 'Alle arter er kartlagt. Legendarisk innsats.'}</p>
        <div className="dash-hero-actions">
          ${canEdit() && html`<button className="btn primary dashboard-catch" onClick=${()=>update(s=>{s.catchOpen=true;})}>🎣 Registrer fangst</button>`}
          <button className="btn ghost" onClick=${()=>update(s=>{s.view='dex';})}>◈ Utforsk Dex</button>
          <button className="btn ghost" onClick=${()=>update(s=>{s.view='records';})}>🏆 Rekorder</button>
        </div>
      </div>
      <div className="big-progress"><span>${pct}%</span><i><b style=${{width:pct+'%'}}></b></i><small>FULLFØRT</small></div>
    </section>

    <section className="dash-card latest-dash" onClick=${()=>latest && update(s=>{s.detailId=latest.species.id;})}>
      <div className="dash-card-head"><span>Siste fangst</span><button onClick=${e=>{e.stopPropagation();update(s=>{s.view='fangster';});}}>Se alle</button></div>
      ${latest ? html`<div className="dash-latest-body"><${Thumb} species=${latest.species} member=${latest.member}/><div><h3>${latest.species.name}</h3><p><b>${memberName(latest.member)}</b>${latest.catch.sted?' · '+latest.catch.sted:''}</p><small>${[latest.catch.dato,latest.catch.vekt,latest.catch.lengde].filter(Boolean).join(' · ')}</small></div></div>` : html`<p className="muted">Ingen fangster registrert ennå.</p>`}
    </section>

    <section className="dash-card leader-now-card">
      <div className="dash-card-head"><span>Leder akkurat nå</span><button onClick=${()=>update(s=>{s.view='stats';})}>Toppliste</button></div>
      ${leader ? html`<button className="leader-now" onClick=${()=>update(s=>{s.profileMember=leader.m;s.member=leader.m;s.view='profiles';})}><span className="leader-crown">👑</span><div><h3>${memberName(leader.m)}</h3><p>${leader.count} arter · ${leader.reactions} reaksjoner</p></div><span className="leader-go">Se profil →</span></button>` : html`<p className="muted">Første fangst avgjør hvem som leder.</p>`}
    </section>

    <section className="dash-card activity-card">
      <div className="dash-card-head"><span>Aktivitet</span><button onClick=${()=>update(s=>{s.view='map';})}>Åpne kart</button></div>
      <div className="activity-numbers"><div><b>${rows.length}</b><span>registrerte</span></div><div><b>${photoCount}</b><span>med bilde</span></div><div><b>${geoCount}</b><span>med GPS</span></div></div>
    </section>

    <section className="dash-card">
      <div className="dash-card-head"><span>Mini-toppliste</span><button onClick=${()=>update(s=>{s.view='stats';})}>Åpne</button></div>
      <${MiniLeaderboard}/>
    </section>

    <section className="dash-card mystery-card" onClick=${()=>mystery && update(s=>{s.detailId=mystery.id;})}>
      <div className="dash-card-head"><span>Dagens mystery-art</span><button onClick=${e=>{e.stopPropagation();update(s=>{s.view='dex';s.filterMystery=true;});}}>Finn flere</button></div>
      ${mystery ? html`<div className="mystery-big"><div className="mystery-mark">?</div><div><h3>???</h3><p>${firstSentence(mystery.info) || (mystery.min ? 'Har regel/minstemål: '+mystery.min : 'Ukjent art i dexen')}</p><small>${CATS[mystery.cat] ? CATS[mystery.cat].name : 'Annet'} · ${mystery.id}</small></div></div>` : html`<p className="muted">Alle arter er fanget. Sykt.</p>`}
    </section>

    <section className="dash-card quick-card">
      <div className="dash-card-head"><span>Snarveier</span></div>
      <div className="quick-grid">
        <button onClick=${()=>update(s=>{s.view='profiles';s.profileMember=s.member||s.members[0]||null;})}>👤 Fiskerprofiler</button>
        <button onClick=${()=>update(s=>{s.view='map';})}>🗺️ Fangstkart</button>
        <button onClick=${()=>update(s=>{s.view='records';})}>🏆 Rekorder</button>
        <button onClick=${()=>update(s=>{s.view='records';})}>🏆 Rekorder per art</button>
      </div>
    </section>

    <section className="dash-card wide progress-card-v20">
      <div className="dash-card-head"><span>Veien videre</span><button onClick=${()=>update(s=>{s.view='dex';})}>Åpne Dex</button></div>
      <div className="dash-cat-progress">${progress.map(r=>html`<button key=${r.cat} onClick=${()=>update(s=>{s.view='dex';s.filterCat=r.cat;})}><span>${CATS[r.cat].name}</span><i><b style=${{width:r.pct+'%'}}></b></i><strong>${r.caught}/${r.total}</strong></button>`)}</div>
    </section>
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
        <div key=${st.m} className=${'leader-card'+(i===0&&st.count>0?' gold':'')} onClick=${()=>{ if(st.m!==FELLES) update(s=>{s.profileMember=st.m;s.member=st.m;s.view='profiles';}); }}>
          <div className="leader-rank">${medal(i)}</div>
          <div className="leader-main"><h3>${memberName(st.m)}</h3><p>${st.count} ${st.count===1?'art':'arter'} · ${st.reactions} reaksjoner</p></div>
          ${editable && st.m!==FELLES && html`<button className="lb-del" onClick=${e=>{e.stopPropagation();delMember(st.m);}}>${delArmed===st.m ? 'Sikker? Trykk igjen' : 'Slett'}</button>`}
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
  const [recordCat, setRecordCat] = useState('ALL');
  const rows = allCatchRows(null);
  let heaviest=null, longest=null, mostReacted=null, newest=null;
  const firstBySpecies = new Map();
  for(const r of rows){
    const w = parseWeightKg(r.catch.vekt); if(w!=null && (!heaviest || w>heaviest.value)) heaviest={value:w,row:r};
    const l = parseLengthCm(r.catch.lengde); if(l!=null && (!longest || l>longest.value)) longest={value:l,row:r};
    const reacts = reactionTotal(r.catch); if(reacts>0 && (!mostReacted || reacts>mostReacted.value)) mostReacted={value:reacts,row:r};
    if(!newest || r.t>newest.t) newest=r;
    const old = firstBySpecies.get(r.species.id);
    if(!old || r.t<old.t) firstBySpecies.set(r.species.id,r);
  }
  const pioneer = new Map();
  for(const row of firstBySpecies.values()) pioneer.set(row.member,(pioneer.get(row.member)||0)+1);
  const topPioneer = [...pioneer.entries()].sort((a,b)=>b[1]-a[1])[0] || null;
  const personRows = leaderboardRows().filter(r=>r.count>0);
  const mythicalLeaders = personRows.map(r=>({m:r.m,count:store.species.filter(s=>s.cat==='M' && s.catches && s.catches[r.m]).length})).sort((a,b)=>b.count-a.count);
  const artRecords = store.species
    .filter(s=>recordCat==='ALL' || s.cat===recordCat)
    .map(s=>{
      const entries = catchers(s).map(member=>({member,catch:s.catches[member]}));
      let heavy=null, long=null;
      for(const e of entries){
        const w=parseWeightKg(e.catch.vekt); if(w!=null && (!heavy || w>heavy.value)) heavy={value:w,...e};
        const l=parseLengthCm(e.catch.lengde); if(l!=null && (!long || l>long.value)) long={value:l,...e};
      }
      return {species:s,heavy,long,count:entries.length};
    })
    .filter(r=>r.heavy || r.long || r.count)
    .sort((a,b)=>a.species.name.localeCompare(b.species.name,'nb'));

  function openRow(row){
    if(!row) return;
    update(s=>{s.member=row.member; s.detailId=row.species.id;});
  }
  function RecCard({icon,title,main,sub,row,accent=''}){
    return html`<button className=${'record-card record-highlight '+accent} onClick=${()=>openRow(row)} disabled=${!row}>
      <div className="rec-icon">${icon}</div><div><span>${title}</span><h3>${main || 'Ingen data ennå'}</h3>${sub && html`<p>${sub}</p>`}</div>
    </button>`;
  }
  const rowText = r => `${memberName(r.member)}${r.catch.sted?' · '+r.catch.sted:''}`;

  return html`<div className="records-page">
    <div className="section-title-row"><div><div className="eyebrow">Hall of fame</div><h2>Rekorder</h2><p className="records-help">Her ser dere rekorder for hele gjengen. Trykk på en art for å se alle fangstene av den.</p></div></div>
    <section className="records-hero">
      <div><div className="eyebrow">Gjengens beste øyeblikk</div><h3>${rows.length} registrerte fangster</h3><p>Her samles både de største fiskene, de ivrigste fiskerne og artsrekordene.</p></div>
      <div className="records-hero-badges"><span>⚖️ ${heaviest ? fmtKg(heaviest.value) : '–'}</span><span>📏 ${longest ? fmtCm(longest.value) : '–'}</span><span>✨ ${mythicalLeaders[0]?.count || 0}</span></div>
    </section>

    <div className="records-grid record-highlight-grid">
      <${RecCard} icon="⚖️" title="Tyngste fisk" main=${heaviest ? `${heaviest.row.species.name} – ${fmtKg(heaviest.value)}` : ''} sub=${heaviest ? rowText(heaviest.row) : ''} row=${heaviest&&heaviest.row}/>
      <${RecCard} icon="📏" title="Lengste fisk" main=${longest ? `${longest.row.species.name} – ${fmtCm(longest.value)}` : ''} sub=${longest ? rowText(longest.row) : ''} row=${longest&&longest.row}/>
      <${RecCard} icon="🆕" title="Nyeste fangst" main=${newest ? newest.species.name : ''} sub=${newest ? rowText(newest) : ''} row=${newest}/>
      <${RecCard} icon="🔥" title="Mest reagert på" main=${mostReacted ? `${mostReacted.row.species.name} – ${mostReacted.value} reaksjoner` : ''} sub=${mostReacted ? rowText(mostReacted.row) : ''} row=${mostReacted&&mostReacted.row}/>
    </div>

    <section className="record-section-grid">
      <div className="stats-card record-board"><h3>Fisker-rekorder</h3>
        ${personRows.length ? html`<div className="record-leader-list">
          ${personRows.slice(0,6).map((r,i)=>html`<button key=${r.m} onClick=${()=>update(s=>{s.member=r.m;s.profileMember=r.m;s.view='profiles';})}><span>${i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.'}</span><b>${memberName(r.m)}</b><small>${r.count} arter</small></button>`)}
        </div>` : html`<p className="muted">Ingen fiskerrekorder ennå.</p>`}
      </div>
      <div className="stats-card record-board"><h3>Spesialrekorder</h3>
        <div className="record-special-lines">
          <button onClick=${()=>topPioneer && update(s=>{s.member=topPioneer[0];s.profileMember=topPioneer[0];s.view='profiles';})}><span>🆕</span><div><b>Pionér</b><small>${topPioneer ? `${memberName(topPioneer[0])} var først på ${topPioneer[1]} arter` : 'Mangler datagrunnlag'}</small></div></button>
          <button onClick=${()=>mythicalLeaders[0] && update(s=>{s.member=mythicalLeaders[0].m;s.profileMember=mythicalLeaders[0].m;s.view='profiles';})}><span>✨</span><div><b>Mythical hunter</b><small>${mythicalLeaders[0]?.count ? `${memberName(mythicalLeaders[0].m)} har ${mythicalLeaders[0].count} encounters` : 'Ingen encounters ennå'}</small></div></button>
          <div><span>📍</span><div><b>Kartlagt</b><small>${rows.filter(r=>hasValidGps(r.catch)).length} fangster har GPS-posisjon</small></div></div>
        </div>
      </div>
    </section>

    <section className="art-records-section">
      <div className="section-title-row"><div><div className="eyebrow">Per art</div><h2>Beste fangst per art</h2><p className="records-help">Viser den tyngste og lengste registrerte fangsten for hver art. Mangler det mål eller vekt, står det tomt.</p></div><div className="record-cat-filters"><button className=${recordCat==='ALL'?'active':''} onClick=${()=>setRecordCat('ALL')}>Alle</button>${catOrder().map(c=>html`<button key=${c} className=${recordCat===c?'active':''} onClick=${()=>setRecordCat(c)}>${CATS[c].name}</button>`)}</div></div>
      <div className="art-record-list">
        ${artRecords.length ? artRecords.map(r=>html`<button key=${r.species.id} className="art-record-row" onClick=${()=>update(s=>{s.member=null;s.detailId=r.species.id;})}>
          <div><b>${r.species.name}</b><small>${r.species.id} · ${r.count} registrert</small></div>
          <span>${r.heavy ? `⚖️ ${fmtKg(r.heavy.value)} · ${memberName(r.heavy.member)}` : '–'}</span>
          <span>${r.long ? `📏 ${fmtCm(r.long.value)} · ${memberName(r.long.member)}` : '–'}</span>
        </button>`) : html`<p className="muted">Ingen fangster med mål eller vekt i dette filteret.</p>`}
      </div>
    </section>
  </div>`;
}

/* ---------- 🗺️ Fangstkart ---------- */
const MAP_CAT_COLORS = {
  F:'#2f7d5b', K:'#e8612c', B:'#2364a0', H:'#1398a5', M:'#7b3fb2',
};
const MAP_CAT_ICONS = {F:'🏞️', K:'🌊', B:'⚓', H:'🦀', M:'✨'};
function mapCatColor(cat){ return MAP_CAT_COLORS[cat] || '#56684c'; }
function mapCatIcon(cat){ return MAP_CAT_ICONS[cat] || '🐟'; }
function mapPinIcon(species){
  const color = mapCatColor(species.cat);
  return L.divIcon({className:'fish-pin-wrap',html:`<div class="fish-pin" style="--pin:${color}"><span>${mapCatIcon(species.cat)}</span></div>`,iconSize:[36,42],iconAnchor:[18,40],popupAnchor:[0,-38]});
}
function mapClusterIcon(rows){
  const cats=[...new Set(rows.map(r=>r.species.cat))];
  const color=cats.length===1?mapCatColor(cats[0]):'#122b36';
  const icon=cats.length===1?mapCatIcon(cats[0]):'🐟';
  return L.divIcon({className:'fish-pin-wrap',html:`<div class="fish-cluster-pin" style="--pin:${color}"><span>${icon}</span><b>${rows.length}</b></div>`,iconSize:[46,46],iconAnchor:[23,23],popupAnchor:[0,-24]});
}
function rowDate(r){ return String(r.catch.dato || r.catch.created || '').slice(0,10); }
function seasonFor(date){
  const m=Number((date||'').slice(5,7));
  if(!m) return 'Ukjent';
  if([12,1,2].includes(m)) return 'Vinter';
  if([3,4,5].includes(m)) return 'Vår';
  if([6,7,8].includes(m)) return 'Sommer';
  return 'Høst';
}
function mapPopupRow(r){
  return `<li><i style="background:${mapCatColor(r.species.cat)}"></i><b>${esc(r.species.name)}</b> · ${esc(memberName(r.member))}${r.catch.sted ? ' · '+esc(r.catch.sted):''}</li>`;
}

export function MapView(){
  useStore();
  const [mapCat, setMapCat] = useState('ALL');
  const [mapMember, setMapMember] = useState(store.member || 'ALL');
  const [mapSeason, setMapSeason] = useState('ALL');
  const [mapYear, setMapYear] = useState('ALL');
  const [onlyPhoto, setOnlyPhoto] = useState(false);
  useEffect(()=>{ setMapMember(store.member || 'ALL'); }, [store.member]);

  const mapTabs=[{key:'ALL',name:'Alle'},...catOrder().map(c=>({key:c,name:CATS[c].name}))];
  const allRows=allCatchRows(mapMember==='ALL'?null:mapMember);
  const years=[...new Set(allRows.map(rowDate).filter(d=>/^\d{4}/.test(d)).map(d=>d.slice(0,4)))].sort().reverse();
  const rows=allRows.filter(r=>{
    if(mapCat!=='ALL' && r.species.cat!==mapCat) return false;
    const date=rowDate(r);
    if(mapSeason!=='ALL' && seasonFor(date)!==mapSeason) return false;
    if(mapYear!=='ALL' && !date.startsWith(mapYear)) return false;
    if(onlyPhoto && !r.catch.hasPhoto) return false;
    return hasValidGps(r.catch);
  });
  const dataKey=rows.map(r=>[r.species.id,r.member,r.catch.lat,r.catch.lng,r.catch.dato,r.catch.hasPhoto].join('|')).join('~');

  useEffect(()=>{
    const box=document.getElementById('mapBox');
    if(!box) return;
    if(typeof L==='undefined'){ box.innerHTML='<p style="padding:20px">Kartbiblioteket fikk ikke lastet – sjekk nettet.</p>'; return; }
    const map=L.map('mapBox',{scrollWheelZoom:true}).setView(KARMOY,10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
    map.createPane('heatPane'); map.getPane('heatPane').style.zIndex=350;
    const groups=new Map();
    for(const r of rows){
      const lat=Number(r.catch.lat),lng=Number(r.catch.lng);
      const key=`${Math.round(lat*900)/900}|${Math.round(lng*900)/900}`;
      const group=groups.get(key)||{rows:[],latSum:0,lngSum:0};
      group.rows.push(r); group.latSum+=lat; group.lngSum+=lng; groups.set(key,group);
    }
    const pts=[];
    for(const group of groups.values()){
      const lat=group.latSum/group.rows.length,lng=group.lngSum/group.rows.length;
      pts.push([lat,lng]);
      const cats=[...new Set(group.rows.map(r=>r.species.cat))];
      const color=cats.length===1?mapCatColor(cats[0]):'#122b36';
      const radius=Math.min(1500,170+Math.sqrt(group.rows.length)*310);
      L.circle([lat,lng],{pane:'heatPane',radius,color,fillColor:color,weight:2,opacity:.44,fillOpacity:Math.min(.33,.09+group.rows.length*.035)}).addTo(map).bindTooltip(`${group.rows.length} fangst${group.rows.length===1?'':'er'} i området`);
      if(group.rows.length===1){
        const r=group.rows[0];
        const popup=`<div class="map-popup"><b>${esc(r.species.name)}</b><br><span class="map-pop-cat" style="background:${mapCatColor(r.species.cat)}">${esc(CATS[r.species.cat]?.name||'Annet')}</span><br>${esc(memberName(r.member))}${r.catch.dato?' · '+esc(r.catch.dato):''}${r.catch.vekt?'<br>⚖️ '+esc(r.catch.vekt):''}${r.catch.lengde?'<br>📏 '+esc(r.catch.lengde):''}${r.catch.sted?'<br>📍 '+esc(r.catch.sted):''}${r.catch.weather?'<br>🌦 '+esc(r.catch.weather):''}</div>`;
        L.marker([lat,lng],{icon:mapPinIcon(r.species),riseOnHover:true}).addTo(map).bindPopup(popup).on('dblclick',()=>update(s=>{s.member=r.member;s.detailId=r.species.id;}));
      }else{
        const popup=`<div class="map-popup cluster-popup"><b>${group.rows.length} fangster i samme område</b><ul>${group.rows.map(mapPopupRow).join('')}</ul><small>Trykk på en enkelt pin andre steder for detaljer.</small></div>`;
        L.marker([lat,lng],{icon:mapClusterIcon(group.rows),riseOnHover:true}).addTo(map).bindPopup(popup);
      }
    }
    if(pts.length) map.fitBounds(pts,{padding:[44,44],maxZoom:13});
    setTimeout(()=>map.invalidateSize(),80);
    return ()=>map.remove();
  },[dataKey]);

  const members=[...store.members];
  if(store.species.some(s=>s.catches && s.catches[FELLES]) && !members.includes(FELLES)) members.push(FELLES);
  return html`<div className="stats-card map-card" style=${{marginTop:'18px'}}>
    <div className="map-head"><div><div className="eyebrow">Fangstkart</div><h3>Kartlegg historiene</h3><p className="muted">Fargede pins viser type fangst. Tall-pins samler fangster som ligger nær hverandre.</p></div><div className="map-viewing">${rows.length} synlige fangster</div></div>
    <div className="map-tools">${mapTabs.map(t=>html`<button key=${t.key} className=${'map-cat'+(mapCat===t.key?' active':'')} style=${t.key!=='ALL'?{borderColor:mapCatColor(t.key)}:null} onClick=${()=>setMapCat(t.key)}>${t.key==='ALL'?'🧭':mapCatIcon(t.key)} ${t.name}</button>`)}</div>
    <div className="map-filter-grid">
      <label>Fisker<select value=${mapMember} onChange=${e=>setMapMember(e.target.value)}><option value="ALL">Alle fiskere</option>${members.map(m=>html`<option key=${m} value=${m}>${memberName(m)}</option>`)}</select></label>
      <label>Årstid<select value=${mapSeason} onChange=${e=>setMapSeason(e.target.value)}><option value="ALL">Alle årstider</option><option>Vinter</option><option>Vår</option><option>Sommer</option><option>Høst</option></select></label>
      <label>År<select value=${mapYear} onChange=${e=>setMapYear(e.target.value)}><option value="ALL">Alle år</option>${years.map(y=>html`<option key=${y}>${y}</option>`)}</select></label>
      <button className=${'map-photo-filter'+(onlyPhoto?' active':'')} onClick=${()=>setOnlyPhoto(!onlyPhoto)}>📷 Kun med bilde</button>
    </div>
    <div id="mapBox" className="map-box"></div>
    <div className="map-legend">${catOrder().map(c=>html`<span key=${c}><i style=${{background:mapCatColor(c)}}></i>${mapCatIcon(c)} ${CATS[c].name}</span>`)}</div>
    <p className="muted" style=${{marginTop:'8px'}}>Dobbelttrykk på en enkel pin for å åpne artskortet. Varme sirkler blir større der flere fangster ligger tett.</p>
  </div>`;
}

function CatchCard({r,onOpen}){
  const [url,setUrl] = useState(null);
  useEffect(()=>{
    let alive = true;
    setUrl(null);
    if(r.catch.hasPhoto) db.loadPhotoThumb(r.species.id, r.member).then(u=>{ if(alive) setUrl(u); });
    return ()=>{ alive=false; };
  }, [r.species.id, r.member, r.catch.hasPhoto]);
  const extra = [r.catch.sted, r.catch.vekt, r.catch.lengde, r.catch.weather].filter(Boolean).join(' · ');
  return html`<article className="catch-card" onClick=${onOpen || (()=>update(st=>{ st.member=r.member; st.detailId = r.species.id; }))}>
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
    <div className="section-title-row"><div><div className="eyebrow">Fangster</div><h2>Alle registrerte fangster</h2></div><div className="log-actions">${canEdit() && html`<button className="btn primary" onClick=${()=>update(s=>{s.catchOpen=true;})}>🎣 Registrer fangst</button>`}<button className="btn ghost" onClick=${()=>reload(false)}>↻ Oppdater</button></div></div>
    ${!rows.length && html`<div className="empty-state">Ingen fangster registrert ennå – første kast gjenstår!</div>`}
    <div className="catch-grid">
      ${rows.map(r=>html`<${CatchCard} key=${r.species.id+'|'+r.member} r=${r}/>`)}
    </div>
  </div>`;
}

export function ProfileView(){
  useStore();
  const allMembers=[...store.members];
  if(store.species.some(s=>s.catches && s.catches[FELLES]) && !allMembers.includes(FELLES)) allMembers.push(FELLES);
  const memberKey=allMembers.join('|');
  const [selected,setSelected]=useState(store.profileMember || store.member || allMembers[0] || '');
  useEffect(()=>{
    const wanted=store.profileMember || store.member || allMembers[0] || '';
    if(wanted && allMembers.includes(wanted)) setSelected(wanted);
  },[store.profileMember,store.member,memberKey]);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const profilePhoto = (store.profilePhotos && store.profilePhotos[selected]) || '';
  const photoInputId = 'profilePhotoInput';

  if(!allMembers.length) return html`<div className="empty-state">Legg til minst én fisker før dere åpner profiler.</div>`;
  const rows=allCatchRows(selected);
  const leaderboard=leaderboardRows();
  const rank=Math.max(0,leaderboard.findIndex(r=>r.m===selected))+1;
  const stats=leaderboard.find(r=>r.m===selected) || {count:0,reactions:0};
  const photos=rows.filter(r=>r.catch.hasPhoto).length;
  const positions=rows.filter(r=>hasValidGps(r.catch)).length;
  const mythical=rows.filter(r=>r.species.cat==='M').length;
  let heaviest=null,longest=null;
  for(const r of rows){
    const w=parseWeightKg(r.catch.vekt); if(w!=null && (!heaviest || w>heaviest.value)) heaviest={value:w,row:r};
    const l=parseLengthCm(r.catch.lengde); if(l!=null && (!longest || l>longest.value)) longest={value:l,row:r};
  }
  const byCat={};
  for(const r of rows) byCat[r.species.cat]=(byCat[r.species.cat]||0)+1;
  const favourite=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  const badges=[];
  if(rows.length) badges.push(['🎣','Første fangst','Har registrert fangst']);
  if(rows.length>=10) badges.push(['🧭','Artsjeger','10 eller flere arter']);
  if(photos>=5) badges.push(['📸','Fotograf','5 fangster med bilde']);
  if(positions>=5) badges.push(['📍','Kartlegger','5 fangster med GPS']);
  if(mythical) badges.push(['✨','Mythical hunter',`${mythical} encounter${mythical===1?'':'s'}`]);
  const changeMember=m=>{setSelected(m);update(s=>{s.profileMember=m;s.member=m;});};

  async function onProfilePhoto(ev){
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if(!file || !selected || selected===FELLES) return;
    if(!String(file.type||'').startsWith('image/')){ toast('Velg en bildefil'); return; }
    setUploadingPhoto(true);
    try{
      const compressed = await compressImage(file);
      // Bruk miniutgaven. Den ser skarp ut i en avatar, men holder databasen liten.
      const dataUrl = typeof compressed === 'string' ? compressed : (compressed.thumb || compressed.full);
      const result = await db.saveMemberProfilePhoto(selected, dataUrl);
      if(!result.ok){
        const reason = String((result.error && result.error.message) || '');
        toast(/profile_photo/i.test(reason)
          ? 'Kjør v22-SQL-filen i Supabase før du legger til profilbilder'
          : 'Kunne ikke lagre profilbildet');
        return;
      }
      update(s=>{ s.profilePhotos = {...(s.profilePhotos||{}), [selected]:dataUrl}; });
      toast('Profilbildet er lagret');
    }catch(err){
      console.error(err);
      toast('Kunne ikke lese bildet. Prøv et annet bilde.');
    }finally{ setUploadingPhoto(false); }
  }

  async function removeProfilePhoto(){
    if(!selected || selected===FELLES) return;
    const result = await db.deleteMemberProfilePhoto(selected);
    if(!result.ok){ toast('Kunne ikke slette profilbildet'); return; }
    update(s=>{
      const next={...(s.profilePhotos||{})};
      delete next[selected];
      s.profilePhotos=next;
    });
    toast('Profilbildet er fjernet');
  }

  return html`<div className="profile-page">
    <div className="section-title-row"><div><div className="eyebrow">Fiskerprofil</div><h2>Din FiskeDex</h2></div><button className="btn ghost" onClick=${()=>update(s=>{s.member=selected;s.view='map';})}>🗺️ Vis på kart</button></div>
    <section className="profile-hero">
      <div className="profile-avatar-wrap">
        <div className=${'profile-avatar'+(profilePhoto?' has-photo':'')}>
          ${profilePhoto ? html`<img src=${profilePhoto} alt=${`Profilbilde av ${memberName(selected)}`}/>` : (selected===FELLES?'👥':selected.slice(0,1).toUpperCase())}
        </div>
        ${canEdit() && selected!==FELLES && html`
          <input id=${photoInputId} className="vh" type="file" accept="image/*" onChange=${onProfilePhoto}/>
          <label className="profile-photo-edit" htmlFor=${photoInputId} title="Bytt profilbilde">${uploadingPhoto?'⏳':'📷'}<span>${uploadingPhoto?'Lagrer':'Bilde'}</span></label>
        `}
      </div>
      <div className="profile-intro"><label>Velg fisker<select value=${selected} onChange=${e=>changeMember(e.target.value)}>${allMembers.map(m=>html`<option key=${m} value=${m}>${memberName(m)}</option>`)}</select></label><h3>${memberName(selected)}</h3><p>${rank ? `#${rank} på topplisten` : 'Klar for første fangst'} · ${stats.count||0} arter registrert · ${stats.reactions||0} reaksjoner</p>
        ${canEdit() && selected!==FELLES && html`<div className="profile-photo-help"><b>${profilePhoto?'Profilbilde valgt':'Ingen profilbilde ennå'}</b><span>Trykk på kameraet for å velge eller bytte bilde.</span>${profilePhoto && html`<button onClick=${removeProfilePhoto}>Fjern bilde</button>`}</div>`}
      </div>
      <div className="profile-hero-actions">${canEdit() && html`<button className="btn primary" onClick=${()=>update(s=>{s.member=selected;s.catchOpen=true;})}>🎣 Registrer fangst</button>`}<button className="btn ghost" onClick=${()=>update(s=>{s.member=selected;s.view='dex';s.filterMine=true;})}>🐟 Se min Dex</button></div>
    </section>

    <section className="profile-stat-grid">
      <div><span>ARTER</span><b>${rows.length}</b><small>registrert</small></div>
      <div><span>FANGSTBILDER</span><b>${photos}</b><small>lagret</small></div>
      <div><span>KARTPINS</span><b>${positions}</b><small>med GPS</small></div>
      <div><span>MYTHICAL</span><b>${mythical}</b><small>encounters</small></div>
    </section>

    <section className="profile-content-grid">
      <div className="stats-card profile-best"><div className="dash-card-head"><span>Personlige rekorder</span><button onClick=${()=>update(s=>{s.view='records';})}>Alle rekorder</button></div>
        <div className="profile-record-lines"><div><span>⚖️</span><p><b>Tyngste</b><small>${heaviest ? `${heaviest.row.species.name} · ${fmtKg(heaviest.value)}` : 'Ingen vekt registrert'}</small></p></div><div><span>📏</span><p><b>Lengste</b><small>${longest ? `${longest.row.species.name} · ${fmtCm(longest.value)}` : 'Ingen lengde registrert'}</small></p></div><div><span>🌊</span><p><b>Favorittområde</b><small>${favourite ? `${CATS[favourite[0]]?.name || 'Annet'} · ${favourite[1]} arter` : 'Ingen fangster ennå'}</small></p></div></div>
      </div>
      <div className="stats-card profile-badges"><div className="dash-card-head"><span>Merker</span></div>${badges.length ? html`<div className="badge-grid">${badges.map(b=>html`<div key=${b[1]}><span>${b[0]}</span><b>${b[1]}</b><small>${b[2]}</small></div>`)}</div>` : html`<p className="muted">Første merke kommer når du registrerer en fangst.</p>`}</div>
    </section>

    <section className="profile-recent"><div className="section-title-row"><div><div className="eyebrow">Siste fangster</div><h2>${memberName(selected)}s fangster</h2></div><button className="btn ghost" onClick=${()=>update(s=>{s.member=selected;s.view='fangster';})}>Se alle</button></div>
      ${rows.length ? html`<div className="catch-grid">${rows.slice(0,6).map(r=>html`<${CatchCard} key=${r.species.id+'|'+r.member} r=${r} onOpen=${()=>update(s=>{s.member=selected;s.detailId=r.species.id;})}/>` )}</div>` : html`<div className="empty-state">Ingen fangster for ${memberName(selected)} ennå.</div>`}
    </section>
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
