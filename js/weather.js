// Værstripe for Karmøy via open-meteo (gratis, ingen nøkkel)
import { store, update } from './store.js';
import { KARMOY } from './config.js';

export async function fetchWeather(){
  try{
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${KARMOY[0]}&longitude=${KARMOY[1]}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code&wind_speed_unit=ms&timezone=Europe%2FOslo`);
    const d = await r.json();
    const c = d.current;
    const ikon = {0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',48:'🌫',51:'🌦',53:'🌦',55:'🌧',61:'🌦',63:'🌧',65:'🌧',71:'🌨',73:'🌨',75:'❄️',80:'🌦',81:'🌧',82:'⛈',95:'⛈',96:'⛈',99:'⛈'};
    const dirs = ['N','NØ','Ø','SØ','S','SV','V','NV'];
    const dir = dirs[Math.round(c.wind_direction_10m/45)%8];
    update(s=>{
      s.weather = `${ikon[c.weather_code]||'🌊'} Fiskeværet på Karmøy nå: <b>${Math.round(c.temperature_2m)}°C</b> · 💨 ${Math.round(c.wind_speed_10m)} m/s fra ${dir}${c.precipitation>0?` · 🌧 ${c.precipitation} mm`:''}`;
    });
  }catch(e){ /* været er ikke kritisk */ }
}
