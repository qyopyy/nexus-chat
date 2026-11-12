"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { Disc3, History, Library, Plus, Radio, Sparkles } from "lucide-react";
import { supabase, isConfigured } from "@/lib/supabase";
import { mfaNeedsChallenge } from "@/lib/mfa";
import { toast, useApp } from "@/store/app";
import { roleRank } from "@/lib/theme";
import { refreshChatList } from "@/lib/data";
import AuthScreen, { ResetPasswordScreen } from "@/components/AuthScreen";
import SetupScreen from "@/components/SetupScreen";
import Toasts from "@/components/ui/Toasts";
import { ACETATE, ACETATE_FREE_BYTES, acetateShareUrl } from "@/lib/acetateBrand";
import { asPeaks, audioExt, fmtBytes, fmtTime } from "@/lib/acetateAudio";
import { useAcetatePlayer } from "@/lib/acetatePlayer";
import {
  ACETATE_KEYS,
  ACETATE_STATUSES,
  addComment,
  addTrackToProject,
  createProject,
  createShare,
  deleteComment,
  deleteProject,
  deleteTrack,
  deleteVersion,
  loadLibrary,
  loadListens,
  loadNotices,
  loadTrackDetail,
  moveInProject,
  removeTrackFromProject,
  reportAcetateError,
  revokeShare,
  sendToNexusChat,
  startCheckout,
  updateProject,
  updateTrack,
  uploadArtwork,
  uploadAudio,
  acetateSigned,
  type AcetateComment,
  type AcetateKind,
  type AcetateListen,
  type AcetateNotice,
  type AcetateMembership,
  type AcetateStatus,
  type AcetateProject,
  type AcetateShare,
  type AcetateStorage,
  type AcetateTrack,
  type AcetateVersion,
} from "@/lib/acetate";
import { useHandsetReporter } from "@/lib/handset";
import PhoneLink from "@/components/layout/PhoneLink";
import { useAcetateLive } from "@/lib/acetateLive";
import { dropOffline, isOffline, keepOffline, offlinePlaybackUrl } from "@/lib/acetateOffline";
import { AcetateMark, ArtTile, Waveform } from "./AcetateBits";
import { Collaborators, LikeButton, NotifyBell } from "./AcetateSocial";
import AcetateShelves from "./AcetateShelves";
import AcetatePlayerBar from "./AcetatePlayerBar";
import AcetatePwa from "./AcetatePwa";
import AcetateRadio from "./AcetateRadio";
import AcetateRecap from "./AcetateRecap";
import { asLyricCues, formatLyricCues, parseLyricCues } from "@/lib/acetateLyrics";
import PhoneCommandHost from "@/components/phone/PhoneCommandHost";
import AcetateDash from "./AcetateDash";
import AcetateBring from "./AcetateBring";
import WhatsNew from "@/components/ui/WhatsNew";
import { ACETATE_RELEASE } from "@/lib/releaseNotes";
import AcetateConvert from "./AcetateConvert";
import { useAcetateTheme } from "@/lib/acetateTheme";
import { CONVERT_MAX_BYTES, convertLimitMessage } from "@/lib/acetateConvert";
import { soundCloudPage } from "@/lib/acetateImportParse";

type Screen =
  | { name: "library" }
  | { name: "projects" }
  | { name: "project"; id: string }
  | { name: "track"; id: string; from?: "home" | "vault" }
  | { name: "premium" }
  | { name: "radio" }
  | { name: "recap" }
  | { name: "vault" }
  | { name: "bring" };

type LibraryState = {
  projects: AcetateProject[];
  tracks: AcetateTrack[];
  memberships: AcetateMembership[];
  storage: AcetateStorage;
  shares: AcetateShare[];
};

const KIND_LABEL: Record<AcetateKind, string> = { project: "Project", album: "Album", playlist: "Playlist" };

function artistName() {
  const id = useApp.getState().userId;
  const profile = id ? useApp.getState().profiles[id] : null;
  return profile?.display_name || profile?.username || "Acetate";
}

