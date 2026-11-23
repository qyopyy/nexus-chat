// Authenticated phone approval + one-time sign-in on a second screen.
// Deploy with --no-verify-jwt: start/check/redeem are anonymous. Every
// approval validates the Supabase access token AND MFA assurance separately.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PEPPER = Deno.env.get("DEVICE_LINK_IP_PEPPER") || SERVICE;
const admin = createClient(URL, SERVICE, {auth:{persistSession:false,autoRefreshToken:false}});
const cors = {"Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"no-store"};
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json"}});}
const wait = (s:number)=>new Promise(resolve=>setTimeout(resolve,s));
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,"0")).join("");}
function randomHex(bytes:number){return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),b=>b.toString(16).padStart(2,"0")).join("");}
function randomCode(){const a=new Uint32Array(1); const limit=Math.floor(4294967296/1000000)*1000000;do{crypto.getRandomValues(a);}while(a[0]>=limit);return String(a[0]%1000000).padStart(6,"0");}
function validId(s:unknown){return typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);}
function validSecret(s:unknown){return typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);}
async function owner(req:Request){
  const jwt=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";
  if(!jwt) return null;
  const auth=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${jwt}`}}});
  const {data,error}=await auth.auth.getUser(jwt);
  if(error||!data.user) return null;
  // Approving a new signed-in screen is sensitive. Do not permit an
  // account enrolled in MFA to authorize pairing from only AAL1.
  const aal=await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aal.error||!aal.data||aal.data.currentLevel!==aal.data.nextLevel) return {mfa:true} as const;
  return {id:data.user.id,email:data.user.email??""} as const;
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  let data:Record<string,unknown>;
  try{data=await req.json();}catch{return json({error:"Invalid request"},400);}
  const action=String(data.action??"");
  const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown").trim().slice(0,120);
  const ipHash=await hash(PEPPER+":"+ip);
  try{
    if(action==="start"){
      const verifier=data.verifier;
      const label=String(data.device_label??"New device").trim().slice(0,64);
      if(!validSecret(verifier)||label.length<1) return json({error:"Invalid device"},400);
      const verifier_hash=await hash(verifier);
      // Retry a collision rather than making an existing code usable.
      for(let i=0;i<6;i++){
        const code=randomCode();
        const {data:row,error}=await admin.from("nexus_device_link_codes")
          .insert({code_hash:await hash(code),verifier_hash,ip_hash:ipHash,device_label:label,
            expires_at:new Date(Date.now()+5*60_000).toISOString()})
          .select("id,expires_at").single();
        if(!error&&row)return json({id:row.id,code,expires_at:row.expires_at});
        if(error?.code!=="23505") return json({error:error?.message??"Could not create code"},429);
      }
      return json({error:"Please try again"},503);
    }
    if(action==="approve"){
      const user=await owner(req);
      if(!user) return json({error:"Sign in on your trusted phone first"},401);
      if("mfa" in user) return json({error:"Complete your account's 2FA before approving another device"},403);
      const code=String(data.code??"");
      if(!/^\d{6}$/.test(code)) return json({error:"Enter the six digits"},400);
      const {data:result,error}=await admin.rpc("nexus_device_link_approve",{
        p_code_hash:await hash(code),p_user_id:user.id,p_ip_hash:ipHash
      });
      if(error) return json({error:"Could not approve this device"},500);
      if(result?.status==="rate_limited") return json({error:"Too many attempts. Try later."},429);
      if(result?.status!=="approved"){await wait(250);return json({error:"Invalid, expired, or already approved code"},400);}
      return json({status:"approved",device_label:result.device_label});
    }
    if(action==="check"||action==="redeem"||action==="cancel"){
      if(!validId(data.id)||!validSecret(data.verifier))return json({error:"Invalid pairing request"},400);
      const verifier_hash=await hash(data.verifier);
      const {data:row,error}=await admin.from("nexus_device_link_codes")
        .select("id,status,expires_at,verifier_hash").eq("id",data.id).maybeSingle();
      if(error)return json({error:"Couldn't check pairing"},500);
      if(!row||row.verifier_hash!==verifier_hash)return json({error:"Unknown pairing"},404);
      if(Date.parse(row.expires_at)<=Date.now())return json({status:"expired"});
      if(action==="cancel"){
        await admin.from("nexus_device_link_codes").update({status:"cancelled"})
          .eq("id",data.id).eq("verifier_hash",verifier_hash).in("status",["pending","approved"]);
        return json({status:"cancelled"});
      }
      if(action==="check")return json({status:row.status});
      if(row.status!=="approved")return json({status:row.status});
      // A single-use authorization is consumed BEFORE creating an OTP. A
      // retry on generation failure requires a fresh code rather than reusing
      // a potentially already exposed sign-in credential.
      const {data:claimed,error:redeemError}=await admin.rpc("nexus_device_link_redeem",{
        p_request_id:data.id,p_verifier_hash:verifier_hash
      });
      if(redeemError||claimed?.status!=="ready")return json({error:"Pairing has expired or was already used"},409);
      const {data:account,error:accountError}=await admin.auth.admin.getUserById(claimed.user_id);
      const email=account?.user?.email;
      if(accountError||!email) return json({error:"Account no longer available"},409);
      const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email});
      const token_hash=link?.properties?.hashed_token;
      if(linkError||!token_hash) return json({error:"Could not complete sign-in. Request another code."},503);
      return json({status:"ready",token_hash,type:"magiclink"});
    }
    return json({error:"Unknown operation"},400);
  }catch(error){
    console.error("device-link failure",error instanceof Error?error.message:error);
    return json({error:"Device linking is temporarily unavailable"},503);
  }
});
