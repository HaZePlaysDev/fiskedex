// Verktøy: parsing, bildekomprimering og silhuett-sporing (uendret logikk)
function esc(s){ return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function memberName(m){ return m===FELLES?'Felles':m; }
function catchers(s){ return Object.keys(s.catches||{}); }
function isCaught(s){ return state.member ? !!(s.catches&&s.catches[state.member]) : catchers(s).length>0; }
function nextId(cat){
  const nums = state.species.filter(s=>s.cat===cat).map(s=>parseInt(s.id.slice(1),10)).filter(n=>!isNaN(n));
  const n = (nums.length?Math.max(...nums):0)+1;
  return cat + String(n).padStart(3,'0');
}
function parseWeightKg(v){
  if(!v) return null;
  const m=String(v).replace(',','.').match(/([\d.]+)\s*(kg|g)?/i);
  if(!m) return null;
  let n=parseFloat(m[1]); if(isNaN(n)) return null;
  const u=(m[2]||'').toLowerCase();
  if(u==='g') n=n/1000;
  else if(!u && n>50) n=n/1000;   // "800" uten enhet tolkes som gram
  return n;
}
function parseLengthCm(v){
  if(!v) return null;
  const m=String(v).replace(',','.').match(/([\d.]+)\s*(cm|mm|m)?/i);
  if(!m) return null;
  let n=parseFloat(m[1]); if(isNaN(n)) return null;
  const u=(m[2]||'').toLowerCase();
  if(u==='m') n=n*100;
  else if(u==='mm') n=n/10;
  return n;
}
function fmtKg(n){ return n>=1 ? (Math.round(n*100)/100).toString().replace('.',',')+' kg' : Math.round(n*1000)+' g'; }
function fmtCm(n){ return (Math.round(n*10)/10).toString().replace('.',',')+' cm'; }
function compressImage(file){
  return new Promise((res,rej)=>{
    const reader = new FileReader();
    reader.onerror = ()=>rej(new Error('read'));
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        try{
          const MAX=2000;
          let w=img.naturalWidth, h=img.naturalHeight;
          if(!w||!h) return rej(new Error('decode'));
          let tw=w, th=h;
          if(Math.max(w,h)>MAX){ const k=MAX/Math.max(w,h); tw=Math.round(w*k); th=Math.round(h*k); }
          // trinnvis halvering gir skarpere nedskalering enn ett stort hopp
          let src=img, sw=w, sh=h;
          while(sw/2 >= tw && sh/2 >= th){
            const half=document.createElement('canvas');
            half.width=Math.round(sw/2); half.height=Math.round(sh/2);
            const hctx=half.getContext('2d');
            hctx.imageSmoothingQuality='high';
            hctx.drawImage(src,0,0,half.width,half.height);
            src=half; sw=half.width; sh=half.height;
          }
          const c=document.createElement('canvas'); c.width=tw; c.height=th;
          const ctx=c.getContext('2d');
          ctx.imageSmoothingQuality='high';
          ctx.drawImage(src,0,0,tw,th);
          res(c.toDataURL('image/jpeg',0.9));
        }catch(err){ rej(err); }
      };
      img.onerror = ()=>rej(new Error('decode'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function readAsDataURL(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}
function loadImage(url){
  return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
}
async function traceSilhouette(file){
  const img = await loadImage(await readAsDataURL(file));
  const MAX=380;
  const k=Math.min(1, MAX/Math.max(img.naturalWidth,img.naturalHeight));
  const w=Math.max(2,Math.round(img.naturalWidth*k)), h=Math.max(2,Math.round(img.naturalHeight*k));
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,w,h);
  const d=ctx.getImageData(0,0,w,h).data;
  const N=w*h;
  // bakgrunnsfarge = median av kantpiksler
  const rs=[],gs=[],bs=[];
  const grab=i=>{const j=4*i; rs.push(d[j]); gs.push(d[j+1]); bs.push(d[j+2]);};
  for(let x=0;x<w;x++){grab(x); grab((h-1)*w+x);}
  for(let y=0;y<h;y++){grab(y*w); grab(y*w+w-1);}
  const med=a=>{a.sort((p,q)=>p-q); return a[a.length>>1];};
  const br=med(rs), bg=med(gs), bb=med(bs);
  const TOL2=45*45;
  const near=i=>{const j=4*i, dr=d[j]-br, dg=d[j+1]-bg, db=d[j+2]-bb; return dr*dr+dg*dg+db*db<TOL2;};
  // flood-fill bakgrunn fra alle kanter
  const lab=new Uint8Array(N), q=new Int32Array(N); let qt=0,qh=0;
  const seed=i=>{ if(!lab[i]&&near(i)){ lab[i]=1; q[qt++]=i; } };
  for(let x=0;x<w;x++){seed(x); seed((h-1)*w+x);}
  for(let y=0;y<h;y++){seed(y*w); seed(y*w+w-1);}
  while(qh<qt){ const i=q[qh++], x=i%w;
    if(x>0)seed(i-1); if(x<w-1)seed(i+1); if(i>=w)seed(i-w); if(i<N-w)seed(i+w); }
  // største sammenhengende motiv
  const comp=new Int32Array(N); let nc=0, best=0, bestSize=0;
  for(let s0=0;s0<N;s0++){
    if(lab[s0]||comp[s0]) continue;
    nc++; let size=0; qh=0; qt=0; q[qt++]=s0; comp[s0]=nc;
    while(qh<qt){ const i=q[qh++]; size++; const x=i%w;
      const tryN=j=>{ if(!lab[j]&&!comp[j]){comp[j]=nc; q[qt++]=j;} };
      if(x>0)tryN(i-1); if(x<w-1)tryN(i+1); if(i>=w)tryN(i-w); if(i<N-w)tryN(i+w); }
    if(size>bestSize){bestSize=size; best=nc;}
  }
  const frac=bestSize/N;
  if(!best || frac<0.02 || frac>0.75) throw new Error('seg');
  // tett hull: alt som ikke er motiv og ikke når kanten, blir motiv
  const reach=new Uint8Array(N); qh=0; qt=0;
  const seedR=i=>{ if(!reach[i]&&comp[i]!==best){ reach[i]=1; q[qt++]=i; } };
  for(let x=0;x<w;x++){seedR(x); seedR((h-1)*w+x);}
  for(let y=0;y<h;y++){seedR(y*w); seedR(y*w+w-1);}
  while(qh<qt){ const i=q[qh++], x=i%w;
    if(x>0)seedR(i-1); if(x<w-1)seedR(i+1); if(i>=w)seedR(i-w); if(i<N-w)seedR(i+w); }
  const main=i=>comp[i]===best || (!reach[i]);
  // bounding box
  let x0=w,y0=h,x1=0,y1=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){ if(main(y*w+x)){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
  const bw=x1-x0+1, bh=y1-y0+1;
  if(bw<4||bh<4) throw new Error('seg');
  // tegn marineblå silhuett, skaler med kantutjevning
  const sc=document.createElement('canvas'); sc.width=bw; sc.height=bh;
  const sctx=sc.getContext('2d');
  const out=sctx.createImageData(bw,bh);
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    if(main((y+y0)*w+(x+x0))){ const j=4*(y*bw+x); out.data[j]=18; out.data[j+1]=43; out.data[j+2]=54; out.data[j+3]=255; }
  }
  sctx.putImageData(out,0,0);
  const fit=Math.min(120/bh, 200/bw);
  const fw=Math.max(1,Math.round(bw*fit)), fh=Math.max(1,Math.round(bh*fit));
  const fc=document.createElement('canvas'); fc.width=fw; fc.height=fh;
  const fctx=fc.getContext('2d'); fctx.imageSmoothingQuality='high';
  fctx.drawImage(sc,0,0,fw,fh);
  return fc.toDataURL('image/png');
}
export { esc, parseWeightKg, parseLengthCm, fmtKg, fmtCm, compressImage, traceSilhouette };