export default function AcetateApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [library, setLibrary] = useState<LibraryState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "library" });
  const [detail, setDetail] = useState<{ versions: AcetateVersion[]; comments: AcetateComment[] } | null>(null);
  const [art, setArt] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<AcetateKind | "all">("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AcetateStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"new" | "title" | "bpm">("new");
  const [dropping, setDropping] = useState(false);
  const [listens, setListens] = useState<AcetateListen[]>([]);
  const [notices, setNotices] = useState<AcetateNotice[]>([]);
  const [folderFilter, setFolderFilter] = useState<string | "all">("all");
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [shelves, setShelves] = useState(true);
  const [unheard, setUnheard] = useState(false);
  const premiumWas = useRef<boolean | null>(null);
  const [shareFor, setShareFor] = useState<{ kind: "track" | "project"; id: string; title: string } | null>(null);
  const [nexusFor, setNexusFor] = useState<{ title: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const userId = session?.user.id ?? null;
  const theme = useAcetateTheme(userId);
  const me = useApp((s) => (userId ? s.profiles[userId] : undefined));
  const chats = useApp((s) => s.chatList);
  const admin = roleRank(me?.site_role) >= 3;

  useEffect(() => {
    if (!isConfigured) return;
    const pending = supabase.auth.getSession().then(({ data }) => data.session ?? null);
    const timed = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
    void Promise.race([pending, timed])
      .then((next) => setSession((current) => (current === undefined ? next : current)))
      .catch(() => setSession((current) => (current === undefined ? null : current)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setNeedsMfa(false);
      return;
    }
    let live = true;
    void mfaNeedsChallenge().then((needed) => {
      if (live) setNeedsMfa(needed);
    });
    return () => {
      live = false;
    };
  }, [session]);

  useEffect(() => {
    if (!userId || needsMfa) return;
    let live = true;
    useApp.setState({ userId });
    void (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (!live) return;
      if (data) useApp.setState((s) => ({ profiles: { ...s.profiles, [userId]: data } }));
      try {
        const next = await loadLibrary();
        const recent = await loadListens();
        const inbox = await loadNotices();
        if (live) {
          premiumWas.current = next.storage.premium;
          setLibrary(next);
          setListens(recent);
          setNotices(inbox);
        }
      } catch (e) {
        if (live) setBootError(e instanceof Error ? e.message : "Couldn't load your library");
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, needsMfa]);

  useEffect(() => {
    const sc = new URLSearchParams(window.location.search).get("sc");
    if (!sc) return;
    const messages: Record<string, string> = {
      connected: "SoundCloud connected",
      denied: "SoundCloud sign-in was cancelled",
      config: "SoundCloud not configured",
      state: "SoundCloud sign-in expired. Try again.",
      token: "SoundCloud didn't finish signing in",
    };
    toast(messages[sc] || "SoundCloud didn't finish signing in", sc === "connected" ? "success" : "error");
    if (sc === "connected") setScreen({ name: "bring" });
    window.history.replaceState({}, "", "/acetate/app");
  }, []);

  useEffect(() => {
    if (!library) return;
    let live = true;
    const paths = new Map<string, string>();
    const next: Record<string, string | null> = {};
    for (const project of library.projects) if (project.artwork_path) paths.set(project.id, project.artwork_path);
    for (const track of library.tracks) {
      if (track.artwork_path) paths.set(track.id, track.artwork_path);
      else if (track.external_art?.startsWith("https://")) next[track.id] = track.external_art;
    }
    void (async () => {
      for (const [id, path] of paths) next[id] = await acetateSigned(path);
      if (live) setArt(next);
    })();
    return () => {
      live = false;
    };
  }, [library]);

  useEffect(() => {
    if (screen.name !== "track") {
      setDetail(null);
      return;
    }
    let live = true;
    void loadTrackDetail(screen.id)
      .then((next) => {
        if (live) setDetail(next);
      })
      .catch(reportAcetateError);
    return () => {
      live = false;
    };
  }, [screen]);

  async function reload() {
    const next = await loadLibrary();
    if (premiumWas.current != null && premiumWas.current !== next.storage.premium) {
      toast(next.storage.premium ? "Acetate Premium is on — unlimited storage" : "Acetate Premium was removed", "info");
    }
    premiumWas.current = next.storage.premium;
    setLibrary(next);
    setListens(await loadListens());
    setNotices(await loadNotices());
    if (screen.name === "track") setDetail(await loadTrackDetail(screen.id));
  }

  useHandsetReporter(userId && !needsMfa ? userId : null);
  useAcetateLive(userId && !needsMfa ? userId : null, () => {
    void reload().catch(() => undefined);
  });

  async function uploadFiles(files: File[], projectId?: string) {
    const audio = files.filter((file) => audioExt(file.name));
    if (!audio.length) throw new Error("Drop audio files — mp3, wav, flac, aac, m4a, ogg, opus, or webm.");
    for (let i = 0; i < audio.length; i += 1) {
      setUploadNote(`Uploading ${i + 1} of ${audio.length}`);
      await uploadAudio(audio[i], { title: audio[i].name.replace(/\.[^.]+$/, ""), projectId });
    }
    setUploadNote(null);
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
      await reload();
    } catch (e) {
      reportAcetateError(e);
    } finally {
      setBusy(false);
    }
  }

  const projectTracks = (projectId: string) => {
    if (!library) return [];
    return library.memberships
      .filter((row) => row.project_id === projectId)
      .sort((a, b) => a.position - b.position)
      .map((row) => library.tracks.find((track) => track.id === row.track_id))
      .filter((track): track is AcetateTrack => !!track);
  };

  async function playIds(ids: string[], album: string | null, startId?: string) {
    if (!library || !ids.length) return;
    const { data, error } = await supabase.from("acetate_versions").select("*").in("track_id", ids);
    if (error) throw new Error(error.message);
    const latest = new Map<string, AcetateVersion>();
    for (const row of (data ?? []) as AcetateVersion[]) {
      const prev = latest.get(row.track_id);
      if (!prev || row.version > prev.version) latest.set(row.track_id, { ...row, peaks: asPeaks(row.peaks) });
    }
    const missing = ids.filter((id) => !latest.has(id));
    if (missing.length) {
      const extra = await supabase.rpc("acetate_collab_versions", { p_tracks: missing });
      const rows = Array.isArray(extra.data) ? (extra.data as AcetateVersion[]) : [];
      for (const row of rows) latest.set(row.track_id, { ...row, peaks: asPeaks(row.peaks) });
    }
    const queue = [];
    for (const id of ids) {
      const track = library.tracks.find((item) => item.id === id);
      const version = latest.get(id);
      if (!track || !version) continue;
      const cached = await offlinePlaybackUrl(version.id);
      const url = cached || (await acetateSigned(version.path));
      if (!url) continue;
      queue.push({
        key: `${track.id}:${version.id}`,
        trackId: track.id,
        versionId: version.id,
        title: track.title,
        versionLabel: version.label || `Version ${version.version}`,
        artist: artistName(),
        album,
        artUrl: track.artwork_path ? await acetateSigned(track.artwork_path) : null,
        peaks: asPeaks(version.peaks),
        duration: version.duration ?? 0,
        url,
        shareUrl: null,
        lyrics: track.lyrics,
        lyricCues: asLyricCues(track.lyric_cues),
      });
    }
    if (!queue.length) throw new Error("Upload a version before playing");
    const start = Math.max(0, queue.findIndex((item) => item.trackId === startId));
    useAcetatePlayer.getState().setQueue(queue, start === -1 ? 0 : start);
  }

  if (!isConfigured) return <SetupScreen />;
  if (bootError) {
    return (
      <div className="grid h-full place-items-center bg-[#100e0c] px-6 text-center text-[#f3eadf]">
        <div className="max-w-md">
          <h1 className="font-serif text-3xl">Acetate isn't on this database yet</h1>
          <p className="mt-3 text-sm text-[#a3988c]">{bootError}</p>
          <p className="mt-3 text-sm text-[#a3988c]">Run the Acetate migration, then reload. It creates the private storage bucket, quota, and share functions.</p>
        </div>
      </div>
    );
  }
  if (session === undefined || (session && !needsMfa && !library)) {
    return (
      <div className="grid h-full place-items-center bg-[#100e0c]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#e4a15a] border-t-transparent" />
      </div>
    );
  }
  if (recovering && session) return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen initialMode="login" />;
  if (needsMfa) return <AuthScreen initialMode="mfa" />;
  if (!library) return null;

  const storage = library.storage;
  const limit = storage.limit ?? ACETATE_FREE_BYTES;
  const ratio = storage.premium ? 1 : Math.min(1, Number(storage.bytes) / limit);
  const query = filter.trim().toLowerCase();
  const ownTracks = library.tracks.filter((track) => track.owner_id === userId);
  const visibleTracks = ownTracks
    .filter((track) => {
      if (starredOnly && !track.starred) return false;
      if (statusFilter !== "all" && (track.status ?? "demo") !== statusFilter) return false;
      if (folderFilter !== "all" && (track.folder ?? "") !== folderFilter) return false;
      if (unheard && listens.some((row) => row.track_id === track.id)) return false;
      if (!query) return true;
      return track.title.toLowerCase().includes(query) || (track.folder ?? "").toLowerCase().includes(query) || (track.musical_key ?? "").toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "bpm") return (a.bpm ?? 999) - (b.bpm ?? 999);
      return a.updated_at < b.updated_at ? 1 : -1;
    });
  const folders = [...new Set(ownTracks.map((track) => track.folder).filter((folder): folder is string => !!folder))];
  const visibleProjects = library.projects.filter((project) => kindFilter === "all" || project.kind === kindFilter);
  const showChrome = !["library", "projects", "project", "vault", "bring"].includes(screen.name);

  return (
    <div className="flex h-full min-h-0 flex-col text-[#f4f1ea]" style={{ ...theme.style, background: theme.tokens.bg, color: theme.tokens.text }}>
      <Toasts />
      <WhatsNew release={ACETATE_RELEASE} storageKey="acetate.seenRelease" openEvent="acetate-whats-new" />
      <PhoneLink />
      {showChrome && (
      <>
      <header className="flex items-center gap-3 border-b border-[#3c342c] px-4 py-3">
        <Link href="/acetate" className="flex items-center gap-2">
          <AcetateMark size={30} />
          <span className="font-serif text-xl tracking-wide">Acetate</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <AcetatePwa />
          {me?.username && (
            <Link href={`/acetate/u/${me.username}`} className="text-xs text-[#a3988c]">
              Profile
            </Link>
          )}
          <NotifyBell notices={notices} onChanged={() => void reload().catch(reportAcetateError)} />
          <button type="button" onClick={() => setHelp(true)} className="text-xs text-[#a3988c]" aria-label="Keyboard help">
            ?
          </button>
          {admin && (
            <Link href="/acetate/admin" className="rounded-full border border-[#3c342c] px-3 py-1 text-xs font-semibold text-[#e4a15a]">
              Admin
            </Link>
          )}
          <Link href="/defend" className="text-xs text-[#7ee0c6]">Defender</Link>
          <button type="button" onClick={() => void supabase.auth.signOut()} className="text-xs text-[#a3988c]">
            Sign out
          </button>
        </div>
      </header>
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between text-xs text-[#a3988c]">
          <span>{storage.premium ? (storage.lifetime ? "Lifetime Premium · unlimited" : "Premium · unlimited") : `${fmtBytes(Number(storage.bytes))} of ${fmtBytes(limit)}`}</span>
          <button type="button" onClick={() => setScreen({ name: "premium" })} className="font-semibold text-[#e4a15a]">
            {storage.premium ? "Plan" : "Upgrade"}
          </button>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#2a241c]">
          <div className="h-full rounded-full bg-[#e4a15a]" style={{ width: `${storage.premium ? 100 : ratio * 100}%` }} />
        </div>
      </div>
      <nav className="flex flex-wrap gap-2 px-4 py-3">
        <NavButton active={screen.name === "library"} onClick={() => setScreen({ name: "library" })} icon={<Library className="size-4" />} label="Library" />
        <NavButton active={screen.name === "projects" || screen.name === "project"} onClick={() => setScreen({ name: "projects" })} icon={<Disc3 className="size-4" />} label="Projects" />
        <NavButton active={screen.name === "radio"} onClick={() => setScreen({ name: "radio" })} icon={<Radio className="size-4" />} label="Radio" />
        <NavButton active={screen.name === "recap"} onClick={() => setScreen({ name: "recap" })} icon={<History className="size-4" />} label="Recap" />
        <NavButton active={screen.name === "premium"} onClick={() => setScreen({ name: "premium" })} icon={<Sparkles className="size-4" />} label="Premium" />
      </nav>
      </>
      )}
      <div className={`min-h-0 flex-1 ${screen.name === "library" || screen.name === "projects" || screen.name === "vault" || screen.name === "project" || screen.name === "bring" ? "overflow-y-auto" : "overflow-y-auto px-4 pb-6"}`}>
        {(screen.name === "library" || screen.name === "projects" || screen.name === "vault" || screen.name === "project") && userId && (
          <AcetateDash
            library={library}
            art={art}
            notices={notices}
            me={me}
            userId={userId}
            email={session?.user.email ?? null}
            admin={admin}
            theme={theme}
            screen={screen.name === "project" ? "project" : screen.name === "vault" ? "vault" : screen.name === "projects" ? "projects" : "home"}
            projectId={screen.name === "project" ? screen.id : undefined}
            onOpenProject={(id) => setScreen({ name: "project", id })}
            onOpenTrack={(id, from) => setScreen({ name: "track", id, from })}
            onHome={() => setScreen({ name: "library" })}
            onVault={() => setScreen({ name: "vault" })}
            onPlay={playIds}
            onShare={(kind, id, title) => setShareFor({ kind, id, title })}
            run={(task) => void run(task)}
            onNotices={() => void reload().catch(reportAcetateError)}
            onNavigate={(name) => {
              if (name === "radio") setScreen({ name: "radio" });
              else if (name === "recap") setScreen({ name: "recap" });
              else if (name === "bring") setScreen({ name: "bring" });
              else setScreen({ name: "premium" });
            }}
          />
        )}

        {screen.name === "bring" && userId && (
          <AcetateBring
            tracks={library.tracks.filter((track) => track.owner_id === userId)}
            onBack={() => setScreen({ name: "library" })}
            onPlayVault={(id) => void playIds([id], null, id)}
            reload={reload}
            run={(task) => void run(task)}
          />
        )}

        {screen.name === "track" && (
          <TrackView
            track={library.tracks.find((item) => item.id === screen.id) ?? null}
            artUrl={art[screen.id] ?? null}
            detail={detail}
            shares={library.shares.filter((share) => share.track_id === screen.id)}
            busy={busy}
            onBack={() => setScreen(screen.name === "track" && screen.from === "vault" ? { name: "vault" } : { name: "library" })}
            onPlayVersion={(version) => {
              const track = library.tracks.find((item) => item.id === screen.id);
              if (!track) return;
              void run(async () => {
                const url = (await offlinePlaybackUrl(version.id)) || (await acetateSigned(version.path));
                if (!url) throw new Error("Couldn't sign that audio");
                useAcetatePlayer.getState().setQueue([
                  {
                    key: `${track.id}:${version.id}`,
                    trackId: track.id,
                    versionId: version.id,
                    title: track.title,
                    versionLabel: version.label || `Version ${version.version}`,
                    artist: artistName(),
                    album: null,
                    artUrl: art[track.id] ?? null,
                    peaks: asPeaks(version.peaks),
                    duration: version.duration ?? 0,
                    url,
                    shareUrl: null,
                    lyrics: track.lyrics,
                    lyricCues: asLyricCues(track.lyric_cues),
                  },
                ]);
              });
            }}
            onUpload={(file, label) => void run(() => uploadAudio(file, { trackId: screen.id, label }).then(() => undefined))}
            onConvert={async (file, label) => {
              await uploadAudio(file, { trackId: screen.id, label });
              await reload();
            }}
            onArt={(file) => void run(() => uploadArtwork(file, "track", screen.id).then(() => undefined))}
            onRename={(title) => void run(() => updateTrack(screen.id, { title }))}
            onMeta={(patch) => void run(async () => {
              await updateTrack(screen.id, patch);
              if ("lyric_cues" in patch || "lyrics" in patch) {
                useAcetatePlayer.setState((state) => ({
                  queue: state.queue.map((item) => item.trackId === screen.id
                    ? { ...item, lyrics: patch.lyrics ?? item.lyrics, lyricCues: "lyric_cues" in patch ? patch.lyric_cues ?? null : item.lyricCues }
                    : item),
                }));
              }
            })}
            onDeleteVersion={(version) => {
              if (window.confirm("Delete this version and its audio?")) void run(() => deleteVersion(version));
            }}
            onDelete={() => {
              if (window.confirm("Delete this track and every version?")) void run(() => deleteTrack(screen.id).then(() => setScreen({ name: "library" })));
            }}
            onComment={(at, body, versionId) => void run(() => addComment(screen.id, at, body, versionId))}
            onDeleteComment={(id) => void run(() => deleteComment(id))}
            onShare={() => {
              const track = library.tracks.find((item) => item.id === screen.id);
              if (track) setShareFor({ kind: "track", id: track.id, title: track.title });
            }}
          />
        )}

        {screen.name === "premium" && (
          <Premium storage={storage} busy={busy} onCheckout={() => void run(async () => {
            const result = await startCheckout();
            window.alert(result.message || "Checkout isn't connected yet.");
          })} />
        )}
      </div>
      {help && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setHelp(false)}>
          <div className="max-w-sm rounded-3xl bg-[#1a1612] p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-2xl">Transport</h2>
            <ul className="mt-2 space-y-1 text-sm text-[#a3988c]">
              <li>Space — play or pause</li>
              <li>Left / right — skip 5 seconds</li>
              <li>M — mute</li>
              <li>J / K — next and previous</li>
            </ul>
            <button type="button" className="mt-4 rounded-full bg-[#e4a15a] px-4 py-2 text-sm font-semibold text-[#100e0c]" onClick={() => setHelp(false)}>
              Close
            </button>
          </div>
        </div>
      )}
      <PhoneCommandHost />
      <AcetatePlayerBar />
      {shareFor && (
        <ShareSheet
          target={shareFor}
          shares={library.shares.filter((share) => (shareFor.kind === "track" ? share.track_id === shareFor.id : share.project_id === shareFor.id))}
          busy={busy}
          onClose={() => setShareFor(null)}
          onCreate={(input) => void run(() => createShare({ kind: shareFor.kind, id: shareFor.id, ...input }).then(() => undefined))}
          onRevoke={(id) => void run(() => revokeShare(id))}
          onNexus={(title, url) => setNexusFor({ title, url })}
        />
      )}
      {nexusFor && (
        <NexusSheet
          title={nexusFor.title}
          url={nexusFor.url}
          chats={chats}
          onOpen={() => void refreshChatList()}
          onClose={() => setNexusFor(null)}
          onSend={(id) => void run(() => sendToNexusChat(id, nexusFor.title, nexusFor.url).then(() => setNexusFor(null)))}
        />
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${active ? "bg-[#e4a15a] text-[#100e0c]" : "bg-[#1a1612] text-[#f3eadf]"}`}>
      {icon}
      {label}
    </button>
  );
}

function FileButton({ label, accept, onFile, onFiles, multiple, disabled }: { label: string; accept: string; onFile?: (file: File) => void; onFiles?: (files: File[]) => void; multiple?: boolean; disabled?: boolean }) {
  return (
    <label className={`rounded-full bg-[#e4a15a] px-4 py-2 text-sm font-semibold text-[#100e0c] ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      {label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (onFiles && files.length) onFiles(files);
          else if (files[0] && onFile) onFile(files[0]);
        }}
      />
    </label>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-[#f3eadf] text-[#100e0c]" : "bg-[#1a1612] text-[#a3988c]"}`}>
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#3c342c] bg-[#1a1612] px-3 py-2">
      <div className="font-serif text-xl text-[#f3eadf]">{value}</div>
      <div className="text-[#a3988c]">{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-3xl border border-dashed border-[#3c342c] px-4 py-8 text-center text-sm text-[#a3988c]">{text}</p>;
}

function Projects({
  projects,
  kindFilter,
  setKindFilter,
  art,
  counts,
  busy,
  onOpen,
  onCreate,
}: {
  projects: AcetateProject[];
  kindFilter: AcetateKind | "all";
  setKindFilter: (kind: AcetateKind | "all") => void;
  art: Record<string, string | null>;
  counts: AcetateMembership[];
  busy: boolean;
  onOpen: (id: string) => void;
  onCreate: (kind: AcetateKind, title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AcetateKind>("project");
  return (
    <section>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["all", "project", "album", "playlist"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setKindFilter(item)} className={`rounded-full px-3 py-1 text-xs font-semibold ${kindFilter === item ? "bg-[#f3eadf] text-[#100e0c]" : "bg-[#1a1612] text-[#a3988c]"}`}>
            {item === "all" ? "All" : KIND_LABEL[item]}
          </button>
        ))}
      </div>
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onCreate(kind, title.trim());
          setTitle("");
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New project, album, or playlist" className="min-w-0 flex-1 rounded-2xl border border-[#3c342c] bg-[#1a1612] px-4 py-2.5 text-sm outline-none" />
        <select value={kind} onChange={(e) => setKind(e.target.value as AcetateKind)} className="rounded-2xl border border-[#3c342c] bg-[#1a1612] px-3 text-sm">
          <option value="project">Project</option>
          <option value="album">Album</option>
          <option value="playlist">Playlist</option>
        </select>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-[#f3eadf] px-4 text-sm font-semibold text-[#100e0c] disabled:opacity-50">
          <Plus className="size-4" /> Create
        </button>
      </form>
      {projects.length === 0 && <Empty text="Group cuts into a project, an album, or a playlist." />}
      <ul className="space-y-2">
        {projects.map((project) => (
          <li key={project.id}>
            <button type="button" onClick={() => onOpen(project.id)} className="flex w-full items-center gap-3 rounded-2xl border border-[#3c342c] bg-[#1a1612] p-3 text-left">
              <ArtTile url={art[project.id]} title={project.title} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{project.title}</span>
                <span className="text-xs text-[#a3988c]">{KIND_LABEL[project.kind]} · {counts.filter((row) => row.project_id === project.id).length} tracks{project.shared_role ? ` · shared ${project.shared_role}` : ""}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectView(props: {
  project: AcetateProject | null;
  tracks: AcetateTrack[];
  art: Record<string, string | null>;
  libraryTracks: AcetateTrack[];
  memberIds: Set<string>;
  busy: boolean;
  onBack: () => void;
  onPlay: (startId?: string) => void;
  onUpload: (file: File) => void;
  onArt: (file: File) => void;
  onAdd: (trackId: string) => void;
  onRemove: (trackId: string) => void;
  onMove: (trackId: string, dir: -1 | 1) => void;
  onRename: (title: string) => void;
  onNote: (note: string) => void;
  onDelete: () => void;
  onOpenTrack: (id: string) => void;
  onShare: () => void;
}) {
  const { project } = props;
  const [title, setTitle] = useState(project?.title ?? "");
  const [note, setNote] = useState(project?.note ?? "");
  const meId = useApp((s) => s.userId);
  useEffect(() => setTitle(project?.title ?? ""), [project?.title]);
  useEffect(() => setNote(project?.note ?? ""), [project?.note]);
  if (!project) return <Empty text="That collection is gone." />;
  const owner = project.owner_id === meId;
  const canEdit = owner || project.shared_role === "editor";
  const available = props.libraryTracks.filter((track) => track.owner_id === meId && !props.memberIds.has(track.id));
  return (
    <section>
      <button type="button" onClick={props.onBack} className="text-sm text-[#a3988c]">Back</button>
      <div className="mt-2 flex items-start gap-3">
        <ArtTile url={props.art[project.id]} title={project.title} size={84} />
        <div className="min-w-0 flex-1">
          <div className="text-xs tracking-[0.18em] text-[#e4a15a] uppercase">{KIND_LABEL[project.kind]}</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && title.trim() !== project.title) props.onRename(title.trim());
            }}
          >
            <input value={title} readOnly={!owner} onChange={(e) => setTitle(e.target.value)} className="w-full bg-transparent font-serif text-3xl outline-none" />
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              props.onNote(note.trim());
            }}
          >
            <input value={note} readOnly={!owner} onChange={(e) => setNote(e.target.value)} placeholder="Session notes" className="mt-1 w-full bg-transparent text-sm text-[#a3988c] outline-none" />
          </form>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => props.onPlay()} className="rounded-full bg-[#e4a15a] px-4 py-2 text-sm font-semibold text-[#100e0c]">Play</button>
        {canEdit && <FileButton label="Add audio" accept="audio/*" disabled={props.busy} onFile={props.onUpload} />}
        {owner && <FileButton label="Artwork" accept="image/jpeg,image/png,image/webp" disabled={props.busy} onFile={props.onArt} />}
        {owner && <button type="button" onClick={props.onShare} className="rounded-full border border-[#3c342c] px-4 py-2 text-sm">Share</button>}
        {owner && <button type="button" onClick={props.onDelete} className="rounded-full px-3 py-2 text-sm text-[#d4653a]">Delete</button>}
      </div>
      <ul className="mt-4 space-y-2">
        {props.tracks.map((track, index) => (
          <li key={track.id} className="flex items-center gap-2 rounded-2xl bg-[#1a1612] p-2">
            <button type="button" onClick={() => props.onPlay(track.id)} className="w-6 text-sm text-[#a3988c]">{index + 1}</button>
            <button type="button" onClick={() => props.onOpenTrack(track.id)} className="min-w-0 flex-1 truncate text-left font-medium">{track.title}</button>
            {canEdit && <button type="button" aria-label="Move up" onClick={() => props.onMove(track.id, -1)} className="text-xs text-[#a3988c]">Up</button>}
            {canEdit && <button type="button" aria-label="Move down" onClick={() => props.onMove(track.id, 1)} className="text-xs text-[#a3988c]">Down</button>}
            {canEdit && <button type="button" onClick={() => props.onRemove(track.id)} className="text-xs text-[#a3988c]">Remove</button>}
          </li>
        ))}
      </ul>
      {owner && <Collaborators projectId={project.id} />}
      {canEdit && available.length > 0 && (
        <label className="mt-4 block text-sm text-[#a3988c]">
          Add from library
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) props.onAdd(e.target.value);
              e.target.value = "";
            }}
            className="mt-1 w-full rounded-2xl border border-[#3c342c] bg-[#1a1612] px-3 py-2 text-[#f3eadf]"
          >
            <option value="">Choose a track</option>
            {available.map((track) => (
              <option key={track.id} value={track.id}>{track.title}</option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

function TrackView(props: {
  track: AcetateTrack | null;
  artUrl: string | null;
  detail: { versions: AcetateVersion[]; comments: AcetateComment[] } | null;
  shares: AcetateShare[];
  busy: boolean;
  onBack: () => void;
  onPlayVersion: (version: AcetateVersion) => void;
  onUpload: (file: File, label: string) => void;
  onConvert: (file: File, label: string) => Promise<void>;
  onArt: (file: File) => void;
  onRename: (title: string) => void;
  onMeta: (patch: { note?: string | null; status?: AcetateStatus; bpm?: number | null; musical_key?: string | null; folder?: string | null; starred?: boolean; lyrics?: string | null; lyrics_on_share?: boolean; lyric_cues?: { t: number; line: string }[] | null }) => void;
  onDeleteVersion: (version: AcetateVersion) => void;
  onDelete: () => void;
  onComment: (at: number, body: string, versionId: string | null) => void;
  onDeleteComment: (id: string) => void;
  onShare: () => void;
}) {
  const { track, detail } = props;
  const me = useApp((s) => s.userId);
  const [offline, setOffline] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState(track?.title ?? "");
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState(track?.note ?? "");
  const [folder, setFolder] = useState(track?.folder ?? "");
  const [bpm, setBpm] = useState(track?.bpm ? String(track.bpm) : "");
  const [lyrics, setLyrics] = useState(track?.lyrics ?? "");
  const [lyricsOnShare, setLyricsOnShare] = useState(!!track?.lyrics_on_share);
  const [cuesText, setCuesText] = useState(formatLyricCues(asLyricCues(track?.lyric_cues)));
  const [cueLine, setCueLine] = useState("");
  const [convertFile, setConvertFile] = useState<File | null>(null);
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const playing = useAcetatePlayer((s) => s.queue[s.index]);
  const current = useAcetatePlayer((s) => s.current);
  useEffect(() => setTitle(track?.title ?? ""), [track?.title]);
  useEffect(() => {
    setNote(track?.note ?? "");
    setFolder(track?.folder ?? "");
    setBpm(track?.bpm ? String(track.bpm) : "");
    setLyrics(track?.lyrics ?? "");
    setLyricsOnShare(!!track?.lyrics_on_share);
    setCuesText(formatLyricCues(asLyricCues(track?.lyric_cues)));
  }, [track?.id, track?.note, track?.folder, track?.bpm, track?.lyrics, track?.lyrics_on_share, track?.lyric_cues]);
  useEffect(() => {
    let live = true;
    const versions = detail?.versions ?? [];
    void (async () => {
      const next: Record<string, boolean> = {};
      for (const version of versions) next[version.id] = await isOffline(version.id);
      if (live) setOffline(next);
    })();
    return () => {
      live = false;
    };
  }, [detail]);
  if (!track) return <Empty text="That track is gone." />;
  const active = detail?.versions.find((version) => playing?.versionId === version.id) ?? detail?.versions[0] ?? null;
  const duration = playing?.trackId === track.id ? playing.duration || current : active?.duration ?? 0;
  const progress = playing?.trackId === track.id && duration ? current / duration : 0;
  return (
    <section>
      <button type="button" onClick={props.onBack} className="text-sm text-[#a3988c]">Library</button>
      <div className="mt-2 flex items-center gap-3">
        <ArtTile url={props.artUrl} title={track.title} size={72} />
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && title.trim() !== track.title) props.onRename(title.trim());
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-transparent font-serif text-3xl outline-none" />
        </form>
      </div>
      <div className="mt-4">
        <Waveform
          peaks={asPeaks(active?.peaks)}
          tall
          progress={progress}
          markers={(detail?.comments ?? []).map((comment) => (duration ? comment.at_seconds / duration : 0))}
          onSeek={(ratio) => {
            if (playing?.trackId === track.id) useAcetatePlayer.getState().seek(ratio * (duration || 0));
            else if (active) props.onPlayVersion(active);
          }}
        />
      </div>
      {track.artist && <p className="mt-2 text-sm text-[#a3988c]">{track.artist}</p>}
      {track.source_url && soundCloudPage(track.source_url) && (
        <a href={track.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-[#e4a15a]">SoundCloud</a>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {active && (
          <button type="button" onClick={() => props.onPlayVersion(active)} className="rounded-full bg-[#e4a15a] px-4 py-2 text-sm font-semibold text-[#100e0c]">
            Play {active.label || `v${active.version}`}
          </button>
        )}
        <FileButton label="Artwork" accept="image/jpeg,image/png,image/webp" disabled={props.busy} onFile={props.onArt} />
        <button type="button" onClick={props.onShare} className="rounded-full border border-[#3c342c] px-4 py-2 text-sm">Share</button>
        <LikeButton trackId={track.id} />
        <button type="button" onClick={() => useAcetatePlayer.getState().setLoop("a")} className="rounded-full border border-[#3c342c] px-3 py-2 text-sm">A</button>
        <button type="button" onClick={() => useAcetatePlayer.getState().setLoop("b")} className="rounded-full border border-[#3c342c] px-3 py-2 text-sm">B</button>
        <button type="button" onClick={() => useAcetatePlayer.getState().setLoop("off")} className="rounded-full border border-[#3c342c] px-3 py-2 text-sm">Clear loop</button>
        <button type="button" onClick={() => useAcetatePlayer.getState().setSleep(20)} className="rounded-full border border-[#3c342c] px-3 py-2 text-sm">Sleep 20m</button>
        <button type="button" onClick={() => props.onMeta({ starred: !track.starred })} className={`rounded-full border border-[#3c342c] px-4 py-2 text-sm ${track.starred ? "text-[#e4a15a]" : ""}`}>
          {track.starred ? "Starred" : "Star"}
        </button>
        <button type="button" onClick={props.onDelete} className="rounded-full px-3 py-2 text-sm text-[#d4653a]">Delete track</button>
      </div>
      <form
        className="mt-4 grid gap-2 rounded-3xl border border-[#3c342c] p-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = bpm.trim() ? Number(bpm) : null;
          props.onMeta({
            note: note.trim() || null,
            folder: folder.trim() || null,
            bpm: parsed && parsed >= 20 && parsed <= 400 ? Math.round(parsed) : null,
            status: (e.currentTarget.elements.namedItem("status") as HTMLSelectElement).value as AcetateStatus,
            musical_key: (e.currentTarget.elements.namedItem("key") as HTMLSelectElement).value || null,
            lyrics: lyrics.trim() || null,
            lyrics_on_share: lyricsOnShare,
            lyric_cues: parseLyricCues(cuesText),
          });
        }}
      >
        <label className="text-xs text-[#a3988c]">
          Stage
          <select name="status" defaultValue={track.status ?? "demo"} className="mt-1 w-full rounded-xl border border-[#3c342c] bg-[#1a1612] px-3 py-2 text-sm text-[#f3eadf]">
            {ACETATE_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>{status.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[#a3988c]">
          Key
          <select name="key" defaultValue={track.musical_key ?? ""} className="mt-1 w-full rounded-xl border border-[#3c342c] bg-[#1a1612] px-3 py-2 text-sm text-[#f3eadf]">
            <option value="">Unset</option>
            {ACETATE_KEYS.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[#a3988c]">
          BPM
          <input value={bpm} onChange={(e) => setBpm(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} inputMode="numeric" className="mt-1 w-full rounded-xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
        </label>
        <label className="text-xs text-[#a3988c]">
          Folder
          <input value={folder} onChange={(e) => setFolder(e.target.value)} maxLength={40} placeholder="Vocals, refs, clients" className="mt-1 w-full rounded-xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
        </label>
        <label className="text-xs text-[#a3988c] sm:col-span-2">
          Lyrics
          <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} maxLength={8000} className="mt-1 min-h-24 w-full rounded-xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={lyricsOnShare} onChange={(e) => setLyricsOnShare(e.target.checked)} />
          Show lyrics on share links
        </label>
        <label className="text-xs text-[#a3988c] sm:col-span-2">
          Timed lyrics
          <textarea value={cuesText} onChange={(e) => setCuesText(e.target.value)} placeholder={"[00:12.00] First line\n[00:18.40] Next line"} className="mt-1 min-h-24 w-full rounded-xl border border-[#3c342c] bg-transparent px-3 py-2 font-mono text-sm outline-none" />
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <input value={cueLine} onChange={(e) => setCueLine(e.target.value)} maxLength={200} placeholder="Line to stamp at the playhead" className="min-w-0 flex-1 rounded-xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
          <button
            type="button"
            className="rounded-full border border-[#3c342c] px-3 py-2 text-sm"
            onClick={() => {
              const line = cueLine.trim();
              if (!line || playing?.trackId !== track.id) return;
              const next = [...(parseLyricCues(cuesText) ?? []), { t: Math.round(current * 1000), line: line.slice(0, 200) }].sort((a, b) => a.t - b.t);
              setCuesText(formatLyricCues(next));
              setCueLine("");
            }}
          >
            Stamp
          </button>
        </div>
        <label className="text-xs text-[#a3988c] sm:col-span-2">
          Private note
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="mt-1 min-h-16 w-full rounded-xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
        </label>
        <button type="submit" disabled={props.busy} className="rounded-full bg-[#f3eadf] px-4 py-2 text-sm font-semibold text-[#100e0c] sm:col-span-2 disabled:opacity-50">Save studio details</button>
      </form>
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem("audio") as HTMLInputElement).files?.[0];
          if (!input || !audioExt(input.name)) return;
          props.onUpload(input, label);
          setLabel("");
          e.currentTarget.reset();
        }}
      >
        <input name="audio" type="file" accept="audio/*" className="max-w-full text-sm" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Version name (rough mix)" className="min-w-40 flex-1 rounded-2xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
        <button type="submit" disabled={props.busy} className="rounded-full bg-[#f3eadf] px-4 text-sm font-semibold text-[#100e0c] disabled:opacity-50">Add version</button>
      </form>
      {active && (
        <div className="mt-4">
          {convertFile ? (
            <AcetateConvert
              source={convertFile}
              sourceLabel={track.title}
              onSave={props.onConvert}
            />
          ) : (
            <button
              type="button"
              className="rounded-full border border-[#3c342c] px-4 py-2 text-sm"
              onClick={() => {
                if (Number(active.bytes) > CONVERT_MAX_BYTES) {
                  setConvertNote(convertLimitMessage(Number(active.bytes)));
                  return;
                }
                void (async () => {
                  const url = await acetateSigned(active.path);
                  if (!url) throw new Error("Couldn't read that version");
                  const res = await fetch(url);
                  if (!res.ok) throw new Error("Couldn't read that version");
                  const blob = await res.blob();
                  const ext = active.path.split(".").pop() || "audio";
                  setConvertFile(new File([blob], `${track.title}.${ext}`, { type: blob.type || active.mime || "application/octet-stream" }));
                  setConvertNote(null);
                })().catch((error: Error) => setConvertNote(error.message));
              }}
            >
              Convert this version
            </button>
          )}
          {convertNote && <p className="mt-2 text-sm text-[#a3988c]">{convertNote}</p>}
        </div>
      )}
      <ul className="mt-4 space-y-2">
        {(detail?.versions ?? []).map((version) => (
          <li key={version.id} className="flex items-center gap-3 rounded-2xl border border-[#3c342c] px-3 py-2">
            <button type="button" onClick={() => props.onPlayVersion(version)} className="min-w-0 flex-1 text-left">
              <span className="block font-medium">{version.label || `Version ${version.version}`}</span>
              <span className="text-xs text-[#a3988c]">{fmtTime(version.duration)} · {fmtBytes(Number(version.bytes))}</span>
            </button>
            {track.library === "vault" && track.owner_id === me && (
              offline[version.id] ? (
                <button type="button" className="text-xs text-[#e4a15a]" onClick={() => void dropOffline(version.id).then(() => setOffline((cur) => ({ ...cur, [version.id]: false }))).catch(reportAcetateError)}>
                  On this device
                </button>
              ) : (
                <button
                  type="button"
                  className="text-xs text-[#a3988c]"
                  onClick={() => {
                    void (async () => {
                      const url = await acetateSigned(version.path);
                      if (!url) throw new Error("Couldn't prepare that file");
                      await keepOffline(version.id, url, track.title, { trackId: track.id, bytes: Number(version.bytes) || 0 });
                      setOffline((cur) => ({ ...cur, [version.id]: true }));
                      toast("Saved on this device", "success");
                    })().catch(reportAcetateError);
                  }}
                >
                  Keep
                </button>
              )
            )}
            <button type="button" onClick={() => props.onDeleteVersion(version)} className="text-xs text-[#a3988c]">Delete</button>
          </li>
        ))}
      </ul>
      {props.shares.length > 0 && (
        <p className="mt-4 text-xs text-[#a3988c]">{props.shares.length} live share {props.shares.length === 1 ? "link" : "links"} · {props.shares.reduce((sum, share) => sum + share.views, 0)} views</p>
      )}
      <h2 className="mt-6 font-serif text-2xl">Comments</h2>
      <ul className="mt-2 space-y-2">
        {(detail?.comments ?? []).map((comment) => (
          <li key={comment.id} className="rounded-2xl border border-[#3c342c] px-3 py-2">
            <div className="flex items-center justify-between text-xs text-[#e4a15a]">
              <button type="button" onClick={() => useAcetatePlayer.getState().seek(comment.at_seconds)}>{fmtTime(comment.at_seconds)}</button>
              <button type="button" onClick={() => props.onDeleteComment(comment.id)} className="text-[#a3988c]">Remove</button>
            </div>
            <p className="text-sm">{comment.body}</p>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const at = playing?.trackId === track.id ? current : 0;
          props.onComment(at, body, active?.id ?? null);
          setBody("");
        }}
      >
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Comment at the playhead" maxLength={500} className="flex-1 rounded-2xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
        <button type="submit" disabled={props.busy || !body.trim()} className="rounded-full bg-[#f3eadf] px-3 text-sm font-semibold text-[#100e0c] disabled:opacity-40">Post</button>
      </form>
    </section>
  );
}

function Premium({ storage, busy, onCheckout }: { storage: AcetateStorage; busy: boolean; onCheckout: () => void }) {
  return (
    <section className="rounded-3xl border border-[#3c342c] bg-[#1a1612] p-5">
      <p className="text-xs tracking-[0.2em] text-[#e4a15a] uppercase">Storage</p>
      <h2 className="mt-2 font-serif text-4xl">{storage.premium ? "Unlimited" : "5 GB free"}</h2>
      <p className="mt-3 text-sm leading-relaxed text-[#a3988c]">
        {storage.lifetime
          ? "An admin granted you lifetime Acetate Premium. It does not expire, and uploads are not capped."
          : "Free accounts include 5 GB, enforced when the file hits storage. Premium removes the cap. Paid checkout is stubbed until a payment provider is connected — it will not charge you."}
      </p>
      <p className="mt-4 text-sm">{fmtBytes(Number(storage.bytes))} used{storage.limit != null ? ` · ${fmtBytes(storage.limit)} included` : ""}</p>
      {!storage.premium && (
        <button type="button" disabled={busy} onClick={onCheckout} className="mt-5 rounded-full bg-[#e4a15a] px-5 py-2.5 font-semibold text-[#100e0c] disabled:opacity-50">
          Upgrade — checkout not connected
        </button>
      )}
      <p className="mt-4 text-xs text-[#a3988c]">Nexus admins grant or revoke lifetime Premium from the Acetate admin panel.</p>
    </section>
  );
}

function ShareSheet({
  target,
  shares,
  busy,
  onClose,
  onCreate,
  onRevoke,
  onNexus,
}: {
  target: { kind: "track" | "project"; id: string; title: string };
  shares: AcetateShare[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { listing: "public" | "unlisted"; password?: string; expiresAt?: string | null; download: boolean }) => void;
  onRevoke: (id: string) => void;
  onNexus: (title: string, url: string) => void;
}) {
  const [listing, setListing] = useState<"public" | "unlisted">("unlisted");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [download, setDownload] = useState(false);
  const expiresAt = useMemo(() => {
    if (expiry === "never") return null;
    const days = expiry === "1" ? 1 : expiry === "7" ? 7 : 30;
    return new Date(Date.now() + days * 86400000).toISOString();
  }, [expiry]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/50 sm:place-items-center" onClick={onClose}>
      <div className="max-h-[86vh] w-full overflow-y-auto rounded-t-3xl bg-[#1a1612] p-5 sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-2xl">Share {target.title}</h2>
        <p className="mt-1 text-sm text-[#a3988c]">Anyone with the link can play, without a Nexus account. Unlisted links are just harder to stumble on.</p>
        <div className="mt-4 flex gap-2">
          {(["unlisted", "public"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setListing(item)} className={`rounded-full px-3 py-1 text-sm ${listing === item ? "bg-[#e4a15a] text-[#100e0c]" : "border border-[#3c342c]"}`}>
              {item === "public" ? "Public" : "Unlisted"}
            </button>
          ))}
        </div>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Optional password" type="text" className="mt-3 w-full rounded-2xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
        <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="mt-2 w-full rounded-2xl border border-[#3c342c] bg-[#1a1612] px-3 py-2 text-sm">
          <option value="never">No expiry</option>
          <option value="1">Expires in 24 hours</option>
          <option value="7">Expires in 7 days</option>
          <option value="30">Expires in 30 days</option>
        </select>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={download} onChange={(e) => setDownload(e.target.checked)} />
          Allow download
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => onCreate({ listing, password, expiresAt, download })}
          className="mt-4 w-full rounded-full bg-[#e4a15a] py-2.5 font-semibold text-[#100e0c] disabled:opacity-50"
        >
          Create link
        </button>
        <ul className="mt-4 space-y-2">
          {shares.map((share) => {
            const url = acetateShareUrl(share.token);
            return (
              <li key={share.id} className="rounded-2xl border border-[#3c342c] p-3 text-sm">
                <div className="text-[#a3988c]">{share.listing} · {share.allow_download ? "download on" : "listen only"} · {share.views} views</div>
                <div className="mt-1 truncate">{url}</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="rounded-full bg-[#f3eadf] px-3 py-1 text-xs font-semibold text-[#100e0c]" onClick={() => void navigator.clipboard.writeText(url).then(() => toast("Link copied", "success")).catch(() => toast("Couldn't copy", "error"))}>Copy</button>
                  <button type="button" className="rounded-full border border-[#3c342c] px-3 py-1 text-xs" onClick={() => onNexus(target.title, url)}>Send to Nexus</button>
                  <button type="button" className="rounded-full px-3 py-1 text-xs text-[#d4653a]" onClick={() => onRevoke(share.id)}>Revoke</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function NexusSheet({
  title,
  url,
  chats,
  onOpen,
  onClose,
  onSend,
}: {
  title: string;
  url: string;
  chats: { id: string; kind: string; name: string | null; other_user_id: string | null }[];
  onOpen: () => void;
  onClose: () => void;
  onSend: (id: string) => void;
}) {
  const profiles = useApp((s) => s.profiles);
  useEffect(() => {
    onOpen();
    // Load the chat list once when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 sm:place-items-center" onClick={onClose}>
      <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-[#1a1612] p-5 sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-2xl">Send to a chat</h2>
        <p className="mt-1 text-sm text-[#a3988c]">{title} plays inline in the Nexus conversation.</p>
        <ul className="mt-3 space-y-1">
          {chats.length === 0 && <li className="text-sm text-[#a3988c]">No chats yet. Open Nexus and start a DM, then come back.</li>}
          {chats.map((chat) => {
            const other = chat.other_user_id ? profiles[chat.other_user_id] : null;
            const label = chat.name || other?.display_name || other?.username || (chat.kind === "dm" ? "Direct message" : "Group");
            return (
              <li key={chat.id}>
                <button type="button" onClick={() => onSend(chat.id)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5">
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 truncate text-xs text-[#a3988c]">{url}</p>
      </div>
    </div>
  );
}
