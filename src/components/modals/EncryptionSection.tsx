"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { toast } from "@/store/app";
import { Label, Toggle } from "./settingsUi";
import {
  changePassphrase,
  clearPinnedKeys,
  e2eeStrict,
  lockE2ee,
  myE2eeState,
  onE2eeChange,
  passphraseProblem,
  resetE2ee,
  setE2eeStrict,
  setupE2ee,
  unlockE2ee,
} from "@/lib/e2ee";

type State = { published: boolean; unlocked: boolean; fingerprint: string | null };

const field = "w-full rounded-lg bg-side px-3 py-2 text-[15px] outline-none ring-1 ring-white/10 focus:ring-white/30";
const btn = "rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-50";
const primary = "rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";

/** Settings → Privacy & Safety → Encrypted DMs */
export default function EncryptionSection() {
  const [st, setSt] = useState<State | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [oldPass, setOldPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [strict, setStrict] = useState(false);
  const [mode, setMode] = useState<"idle" | "change" | "reset">("idle");

  const refresh = useCallback(() => void myE2eeState().then(setSt), []);
  useEffect(() => {
    refresh();
    setStrict(e2eeStrict());
    return onE2eeChange(refresh);
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, "success");
      setPass("");
      setPass2("");
      setOldPass("");
      setMode("idle");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  if (!st) return <div className="mb-6 h-24 animate-pulse rounded-xl bg-side" />;

  const problem = pass ? passphraseProblem(pass) : null;

  return (
    <div className="mb-8 rounded-xl border border-white/10 p-4">
      <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
        <Lock className="size-4 text-[#23a55a]" /> Encrypted DMs
        {st.published && st.unlocked && <span className="rounded-full bg-[#23a55a]/20 px-2 py-0.5 text-[11px] text-[#23a55a]">On</span>}
        {st.published && !st.unlocked && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-400">Locked on this device</span>}
      </div>
      <p className="mb-3 text-sm text-sub">
        Text in one-to-one DMs is encrypted on your device and only you and your friend can read it — Nexus servers, backups and notifications only ever see scrambled text.
        It works once <b>both</b> of you turn it on.
      </p>

      {!st.published && (
        <>
          <Label>Choose an encryption passphrase</Label>
          <p className="mb-2 text-xs text-sub">Needed to read your history on a new phone or browser. We can&apos;t recover it — if you lose it, old encrypted messages are gone.</p>
          <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="At least 10 characters" className={field} />
          <input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Repeat passphrase" className={`${field} mt-2`} />
          {problem && <p className="mt-1 text-xs text-red-400">{problem}</p>}
          <div className="mt-3">
            <button className={primary} disabled={busy || !pass || !!problem || pass !== pass2} onClick={() => void run(() => setupE2ee(pass), "Encrypted DMs are on")}>
              Turn on encrypted DMs
            </button>
          </div>
        </>
      )}

      {st.published && !st.unlocked && (
        <>
          <Label>Unlock on this device</Label>
          <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Your encryption passphrase" className={field} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primary} disabled={busy || !pass} onClick={() => void run(() => unlockE2ee(pass), "Unlocked")}>
              Unlock
            </button>
            <button className={btn} onClick={() => setMode(mode === "reset" ? "idle" : "reset")}>
              Forgot it…
            </button>
          </div>
        </>
      )}

      {st.published && st.unlocked && (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-side p-3 text-xs text-sub">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#23a55a]" />
            <div>
              <div className="mb-0.5 font-semibold text-white">Your safety number</div>
              <div className="font-mono text-[13px] tracking-wide text-white">{st.fingerprint}</div>
              Read this out to a friend (in person or on a call) — they can check it matches what they see for you. Nexus warns you if a friend&apos;s key ever changes.
            </div>
          </div>
          <Toggle
            label="Only send encrypted"
            hint="Block messages to friends who haven't turned encryption on, instead of sending them normally."
            checked={strict}
            onChange={(v) => {
              setE2eeStrict(v);
              setStrict(v);
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btn} onClick={() => setMode(mode === "change" ? "idle" : "change")}>
              Change passphrase
            </button>
            <button className={btn} onClick={() => void run(lockE2ee, "Locked on this device")}>
              Lock this device
            </button>
            <button className={btn} onClick={() => void run(async () => clearPinnedKeys(), "Friends' keys will be trusted again on first use")}>
              Trust changed friend keys
            </button>
            <button className={`${btn} text-red-400`} onClick={() => setMode(mode === "reset" ? "idle" : "reset")}>
              Reset encryption…
            </button>
          </div>
        </>
      )}

      {mode === "change" && (
        <div className="mt-3 space-y-2">
          <input type="password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} placeholder="Current passphrase" className={field} />
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="New passphrase (10+ characters)" className={field} />
          {problem && <p className="text-xs text-red-400">{problem}</p>}
          <button className={primary} disabled={busy || !oldPass || !pass || !!problem} onClick={() => void run(() => changePassphrase(oldPass, pass), "Passphrase changed")}>
            Save new passphrase
          </button>
        </div>
      )}

      {mode === "reset" && (
        <div className="mt-3 rounded-lg border border-red-500/40 p-3 text-sm">
          Resetting deletes your encryption key. <b>Messages already sent in encrypted DMs can never be read again</b>, by you or your friends. You can then turn encryption on again with a new key.
          <div className="mt-2">
            <button className={`${btn} text-red-400`} disabled={busy} onClick={() => void run(resetE2ee, "Encryption reset")}>
              Yes, delete my key
            </button>
          </div>
        </div>
      )}

      <details className="mt-4 text-xs text-sub">
        <summary className="cursor-pointer">What is and isn&apos;t protected</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Protected: the text of one-to-one DMs, notification previews, the chat list preview and server-side backups.</li>
          <li>Not protected: photos, videos, files and voice notes, group chats and servers, and who you message and when.</li>
          <li>Link embeds are made on your device from the decrypted text; a friend&apos;s device may fetch the linked site.</li>
          <li>Reports you file include the text you choose to send to moderators.</li>
          <li>Anyone with your unlocked device (or your passphrase) can read your encrypted DMs.</li>
        </ul>
      </details>
    </div>
  );
}
