// Vær- og tidevannsstripe for Karmøy
// Vær: Open-Meteo (gratis, ingen nøkkel)
// Tidevann: Kartverket sitt åpne vannstands-API
import { store, update } from './store.js';
import { KARMOY } from './config.js';

function pad(n){ return String(n).padStart(2,'0'); }
function localStamp(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function clock(d){
  return new Intl.DateTimeFormat('no-NO',{hour:'2-digit',minute:'2-digit'}).format(d);
}

async function fetchWeatherPart(){
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${KARMOY[0]}&longitude=${KARMOY[1]}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code&wind_speed_unit=ms&timezone=Europe%2FOslo`);
  const d = await r.json();
  const c = d.current;
  const ikon = {0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',48:'🌫',51:'🌦',53:'🌦',55:'🌧',61:'🌦',63:'🌧',65:'🌧',71:'🌨',73:'🌨',75:'❄️',80:'🌦',81:'🌧',82:'⛈',95:'⛈',96:'⛈',99:'⛈'};
  const dirs = ['N','NØ','Ø','SØ','S','SV','V','NV'];
  const dir = dirs[Math.round(c.wind_direction_10m/45)%8];
  return `${ikon[c.weather_code]||'🌊'} Karmøy nå: <b>${Math.round(c.temperature_2m)}°C</b> · 💨 ${Math.round(c.wind_speed_10m)} m/s fra ${dir}${c.precipitation>0?` · 🌧 ${c.precipitation} mm`:''}`;
}

async function fetchTidePart(){
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate()+2);
  const q = new URLSearchParams({
    lat:String(KARMOY[0]),
    lon:String(KARMOY[1]),
    fromtime:localStamp(start),
    totime:localStamp(end),
    datatype:'tab',          // flo/fjære-tabell
    refcode:'cd',            // sjøkartnull
    place:'Karmøy',
    file:'',
    lang:'nb',
    interval:'10',
    dst:'1',
    tzone:'1',
    tide_request:'locationdata',
  });
  const r = await fetch(`https://vannstand.kartverket.no/tideapi.php?${q.toString()}`);
  const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const now = Date.now();
  const events = [...xml.querySelectorAll('waterlevel')]
    .map(n=>({
      value:Number(n.getAttribute('value')),
      time:new Date(n.getAttribute('time')),
      flag:n.getAttribute('flag'),
    }))
    .filter(x=>['high','low'].includes(x.flag) && !Number.isNaN(x.value) && x.time.getTime()>now-60*60*1000)
    .sort((a,b)=>a.time-b.time);
  const next = events.find(x=>x.time.getTime()>=now) || events[0];
  if(!next) return '';
  const navn = next.flag === 'high' ? 'Flo' : 'Fjære';
  return `🌊 Neste ${navn.toLowerCase()}: <b>${clock(next.time)}</b> (${Math.round(next.value)} cm)`;
}

export async function fetchWeather(){
  const parts = [];
  const [w,t] = await Promise.allSettled([fetchWeatherPart(), fetchTidePart()]);
  if(w.status==='fulfilled' && w.value) parts.push(w.value);
  if(t.status==='fulfilled' && t.value) parts.push(t.value);
  if(parts.length){
    update(s=>{ s.weather = parts.join(' · '); });
  }
}
