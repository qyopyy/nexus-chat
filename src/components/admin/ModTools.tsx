"use client";

import { useMemo, useState } from "react";
import { Ban, MessageSquareOff } from "lucide-react";
import { useApp } from "@/store/app";
import { banUntil, isBanned, isMuted, muteUser, toggleBadge, unbanUser } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { VerifiedCheck } from "@/components/ui/NameTag";

const EMPTY: string[] = [];

/** "yyyy-MM-ddTHH:mm" in local time for <input type="datetime-local"> */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const PRESETS: [string, number][] = [
  ["1h", 60],
  ["1d", 1440],
  ["3d", 4320],
  ["1w", 10080],
  ["30d", 43200],
];

/** Click-to-toggle badge chips (admins+). Used on the profile card and in the admin panel. */
export function BadgeToggles({ userId, compact }: { userId: string; compact?: boolean }) {
  const catalog = useApp((s) => s.badges);
  const owned = useApp((s) => s.userBadges[userId] ?? EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const list = useMemo(() => Object.values(catalog).sort((a, b) => b.priority - a.priority), [catalog]);
  return (
    <div className={cn("flex flex-wrap gap-1.5", compact && "gap-1")}>
      {list.map((b) => {
        const has = owned.includes(b.id);
        return (
          <button
            key={b.id}
            disabled={busy === b.id}
            onClick={async () => {
              setBusy(b.id);
              await toggleBadge(userId, b.id);
              setBusy(null);
            }}
            title={has ? `Remove ${b.name}` : `Give ${b.name}`}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition active:scale-95 disabled:opacity-50",
              has ? "bg-white/10" : "border-line text-sub opacity-70 hover:opacity-100",
            )}
            style={has ? { borderColor: b.key === "verified" ? "#fff" : b.color, color: b.key === "verified" ? "#fff" : b.color } : undefined}
          >
            {b.key === "verified" ? <VerifiedCheck size={13} /> : <span className="text-sm leading-none">{b.icon}</span>}
            {b.name}
            {has && <span className="text-[10px] opacity-70">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Suspend account / block messaging until an exact date & time */
export function ModerationControls({ userId }: { userId: string }) {
  const p = useApp((s) => s.profiles[userId]);
  const [mode, setMode] = useState<"mute" | "ban">("mute");
  const [until, setUntil] = useState(() => localInput(new Date(Date.now() + 86400_000)));
  const [forever, setForever] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const banned = isBanned(p);
  const muted = isMuted(p);

  const apply = async () => {
    const iso = forever ? null : new Date(until).toISOString();
    if (!forever && new Date(until).getTime() <= Date.now()) return alert("Pick a time in the future");
    if (forever && mode === "ban" && !confirm(`Permanently ban ${p.display_name}?`)) return;
    setBusy(true);
    if (mode === "ban") await banUntil(userId, iso, reason);
    else await muteUser(userId, iso ?? "infinity", reason);
    setBusy(false);
  };

  return (
    <div className="space-y-2.5">
      {(banned || muted) && (
        <div className="space-y-1.5">
          {banned && (
            <Status
              icon={<Ban className="size-4" />}
              text={p.banned_until === "infinity" ? "Banned permanently" : `Suspended until ${new Date(p.banned_until!).toLocaleString()}`}
              reason={p.ban_reason}
              onLift={async () => {
                setBusy(true);
                await unbanUser(userId);
                setBusy(false);
              }}
              busy={busy}
            />
          )}
          {muted && (
            <Status
              icon={<MessageSquareOff className="size-4" />}
              text={p.muted_until === "infinity" ? "Can't send messages (indefinitely)" : `Can't send messages until ${new Date(p.muted_until!).toLocaleString()}`}
              reason={p.mute_reason}
              onLift={async () => {
                setBusy(true);
                await muteUser(userId, null, "");
                setBusy(false);
              }}
              busy={busy}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/25 p-1 text-xs font-semibold">
        {(
          [
            ["mute", "Block messaging", <MessageSquareOff key="m" className="size-3.5" />],
            ["ban", "Suspend account", <Ban key="b" className="size-3.5" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} onClick={() => setMode(id)} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5", mode === id ? "bg-dnd text-white" : "text-sub")}>
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map(([l, m]) => (
          <button
            key={l}
            onClick={() => {
              setForever(false);
              setUntil(localInput(new Date(Date.now() + m * 60_000)));
            }}
            className="rounded-md bg-hover px-2 py-1 text-xs hover:bg-active"
          >
            +{l}
          </button>
        ))}
        <button onClick={() => setForever((v) => !v)} className={cn("rounded-md px-2 py-1 text-xs", forever ? "bg-dnd text-white" : "bg-hover hover:bg-active")}>
          Forever
        </button>
      </div>
      {!forever && (
        <label className="block text-xs text-sub">
          Until
          <input
            type="datetime-local"
            value={until}
            min={localInput(new Date())}
            onChange={(e) => setUntil(e.target.value)}
            className="mt-1 w-full rounded-md bg-rail px-2.5 py-2 text-sm text-txt outline-none [color-scheme:dark] focus:ring-2 focus:ring-dnd/50"
          />
        </label>
      )}
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason (shown to them)" className="w-full rounded-md bg-rail px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-dnd/50" />
      <button disabled={busy} onClick={() => void apply()} className="w-full rounded-md bg-dnd py-2 text-sm font-semibold text-white hover:bg-dnd/85 disabled:opacity-60">
        {mode === "ban" ? (forever ? "Ban permanently" : "Suspend until then") : forever ? "Block messaging indefinitely" : "Block messaging until then"}
      </button>
    </div>
  );
}

function Status({ icon, text, reason, onLift, busy }: { icon: React.ReactNode; text: string; reason?: string | null; onLift: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-dnd/10 px-2.5 py-2 text-xs">
      <span className="text-dnd">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="text-dnd">{text}</span>
        {reason && <span className="text-sub"> — {reason}</span>}
      </span>
      <button disabled={busy} onClick={onLift} className="rounded-md bg-ok px-2.5 py-1 font-semibold text-white hover:bg-ok/85">
        Lift
      </button>
    </div>
  );
}
