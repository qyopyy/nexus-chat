"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";
import { createPost, createStory, GRAM_GENRES, GRAM_MOODS, gramHome, mediaKind, uploadMedia, useGram, type GramGenre, type GramMood, type Media } from "@/lib/gram";
import { can } from "@/lib/privileges";

const TABS = [
  ["post", "Post", "Photos or a video for your profile grid"],
  ["short", "Short", "A vertical video up to 3 minutes"],
  ["story", "Story", "Disappears after 24 or 48 hours"],
] as const;

export default function Create() {
  const mode = useGram((s) => s.create);
  const remixOf = useGram((s) => s.remixOf);
  const [kind, setKind] = useState<"post" | "short" | "story">("post");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [mood, setMood] = useState<GramMood | null>(null);
  const [genre, setGenre] = useState<GramGenre | null>(null);
  const [hours, setHours] = useState<24 | 48>(can.longStories() ? 48 : 24);
  const [busy, setBusy] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode) {
      setKind(mode);
      setFiles([]);
      setCaption(remixOf ? "Remix ✨ " : "");
      setAlt("");
      setMood(null);
      setGenre(null);
      setHours(can.longStories() ? 48 : 24);
    }
  }, [mode, remixOf]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);

  if (!mode) return null;
  const close = () => {
    if (busy) return;
    useGram.setState({ create: null, remixOf: null });
  };
  const accept = kind === "short" ? "video/*" : kind === "story" ? "image/*,video/*" : "image/*,video/*";
  const multi = kind === "post" && !remixOf;

  const choose = (list: FileList | null) => {
    if (!list?.length) return;
    let arr = [...list];
    if (kind === "short") arr = arr.filter((f) => mediaKind(f) === "video").slice(0, 1);
    else if (kind === "story") arr = arr.filter((f) => mediaKind(f)).slice(0, 1);
    else arr = arr.filter((f) => mediaKind(f)).slice(0, 10);
    if (!arr.length) return toast(kind === "short" ? "Shorts are videos — pick a video" : "Pick a photo or video", "error");
    const big = arr.find((f) => f.size > 1024 * 1024 * 1024);
    if (big) return toast(`${big.name} is over 1 GB`, "error");
    setFiles(multi ? [...files, ...arr].slice(0, 10) : arr);
  };

  const share = async () => {
    if (!files.length) return toast("Add a photo or video first", "error");
    setBusy("Starting…");
    try {
      const media: Media[] = [];
      for (const [k, f] of files.entries()) {
        media.push(await uploadMedia(f, (s) => setBusy(files.length > 1 ? `${s} (${k + 1}/${files.length})` : s)));
      }
      if (kind === "short" && media[0].dur && media[0].dur > 185) throw new Error("Shorts can be up to 3 minutes");
      setBusy("Sharing…");
      if (kind === "story") {
        await createStory(media[0], caption, hours);
        toast(`Story shared for ${hours} hours`, "success");
      } else {
        await createPost(kind, media, caption, { mood, remixOf, alt: alt.trim() || null, genre });
        toast(remixOf ? "Remix posted" : kind === "short" ? "Short posted" : "Posted", "success");
      }
      useGram.setState({ create: null, remixOf: null });
      gramHome(kind === "short" ? { view: "shorts" } : { view: "home" });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-[88] flex items-end justify-center bg-black/70 sm:items-center" onClick={close}>
      <div className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-chat sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-line/60 px-4 py-3">
          <div className="flex-1 font-bold">{remixOf ? "Remix" : "Create"}</div>
          <button onClick={close} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {!remixOf && (
          <div className="flex gap-1 p-2.5 sm:p-3">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => (setKind(k), setFiles([]))} className={cn("min-h-11 flex-1 rounded-full px-2 py-2 text-sm font-bold", kind === k ? "bg-white text-black" : "bg-hover")}>
                {l}
              </button>
            ))}
          </div>
        )}
        <p className="-mt-1 px-4 pb-2 text-xs text-sub">{remixOf ? "Add your take on this post" : TABS.find((t) => t[0] === kind)![2]}</p>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <input ref={pick} type="file" accept={accept} multiple={multi} hidden onChange={(e) => (choose(e.target.files), (e.target.value = ""))} />
          {files.length === 0 ? (
            <button
              onClick={() => pick.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => (e.preventDefault(), choose(e.dataTransfer.files))}
              className={cn("grid w-full place-items-center rounded-2xl border-2 border-dashed border-line text-sub hover:border-accent hover:text-txt", kind === "post" ? "aspect-square" : "aspect-[9/14]")}
            >
              <span className="flex flex-col items-center gap-2">
                <ImagePlus className="size-12" />
                <span className="font-semibold">{kind === "short" ? "Choose a video" : multi ? "Choose photos or a video" : "Choose a photo or video"}</span>
                <span className="text-xs">or drop it here · compressed on upload · up to 100 MB</span>
              </span>
            </button>
          ) : (
            <div className={cn("grid gap-2", files.length > 1 ? "grid-cols-3" : "grid-cols-1")}>
              {files.map((f, k) => (
                <div key={k} className={cn("relative overflow-hidden rounded-xl bg-black", files.length > 1 ? "aspect-square" : kind === "post" ? "max-h-[50vh]" : "mx-auto aspect-[9/16] max-h-[50vh]")}>
                  {mediaKind(f) === "video" ? (
                    <video src={urls[k]} muted autoPlay loop playsInline className="h-full w-full object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[k]} alt="" className="h-full w-full object-contain" />
                  )}
                  {!busy && (
                    <button onClick={() => setFiles(files.filter((_, j) => j !== k))} className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {multi && files.length < 10 && !busy && (
                <button onClick={() => pick.current?.click()} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line text-sub">
                  <ImagePlus className="size-7" />
                </button>
              )}
            </div>
          )}

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={kind === "story" ? 200 : 2200}
            placeholder={kind === "story" ? "Add text (optional)" : "Write a caption… use #tags"}
            className="mt-3 min-h-20 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />

          {kind !== "story" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["nexus", "newmusic", "fyp", "producer", "release", ...(mood ? [mood] : []), ...(genre ? [GRAM_GENRES.find((g) => g.id === genre)?.tag || genre] : [])].map((tag) => {
                const hash = `#${tag}`;
                const on = caption.toLowerCase().includes(hash.toLowerCase());
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (on) setCaption((c) => c.replace(new RegExp(`\\s*${hash}\\b`, "gi"), "").replace(/\s{2,}/g, " ").trim());
                      else setCaption((c) => `${c.trim()}${c.trim() ? " " : ""}${hash}`.slice(0, 2200));
                    }}
                    className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", on ? "bg-accent text-white" : "bg-white/5 text-white/70 hover:bg-white/10")}
                  >
                    {hash}
                  </button>
                );
              })}
            </div>
          )}

          {kind !== "story" && (
            <>
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-sub">Genre / style</p>
                <div className="flex flex-wrap gap-1.5">
                  {GRAM_GENRES.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGenre(genre === g.id ? null : g.id)}
                      className={cn("rounded-full px-3 py-1 text-xs font-semibold", genre === g.id ? "text-black" : "bg-white/5 text-white/70 hover:bg-white/10")}
                      style={genre === g.id ? { background: g.hue } : undefined}
                      title={`#${g.tag}`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                {genre && <p className="mt-1 text-[11px] text-sub">Adds #{GRAM_GENRES.find((x) => x.id === genre)?.tag} and boosts For you ranking</p>}
              </div>
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-sub">Mood</p>
                <div className="flex flex-wrap gap-1.5">
                  {GRAM_MOODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMood(mood === m.id ? null : m.id)}
                      className={cn("rounded-full px-3 py-1 text-xs font-semibold", mood === m.id ? "text-black" : "bg-white/5 text-white/70 hover:bg-white/10")}
                      style={mood === m.id ? { background: m.hue } : undefined}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold text-sub">Alt text (SEO &amp; accessibility)</span>
                <input value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} placeholder="Describe the image or video" className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
              </label>
            </>
          )}

          {kind === "story" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-sub">Visible for</span>
              {([24, 48] as const).map((h) => (
                <button key={h} onClick={() => setHours(h)} className={cn("rounded-full px-4 py-1.5 font-bold", hours === h ? "bg-accent text-white" : "bg-hover")}>
                  {h} hours
                </button>
              ))}
              {can.longStories() && <span className="text-[11px] font-semibold text-[#eb459e]">VIP · 48h unlocked</span>}
            </div>
          )}
        </div>
        <div className="p-4 pb-safe-4">
          <button disabled={!!busy || !files.length} onClick={() => void share()} className="min-h-12 w-full rounded-full bg-gradient-to-r from-[#ff2bd6] via-[#8b5cff] to-[#00c2ff] py-3 font-black text-white disabled:opacity-50">
            {busy ?? (kind === "story" ? `Share story · ${hours}h` : kind === "short" ? "Post Short" : remixOf ? "Share remix" : "Share")}
          </button>
        </div>
      </div>
    </div>
  );
}
