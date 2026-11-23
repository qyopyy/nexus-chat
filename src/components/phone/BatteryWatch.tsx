"use client";
import { useEffect, useState } from "react";
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, RefreshCw, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";
import { refreshHandset, thisDeviceId, type Handset } from "@/lib/handset";

function fresh(row:Handset,now:number){return now-Date.parse(row.last_seen)<90000;}
export default function BatteryWatch({rows,refresh}:{rows:Handset[];refresh?:()=>void}){
 const userId=useApp(s=>s.userId);
 const [now,setNow]=useState(()=>Date.now());
 const [loading,setLoading]=useState(false);
 const [notifyBelow,setNotifyBelow]=useState(20);
 const [notified,setNotified]=useState<Record<string,boolean>>({});
 const mine=thisDeviceId();
 useEffect(()=>{
   const timer=window.setInterval(()=>setNow(Date.now()),10000);
   return()=>clearInterval(timer);
 },[]);
 useEffect(()=>{
   // Notifications only while the dashboard is open. Never promise
   // background alerts or report absent battery data as 0%.
   const next:Record<string,boolean>={};
   for(const row of rows){
     if(row.kind!=="phone"||row.battery==null||!fresh(row,now))continue;
     const low=!row.charging&&row.battery<=notifyBelow;
     next[row.device_id]=low;
     if(low&&!notified[row.device_id]&&"Notification" in window&&Notification.permission==="granted")
       new Notification("Nexus battery watch",{body:`${row.label} is at ${row.battery}%`});
   }
   setNotified(previous=>{
     const changed=Object.keys(next).some(k=>next[k]!==previous[k])||Object.keys(previous).some(k=>!(k in next));
     return changed?next:previous;
   });
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[rows,now,notifyBelow]);
 const phones=rows.filter(row=>row.kind==="phone");
 return <section className="mt-5 rounded-3xl border border-white/10 bg-[#11161a] p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#7ee0c6]">Battery Watch</p><h2 className="mt-1 text-xl font-semibold">Linked phone batteries</h2><p className="mt-1 text-xs text-[#9eaaa8]">Live readings refresh when Nexus is open on the phone. Unsupported browsers show unavailable.</p></div>
     <button type="button" disabled={loading} onClick={async()=>{setLoading(true);try{await refreshHandset();refresh?.();}finally{setLoading(false);}}}
       className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs disabled:opacity-50"><RefreshCw size={14} className={loading?"animate-spin":""}/>Refresh this device</button>
   </div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    {phones.length===0?<p className="text-sm text-[#a8b3b0]">No phones yet. Sign in on a phone or approve a new device above.</p>:phones.map(row=>{
      const isLive=fresh(row,now),pct=row.battery;
      const Icon=pct==null?Smartphone:row.charging?BatteryCharging:pct<=20?BatteryLow:pct>=80?BatteryFull:BatteryMedium;
      return <div key={row.device_id} className="rounded-2xl border border-white/10 bg-[#0b1014] p-4">
         <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Icon size={21} className={row.charging?"text-[#7ee0c6]":pct!=null&&pct<=20?"text-orange-300":"text-[#b5c6cc]"}/><span className="truncate text-sm font-medium">{row.label}{row.device_id===mine?" (this device)":""}</span></div><span className={isLive?"text-xs text-[#7ee0c6]":"text-xs text-[#a1a5b0]"}>{isLive?"Online":"Offline"}</span></div>
         <div className="mt-3 flex items-end gap-2"><strong className="text-4xl tabular-nums">{pct==null?"—":`${pct}%`}</strong><span className="pb-1 text-xs text-[#a8b3b0]">{pct==null?"Unavailable":row.charging?"Charging":"On battery"}</span></div>
         <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`${row.label} battery`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct??undefined} aria-valuetext={pct==null?"Battery unavailable":`${pct} percent`}>
           {pct!=null&&<div className={`h-full rounded-full transition-all ${pct<=20?"bg-orange-400":"bg-[#7ee0c6]"}`} style={{width:`${pct}%`}}/>}
         </div>
         <p className="mt-2 text-xs text-[#a8b3b0]">{Number.isFinite(Date.parse(row.last_seen))?`Last update: ${new Date(row.last_seen).toLocaleTimeString()}`:"No update"}{!isLive?" · may be stale":""}</p>
         {pct==null&&<p className="mt-2 text-xs text-[#a8b3b0]">iPhone Safari does not provide battery percentage. Open the installed Nexus app with battery access, or use a supported browser.</p>}
       </div>;
    })}
   </div>
   <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-[#b4c1bf]">
     <label htmlFor="nexus-battery-threshold">Warn while this page is open below</label>
     <select id="nexus-battery-threshold" value={notifyBelow} onChange={e=>setNotifyBelow(Number(e.target.value))} className="rounded-lg bg-[#1d282a] px-2 py-1">
       <option value={10}>10%</option><option value={20}>20%</option><option value={30}>30%</option>
     </select>
     <button type="button" onClick={()=>{"Notification" in window&&Notification.requestPermission()}} disabled={typeof window==="undefined"||!("Notification" in window)} className="rounded-lg border border-white/15 px-2 py-1 disabled:opacity-50">Enable alerts</button>
   </div>
 </section>;
}
