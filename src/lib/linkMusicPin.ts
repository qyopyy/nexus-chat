"use client";

import { linkbioUploadMusic } from "./linkbio";
import { listMyProjects, listTracks, trackUrl, type UntitledTrack } from "./untitled";
import { listVault, vaultUrl, type VaultFile } from "./protect";
import { toast } from "@/store/app";

export type PinSourceItem =
  | { source: "cutroom"; id: string; title: string; projectTitle: string; track: UntitledTrack }
  | { source: "vault"; id: string; title: string; projectTitle: string; file: VaultFile };

const isAudioVault = (f: VaultFile) =>
  !!(f.mime?.startsWith("audio/") || /\.(mp3|wav|flac|aiff?|m4a|ogg|aac)$/i.test(f.name));

/** List recent Cutroom tracks + Vault audio the user can pin onto Nexus Link. */
export async function listPinMusicSources(limit = 24): Promise<PinSourceItem[]> {
  const out: PinSourceItem[] = [];
  try {
    const projects = await listMyProjects();
    for (const p of projects.slice(0, 12)) {
      const tracks = await listTracks(p.id);
      for (const t of tracks.slice(0, 8)) {
        out.push({
          source: "cutroom",
          id: t.id,
          title: t.title || "Untitled track",
          projectTitle: p.title || "Cutroom",
          track: t,
        });
        if (out.length >= limit) return out;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const files = await listVault();
    for (const f of files) {
      if (!isAudioVault(f)) continue;
      out.push({
        source: "vault",
        id: f.id,
        title: f.title || f.name,
        projectTitle: f.artist || f.folder || "Vault",
        file: f,
      });
      if (out.length >= limit) break;
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** Copy a remote/signed audio URL into the public linkbio-music bucket. */
export async function linkbioPinRemoteAudio(url: string, fileName: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    if (!blob.size) throw new Error("empty");
    const safe = (fileName || "track.mp3").replace(/[^\w.\-]+/g, "_").slice(-80) || "track.mp3";
    const mime = blob.type && blob.type.startsWith("audio/") ? blob.type : "audio/mpeg";
    const file = new File([blob], safe, { type: mime });
    return linkbioUploadMusic(file);
  } catch {
    toast("Couldn’t copy that track into Link", "error");
    return null;
  }
}

export async function pinSourceToLink(item: PinSourceItem): Promise<string | null> {
  if (item.source === "cutroom") {
    const url = await trackUrl(item.track.path);
    if (!url) {
      toast("Couldn’t open Cutroom track", "error");
      return null;
    }
    const name = `${item.track.title || "cut"}.mp3`;
    return linkbioPinRemoteAudio(url, name);
  }
  const url = await vaultUrl(item.file);
  if (!url) {
    toast("Couldn’t open Vault file", "error");
    return null;
  }
  return linkbioPinRemoteAudio(url, item.file.name || "vault.mp3");
}
