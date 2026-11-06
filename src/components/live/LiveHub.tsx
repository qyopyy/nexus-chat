"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Mic, MicOff, MonitorUp, Radio, Video, VideoOff } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import AvatarButton from "@/components/vavatar/AvatarButton";
import {
  LIVE_QUALITIES,
  canLiveScreenShare,
  endLive,
  goLive,
  leaveLive,
  listLiveStreams,
  openLiveHub,
  sendLiveChat,
  toggleLiveCam,
  toggleLiveMic,
  toggleLiveScreen,
  useLive,
  watchLive,
  type LiveQuality,
  type LiveSource,
} from "@/lib/live";

const CATS = ["Just Chatting", "Music", "Gaming", "Art", "IRL", "Tech", "Sports"];

export default function LiveHub({ mobile }: { mobile?: boolean }) {
  const stream = useLive((s) => s.stream);
  const role = useLive((s) => s.role);
  const liveList = useLive((s) => s.liveList);

  useEffect(() => {
    if (!stream) void listLiveStreams();
  }, [stream]);

  // Deep link: /?watchLive=<streamId> or #watchLive=<id>
  useEffect(() => {
    if (stream) return;
    try {
      const q = new URLSearchParams(window.location.search).get("watchLive");
      const hash = window.location.hash.match(/watchLive=([^&]+)/)?.[1];
      const id = q || hash;
      if (!id) return;
      void watchLive(id).catch(() => toast("Couldn't open that live stream", "error"));
    } catch {
      /* ignore */
    }
  }, [stream]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0e0e10] text-white">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-white/10 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        <button
          onClick={() => {
            if (stream) leaveLive();
            useApp.setState(mobile ? { hub: null, mobileTab: "videos" } : { hub: "videos" });
          }}
          className="grid size-9 place-items-center rounded-full hover:bg-white/5"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <Radio className="size-5 text-[#9146ff]" />
        <div className="font-semibold">Nexus Live</div>
        <span className="text-xs text-white/45">Twitch-style streams · HD & 4K · screen share</span>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {stream && role ? <StreamRoom mobile={mobile} /> : <Lobby list={liveList} />}
      </div>
    </div>
  );
}

