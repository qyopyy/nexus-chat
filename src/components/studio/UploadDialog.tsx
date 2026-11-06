"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleCheck, Copy, ExternalLink, Fingerprint, ImagePlus, Link2, Plus, Trash2, CloudUpload, X } from "lucide-react";
import { toast } from "@/store/app";
import { useStudio } from "@/store/studio";
import {
  autoThumbnails,
  fmtDuration,
  getVideo,
  inspectVideo,
  playbackUrl,
  qualityLabel,
  slugFree,
  slugify,
  startVideoUpload,
  updateVideo,
  uploadThumb,
  useUploads,
  videoLink,
  type FileInfo,
} from "@/lib/videos";
import { cn } from "@/lib/utils";
import { checkStatus, clipFromFile, copyrightCheck, decodeLimit, type AudioCheck } from "@/lib/audio";
import { CHECK_INFO, CheckView } from "@/components/music/AudioBits";
import type { Video, VideoLink } from "@/lib/types";

const STEPS = ["Details", "Links", "Checks", "Visibility"] as const;
const CATEGORIES = ["Music", "Entertainment", "Gaming", "People & Blogs", "Comedy", "Film & Animation", "Education", "Howto & Style", "Sports", "Travel & Events", "Science & Technology", "News & Politics", "Pets & Animals", "Autos & Vehicles", "Nonprofits & Activism"];

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Studio upload / details dialog: select file → Details → Links → Checks → Visibility, upload runs in the background */
export default function UploadDialog() {
  const open = useStudio((s) => s.uploadOpen);
  const editId = useStudio((s) => s.editVideoId);
  const close = () => useStudio.setState({ uploadOpen: false, editVideoId: null });
  if (!open && !editId) return null;
  return <Dialog key={editId ?? "new"} editId={editId} onClose={close} />;
}

