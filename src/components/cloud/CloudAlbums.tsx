"use client";

import { useEffect, useState } from "react";
import { addFileToAlbum, albumFiles, cloudUrl, createAlbum, deleteAlbum, inviteToAlbum, leaveAlbum, listAlbums, removeFileFromAlbum, type CloudAlbum, type CloudFile } from "@/lib/nexusCloud";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";

export default function CloudAlbums({ files }: { files: CloudFile[] }) {
  const userId = useApp((s) => s.userId);
  const [albums, setAlbums] = useState<CloudAlbum[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [items, setItems] = useState<CloudFile[]>([]);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    setAlbums(await listAlbums());
  }

  useEffect(() => {
    void refresh().catch((e: Error) => setNote(e.message));
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`cloud-albums:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_cloud_album_items" }, () => {
        if (open) void albumFiles(open).then(setItems).catch(() => undefined);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "nexus_cloud_albums" }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, open]);

  const current = albums.find((album) => album.id === open) ?? null;
  const mine = current?.owner_id === userId;

  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Shared albums</h2>
      <p className="mt-1 text-sm text-[#a39e96]">Invite a friend who also has Premium. They can open the files. They cannot upload into your storage.</p>
      {note && <p className="mt-2 text-sm text-[#e07a5f]">{note}</p>}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void createAlbum(title).then(() => {
            setTitle("");
            return refresh();
          }).catch((e: Error) => setNote(e.message));
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Album name" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none" />
        <button type="submit" className="rounded-full bg-[#f4f1ea] px-4 text-sm font-semibold text-[#070709]">Create</button>
      </form>
      <ul className="mt-3 space-y-2">
        {albums.map((album) => (
          <li key={album.id}>
            <button type="button" className="w-full rounded-2xl border border-white/10 px-3 py-2 text-left" onClick={() => {
              setOpen(album.id);
              void albumFiles(album.id).then(setItems).catch((e: Error) => setNote(e.message));
            }}>
              <span className="font-semibold">{album.title}</span>
              <span className="ml-2 text-xs text-[#8d8880]">{album.owner_id === userId ? "Yours" : "Shared with you"}</span>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <div className="mt-4 rounded-3xl border border-white/10 p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{current.title}</h3>
            {mine ? (
              <button type="button" className="text-xs text-[#e07a5f]" onClick={() => void deleteAlbum(current.id).then(() => { setOpen(null); return refresh(); })}>Delete album</button>
            ) : (
              <button type="button" className="text-xs text-[#e07a5f]" onClick={() => void leaveAlbum(current.id).then(() => { setOpen(null); return refresh(); })}>Leave</button>
            )}
          </div>
          {mine && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void inviteToAlbum(current.id, who).then(() => setWho("")).catch((e: Error) => setNote(e.message));
              }}
            >
              <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Friend username" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-transparent px-3 py-1.5 text-sm outline-none" />
              <button type="submit" className="rounded-full border border-white/15 px-3 text-sm">Invite</button>
            </form>
          )}
          {mine && files.length > 0 && (
            <select
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#141414] px-2 py-1.5 text-sm"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                void addFileToAlbum(current.id, e.target.value).then(() => albumFiles(current.id)).then(setItems).catch((err: Error) => setNote(err.message));
                e.target.value = "";
              }}
            >
              <option value="">Add one of your files</option>
              {files.map((file) => (
                <option key={file.id} value={file.id}>{file.name}</option>
              ))}
            </select>
          )}
          <ul className="mt-3 space-y-1 text-sm">
            {items.map((file) => (
              <li key={file.id} className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => void cloudUrl(file).then((url) => window.open(url, "_blank", "noopener"))}>{file.name}</button>
                {mine && <button type="button" className="text-xs text-[#8d8880]" onClick={() => void removeFileFromAlbum(current.id, file.id).then(() => albumFiles(current.id)).then(setItems)}>Remove</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
