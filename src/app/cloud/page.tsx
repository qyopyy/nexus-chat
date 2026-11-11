"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/store/app";
import { addCloudFiles, addVoiceMemo, cloudUrl, deleteCloud, listCloud, syncCloudIfDue, type CloudFile } from "@/lib/nexusCloud";
import CloudAlbums from "@/components/cloud/CloudAlbums";
import { fmtBytes } from "@/lib/acetateAudio";

export default function NexusCloudPage() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<CloudFile[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function refresh() {
    setRows(await listCloud());
  }

  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id;
      if (!id) {
        if (live) setReady(true);
        return;
      }
      useApp.setState({ userId: id });
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (profile) useApp.setState((s) => ({ profiles: { ...s.profiles, [id]: profile } }));
      const { data: tier } = await supabase.rpc("my_tier");
      if (!live) return;
      setOpen(Number(tier) >= 2);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void syncCloudIfDue()
      .then(() => listCloud())
      .then((list) => {
        if (live) setRows(list);
      })
      .catch((e: Error) => setNote(e.message));
    const timer = window.setInterval(() => {
      void syncCloudIfDue().then(() => refresh()).catch(() => undefined);
    }, 60 * 60 * 1000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [open]);

  return (
    <div className="h-full overflow-y-auto bg-[#070709] text-[#f4f1ea]">
      <main className="mx-auto max-w-3xl px-5 py-8">
        <Link href="/" className="text-sm text-[#8d8880]">Nexus</Link>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#7ee0c6] uppercase">Premium</p>
        <h1 className="mt-1 font-serif text-4xl">Nexus Cloud</h1>
        <p className="mt-2 max-w-xl text-sm text-[#a39e96]">
          Photos, files, and voice memos stay on your account and show up on every device you sign into. While Nexus is open, a sync runs at least once a day. A website cannot read your camera roll by itself — add the photos you want kept.
        </p>
        {ready && !open && <p className="mt-4 rounded-2xl bg-[#1a1a1a] px-4 py-3 text-sm">Nexus Cloud is included with Lighting Premium and up. Sign in on this account, or ask an admin to grant that plan.</p>}
        {note && <p className="mt-3 text-sm text-[#e07a5f]">{note}</p>}
        {open && (
          <div className="mt-5 flex flex-wrap gap-2">
            <label className="rounded-full bg-[#f4f1ea] px-4 py-2 text-sm font-semibold text-[#070709]">
              Add photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void addCloudFiles(files, "photo").then(refresh).catch((err: Error) => setNote(err.message));
              }} />
            </label>
            <label className="rounded-full border border-white/15 px-4 py-2 text-sm">
              Add files
              <input type="file" multiple className="hidden" onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void addCloudFiles(files, "file").then(refresh).catch((err: Error) => setNote(err.message));
              }} />
            </label>
            <button
              type="button"
              className="rounded-full border border-white/15 px-4 py-2 text-sm"
              onClick={() => {
                if (recording && rec.current) {
                  rec.current.stop();
                  setRecording(false);
                  return;
                }
                void navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                  const recorder = new MediaRecorder(stream);
                  chunks.current = [];
                  recorder.ondataavailable = (event) => {
                    if (event.data.size) chunks.current.push(event.data);
                  };
                  recorder.onstop = () => {
                    stream.getTracks().forEach((track) => track.stop());
                    const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
                    void addVoiceMemo(blob).then(refresh).catch((err: Error) => setNote(err.message));
                  };
                  rec.current = recorder;
                  recorder.start();
                  setRecording(true);
                }).catch(() => setNote("Microphone permission is needed for a voice memo."));
              }}
            >
              {recording ? "Stop memo" : "Voice memo"}
            </button>
          </div>
        )}
        {open && <CloudAlbums files={rows} />}
        <ul className="mt-6 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 rounded-2xl border border-white/10 px-3 py-2">
              <span className="w-14 text-[10px] font-semibold tracking-wide text-[#7ee0c6] uppercase">{row.kind}</span>
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => void cloudUrl(row).then((url) => window.open(url, "_blank", "noopener"))}>
                {row.name}
              </button>
              <span className="text-xs text-[#8d8880]">{fmtBytes(Number(row.bytes))}</span>
              <button type="button" className="text-xs text-[#e07a5f]" onClick={() => void deleteCloud(row).then(refresh).catch((err: Error) => setNote(err.message))}>Delete</button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
