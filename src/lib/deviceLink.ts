"use client";

import { supabase, errorText } from "./supabase";

const STORAGE_KEY="nexus:pending-device-link";
export type Pairing={id:string;code:string;verifier:string;expires_at:string};
export type PairStatus="pending"|"approved"|"consumed"|"cancelled"|"expired";

async function request(action:string,fields:Record<string,unknown>={}):Promise<Record<string,any>>{
  const {data,error}=await supabase.functions.invoke("device-link",{body:{action,...fields}});
  if(error){
    const context=(error as {context?:Response}).context;
    if(context && typeof context.json==="function"){
      const message=await context.json().catch(()=>null);
      if(message?.error)throw new Error(String(message.error));
    }
    throw new Error(errorText(error));
  }
  if(data?.error)throw new Error(data.error);
  return data as Record<string,any>;
}
function randomSecret(){
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
export function storedPairing():Pairing|null{
  try{
    const data=JSON.parse(sessionStorage.getItem(STORAGE_KEY)??"null") as Pairing|null;
    if(data&&/^[0-9]{6}$/.test(data.code)&&Date.parse(data.expires_at)>Date.now())return data;
  }catch{/* ignore corrupt state */}
  sessionStorage.removeItem(STORAGE_KEY);
  return null;
}
export async function startPairing(){
  const verifier=randomSecret();
  const device_label=/Android|iPhone|iPad/i.test(navigator.userAgent)?"New phone":"New browser or computer";
  const data=await request("start",{verifier,device_label});
  const pair:Pairing={id:String(data.id),code:String(data.code),verifier,expires_at:String(data.expires_at)};
  sessionStorage.setItem(STORAGE_KEY,JSON.stringify(pair));
  return pair;
}
export async function checkPairing(pair:Pairing):Promise<PairStatus>{
  const result=await request("check",{id:pair.id,verifier:pair.verifier});
  return result.status as PairStatus;
}
export async function cancelPairing(pair:Pairing){
  sessionStorage.removeItem(STORAGE_KEY);
  await request("cancel",{id:pair.id,verifier:pair.verifier});
}
export async function redeemPairing(pair:Pairing){
  const result=await request("redeem",{id:pair.id,verifier:pair.verifier});
  if(result.status!=="ready")throw new Error("Approval has not completed. Check the code or start again.");
  // Do not persist the single-use token in sessionStorage, URL, or logs.
  sessionStorage.removeItem(STORAGE_KEY);
  const {error}=await supabase.auth.verifyOtp({token_hash:String(result.token_hash),type:"magiclink"});
  if(error)throw new Error(errorText(error));
}
export async function approvePairing(code:string){
  return await request("approve",{code:code.replace(/\D/g,"")});
}
