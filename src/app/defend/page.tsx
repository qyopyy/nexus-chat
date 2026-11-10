"use client";

import { useState } from "react";
import type { DefendReport } from "@/lib/nexusDefend";

export default function NexusDefendPage() {
  const [report, setReport] = useState<DefendReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-xl px-5 py-10">
        <p className="text-[11px] font-semibold tracking-[0.28em] text-[#7ee0c6] uppercase">Nexus Defender</p>
        <h1 className="mt-2 font-serif text-4xl">Check a file or an APK</h1>
        <p className="mt-3 text-sm text-[#a39e96]">
          This is a structural scan, not a full antivirus. Chat still refuses executable uploads. Nothing you check here is saved.
        </p>
        <label className="mt-6 block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm">
          Choose a file
          <input
            type="file"
            className="mt-3 block w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              const body = new FormData();
              body.set("file", file);
              void fetch("/api/malware/defend", { method: "POST", body })
                .then(async (res) => {
                  const data = (await res.json()) as DefendReport;
                  setReport(data);
                })
                .catch(() => setError("The scan did not finish."))
                .finally(() => setBusy(false));
            }}
          />
        </label>
        {busy && <p className="mt-4 text-sm text-[#a39e96]">Scanning…</p>}
        {error && <p className="mt-4 text-sm text-[#e07a5f]">{error}</p>}
        {report && (
          <ul className="mt-6 space-y-2">
            {report.findings.map((item, i) => (
              <li key={i} className={`rounded-xl px-3 py-2 text-sm ${item.level === "block" ? "bg-[#3a1512] text-[#ffb4a8]" : item.level === "warn" ? "bg-[#2a2412] text-[#f0d48a]" : "bg-[#10241c] text-[#b7f0dc]"}`}>
                {item.level === "ok" ? "Clear" : item.level === "warn" ? "Review" : "Blocked"} — {item.detail}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