function Lobby({ list }: { list: ReturnType<typeof useLive.getState>["liveList"] }) {
  const profiles = useApp((s) => s.profiles);
  const [going, setGoing] = useState(false);
  const [title, setTitle] = useState("Live on Nexus");
  const [category, setCategory] = useState(CATS[0]!);
  const [quality, setQuality] = useState<LiveQuality>("1080p30");
  const [source, setSource] = useState<LiveSource>("camera");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 pb-16">
        <div className="overflow-hidden rounded-3xl border border-[#9146ff]/30 bg-gradient-to-br from-[#2a0a4a] to-[#0e0e10] p-5">
          <div className="text-[10px] font-semibold tracking-[0.2em] text-[#bf94ff] uppercase">Go live</div>
          <h1 className="mt-1 text-2xl font-black">Broadcast in HD or 4K</h1>
          <p className="mt-1 text-sm text-white/60">Camera, screen share, or both — and swap in your V-Avatar mid-stream with ✨. Viewers sync over WebRTC.</p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-white/50">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" maxLength={120} />
            </label>
            <label className="text-xs text-white/50">
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none">
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-white/50">
              Quality
              <select value={quality} onChange={(e) => setQuality(e.target.value as LiveQuality)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none">
                {LIVE_QUALITIES.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label} — {q.hint}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-white/50">
              Source
              <select value={source} onChange={(e) => setSource(e.target.value as LiveSource)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none">
                <option value="camera">Camera</option>
                <option value="screen">Screen share</option>
                <option value="both">Camera + screen</option>
              </select>
            </label>
          </div>

          {(source === "screen" || source === "both") && !canLiveScreenShare() && (
            <p className="mt-2 text-xs text-amber-300">Screen share isn’t available in this browser (try desktop Chrome/Edge/Firefox).</p>
          )}

          <button
            disabled={going}
            onClick={async () => {
              setGoing(true);
              try {
                await goLive({ title, category, quality, source });
              } catch (e) {
                toast(String((e as Error).message ?? e), "error");
              } finally {
                setGoing(false);
              }
            }}
            className="mt-4 w-full rounded-full bg-[#9146ff] py-3 text-sm font-black hover:brightness-110 disabled:opacity-50"
          >
            {going ? "Starting…" : "Start streaming"}
          </button>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold tracking-wide text-white/70 uppercase">Live now</h2>
          {list.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/40">No one is live — be the first.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((s) => {
                const host = profiles[s.host_id];
                return (
                  <button
                    key={s.id}
                    onClick={async () => {
                      try {
                        await watchLive(s.id);
                      } catch (e) {
                        toast(String((e as Error).message ?? e), "error");
                        void listLiveStreams();
                      }
                    }}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#eb0400] px-1.5 py-0.5 text-[10px] font-black tracking-wide">LIVE</span>
                      <span className="text-[10px] text-white/45">{s.quality.replace("p", "p ")}</span>
                    </div>
                    <div className="mt-2 truncate font-semibold">{s.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                      <Avatar userId={s.host_id} size={20} plain />
                      @{host?.username ?? "…"} · {s.category}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={() => void listLiveStreams()} className="mt-3 text-xs font-semibold text-[#bf94ff]">
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function StreamRoom({ mobile }: { mobile?: boolean }) {
  const profiles = useApp((s) => s.profiles);
  const stream = useLive((s) => s.stream)!;
  const role = useLive((s) => s.role)!;
  const localCam = useLive((s) => s.localCam);
  const localScreen = useLive((s) => s.localScreen);
  const remote = useLive((s) => s.remote);
  const chat = useLive((s) => s.chat);
  const viewers = useLive((s) => s.viewers);
  const micOn = useLive((s) => s.micOn);
  const camOn = useLive((s) => s.camOn);
  const screenOn = useLive((s) => s.screenOn);
  const avatarOn = useLive((s) => s.avatarOn);
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState("0:00");
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const started = Date.parse(stream.started_at || "") || Date.now();
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - started) / 1000));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      setElapsed(h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [stream.started_at]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (role === "host") {
      v.srcObject = localCam;
      void v.play().catch(() => {});
    } else {
      v.srcObject = remote;
      void v.play().catch(() => {});
    }
  }, [role, localCam, remote]);

  useEffect(() => {
    const v = screenRef.current;
    if (!v) return;
    v.srcObject = localScreen;
    void v.play().catch(() => {});
  }, [localScreen]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  const host = profiles[stream.host_id];

  return (
    <div className={cn("flex h-full min-h-0", mobile ? "flex-col" : "flex-row")}>
      <div className="relative min-h-0 min-w-0 flex-1 bg-black">
        <video ref={videoRef} autoPlay playsInline muted={role === "host"} className="absolute inset-0 size-full object-contain" />
        {role === "host" && localScreen && (
          <video ref={screenRef} autoPlay playsInline muted className="absolute right-3 bottom-20 w-[30%] max-w-xs rounded-xl border border-white/20 object-contain shadow-2xl" />
        )}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-[#eb0400] px-2 py-0.5 text-[11px] font-black tracking-wide">LIVE</span>
          <span className="rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold tabular-nums backdrop-blur">{elapsed}</span>
          <span className="rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold backdrop-blur">{viewers} watching</span>
          <span className="rounded bg-black/60 px-2 py-0.5 text-[11px] text-white/70 backdrop-blur">{stream.quality}</span>
          {avatarOn && (
            <span className="rounded bg-gradient-to-r from-[#ff2bd6] to-[#8b5cff] px-2 py-0.5 text-[11px] font-bold tracking-wide">V-Avatar</span>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold backdrop-blur hover:bg-black/75"
            title="Copy watch link"
            onClick={() => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/?watchLive=${encodeURIComponent(stream.id)}`;
              void navigator.clipboard.writeText(url).then(() => toast("Watch link copied", "success"));
            }}
          >
            <Copy className="size-3" /> Share
          </button>
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-black/50 py-1 pr-3 pl-1 backdrop-blur">
          <Avatar userId={stream.host_id} size={28} plain />
          <div className="text-xs">
            <div className="font-semibold">@{host?.username ?? "host"}</div>
            <div className="text-white/50">{stream.category}</div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
          <div className="truncate text-lg font-bold">{stream.title}</div>
          {role === "host" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => toggleLiveMic()} className={cn("tap-target grid place-items-center rounded-full", micOn ? "bg-white/15" : "bg-[#eb0400]")} aria-label={micOn ? "Mute" : "Unmute"}>
                {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </button>
              <button onClick={() => toggleLiveCam()} className={cn("tap-target grid place-items-center rounded-full", avatarOn ? "bg-gradient-to-br from-[#ff2bd6]/40 to-[#8b5cff]/40" : camOn ? "bg-white/15" : "bg-[#eb0400]")} aria-label={camOn ? "Camera off" : "Camera on"} title={avatarOn ? "Turn off V-Avatar" : camOn ? "Camera off" : "Camera on"}>
                {camOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
              </button>
              <AvatarButton context="live" />
              {canLiveScreenShare() && (
                <button onClick={() => void toggleLiveScreen()} className={cn("tap-target grid place-items-center rounded-full", screenOn ? "bg-[#9146ff]" : "bg-white/15")} title="Share screen" aria-label="Share screen">
                  <MonitorUp className="size-4" />
                </button>
              )}
              <button onClick={() => void endLive()} className="ml-auto min-h-10 rounded-full bg-[#eb0400] px-4 py-2 text-xs font-bold">
                End stream
              </button>
            </div>
          )}
          {role === "viewer" && (
            <button onClick={() => leaveLive()} className="mt-2 rounded-full bg-white/15 px-4 py-2 text-xs font-bold">
              Leave
            </button>
          )}
        </div>
      </div>

      <aside className={cn("flex flex-col border-white/10 bg-[#18181b]", mobile ? "h-56 border-t" : "w-[320px] border-l")}>
        <div className="border-b border-white/10 px-3 py-2 text-xs font-bold tracking-wide text-white/60 uppercase">Live chat</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
          {chat.map((m) => {
            const a = profiles[m.author_id];
            return (
              <div key={m.id} className="text-sm">
                <span className="font-bold text-[#bf94ff]">@{a?.username ?? "…"}</span> <span className="text-white/85">{m.body}</span>
              </div>
            );
          })}
          <div ref={chatEnd} />
        </div>
        <form
          className="flex gap-2 border-t border-white/10 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendLiveChat(text).then(() => setText(""));
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Send a message" maxLength={500} className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm outline-none" />
          <button type="submit" className="rounded-lg bg-[#9146ff] px-3 text-sm font-bold">
            Chat
          </button>
        </form>
      </aside>
    </div>
  );
}

export { openLiveHub };