function Dialog({ editId, onClose }: { editId: string | null; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [copy, setCopy] = useState<AudioCheck | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyOn, setCopyOn] = useState(false);
  useEffect(() => {
    void checkStatus().then((x) => setCopyOn(x.configured));
  }, []);
  const runCopy = async (f: File, vid: string) => {
    setCopyBusy(true);
    try {
      const c = await copyrightCheck(await clipFromFile(f), { kind: "video", id: vid });
      setCopy(c);
    } catch (e) {
      toast(`Copyright check: ${(e as Error).message}`, "error");
    } finally {
      setCopyBusy(false);
    }
  };
  const [step, setStep] = useState(0);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<{ blob: Blob; url: string }[]>([]);
  const [thumbPick, setThumbPick] = useState<number | "custom" | null>(null);
  const [customThumb, setCustomThumb] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  // form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [kids, setKids] = useState<boolean | null>(null);
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("Music");
  const [commentsOn, setCommentsOn] = useState(true);
  const [slug, setSlug] = useState("");
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const [links, setLinks] = useState<VideoLink[]>([]);
  const [visibility, setVisibility] = useState<Video["visibility"]>("public");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState(() => localInput(new Date(Date.now() + 86400_000)));

  const upload = useUploads((s) => (video ? s.items[video.id] : undefined));

  // edit mode: load existing video
  useEffect(() => {
    if (!editId) return;
    void getVideo(editId).then((v) => {
      if (!v) return;
      fill(v);
      void playbackUrl(v).then(setPreview);
    });
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  function fill(v: Video) {
    setVideo(v);
    setTitle(v.title);
    setDesc(v.description);
    setKids(v.made_for_kids);
    setTags(v.tags.join(", "));
    setCategory(v.category ?? "Music");
    setCommentsOn(v.comments_enabled);
    setSlug(v.slug ?? "");
    setLinks(v.links ?? []);
    setVisibility(v.visibility);
    if (v.publish_at && new Date(v.publish_at) > new Date()) {
      setSchedule(true);
      setWhen(localInput(new Date(v.publish_at)));
    }
  }

  async function choose(f: File) {
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) return toast("Pick a video file (MP4, MOV, WebM)", "error");
    if (preparing) return;
    setPreparing(true);
    let v: Video | null = null;
    let i: FileInfo = { width: 0, height: 0, duration: 0 };
    let uploadFile = f;
    try {
      setFile(f);
      setPreview(URL.createObjectURL(f));
      const { shieldGate } = await import("@/lib/shield");
      if (await shieldGate(f, "video")) {
        setFile(null);
        setPreview(null);
        return;
      }
      const { youtubeCidGate } = await import("@/lib/audio");
      if (await youtubeCidGate(f, "video")) {
        setFile(null);
        setPreview(null);
        return;
      }
      // MOV / QuickTime → Full HD 60fps MP4 before the resumable upload (≤250 MB clips)
      const movLike = /quicktime|hevc/i.test(f.type) || /\.(mov|m4v)$/i.test(f.name);
      if (movLike && f.size <= 250 * 1024 * 1024) {
        try {
          const { compressVideo, FULL_HD_60 } = await import("@/lib/compressMedia");
          toast("Converting MOV → Full HD 60fps MP4…");
          const out = await compressVideo(f, { ...FULL_HD_60, force: true });
          if (!out.skipped) {
            uploadFile = new File([out.blob], f.name.replace(/\.[^.]+$/, "") + ".mp4", { type: out.mime || "video/mp4" });
            setFile(uploadFile);
            setPreview(URL.createObjectURL(uploadFile));
            toast("Converted MOV → Full HD 60fps MP4", "success");
          }
        } catch {
          toast("Couldn't convert MOV — uploading original", "error");
        }
      }
      i = await inspectVideo(uploadFile);
      setInfo(i);
      v = await startVideoUpload(uploadFile, i);
    } catch (e) {
      toast(`Upload failed: ${(e as Error).message}`, "error");
    } finally {
      setPreparing(false);
    }
    if (!v) return;
    setVideo(v);
    setTitle(v.title);
    const base = slugify(v.title);
    if (base.length >= 3 && (await slugFree(base, v.id))) setSlug(base);
    if (f.size <= decodeLimit()) void checkStatus().then((x) => {
        if (x.configured) void runCopy(f, v!.id);
      });
    void autoThumbnails(f).then((bl) => {
      setThumbs(bl.map((b) => ({ blob: b, url: URL.createObjectURL(b) })));
      if (bl.length) setThumbPick(1 < bl.length ? 1 : 0);
    });
  }

  // custom link availability
  useEffect(() => {
    if (!video) return;
    const s = slug.trim();
    if (!s) return setSlugOk(null);
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(s)) return setSlugOk(false);
    const t = setTimeout(() => void slugFree(s, video.id).then(setSlugOk), 300);
    return () => clearTimeout(t);
  }, [slug, video]);

  const height = info?.height ?? video?.height ?? 0;
  const width = info?.width ?? video?.width ?? 0;
  const duration = info?.duration ?? video?.duration ?? 0;
  const q = qualityLabel(height, width);
  const checks = useMemo(
    () => [
      { ok: Math.min(height, width) >= 720, label: q ? `Resolution: ${q}${Math.min(height, width) >= 1080 ? " — great" : Math.min(height, width) >= 720 ? "" : " — upload 720p or higher for HD"}` : "Resolution: reading…" },
      { ok: duration > 0, label: duration ? `Length: ${fmtDuration(duration)}` : "Length: reading…" },
      { ok: !file || /mp4|quicktime|webm|x-m4v/.test(file.type), label: file ? `Format: ${file.type || "unknown"}${/mp4/.test(file.type) ? " (plays everywhere)" : ""}` : "Format: original file" },
      copyOn
        ? {
            ok: copy?.status === "clean" || copy?.status === "own",
            label: copyBusy
              ? "Copyright: listening for copyrighted music…"
              : copy
                ? `Copyright: ${(CHECK_INFO[copy.status] ?? CHECK_INFO.error).label.toLowerCase()}`
                : "Copyright: not checked yet",
          }
        : { ok: true, label: "Copyright: only upload videos you own or have rights to" },
    ],
    [height, width, duration, q, file, copy, copyBusy, copyOn],
  );

  async function save(final: boolean) {
    if (!video) return;
    if (!title.trim()) {
      setStep(0);
      return toast("Add a title", "error");
    }
    if (kids === null && final) {
      setStep(0);
      return toast("Choose whether it's made for kids", "error");
    }
    if (slug && slugOk === false) {
      setStep(0);
      return toast("Pick another custom link", "error");
    }
    setSaving(true);
    let thumb_url = video.thumb_url;
    const chosen = thumbPick === "custom" ? customThumb?.blob : thumbPick !== null ? thumbs[thumbPick]?.blob : null;
    if (chosen) thumb_url = (await uploadThumb(video.id, chosen)) ?? thumb_url;
    const v = await updateVideo(video.id, {
      title: title.trim().slice(0, 100),
      description: desc.slice(0, 5000),
      made_for_kids: !!kids,
      tags: tags
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 30),
      category,
      comments_enabled: commentsOn,
      slug: slug.trim() || null,
      links: links.filter((l) => /^https?:\/\/\S+\.\S+/.test(l.url)).map((l) => ({ label: l.label.trim().slice(0, 60), url: l.url.trim() })),
      visibility: final ? visibility : video.visibility,
      publish_at: final && schedule && visibility === "public" ? new Date(when).toISOString() : null,
      thumb_url,
    });
    setSaving(false);
    if (!v) return;
    setVideo(v);
    if (final) {
      toast(upload?.status === "uploading" ? "Saved — it goes live as soon as the upload finishes" : visibility === "private" ? "Saved as private" : "Published 🎉", "success");
      window.dispatchEvent(new CustomEvent("nexus:video-ready", { detail: v.id }));
      onClose();
    } else toast("Draft saved", "success");
  }

  // ---------------------------------------------------------------- file picker
  if (!video && !editId) {
    return (
      <Shell onClose={onClose} title="Upload videos">
        <div
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void choose(f);
          }}
          className={cn("flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center transition", drag && "bg-accent/10")}
        >
          <div className={cn("grid size-36 place-items-center rounded-full bg-black/30 transition", drag && "scale-110")}>
            <CloudUpload className="size-16 text-sub" />
          </div>
          <div>
            <div className="text-lg font-semibold">Drag and drop a video file to upload</div>
            <div className="text-sm text-sub">Your video stays private until you publish it. 1080p, 1440p and 4K keep their full quality.</div>
          </div>
          <input ref={pickRef} type="file" accept="video/*,.mkv" hidden onChange={(e) => (e.target.files?.[0] && void choose(e.target.files[0]), (e.target.value = ""))} />
          <button disabled={preparing} onClick={() => pickRef.current?.click()} className="rounded-full bg-txt px-5 py-2.5 font-semibold text-chat disabled:opacity-60">
            {preparing ? "Starting upload…" : "Select file"}
          </button>
          <p className="max-w-md text-xs text-faint">By uploading you confirm you own the rights to this video. MP4 (H.264 or HEVC) plays on every phone and browser.</p>
        </div>
      </Shell>
    );
  }

  const pct = upload ? Math.round((upload.sent / Math.max(upload.bytes, 1)) * 100) : 100;
  const eta = upload && upload.status === "uploading" && upload.speed > 0 ? Math.max(0, (upload.bytes - upload.sent) / upload.speed) : 0;
  const link = video ? videoLink({ id: video.id, slug: slug.trim() || null }) : "";

  return (
    <Shell onClose={onClose} title={title || "Untitled"} wide>
      {/* stepper */}
      <div className="flex shrink-0 items-center justify-center gap-0 border-b border-line/60 px-3 py-3 sm:gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <button onClick={() => setStep(i)} className="flex flex-col items-center gap-1 px-2 text-xs font-semibold sm:px-4">
              <span className={cn("grid size-6 place-items-center rounded-full border-2 text-[11px]", i < step ? "border-accent bg-accent text-white" : i === step ? "border-accent text-accent" : "border-sub text-sub")}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={i === step ? "text-txt" : "text-sub"}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <span className="mb-4 h-0.5 w-6 bg-line sm:w-16" />}
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* form */}
        <div className="min-w-0 flex-1 space-y-5 p-4 sm:p-6 lg:overflow-y-auto">
          {step === 0 && (
            <>
              <h3 className="text-xl font-bold">Details</h3>
              <Field label="Title (required)" count={`${title.length}/100`}>
                <textarea value={title} maxLength={100} rows={2} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title that describes your video" className="w-full resize-none bg-transparent outline-none" />
              </Field>
              <Field label="Description" count={`${desc.length}/5000`}>
                <textarea value={desc} maxLength={5000} rows={6} onChange={(e) => setDesc(e.target.value)} placeholder="Tell viewers about your video. Links, #hashtags and 1:23 timestamps become clickable." className="w-full resize-y bg-transparent outline-none" />
              </Field>

              <div>
                <div className="font-semibold">Thumbnail</div>
                <p className="mb-2 text-xs text-sub">Pick a frame or upload your own (1280×720 JPG/PNG).</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={thumbRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      if (f.size > 10 * 1024 * 1024) return toast("Thumbnail must be under 10 MB", "error");
                      setCustomThumb({ blob: f, url: URL.createObjectURL(f) });
                      setThumbPick("custom");
                    }}
                  />
                  <button onClick={() => thumbRef.current?.click()} className="grid aspect-video w-36 place-items-center rounded-lg border-2 border-dashed border-line text-xs text-sub hover:border-sub">
                    {customThumb ? <img src={customThumb.url} alt="" className="size-full rounded-md object-cover" /> : (<span className="flex flex-col items-center gap-1"><ImagePlus className="size-5" /> Upload file</span>)}
                  </button>
                  {thumbs.map((t, i) => (
                    <button key={i} onClick={() => setThumbPick(i)} className={cn("relative aspect-video w-36 overflow-hidden rounded-lg ring-2", thumbPick === i ? "ring-accent" : "ring-transparent opacity-70 hover:opacity-100")}>
                      <img src={t.url} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                  {video?.thumb_url && thumbPick === null && <img src={video.thumb_url} alt="" className="aspect-video w-36 rounded-lg object-cover ring-2 ring-accent" />}
                  {!thumbs.length && file && <div className="grid aspect-video w-36 animate-pulse place-items-center rounded-lg bg-black/30 text-[11px] text-sub">Making frames…</div>}
                </div>
              </div>

              <div>
                <div className="font-semibold">Audience</div>
                <p className="mb-2 text-xs text-sub">Is this video made for kids? (required)</p>
                <Radio checked={kids === false} onClick={() => setKids(false)} label="No, it's not made for kids" />
                <Radio checked={kids === true} onClick={() => setKids(true)} label="Yes, it's made for kids" />
              </div>

              <Field label="Custom link" hint={slugOk === false ? "Taken or invalid — use 3–60 lowercase letters, numbers, dashes" : slugOk ? "Available ✓" : undefined} error={slugOk === false}>
                <div className="flex items-center text-sm">
                  <span className="shrink-0 text-sub">{typeof window !== "undefined" ? window.location.host : ""}/v/</span>
                  <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 61))} placeholder="my-video" className="min-w-0 flex-1 bg-transparent outline-none" />
                </div>
              </Field>

              <Field label="Tags" hint="Comma separated — help people find your video">
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="phonk, beat, audia" className="w-full bg-transparent outline-none" />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-sm font-semibold">Category</div>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-line bg-transparent px-3 py-2.5 outline-none focus:border-accent">
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-panel">
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 sm:mt-6">
                  <span className="text-sm">Allow comments</span>
                  <input type="checkbox" checked={commentsOn} onChange={(e) => setCommentsOn(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
                </label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h3 className="text-xl font-bold">Links</h3>
              <p className="-mt-3 text-sm text-sub">Add up to 12 links — they show as buttons under the video and as cards in the description (store links, Spotify, merch, socials…).</p>
              <div className="space-y-2">
                {links.map((l, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-2.5 sm:flex-row">
                    <input
                      value={l.label}
                      onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      placeholder="Button text (e.g. Stream on Spotify)"
                      className="min-w-0 flex-1 rounded-lg bg-black/25 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      value={l.url}
                      onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                      onBlur={(e) => !/^https?:\/\//.test(e.target.value) && e.target.value && setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: `https://${x.url}` } : x)))}
                      placeholder="https://"
                      className="min-w-0 flex-[1.4] rounded-lg bg-black/25 px-3 py-2 text-sm outline-none"
                    />
                    <button onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} className="grid size-9 shrink-0 place-items-center self-end rounded-lg text-sub hover:bg-dnd/15 hover:text-dnd sm:self-auto" aria-label="Remove link">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                disabled={links.length >= 12}
                onClick={() => setLinks((ls) => [...ls, { label: "", url: "" }])}
                className="flex items-center gap-1.5 rounded-full bg-side px-4 py-2 text-sm font-semibold hover:bg-hover disabled:opacity-40"
              >
                <Plus className="size-4" /> Add link
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="text-xl font-bold">Checks</h3>
              <p className="-mt-3 text-sm text-sub">We check your video for quality and playback issues.</p>
              <div className="divide-y divide-line/60 rounded-xl border border-line">
                {checks.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 text-sm">
                    <CircleCheck className={cn("size-5 shrink-0", c.ok ? "text-ok" : "text-idle")} />
                    {c.label}
                  </div>
                ))}
              </div>
              {copy && <CheckView c={copy} />}
              {copyOn && file && video && !copyBusy && (
                <button onClick={() => void runCopy(file, video.id)} className="flex items-center gap-1.5 self-start rounded-full bg-hover px-4 py-2 text-sm font-semibold hover:bg-active">
                  <Fingerprint className="size-4" /> {copy ? "Check copyright again" : "Check for copyrighted music"}
                </button>
              )}
              <p className="text-xs text-faint">Nexus keeps your original file, so 1080p and 4K uploads play in full quality.</p>
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="text-xl font-bold">Visibility</h3>
              <p className="-mt-3 text-sm text-sub">Choose when to publish and who can see your video.</p>
              <div className="space-y-1 rounded-xl border border-line p-3">
                <div className="mb-1 font-semibold">Save or publish</div>
                <Radio checked={visibility === "private"} onClick={() => setVisibility("private")} label="Private" sub="Only you can watch it" />
                <Radio checked={visibility === "unlisted"} onClick={() => setVisibility("unlisted")} label="Unlisted" sub="Anyone with the link can watch it" />
                <Radio checked={visibility === "public"} onClick={() => setVisibility("public")} label="Public" sub="Everyone on Nexus can find and watch it" />
              </div>
              <div className={cn("rounded-xl border border-line p-3", visibility !== "public" && "opacity-50")}>
                <label className="flex cursor-pointer items-center gap-2 font-semibold">
                  <input type="checkbox" disabled={visibility !== "public"} checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="size-4" />
                  Schedule
                </label>
                {schedule && visibility === "public" && (
                  <input type="datetime-local" value={when} min={localInput(new Date())} onChange={(e) => setWhen(e.target.value)} className="mt-2 rounded-lg bg-black/25 px-3 py-2 text-sm outline-none [color-scheme:dark]" />
                )}
              </div>
            </>
          )}
        </div>

        {/* preview card */}
        <aside className="shrink-0 p-4 sm:p-6 lg:w-[360px] lg:pl-0">
          <div className="overflow-hidden rounded-xl bg-black/30">
            <div className="relative aspect-video bg-black">
              {preview ? <video src={preview} controls playsInline muted className="size-full object-contain" /> : <div className="grid size-full place-items-center text-sm text-sub">Preview</div>}
              {q && <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 text-[11px] font-bold text-white">{q}</span>}
            </div>
            <div className="space-y-2 p-3 text-sm">
              <div>
                <div className="text-xs text-sub">Video link</div>
                <div className="flex items-center gap-1">
                  <a href={link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[#6ab7ff]">
                    {link}
                  </a>
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(link);
                      toast("Link copied", "success");
                    }}
                    className="grid size-7 place-items-center rounded hover:bg-white/10"
                    aria-label="Copy link"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs text-sub">Filename</div>
                <div className="truncate">{file?.name ?? video?.video_path?.split("/").pop() ?? "—"}</div>
              </div>
              {links.filter((l) => l.url).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {links
                    .filter((l) => l.url)
                    .map((l, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                        <ExternalLink className="size-3" /> {l.label || "Link"}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* footer: upload progress + navigation */}
      <div className="flex shrink-0 items-center gap-3 border-t border-line/60 px-4 py-3 pb-safe-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-sub">
          {upload ? (
            upload.status === "uploading" ? (
              <>
                <CloudUpload className="size-4 shrink-0 text-accent" />
                <span className="truncate">
                  Uploading {pct}%{eta ? ` · ${eta > 90 ? `${Math.ceil(eta / 60)} min` : `${Math.ceil(eta)} s`} left` : ""}
                </span>
                <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-black/40 sm:block">
                  <span className="block h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </span>
              </>
            ) : upload.status === "done" ? (
              <>
                <CircleCheck className="size-4 text-ok" /> Upload complete · {q}
              </>
            ) : (
              <span className="text-dnd">{upload.error}</span>
            )
          ) : (
            <>
              <Link2 className="size-4" /> {q || "Saved"}
            </>
          )}
        </div>
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-hover">
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(step + 1)} className="rounded-full bg-txt px-5 py-2 text-sm font-semibold text-chat">
            Next
          </button>
        ) : (
          <button disabled={saving || !video} onClick={() => void save(true)} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : visibility === "private" ? "Save" : schedule ? "Schedule" : "Publish"}
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-6" role="dialog" aria-modal>
      <div className={cn("flex h-full w-full animate-pop flex-col overflow-hidden bg-panel shadow-2xl sm:h-[min(860px,94dvh)] sm:rounded-2xl", wide ? "max-w-6xl" : "max-w-4xl")}>
        <div className="flex shrink-0 items-center gap-3 border-b border-line/60 px-4 py-3 pt-safe-3 sm:pt-3">
          <div className="min-w-0 flex-1 truncate text-lg font-bold">{title}</div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, count, hint, error, children }: { label: string; count?: string; hint?: string; error?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className={cn("rounded-lg border px-3 pt-1.5 pb-2 focus-within:border-accent", error ? "border-dnd" : "border-line")}>
        <div className="flex justify-between text-xs text-sub">
          <span>{label}</span>
          {count && <span>{count}</span>}
        </div>
        {children}
      </div>
      {hint && <div className={cn("mt-1 text-xs", error ? "text-dnd" : "text-sub")}>{hint}</div>}
    </div>
  );
}

function Radio({ checked, onClick, label, sub }: { checked: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left hover:bg-white/5">
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", checked ? "border-accent" : "border-sub")}>{checked && <span className="size-2.5 rounded-full bg-accent" />}</span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="block text-xs text-sub">{sub}</span>}
      </span>
    </button>
  );
}
