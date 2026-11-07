"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ImagePlus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import {
  PERSONAL_EMOJI_LIMIT,
  SERVER_EMOJI_LIMIT,
  addCustomEmoji,
  cleanEmojiName,
  deleteCustomEmoji,
  emojiToken,
  loadSpaceEmojis,
  renameCustomEmoji,
  useEmojis,
  type CustomEmoji,
} from "@/lib/customEmoji";

/**
 * Upload & manage custom emojis — for a server (spaceId) or your personal set (spaceId = null).
 * Every emoji works across all of Nexus: chats, DMs, servers and reactions.
 */
export default function EmojiManager({ spaceId, canEdit }: { spaceId: string | null; canEdit: boolean }) {
  const me = useApp((s) => s.userId);
  const mine = useEmojis((s) => s.mine);
  const [serverList, setServerList] = useState<CustomEmoji[] | null>(null);
  const [busy, setBusy] = useState(0);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (spaceId) void loadSpaceEmojis(spaceId).then(setServerList);
  }, [spaceId]);

  const list = spaceId ? (serverList ?? []) : mine.filter((e) => !e.space_id && e.owner_id === me);
  const limit = spaceId ? SERVER_EMOJI_LIMIT : PERSONAL_EMOJI_LIMIT;
  const loading = spaceId ? serverList === null : false;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, Math.max(0, limit - list.length));
    if (picked.length < files.length) toast(`Only ${limit} emojis fit — added the first ${picked.length}`, "info");
    setBusy(picked.length);
    for (const f of picked) {
      const e = await addCustomEmoji(spaceId, f, picked.length === 1 && name ? name : f.name);
      if (e && spaceId) setServerList((l) => [...(l ?? []), e]);
      setBusy((n) => n - 1);
    }
    setName("");
    if (input.current) input.current.value = "";
  };

  const remove = async (e: CustomEmoji) => {
    await deleteCustomEmoji(e);
    if (spaceId) setServerList((l) => (l ?? []).filter((x) => x.id !== e.id));
  };

  const saveName = async (e: CustomEmoji) => {
    const n = cleanEmojiName(editName);
    setEditing(null);
    if (!n || n === e.name) return;
    await renameCustomEmoji(e, n);
    if (spaceId) setServerList((l) => (l ?? []).map((x) => (x.id === e.id ? { ...x, name: n } : x)));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-side p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold">{spaceId ? "Server emojis" : "Your emojis"}</div>
            <p className="text-[12px] text-sub">
              {spaceId
                ? "Members can use these everywhere on Nexus — in this server, DMs, group chats and reactions."
                : "Personal emojis go with you — use them in any chat, server or reaction."}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold text-sub">
            {list.length}/{limit}
          </span>
        </div>
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32))}
              placeholder="name (optional, e.g. party_cat)"
              className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 font-mono text-sm outline-none"
            />
            <input ref={input} type="file" accept="image/png,image/gif,image/webp,image/jpeg" multiple hidden onChange={(e) => void upload(e.target.files)} />
            <button
              disabled={busy > 0 || list.length >= limit}
              onClick={() => input.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy > 0 ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {busy > 0 ? `Uploading ${busy}…` : "Upload"}
            </button>
            <p className="w-full text-[11px] text-faint">PNG, GIF (animated), WEBP or JPG · under 2 MB · pick several at once to bulk add</p>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-sub">Loading…</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl bg-side px-3 py-6 text-center text-sm text-sub">No custom emojis yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {list.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-xl bg-side px-2.5 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.url} alt={`:${e.name}:`} className="size-8 shrink-0 object-contain" />
              {editing === e.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(ev) => setEditName(ev.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") void saveName(e);
                    if (ev.key === "Escape") setEditing(null);
                  }}
                  className="min-w-0 flex-1 rounded-md bg-rail px-2 py-1 font-mono text-sm outline-none"
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm font-semibold">:{e.name}:</div>
                  {e.animated && <div className="text-[10px] font-bold text-accent uppercase">Animated</div>}
                </div>
              )}
              {editing === e.id ? (
                <>
                  <IconBtn label="Save" onClick={() => void saveName(e)}>
                    <Check className="size-4" />
                  </IconBtn>
                  <IconBtn label="Cancel" onClick={() => setEditing(null)}>
                    <X className="size-4" />
                  </IconBtn>
                </>
              ) : (
                <>
                  <IconBtn
                    label="Copy code"
                    onClick={() => {
                      void navigator.clipboard.writeText(emojiToken(e));
                      toast(`:${e.name}: copied — paste it in any chat`, "success");
                    }}
                  >
                    <Copy className="size-4" />
                  </IconBtn>
                  {canEdit && (
                    <>
                      <IconBtn
                        label="Rename"
                        onClick={() => {
                          setEditing(e.id);
                          setEditName(e.name);
                        }}
                      >
                        <Pencil className="size-4" />
                      </IconBtn>
                      <IconBtn label="Delete" danger onClick={() => void remove(e)}>
                        <Trash2 className="size-4" />
                      </IconBtn>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={danger ? "rounded-lg bg-dnd/15 p-1.5 text-dnd" : "rounded-lg bg-hover p-1.5 text-sub hover:text-txt"}>
      {children}
    </button>
  );
}
