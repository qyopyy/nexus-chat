"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "@/store/app";
import { cn } from "@/lib/utils";
import { createPost, createStory, gramHome, mediaKind, uploadMedia, useGram, type Media } from "@/lib/gram";

const TABS = [
  ["post", "Post", "Photos or a video for your profile grid"],
  ["short", "Short", "A vertical video up to 3 minutes"],
  ["story", "Story", "Disappears after 24 or 48 hours"],
] as const;

export default function Create() {
  const mode = useGram((s) => s.create);
  const [kind, setKind] = useState<"post" | "short" | "story">("post");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [hours, setHours] = useState<24 | 48>(24);
  const [busy, setBusy] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode) {
      setKind(mode);
      setFiles([]);
      setCaption("");
    }
  }, [mode]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);

  if (!mode) return null;
  const close = () => !busy && useGram.setState({ create: null });
  const accept = kind === "short" ? "video/*" : kind === "story" ? "image/*,video/*" : "image/*,video/*";
  const multi = kind === "post";

  const choose = (list: FileList | null) => {
    if (!list?.length) return;
    let arr = [...list];
    if (kind === "short") arr = arr.filter((f) => mediaKind(f) === "video").slice(0, 1);
    else if (kind === "story") arr = arr.filter((f) => mediaKind(f)).slice(0, 1);
    else arr = arr.filter((f) => mediaKind(f)).slice(0, 10);
    if (!arr.length) return toast(kind === "short" ? "Shorts are videos — pick a video" : "Pick a photo or video", "error");
    const big = arr.find((f) => f.size > 100 * 1024 * 1024);
    if (big) return toast(`${big.name} is over 100 MB`, "error");
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
        await createPost(kind, media, caption);
        toast(kind === "short" ? "Short posted" : "Posted", "success");
      }
      useGram.setState({ create: null });
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
          <div className="flex-1 font-bold">Create</div>
          <button onClick={close} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex gap-1 p-3">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => (setKind(k), setFiles([]))} className={cn("flex-1 rounded-full py-2 text-sm font-bold", kind === k ? "bg-white text-black" : "bg-hover")}>
              {l}
            </button>
          ))}
        </div>
        <p className="-mt-1 px-4 pb-2 text-xs text-sub">{TABS.find((t) => t[0] === kind)![2]}</p>

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
            placeholder={kind === "story" ? "Add text (optional)" : "Write a caption…"}
            className="mt-3 min-h-20 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {kind === "story" && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-sub">Visible for</span>
              {([24, 48] as const).map((h) => (
                <button key={h} onClick={() => setHours(h)} className={cn("rounded-full px-4 py-1.5 font-bold", hours === h ? "bg-accent text-white" : "bg-hover")}>
                  {h} hours
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 pb-safe-4">
          <button disabled={!!busy || !files.length} onClick={() => void share()} className="w-full rounded-full bg-gradient-to-r from-[#ff2bd6] via-[#8b5cff] to-[#00c2ff] py-3 font-black text-white disabled:opacity-50">
            {busy ?? (kind === "story" ? `Share story · ${hours}h` : kind === "short" ? "Post Short" : "Share")}
          </button>
        </div>
      </div>
    </div>
  );
}
