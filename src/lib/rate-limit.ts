import { NextResponse } from "next/server";
export function createRateLimitHeaders(r:any){return {"RateLimit-Limit":String(r.limit),"RateLimit-Remaining":String(r.remaining)}}
export function createRateLimitedResponse(){return NextResponse.json({error:"Too many requests"},{status:429});}