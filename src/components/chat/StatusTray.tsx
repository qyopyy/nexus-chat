"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp, toast } from "@/store/app";
import { supabase } from "@/lib/supabase";
import { deleteStatus, listStatuses, postPhotoStatus, postTextStatus, statusPhotoUrl, type NexusStatus } from "@/lib/nexusStatus";
import Avatar from "@/components/ui/Avatar";

function StatusPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let dead = false;
    void statusPhotoUrl(path).then((next) => {
      if (!dead) setUrl(next);
    });
    return () => {
      dead = true;
    };
  }, [path]);
  if (!url) return null;
  return <img src={url} alt="" className="mb-2 max-h-64 w-full rounded-xl object-cover" />;
}

export default function StatusTray() {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const spaces = useApp((s) => s.spaces);
  const [rows, setRows] = useState<NexusStatus[]>([]);
  const [open, setOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("friends");

  const refresh = useCallback(async () => {
    setRows(await listStatuses());
  }, []);

  useEffect(() => {
    if (!me) return;
    void refresh();
    const channel = supabase
      .channel(`nexus-status:${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_statuses" }, () => void refresh())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [me, refresh]);

  const people = useMemo(() => {
    const order: string[] = [];
    for (const row of rows) if (!order.includes(row.user_id)) order.push(row.user_id);
    if (me && !order.includes(me)) order.unshift(me);
    return order;
  }, [rows, me]);

  const viewing = rows.filter((row) => row.user_id === viewer);

  if (!me) return null;
  const name = (id: string) => (id === me ? "Your status" : profiles[id]?.display_name || "Status");

  return (
    <div className="border-b border-black/20 px-3 py-2">
      <div className="no-scrollbar flex gap-3 overflow-x-auto">
        <button type="button" onClick={() => setOpen(true)} className="flex w-14 shrink-0 flex-col items-center gap-1 text-[11px] text-sub">
          <span className="grid size-12 place-items-center rounded-full border border-dashed border-white/20 text-lg">+</span>
          Status
        </button>
        {people.filter((id) => rows.some((row) => row.user_id === id)).map((id) => (
          <button key={id} type="button" onClick={() => setViewer(id)} className="flex w-14 shrink-0 flex-col items-center gap-1">
            <span className="rounded-full bg-gradient-to-br from-accent to-emerald-300 p-[2px]">
              <span className="block rounded-full bg-side p-[2px]">
                <Avatar userId={id} size={40} plain />
              </span>
            </span>
            <span className="w-full truncate text-center text-[11px] text-sub">{id === me ? "You" : profiles[id]?.display_name || "…"}</span>
          </button>
        ))}
      </div>
      {open && (
        <form
          className="mt-2 space-y-2 rounded-2xl bg-side p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const target = audience === "friends" ? { kind: "friends" as const } : { kind: "space" as const, spaceId: audience };
            const file = (event.currentTarget.elements.namedItem("photo") as HTMLInputElement).files?.[0];
            const task = file ? postPhotoStatus(file, body, target) : postTextStatus(body, target);
            void task.then(() => {
              setBody("");
              setOpen(false);
              toast("Status is up for 24 hours", "success");
              return refresh();
            }).catch((err: Error) => toast(err.message, "error"));
          }}
        >
          <p className="text-xs text-sub">Friends or one space can see this for 24 hours. Then it expires.</p>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={280} placeholder="What's happening?" className="min-h-16 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none" />
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="text-xs text-sub" />
          <select value={audience} onChange={(event) => setAudience(event.target.value)} className="w-full rounded-xl bg-black/30 px-2 py-1.5 text-sm">
            <option value="friends">Friends</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>{space.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="submit" className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white">Post</button>
            <button type="button" className="text-xs text-sub" onClick={() => setOpen(false)}>Close</button>
          </div>
        </form>
      )}
      {viewer && (
        <div className="mt-2 rounded-2xl bg-black/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{name(viewer)}</span>
            <button type="button" className="text-xs text-sub" onClick={() => setViewer(null)}>Close</button>
          </div>
          {viewing.length === 0 && <p className="text-sm text-sub">No status right now.</p>}
          {viewing.map((row) => (
            <article key={row.id} className="mb-2">
              {row.kind === "photo" && row.media_path && <StatusPhoto path={row.media_path} />}
              {row.body && <p className="text-sm">{row.body}</p>}
              <p className="mt-1 text-[11px] text-sub">
                {row.audience === "friends" ? "Friends" : spaces.find((space) => space.id === row.space_id)?.name || "A space"} · until {new Date(row.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
              {row.user_id === me && (
                <button type="button" className="mt-1 text-xs text-dnd" onClick={() => void deleteStatus(row.id).then(refresh).catch((err: Error) => toast(err.message, "error"))}>Remove</button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
