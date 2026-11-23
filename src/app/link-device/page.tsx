"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BatteryCharging, CheckCircle2, KeyRound, MonitorSmartphone, RefreshCw, ShieldCheck } from "lucide-react";
import { cancelPairing, checkPairing, redeemPairing, startPairing, storedPairing, type Pairing } from "@/lib/deviceLink";
import { supabase, errorText } from "@/lib/supabase";

export default function LinkDevicePage(){
  const [pair,setPair]=useState<Pairing|null>(null);
  const [phase,setPhase]=useState<"idle"|"waiting"|"redeeming"|"done"|"expired">("idle");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [seconds,setSeconds]=useState(0);
  const inFlight=useRef(false);
  const redeeming=useRef(false);
  const [signedIn,setSignedIn]=useState(false);

  useEffect(()=>{
    let alive=true;
    void supabase.auth.getSession().then(({data})=>{if(alive)setSignedIn(!!data.session);});
    const remembered=storedPairing();
    if(remembered){setPair(remembered);setPhase("waiting");}
    return ()=>{alive=false};
  },[]);

  const begin=useCallback(async()=>{
    setBusy(true);setError(null);
    try{
      const next=await startPairing();
      setPair(next);setPhase("waiting");
    }catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  },[]);

  const finish=useCallback(async(current:Pairing)=>{
    if(redeeming.current)return;
    redeeming.current=true;setPhase("redeeming");
    try{
      await redeemPairing(current);
      setPhase("done");
      window.location.assign("/phone");
    }catch(e){setError(errorText(e));setPhase("expired");setPair(null);}
    finally{redeeming.current=false;}
  },[]);

  useEffect(()=>{
    if(!pair||phase!=="waiting")return;
    let live=true;
    const poll=async()=>{
      const remaining=Math.max(0,Math.ceil((Date.parse(pair.expires_at)-Date.now())/1000));
      if(!live)return;
      setSeconds(remaining);
      if(!remaining){setPhase("expired");return;}
      if(inFlight.current)return;
      inFlight.current=true;
      try{
        const status=await checkPairing(pair);
        if(!live)return;
        if(status==="approved"){void finish(pair);return;}
        if(status==="expired"||status==="cancelled"||status==="consumed"){setPhase("expired");}
        setError(null);
      }catch(e){if(live)setError(errorText(e));}
      finally{inFlight.current=false;}
    };
    void poll();
    const timer=window.setInterval(()=>void poll(),3000);
    const tick=window.setInterval(()=>setSeconds(Math.max(0,Math.ceil((Date.parse(pair.expires_at)-Date.now())/1000))),1000);
    return()=>{live=false;clearInterval(timer);clearInterval(tick);};
  },[pair,phase,finish]);

  return (
    <main className="min-h-screen bg-[#07090f] px-4 py-12 text-[#f5f5fb]">
      <div className="mx-auto max-w-lg">
        <Link href="/login" className="text-sm text-[#9aa3b8] hover:text-white">← Nexus sign in</Link>
        <div className="mt-8 rounded-[2rem] border border-white/10 bg-[#111622] p-7 shadow-2xl sm:p-10">
          <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-[#7ee0c6]/10 text-[#7ee0c6]"><MonitorSmartphone size={30}/></div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#7ee0c6]">Link device</p>
          <h1 className="mt-2 text-3xl font-bold">Sign in with your phone</h1>
          <p className="mt-3 text-sm leading-6 text-[#aab2c2]">Like signing in on a TV: get a six-digit code here, then enter it in <strong>Nexus → Phone Link → Approve a device</strong> on a phone already signed in to your account.</p>
          {signedIn&&<p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-[#d9e2f2]">This browser already has a Nexus session. For a new-device sign-in, open this page on the device you want to link.</p>}
          {pair&&phase==="waiting" ? (
            <div className="mt-8 text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#aab2c2]">Your one-time code</p>
              <div className="rounded-2xl border border-[#7ee0c6]/30 bg-[#070c14] p-4 font-mono text-4xl font-bold tracking-[0.16em] text-white sm:text-5xl" aria-label={`Device code ${pair.code}`}>{pair.code.slice(0,3)} {pair.code.slice(3)}</div>
              <p className="mt-4 text-sm text-[#aab2c2]">Expires in <span className="font-semibold tabular-nums text-white">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</span></p>
              <p role="status" className="mt-3 flex items-center justify-center gap-2 text-sm text-[#7ee0c6]"><RefreshCw size={15} className="animate-spin"/> Waiting for approval…</p>
              <button type="button" className="mt-6 rounded-full border border-white/20 px-5 py-2 text-sm hover:bg-white/10" onClick={async()=>{setPhase("idle");setPair(null);try{await cancelPairing(pair);}catch{ /* expired codes remain short-lived */ }}}>Cancel</button>
            </div>
          ):phase==="redeeming"?(
            <p role="status" className="mt-7 flex items-center gap-3 text-[#7ee0c6]"><RefreshCw size={20} className="animate-spin"/> Signing in securely…</p>
          ):phase==="done"?(
            <p role="status" className="mt-7 flex items-center gap-3 text-[#7ee0c6]"><CheckCircle2/> Device approved!</p>
          ):(
            <div className="mt-8">
              {phase==="expired"&&<p className="mb-3 text-sm text-[#ffbb9b]">The code expired or could not be used. Generate a new one.</p>}
              <button type="button" onClick={()=>void begin()} disabled={busy} className="w-full rounded-xl bg-[#7ee0c6] p-3 font-bold text-[#07110e] disabled:opacity-50">{busy?"Creating code…":"Get a six-digit code"}</button>
            </div>
          )}
          {error&&<p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
          <div className="mt-8 grid gap-3 border-t border-white/10 pt-6 text-sm text-[#aab2c2]">
            <p className="flex gap-2"><KeyRound size={18} className="shrink-0 text-[#7ee0c6]"/> Short-lived codes can only be approved by an already signed-in account.</p>
            <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-[#7ee0c6]"/> A private verifier binds approval to this browser. Code alone cannot sign you in.</p>
            <p className="flex gap-2"><BatteryCharging size={18} className="shrink-0 text-[#7ee0c6]"/> Once linked, supported phones can show battery percentage in Phone Link.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
