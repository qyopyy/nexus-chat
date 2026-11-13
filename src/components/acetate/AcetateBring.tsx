"use client";

import { useEffect, useState } from "react";
import AcetateConvert from "./AcetateConvert";
import AcetateLinkPlayer from "./AcetateLinkPlayer";
import { featureFlags, loadFeatureFlags, type FeatureFlags } from "@/lib/featureFlags";
import { uploadAudio, updateTrack, type AcetateTrack } from "@/lib/acetate";
import { toast } from "@/store/app";
import { fmtTime } from "@/lib/acetateAudio";
import {
  deleteLinkList,
  loadLinkLibrary,
  matchLinkToVault,
  resolvePublicLink,
  saveLinkList,
  vaultTitleMatches,
  type LinkList,
  type LinkRow,
} from "@/lib/acetateLinks";
import {
  connectSoundCloud,
  disconnectSoundCloud,
  downloadSoundCloud,
  resolveSoundCloud,
  soundCloudStatus,
  type SoundCloudCard,
  type SoundCloudStatus,
} from "@/lib/soundcloudClient";

export default function AcetateBring(props: {
  tracks: AcetateTrack[];
  onBack: () => void;
  onPlayVault: (id: string) => void;
  reload: () => Promise<void>;
  run: (task: () => Promise<void>) => void;
}) {
  const [flags, setFlags] = useState<FeatureFlags>(featureFlags());
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [cloud, setCloud] = useState<SoundCloudStatus | null>(null);
  const [cloudUrl, setCloudUrl] = useState("");
  const [found, setFound] = useState<SoundCloudCard | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [lists, setLists] = useState<LinkList[]>([]);
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<LinkRow | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);

  useEffect(() => {
    void loadFeatureFlags().then(setFlags);
  }, []);

  useEffect(() => {
    if (!flags.soundcloud_import) return;
    void soundCloudStatus(true).then(setCloud).catch((error: Error) => setCloud({ configured: true, connected: false, error: error.message }));
  }, [flags.soundcloud_import]);

  useEffect(() => {
    if (!flags.link_import) return;
    void loadLinkLibrary().then((library) => {
      setLists(library.lists);
      setRows(library.items);
    }).catch(() => undefined);
  }, [flags.link_import]);

  function importTrack(card: SoundCloudCard) {
    if (!card.canImport) return;
    props.run(async () => {
      const audio = await downloadSoundCloud(card.id);
      const saved = await uploadAudio(audio.file, { library: "vault", title: audio.title });
      await updateTrack(saved.trackId, {
        artist: audio.artist || null,
        source_url: audio.source,
        source_kind: "soundcloud",
        external_art: audio.artwork,
      });
      toast(`${audio.title} is in Vault`, "success");
    });
  }

  const openRows = rows.filter((row) => row.list_id === openId);

  return (
    <div className="px-4 pt-4 pb-28" style={{ fontFamily: "var(--ac-font)" }}>
      <header className="flex items-center gap-3">
        <button type="button" onClick={props.onBack} className="grid size-10 place-items-center rounded-full" style={{ background: "var(--ac-card)" }} aria-label="Back">←</button>
        <div>
          <p className="text-xs font-bold tracking-[0.18em] uppercase" style={{ color: "var(--ac-accent)" }}>Bring in</p>
          <h1 className="text-3xl font-black">Your audio, or a link</h1>
        </div>
      </header>
      <p className="mt-3 max-w-xl text-sm" style={{ color: "var(--ac-muted)" }}>
        Convert files you already own. Import SoundCloud audio only through the official download. Spotify and YouTube links stay metadata and play in their own players.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Format converter</h2>
        {flags.format_convert ? (
          <div className="mt-3">
            <AcetateConvert
              source={localFile}
              saveLabel="Save into Vault"
              onFile={setLocalFile}
              onSave={async (file, label) => {
                await uploadAudio(file, { library: "vault", title: file.name.replace(/\.[^.]+$/, ""), label });
                await props.reload();
                toast(`Saved ${label} into Vault`, "success");
              }}
            />
          </div>
        ) : <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>Format conversion is turned off.</p>}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">SoundCloud</h2>
        {!flags.soundcloud_import && <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>SoundCloud import is turned off.</p>}
        {flags.soundcloud_import && !cloud && <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>Checking SoundCloud…</p>}
        {flags.soundcloud_import && (cloud?.disabled || cloud?.error === "SoundCloud import is turned off") && (
          <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>SoundCloud import is turned off.</p>
        )}
        {flags.soundcloud_import && cloud && !cloud.configured && !cloud.disabled && (
          <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>SoundCloud not configured. An admin needs SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET on the server.</p>
        )}
        {flags.soundcloud_import && cloud?.configured && !cloud.connected && !cloud.disabled && (
          <>
            <button type="button" className="mt-3 rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "var(--ac-accent)", color: "var(--ac-accent-text)" }} onClick={() => void connectSoundCloud().catch((error: Error) => setCloud({ ...cloud, error: error.message }))}>
              Connect SoundCloud
            </button>
            {cloud.error && <p className="mt-2 text-sm">{cloud.error}</p>}
          </>
        )}
        {flags.soundcloud_import && cloud?.connected && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">Connected as {cloud.username}</p>
              <button type="button" className="text-sm" style={{ color: "var(--ac-muted)" }} onClick={() => void disconnectSoundCloud().then(() => setCloud({ configured: true, connected: false }))}>Disconnect</button>
            </div>
            <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>
              Your uploads are imported when SoundCloud gives an official download. Other tracks import only when the artist enabled downloads. Streams are never copied.
            </p>
            <ul className="mt-3 space-y-2">
              {(cloud.tracks ?? []).map((track) => (
                <li key={track.id} className="flex items-center gap-3 rounded-2xl p-2" style={{ background: "var(--ac-card)" }}>
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: "var(--ac-line)" }}>
                    {track.artwork ? <img src={track.artwork} alt="" className="size-full object-cover" /> : track.title.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{track.title}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--ac-muted)" }}>{track.artist} · {fmtTime((track.durationMs ?? 0) / 1000)}</span>
                  </span>
                  <button type="button" disabled={!track.canImport} className="rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40" style={{ background: "var(--ac-accent)", color: "var(--ac-accent-text)" }} onClick={() => importTrack(track)}>
                    Import
                  </button>
                </li>
              ))}
            </ul>
            {(cloud.tracks ?? []).length === 0 && <p className="mt-3 text-sm" style={{ color: "var(--ac-muted)" }}>No SoundCloud uploads on this account.</p>}
            <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => {
              event.preventDefault();
              props.run(async () => {
                setFound(await resolveSoundCloud(cloudUrl));
              });
            }}>
              <input value={cloudUrl} onChange={(event) => setCloudUrl(event.target.value)} placeholder="SoundCloud track URL" className="min-w-0 flex-1 rounded-2xl px-3 py-2 text-sm outline-none" style={{ background: "var(--ac-card)" }} />
              <button type="submit" className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "var(--ac-card)" }}>Check</button>
            </form>
            {found && (
              <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--ac-card)" }}>
                <p className="font-semibold">{found.title}</p>
                <p className="text-sm" style={{ color: "var(--ac-muted)" }}>{found.artist}</p>
                {found.canImport ? (
                  <button type="button" className="mt-2 rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: "var(--ac-accent)", color: "var(--ac-accent-text)" }} onClick={() => importTrack(found)}>Import into Vault</button>
                ) : <p className="mt-2 text-sm">{found.reason}</p>}
              </div>
            )}
            {cloud.error && <p className="mt-2 text-sm">{cloud.error}</p>}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">Link a track, album, or playlist</h2>
        {!flags.link_import && <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>Link import is turned off.</p>}
        {flags.link_import && (
          <>
            <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>
              Spotify, YouTube, and SoundCloud links save the title, artist, duration, cover, and page link. Nothing is downloaded or transcoded.
            </p>
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => {
              event.preventDefault();
              props.run(async () => {
                const resolved = await resolvePublicLink(linkUrl);
                const saved = await saveLinkList(resolved);
                setLists((current) => [saved.list, ...current]);
                setRows((current) => [...saved.items, ...current]);
                setOpenId(saved.list.id);
                setLinkUrl("");
                setLinkNote(resolved.note);
              });
            }}>
              <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Paste a Spotify, YouTube, or SoundCloud link" className="min-w-0 flex-1 rounded-2xl px-3 py-2 text-sm outline-none" style={{ background: "var(--ac-card)" }} />
              <button type="submit" className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "var(--ac-accent)", color: "var(--ac-accent-text)" }}>Create</button>
            </form>
            {linkNote && <p className="mt-2 text-sm" style={{ color: "var(--ac-muted)" }}>{linkNote}</p>}
            <ul className="mt-4 space-y-3">
              {lists.map((list) => (
                <li key={list.id} className="rounded-2xl p-3" style={{ background: "var(--ac-card)" }}>
                  <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpenId(openId === list.id ? null : list.id)}>
                    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: "var(--ac-line)" }}>
                      {list.artwork_url ? <img src={list.artwork_url} alt="" className="size-full object-cover" /> : list.title.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{list.title}</span>
                      <span className="block text-xs capitalize" style={{ color: "var(--ac-muted)" }}>{list.source}{list.partial ? " · some tracks could not be listed" : ""}</span>
                    </span>
                  </button>
                  {openId === list.id && (
                    <div className="mt-3">
                      <ol className="space-y-2">
                        {openRows.map((row) => {
                          const matches = vaultTitleMatches(row.title, props.tracks);
                          return (
                            <li key={row.id} className="rounded-xl p-2" style={{ background: "var(--ac-bg)" }}>
                              <div className="flex items-center gap-2">
                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPlaying(playing?.id === row.id ? null : row)}>
                                  <span className="block truncate font-semibold">{row.title}</span>
                                  <span className="block truncate text-xs" style={{ color: "var(--ac-muted)" }}>{row.artist || row.source}{row.duration_ms ? ` · ${fmtTime(row.duration_ms / 1000)}` : ""}</span>
                                </button>
                                {row.vault_track_id && (
                                  <button type="button" className="text-xs font-semibold" style={{ color: "var(--ac-accent)" }} onClick={() => props.onPlayVault(row.vault_track_id || "")}>Play Vault</button>
                                )}
                              </div>
                              {matches.length > 0 && !row.vault_track_id && (
                                <button type="button" className="mt-1 text-xs font-semibold" style={{ color: "var(--ac-accent)" }} onClick={() => props.run(() => matchLinkToVault(row.id, matches[0].id).then(() => setRows((current) => current.map((item) => item.id === row.id ? { ...item, vault_track_id: matches[0].id } : item))))}>
                                  Match to my Vault · {matches[0].title}{matches.length > 1 ? ` · ${matches.length} titles` : ""}
                                </button>
                              )}
                              {playing?.id === row.id && <AcetateLinkPlayer item={{ source: row.source, kind: row.kind, title: row.title, externalId: row.external_id, sourceUrl: row.source_url }} />}
                            </li>
                          );
                        })}
                      </ol>
                      <button type="button" className="mt-3 text-xs" style={{ color: "var(--ac-muted)" }} onClick={() => props.run(() => deleteLinkList(list.id).then(() => {
                        setLists((current) => current.filter((item) => item.id !== list.id));
                        setRows((current) => current.filter((item) => item.list_id !== list.id));
                      }))}>Delete playlist</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
