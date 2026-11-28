"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { EmbedItem, EmbedOverrides, Message } from "@/lib/types";
import type { LinkPreview } from "@/lib/unfurl";
import { cleanItem, safeEmbedImage, saveEmbed, uploadEmbedImage } from "@/lib/embedEdit";
import { proxiedImage } from "@/lib/netPrefs";

/** Edit how a link in my message looks: title, description, picture — or hide / reset the embed. */
export default function EmbedEditor({ message, url, preview, onClose }: { message: Message; url: string; preview: LinkPreview; onClose: () => void }) {
  const cur: EmbedItem = message.embed?.items?.[url] ?? {};
  const [title, setTitle] = useState(cur.title ?? preview.title ?? "");
  const [description, setDescription] = useState(cur.description ?? preview.description ?? "");
  const [image, setImage] = useState(cur.image ?? "");
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  const shown = safeEmbedImage(image) ?? preview.image ?? null;

  async function commit(item: EmbedItem | null, off?: boolean) {
    setBusy(true);
    const items = { ...(message.embed?.items ?? {}) };
    if (item) items[url] = item;
    else delete items[url];
    const next: EmbedOverrides = { off: off ?? message.embed?.off, items };
    const ok = await saveEmbed(message.id, next);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-rail p-5 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <h3 className="flex-1 text-lg font-bold">Edit link embed</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-sub hover:bg-white/10" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border-l-4 border-accent bg-black/25">
          {shown && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxiedImage(shown) ?? shown} alt="" className="max-h-40 w-full object-cover" referrerPolicy="no-referrer" />
          )}
          <div className="p-2.5">
            <div className="line-clamp-2 text-sm font-semibold text-[#6ab7ff]">{title || "Title"}</div>
            <div className="mt-0.5 line-clamp-3 text-xs opacity-75">{description || "Description"}</div>
          </div>
        </div>

        <label className="mt-4 block text-xs font-bold tracking-wide text-sub uppercase">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} className="mt-1 w-full rounded-lg bg-side px-3 py-2 text-sm outline-none ring-accent focus:ring-1" />
        <label className="mt-3 block text-xs font-bold tracking-wide text-sub uppercase">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} rows={3} className="mt-1 w-full resize-none rounded-lg bg-side px-3 py-2 text-sm outline-none ring-accent focus:ring-1" />
        <label className="mt-3 block text-xs font-bold tracking-wide text-sub uppercase">Picture</label>
        <div className="mt-1 flex gap-2">
          <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://… image link" className="min-w-0 flex-1 rounded-lg bg-side px-3 py-2 text-sm outline-none ring-accent focus:ring-1" />
          <button
            type="button"
            disabled={busy}
            onClick={() => pick.current?.click()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15 disabled:opacity-40"
          >
            <ImagePlus className="size-4" /> Upload
          </button>
          <input
            ref={pick}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              void uploadEmbedImage(f).then((u) => {
                if (u) setImage(u);
                setBusy(false);
              });
            }}
          />
        </div>
        {image && !safeEmbedImage(image) && <p className="mt-1 text-xs text-dnd">Use an https:// image link.</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void commit(cleanItem({ title: title !== preview.title ? title : undefined, description: description !== preview.description ? description : undefined, image }))}
            className="rounded-md bg-ok px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Save
          </button>
          <button type="button" disabled={busy} onClick={() => void commit(null)} className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-40">
            Reset to original
          </button>
          <button type="button" disabled={busy} onClick={() => void commit({ hide: true })} className="ml-auto rounded-md bg-dnd/20 px-4 py-2 text-sm font-semibold text-dnd disabled:opacity-40">
            Remove embed
          </button>
        </div>
      </div>
    </div>
  );
}
