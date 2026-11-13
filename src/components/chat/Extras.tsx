"use client";

import { ScheduleSheet } from "./ScheduleMessage";
import { useEffect, useRef, useState } from "react";
import { Hourglass, Lock, Play, Plus, Square, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { useChat } from "@/store/chat";
import { supabase } from "@/lib/supabase";
import { loadProfiles } from "@/lib/data";
import { answerFive, sendFive } from "@/lib/realtime";
import { BUMP_PIN_RE, capsuleInfo, createCapsule, loadJam, saveJam, startJam, type CapsuleInfo, type Jam } from "@/lib/chatExtras";
import { openWumpPin } from "@/lib/wumpOpen";
import { INSTS, NOTES, hit, pctx, type Pattern } from "@/components/music/Tools2";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import { PollCreator } from "./Poll";
import { bumpShareLocationWithFriend } from "@/lib/bump";
import { MapPin } from "lucide-react";
import { sendMessage } from "@/lib/data";
import { wumpCardMessage } from "@/lib/wumpCard";
import { wumpCreateMeetup } from "@/lib/wumpTogether";
import LocationPicker from "@/components/maps/LocationPicker";

// ------------------------------------------------------------------ composer "+" menu
export function ComposerPlus({ conversationId }: { conversationId: string }) {
  const me = useApp((s) => s.userId);
  const friendships = useApp((s) => s.friendships);
  const profiles = useApp((s) => s.profiles);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<null | "poll" | "capsule" | "bump" | "schedule" | "place">(null);
  const item = (emoji: string, label: string, sub: string, fn: () => void) => (
    <button
      onClick={() => {
        setOpen(false);
        fn();
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover"
    >
      <span className="text-2xl">{emoji}</span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-sub">{sub}</span>
      </span>
    </button>
  );
  const friends = friendships
    .filter((f) => f.status === "accepted" && me && (f.requester_id === me || f.addressee_id === me))
    .map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id));
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={cn("-ml-2 grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90", open ? "rotate-45 text-accent" : "text-sub hover:text-txt")} title="More">
        <Plus className="size-[24px]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-12 left-0 z-50 w-72 animate-pop rounded-2xl bg-menu p-1.5 shadow-2xl ring-1 ring-white/10">
            {item("🥁", "Start a Jam", "A beat everyone in this chat edits live", () => void startJam(conversationId))}
            {item("🎹", "FL Studio lab", "Shortcuts, scales, MIDI export for producers", () => {
              useApp.setState({ hub: "apps", appsTool: "flstudio", mobileTab: "apps" });
            })}
            {item("🎙", "Voice changer", "Call FX + attach AI model zip", () => {
              useApp.setState({ hub: "apps", appsTool: "voicefx", mobileTab: "apps" });
            })}
            {item("📎", "Share voice-model zip", "Attach a nexus-voice.json pack in chat", () => {
              toast("Use the paperclip and pick a .zip with nexus-voice.json — peers can download it", "info");
            })}
            {item("⏰", "Schedule a message", "Nexus sends it for you later", () => setSheet("schedule"))}
            {item("📊", "Poll", "Ask the chat a question", () => setSheet("poll"))}
            {item("⏳", "Time capsule", "A message that stays sealed until a date", () => setSheet("capsule"))}
            {item("📍", "Share Wump location", "Send your live pin to a friend in Nexus", () => setSheet("bump"))}
            {item("📌", "Send a place", "Drop a pin or search, then post it in this chat", () => setSheet("place"))}
            {item("✋", "High five", "Ask for a high five — they tap back, you both celebrate", () => {
              if (me && sendFive(me)) toast("✋ High five sent — waiting for them to slap back", "info");
            })}
          </div>
        </>
      )}
      {sheet === "poll" && <PollCreator conversationId={conversationId} onClose={() => setSheet(null)} />}
      {sheet === "schedule" && <ScheduleSheet conversationId={conversationId} onClose={() => setSheet(null)} />}
      {sheet === "capsule" && <CapsuleCreator conversationId={conversationId} onClose={() => setSheet(null)} />}
      {sheet === "bump" && (
        <BumpSharePicker
          friends={friends}
          profiles={profiles}
          onClose={() => setSheet(null)}
          onPick={(id) => {
            setSheet(null);
            void bumpShareLocationWithFriend(id);
          }}
        />
      )}
      {sheet === "place" && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 p-3 sm:place-items-center" onClick={() => setSheet(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <LocationPicker
              onCancel={() => setSheet(null)}
              confirmLabel="Send to this chat"
              onPick={async (place) => {
                await sendMessage(conversationId, wumpCardMessage({ kind: "place", lat: place.lat, lng: place.lng, name: place.name }));
                toast("Place sent", "success");
                setSheet(null);
              }}
              extra={{
                label: "Meetup",
                onPress: async (place) => {
                  const { data } = await supabase.from("conversation_members").select("user_id").eq("conversation_id", conversationId);
                  const invite = (data ?? []).map((row) => (row as { user_id: string }).user_id).filter((id) => id && id !== me);
                  await wumpCreateMeetup({ title: place.name, lat: place.lat, lng: place.lng, placeName: place.address || place.name, invite });
                  await sendMessage(conversationId, wumpCardMessage({ kind: "place", lat: place.lat, lng: place.lng, name: place.name }));
                  setSheet(null);
                },
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BumpSharePicker({
  friends,
  profiles,
  onClose,
  onPick,
}: {
  friends: string[];
  profiles: Record<string, { display_name?: string; username?: string } | undefined>;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-chat p-5 pb-safe-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="size-5 text-accent" />
          <span className="flex-1 text-lg font-bold">Share Wump with a friend</span>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-sub">Sends your live location pin into a Nexus DM and lights you up on Wump for friends.</p>
        {!friends.length ? (
          <p className="py-8 text-center text-sm text-sub">Add a friend first, then share your Wump pin with them.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {friends.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPick(id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-hover"
                >
                  <Avatar userId={id} size={36} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{profiles[id]?.display_name || profiles[id]?.username || "Friend"}</span>
                  <MapPin className="size-4 text-accent" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Rich card for a Bump location pin shared in chat */
export function BumpPinCard({ text, mine }: { text: string; mine: boolean }) {
  const m = text.match(BUMP_PIN_RE);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  const maps = `https://maps.apple.com/?ll=${lat},${lng}&q=Wump`;
  const note = text
    .split("\n")
    .filter((l) => l && !l.startsWith("http") && !l.includes("[bump-pin:") && !l.startsWith("📍"))
    .join(" ")
    .trim();
  return (
    <div
      className={cn(
        "mt-1 w-[min(280px,78vw)] overflow-hidden rounded-2xl ring-1",
        mine ? "bg-white/10 ring-white/15" : "bg-side ring-line",
      )}
    >
      <button
        type="button"
        onClick={() => openWumpPin({ lat, lng, name: note || "Shared place" })}
        className="block w-full text-left transition hover:brightness-110"
      >
        <div className="relative h-28 bg-[radial-gradient(circle_at_50%_40%,#fb718555,transparent_55%),linear-gradient(160deg,#0f172a,#7c3aed)]">
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[70%] text-3xl drop-shadow">📍</span>
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-[11px] font-semibold text-white/90">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
        </div>
        <div className="px-3 py-2">
          <div className="text-sm font-bold">Wump location</div>
          <div className="text-[11px] text-sub">{note || "Open in Wump"}</div>
        </div>
      </button>
      <a href={maps} target="_blank" rel="noreferrer noopener" className="block px-3 pb-2 text-[11px] text-sub underline-offset-2 hover:underline">
        Apple Maps
      </a>
    </div>
  );
}

// ------------------------------------------------------------------ high five
export function HighFivePrompt() {
  const five = useChat((s) => s.five);
  const me = useApp((s) => s.userId);
  const who = useApp((s) => (five ? s.profiles[five.from] : undefined));
  useEffect(() => {
    if (!five) return;
    const t = setTimeout(() => useChat.setState({ five: null }), 15000);
    return () => clearTimeout(t);
  }, [five]);
  if (!five || !me) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex animate-[typin_.25s_ease-out] items-center gap-3 rounded-full bg-gradient-to-r from-[#ffb02e] to-[#ff2bd6] py-1.5 pr-1.5 pl-2 text-white shadow-2xl">
        <Avatar userId={five.from} size={30} plain />
        <span className="text-sm font-semibold">{who?.display_name ?? "Someone"} wants a high five!</span>
        <button onClick={() => answerFive(me, five.from)} className="animate-[typwave_1s_ease-in-out_infinite] rounded-full bg-white px-4 py-1.5 text-lg active:scale-90" aria-label="High five back">
          ✋
        </button>
        <button onClick={() => useChat.setState({ five: null })} className="grid size-7 place-items-center rounded-full bg-black/20" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Jam: shared live beat
export function JamCard({ id }: { id: string }) {
  const me = useApp((s) => s.userId);
  const [jam, setJam] = useState<Jam | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(-1);
  const live = useRef<Jam | null>(null);
  live.current = jam ?? null;
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Jam>>({});

  useEffect(() => {
    let alive = true;
    void loadJam(id).then((j) => {
      if (!alive) return;
      setJam(j);
      if (j?.updated_by) void loadProfiles([j.updated_by]);
    });
    const ch = supabase
      .channel(`jam-${id}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jams", filter: `id=eq.${id}` }, ({ new: row }) => {
        const j = row as Jam;
        if (j.updated_by === me && saveT.current) return; // my own pending edit
        void loadProfiles(j.updated_by ? [j.updated_by] : []);
        setJam(j);
      })
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [id, me]);

  const queueSave = (patch: Partial<Jam>) => {
    pending.current = { ...pending.current, ...patch };
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      const p = pending.current;
      pending.current = {};
      saveT.current = null;
      void saveJam(id, p as Partial<Pick<Jam, "pattern" | "bpm" | "root">>);
    }, 350);
  };

  // loop player
  useEffect(() => {
    if (!playing) return;
    const c = pctx();
    void c.resume();
    const bus = c.createDynamicsCompressor();
    bus.threshold.value = -10;
    bus.ratio.value = 3;
    bus.connect(c.destination);
    let next = c.currentTime + 0.06;
    let s = 0;
    const iv = setInterval(() => {
      const j = live.current;
      if (!j) return;
      while (next < c.currentTime + 0.12) {
        const six = 60 / j.bpm / 4;
        for (const ins of INSTS) if (j.pattern[ins.id]?.[s]) hit(c, bus, ins.id, next, j.root);
        const shown = s;
        setTimeout(() => setStep(shown), Math.max(0, (next - c.currentTime) * 1000));
        next += six;
        s = (s + 1) % 16;
      }
    }, 25);
    return () => {
      clearInterval(iv);
      setTimeout(() => bus.disconnect(), 400);
      setStep(-1);
    };
  }, [playing]);

  if (jam === undefined) return <div className="mt-1 h-40 w-[min(360px,75vw)] animate-pulse rounded-2xl bg-black/20" />;
  if (jam === null) return <div className="mt-1 text-sm opacity-70">Jam unavailable</div>;
  const editor = jam.updated_by ? useApp.getState().profiles[jam.updated_by] : null;
  const toggle = (inst: string, s: number) => {
    const pattern = { ...jam.pattern, [inst]: jam.pattern[inst as keyof Pattern].map((x, k) => (k === s ? !x : x)) } as Pattern;
    if (!jam.pattern[inst as keyof Pattern][s]) hit(pctx(), pctx().destination, inst as keyof Pattern, pctx().currentTime, jam.root);
    setJam({ ...jam, pattern, updated_by: me });
    queueSave({ pattern });
  };
  return (
    <div className="mt-1 w-[min(420px,78vw)] rounded-2xl bg-[#0d0a1a] p-2.5 text-white ring-1 ring-white/10">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={() => setPlaying(!playing)} className={cn("grid size-9 place-items-center rounded-full", playing ? "bg-dnd" : "bg-accent")} aria-label={playing ? "Stop jam" : "Play jam"}>
          {playing ? <Square className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black">🥁 Jam</div>
          <div className="truncate text-[11px] text-white/60">{editor ? `last edit: ${jam.updated_by === me ? "you" : editor.display_name}` : "tap squares — everyone here can edit"}</div>
        </div>
        <label className="flex items-center gap-1 text-[11px] text-white/70">
          <input
            type="number"
            min={60}
            max={200}
            value={jam.bpm}
            onChange={(e) => {
              const bpm = Math.max(60, Math.min(200, Number(e.target.value) || 120));
              setJam({ ...jam, bpm });
              queueSave({ bpm });
            }}
            className="w-12 rounded bg-white/10 px-1 py-0.5 text-center text-xs text-white outline-none"
          />
          BPM
        </label>
        <select
          value={jam.root}
          onChange={(e) => {
            const root = Number(e.target.value);
            setJam({ ...jam, root });
            queueSave({ root });
          }}
          className="rounded bg-white/10 px-1 py-0.5 text-xs"
          title="808 key"
        >
          {NOTES.map((n, i) => (
            <option key={n} value={i} className="bg-[#0d0a1a]">
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-[3px]">
        {INSTS.map((ins) => (
          <div key={ins.id} className="flex items-center gap-[3px]">
            <span className="w-9 shrink-0 truncate text-[9px] font-bold text-white/60 uppercase">{ins.name}</span>
            {(jam.pattern[ins.id] ?? Array(16).fill(false)).map((on: boolean, s: number) => (
              <button
                key={s}
                onClick={() => toggle(ins.id, s)}
                className={cn("h-4 flex-1 rounded-[3px] transition", s % 4 === 0 && "ml-[2px]", step === s && "ring-1 ring-white")}
                style={{ background: on ? ins.color : s % 8 < 4 ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.04)" }}
                aria-label={`${ins.name} ${s + 1}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ time capsule
export function CapsuleCard({ id, mine }: { id: string; mine: boolean }) {
  const [c, setC] = useState<CapsuleInfo | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [justOpened, setJustOpened] = useState(false);
  useEffect(() => void capsuleInfo(id).then(setC), [id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // refetch the moment it unlocks
  useEffect(() => {
    if (!c || c.body !== null) return;
    const ms = new Date(c.unlock_at).getTime() - Date.now();
    if (ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => void capsuleInfo(id).then((x) => (setC(x), setJustOpened(true))), Math.max(0, ms) + 800);
    return () => clearTimeout(t);
  }, [c, id]);
  if (c === undefined) return <div className="mt-1 h-24 w-64 animate-pulse rounded-2xl bg-black/20" />;
  if (c === null) return <div className="mt-1 text-sm opacity-70">Capsule unavailable</div>;
  const left = Math.max(0, new Date(c.unlock_at).getTime() - now);
  const sealed = left > 0;
  const d = Math.floor(left / 86400000),
    h = Math.floor((left % 86400000) / 3600000),
    m = Math.floor((left % 3600000) / 60000),
    s = Math.floor((left % 60000) / 1000);
  return (
    <div className={cn("mt-1 w-[min(320px,72vw)] overflow-hidden rounded-2xl p-3", sealed ? "bg-gradient-to-br from-[#2b1a6a] to-[#0d0a1a] text-white" : "bg-black/20", justOpened && "animate-pop")}>
      <div className="flex items-center gap-2">
        <span className={cn("text-2xl", sealed && "animate-[typwave_2.4s_ease-in-out_infinite]")}>{sealed ? "⏳" : "💌"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black">{sealed ? "Sealed time capsule" : "Time capsule opened"}</div>
          <div className="text-[11px] opacity-70">
            {sealed ? "Opens " : "Sealed "}
            {new Date(sealed ? c.unlock_at : c.created_at).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
      {sealed ? (
        <>
          <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
            {[
              [d, "days"],
              [h, "hrs"],
              [m, "min"],
              [s, "sec"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg bg-white/10 py-1.5">
                <div className="text-lg font-black tabular-nums">{v}</div>
                <div className="text-[10px] opacity-60">{l}</div>
              </div>
            ))}
          </div>
          {mine && c.body ? (
            <details className="mt-2 text-xs opacity-80">
              <summary className="cursor-pointer">Only you can peek (it&apos;s yours)</summary>
              <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            </details>
          ) : (
            <p className="mt-2 flex items-center gap-1 text-[11px] opacity-60">
              <Lock className="size-3" /> Nobody else can read it until then.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-[15px] break-words whitespace-pre-wrap">{c.body}</p>
      )}
    </div>
  );
}

export function CapsuleCreator({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [preset, setPreset] = useState<number | "custom">(24 * 7);
  const [custom, setCustom] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const unlock = preset === "custom" ? new Date(custom) : new Date(Date.now() + preset * 3600000);
  const send = async () => {
    if (unlock.getTime() < Date.now() + 60000) return toast("Pick a time in the future", "error");
    setBusy(true);
    try {
      await createCapsule(conversationId, body, unlock);
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-chat p-5 pb-safe-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center">
          <Hourglass className="mr-2 size-5 text-accent" />
          <span className="flex-1 text-lg font-bold">Time capsule</span>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="Write something for the future… a prediction, a promise, a secret." className="min-h-28 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" autoFocus />
        <div className="mt-3 flex flex-wrap gap-1.5 text-sm">
          {(
            [
              [1, "1 hour"],
              [24, "Tomorrow"],
              [24 * 7, "1 week"],
              [24 * 30, "1 month"],
              [24 * 365, "1 year"],
              ["custom", "Pick a date"],
            ] as [number | "custom", string][]
          ).map(([v, l]) => (
            <button key={String(v)} onClick={() => setPreset(v)} className={cn("rounded-full px-3 py-1.5 font-semibold", preset === v ? "bg-accent text-white" : "bg-hover")}>
              {l}
            </button>
          ))}
        </div>
        {preset === "custom" && <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm" />}
        <p className="mt-2 text-xs text-sub">Opens {unlock.toLocaleString([], { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}. Everyone sees a countdown; the text unlocks for them at that moment.</p>
        <button disabled={busy || !body.trim()} onClick={() => void send()} className="mt-4 w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50">
          {busy ? "Sealing…" : "Seal capsule"}
        </button>
      </div>
    </div>
  );
}

