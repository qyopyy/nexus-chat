"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gamepad2, ExternalLink, Server } from "lucide-react";

const KEY = "nexus.playgta.url";
const DEFAULT_URL = process.env.NEXT_PUBLIC_PLAYGTA_URL ?? "";

/**
 * PlayGTA (gtalab, MIT) lives in /playgta in this repo — a Bun server that lets visitors take turns on a console.
 * The server can't run on Vercel, so this page points Nexus users at wherever you host it.
 */
export default function PlayGtaHub() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [saved, setSaved] = useState(DEFAULT_URL);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v) {
        setUrl(v);
        setSaved(v);
      }
    } catch {
      /* storage blocked */
    }
  }, []);

  const clean = (u: string) => {
    try {
      const p = new URL(u.trim());
      return p.protocol === "https:" || p.hostname === "localhost" ? p.href : "";
    } catch {
      return "";
    }
  };
  const ok = clean(saved);

  const save = () => {
    const c = clean(url);
    setSaved(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-8 text-txt">
      <Link href="/" className="text-sm text-sub hover:text-txt">
        ← Back to Nexus
      </Link>
      <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold">
        <Gamepad2 className="size-6 text-accent" /> PlayGTA
      </h1>
      <p className="mt-2 text-sm text-sub">
        Take turns playing a console from the browser: join the line, get timed control over low-latency video. On phones you get on-screen joysticks and buttons plus a full-screen mode. The full project is part of Nexus in the <code>playgta/</code> folder.
      </p>

      <div className="mt-6 rounded-xl bg-side p-4 ring-1 ring-white/10">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          <Server className="size-4" /> Your PlayGTA server
        </div>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://play.example.com"
            className="min-w-0 flex-1 rounded-md bg-rail px-3 py-2 outline-none focus:ring-2 focus:ring-accent/60"
          />
          <button onClick={save} className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
            Save
          </button>
        </div>
        {ok ? (
          <a href={ok} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-semibold text-white">
            Join the line <ExternalLink className="size-4" />
          </a>
        ) : (
          <p className="mt-3 text-sm text-sub">Add the address of your running server (https, or localhost while testing) to get a Join button.</p>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-side p-4 text-sm text-sub ring-1 ring-white/10">
        <div className="mb-1 font-semibold text-txt">Run it</div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            On a computer with Bun: <code>cd playgta &amp;&amp; bun install &amp;&amp; bun start</code> (simulated console on port 3000).
          </li>
          <li>
            For a real console follow <code>playgta/docs/setup.md</code> (chiaki-ng + MediaMTX). Only use a console you own.
          </li>
          <li>Put it behind HTTPS, then paste the address above (or set NEXT_PUBLIC_PLAYGTA_URL on Vercel).</li>
        </ol>
        <p className="mt-3">
          <b className="text-txt">Admin panel:</b> set <code>ADMIN_TOKEN</code> (16+ characters) and open <code>http://localhost:3000/admin</code> on the machine running the server. It has skip / pause / remove controls and a button that plays a cheat-code sequence on the console. It never works through a tunnel.
        </p>
        <p className="mt-3 text-xs">PlayGTA is MIT-licensed; its <code>chiaki/</code> folder is AGPL-3.0. Not affiliated with Sony, Rockstar or Take-Two.</p>
      </div>
    </div>
  );
}
