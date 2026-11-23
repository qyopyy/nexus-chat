"use client";
import { useState } from "react";
import { approvePairing } from "@/lib/deviceLink";
import { errorText } from "@/lib/supabase";

export default function ApproveDevice(){
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState("");
 const [error,setError]=useState("");
 async function submit(e:React.FormEvent){
   e.preventDefault();
   setBusy(true);setError("");setResult("");
   try{
     const reply=await approvePairing(code);
     setResult(`Approved ${String(reply.device_label||"new device")}. It can now finish signing in.`);
     setCode("");
   }catch(err){setError(errorText(err));}
   finally{setBusy(false);}
 }
 return <section className="mt-5 rounded-3xl border border-[#7ee0c6]/25 bg-[#101b1a] p-5">
   <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#7ee0c6]">Six-digit pairing</p>
   <h2 className="mt-2 text-xl font-semibold">Approve a new device</h2>
   <p className="mt-2 text-sm leading-6 text-[#b5bfba]">On the other screen, open <a href="/link-device" className="underline">nexusproject.cc/link-device</a> and request a code. Enter that code here only if you initiated the sign-in. Never approve an unexpected request.</p>
   <form className="mt-4 flex flex-wrap gap-2" onSubmit={e=>void submit(e)}>
     <input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
       aria-label="Six-digit device linking code" inputMode="numeric" autoComplete="one-time-code"
       maxLength={6} pattern="[0-9]{6}" required placeholder="000000"
       className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xl tracking-[.25em] outline-none focus:border-[#7ee0c6]"/>
     <button disabled={busy||code.length!==6} className="rounded-xl bg-[#7ee0c6] px-5 py-3 font-semibold text-[#091412] disabled:opacity-50" type="submit">{busy?"Checking…":"Approve"}</button>
   </form>
   {result&&<p role="status" className="mt-3 text-sm text-[#7ee0c6]">{result}</p>}
   {error&&<p role="alert" className="mt-3 text-sm text-[#ffb3a9]">{error}</p>}
 </section>;
}
