"use client";

import { useEffect, useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { toolost } from "@/lib/toolost";

/** Finishes the Too Lost OAuth sign-in: hands ?code & ?state to the edge function, which swaps them for tokens. */
export default function TooLostCallback() {
  const [state, setState] = useState<{ kind: "busy" | "ok" | "error"; text: string }>({ kind: "busy", text: "Connecting your Too Lost account…" });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const err = q.get("error_description") || q.get("error");
    if (err) return setState({ kind: "error", text: `Too Lost said: ${err}` });
    const code = q.get("code");
    const st = q.get("state");
    if (!code || !st) return setState({ kind: "error", text: "This link is missing the sign-in code. Start again from Settings → Too Lost." });
    if (!isConfigured) return;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return setState({ kind: "error", text: "Sign in to Nexus in this browser first, then press Connect again." });
      try {
        const r = await toolost<{ env: string; account: string }>("exchange", { code, state: st });
        setState({ kind: "ok", text: `Connected ${r.env} — ${r.account}` });
        window.history.replaceState(null, "", window.location.pathname);
        setTimeout(() => window.location.replace("/distro/app#settings/toolost"), 1500);
      } catch (e) {
        setState({ kind: "error", text: (e as Error).message });
      }
    })();
  }, []);
  return (
    <div className="dx grid min-h-dvh place-items-center p-6" data-dx-theme="999">
      <div className="dx-panel w-full max-w-[420px] p-6 text-center">
        <div className="dx-label">Too Lost</div>
        <h1 className="mt-2 text-[22px] font-medium">{state.kind === "busy" ? "Connecting…" : state.kind === "ok" ? "Connected" : "Couldn't connect"}</h1>
        <p className="mt-2 text-[14px] text-[var(--dx-muted)]">{state.text}</p>
        {state.kind !== "busy" && (
          <a href="/distro/app#settings/toolost" className="dx-btn dx-btn-primary mt-5">
            Back to Settings
          </a>
        )}
        {state.kind === "busy" && <div className="mx-auto mt-5 size-7 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />}
      </div>
    </div>
  );
}
