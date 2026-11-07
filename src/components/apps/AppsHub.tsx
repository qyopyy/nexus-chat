"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AppWindow,
  Calculator,
  Music2,
  NotebookPen,
  ChartPie,
  Ruler,
  ArrowLeft,
  AudioLines,
  Barcode,
  Binary,
  Braces,
  CaseSensitive,
  CheckSquare,
  FileDigit,
  FilePen,
  Fingerprint,
  ImageUpscale,
  KeyRound,
  Globe,
  Link2,
  MapPin,
  Megaphone,
  Piano,
  Pipette,
  QrCode,
  ShieldAlert,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/store/app";
import { studioGo } from "@/store/studio";
import { cn } from "@/lib/utils";
import ImageStudio from "./ImageStudio";
import PdfEditor from "./PdfEditor";
import MusicCheck from "./MusicCheck";
import QrMaker from "./QrMaker";
import ColorStudio from "./ColorStudio";
import TextLab from "./TextLab";
import Checksum from "./Checksum";
import Metronome from "./Metronome";
import BpmTap from "./BpmTap";
import JsonLab from "./JsonLab";
import TokenGen from "./TokenGen";
import Base64Lab from "./Base64Lab";
import UpcGenerator from "./UpcGenerator";
import PitchSheet from "./PitchSheet";
import MetadataPack from "./MetadataPack";
import ReleaseChecklist from "./ReleaseChecklist";
import PromoStudio from "./PromoStudio";
import VoiceChangerApp from "./VoiceChangerApp";
import FlStudioLab from "./FlStudioLab";
import { FocusTimer, KeyScale, QuickNotes, RoyaltySplits, TipSplit, UnitConverter } from "./MoreApps";
import SpotifyTakedown from "@/components/music/SpotifyTakedown";
import BumpHub from "@/components/bump/BumpHub";
import BrowserHub from "@/components/browser/BrowserHub";
import LinkBioHub, { openLinkBio } from "@/components/linkbio/LinkBioHub";
import IpaDownloads from "@/components/apps/IpaDownloads";
import TestFlightInvites from "@/components/apps/TestFlightInvites";
import { openBump } from "@/lib/bump";
import { openBrowser } from "@/lib/browser";

type ToolId =
  | "bump"
  | "browser"
  | "linkbio"
  | "image"
  | "pdf"
  | "music"
  | "spotify-td"
  | "upc"
  | "pitch"
  | "metadata"
  | "release"
  | "promo"
  | "voicefx"
  | "flstudio"
  | "qr"
  | "color"
  | "text"
  | "checksum"
  | "metronome"
  | "bpm"
  | "json"
  | "token"
  | "base64"
  | "focus"
  | "units"
  | "tip"
  | "keyscale"
  | "splits"
  | "notes";

const TOOLS: {
  id: ToolId;
  name: string;
  tag: string;
  desc: string;
  bg: string;
  emoji: string;
  /** Optional branded app icon (Nexus-style masters in /public) */
  iconSrc?: string;
  Icon: LucideIcon;
}[] = [
  {
    id: "bump",
    name: "Wump",
    tag: "OSM map · invites · privacy",
    desc: "Real OpenStreetMap pins, Live sharing, family/friend invite links — also a separate Wump IPA.",
    bg: "linear-gradient(135deg,#ff4d6d,#7c3aed 50%,#2563eb)",
    emoji: "📍",
    iconSrc: "/wump-icon.png",
    Icon: MapPin,
  },
  {
    id: "browser",
    name: "Browser",
    tag: "Google search · fetch pages · IPA",
    desc: "Private browser with live search, Brave-style shields, NextDNS / custom DoH, and IPA/APK shells.",
    bg: "linear-gradient(135deg,#60a5fa,#7c3aed 55%,#0b1220)",
    emoji: "🌐",
    iconSrc: "/browser-icon.png",
    Icon: Globe,
  },
  {
    id: "linkbio",
    name: "Nexus Link",
    tag: "Link in bio · 999 themes · glow",
    desc: "Side-project link-in-bio with login, Juice 999 themes, animated backgrounds, glowing names, and its own admin.",
    bg: "linear-gradient(135deg,#a855f7,#4c1d95 50%,#0a0214)",
    emoji: "🔗",
    Icon: Link2,
  },
  {
    id: "image",
    name: "Image studio",
    tag: "Resize · crop · filters · upscale",
    desc: "Resize, crop, apply filters, and upscale images locally — then download PNG, JPEG, or WebP.",
    bg: "linear-gradient(135deg,#00a8fc,#0b2a5c)",
    emoji: "🖼️",
    Icon: ImageUpscale,
  },
  {
    id: "pdf",
    name: "PDF editor & sign",
    tag: "Sign · text · pages · stamps",
    desc: "Sign PDFs with a drawn, typed or uploaded signature, add text and dates, rotate and reorder pages.",
    bg: "linear-gradient(135deg,#faa61a,#5c2b0b)",
    emoji: "📄",
    Icon: FilePen,
  },
  {
    id: "music",
    name: "Music ID check",
    tag: "Shield 360 · ACRCloud",
    desc: "Check a track against your Nexus fingerprints and ACRCloud Content ID.",
    bg: "linear-gradient(135deg,#5c0b4a,#1b0b5c)",
    emoji: "🧬",
    Icon: Fingerprint,
  },
  {
    id: "spotify-td",
    name: "Spotify takedown",
    tag: "Instant copyright notice",
    desc: "Paste a Spotify track link — resolve metadata and send a notice to Spotify.",
    bg: "linear-gradient(135deg,#1DB954,#0b3d24)",
    emoji: "⚡",
    Icon: ShieldAlert,
  },
  {
    id: "upc",
    name: "UPC / EAN generator",
    tag: "Barcodes for releases",
    desc: "Generate GS1 UPC-A or EAN-13 codes with check digits and downloadable barcode PNG.",
    bg: "linear-gradient(135deg,#1DB954,#064e3b)",
    emoji: "▦",
    Icon: Barcode,
  },
  {
    id: "pitch",
    name: "Pitch one-sheet",
    tag: "Playlists · blogs · DSP",
    desc: "Write a short release pitch and export a one-sheet for curators.",
    bg: "linear-gradient(135deg,#a855f7,#4c1d95)",
    emoji: "✎",
    Icon: FilePen,
  },
  {
    id: "metadata",
    name: "Metadata pack",
    tag: "CSV · JSON · ISRCs",
    desc: "Build album tracklists with ISRC/UPC fields — export DistroKid-style CSV or JSON.",
    bg: "linear-gradient(135deg,#38bdf8,#0c4a6e)",
    emoji: "{}",
    Icon: Braces,
  },
  {
    id: "release",
    name: "Release checklist",
    tag: "Ship-ready for artists",
    desc: "Tick masters, codes, artwork, splits, and pitch before you deliver to stores.",
    bg: "linear-gradient(135deg,#f59e0b,#7c2d12)",
    emoji: "☑",
    Icon: CheckSquare,
  },
  {
    id: "promo",
    name: "Promo studio",
    tag: "IG · Reels · TikTok",
    desc: "30-day Story / Reel / TikTok scripts with shot lists — copy captions and film every day.",
    bg: "linear-gradient(135deg,#ff2bd6,#7c3aed)",
    emoji: "📣",
    Icon: Megaphone,
  },
  {
    id: "voicefx",
    name: "Voice changer",
    tag: "Call FX · AI model zip",
    desc: "Chipmunk, deep, robot, radio — plus attach a nexus-voice.json AI model zip for custom call FX.",
    bg: "linear-gradient(135deg,#a855f7,#4c1d95)",
    emoji: "🎙",
    Icon: AudioLines,
  },
  {
    id: "flstudio",
    name: "FL Studio lab",
    tag: "Shortcuts · scales · MIDI",
    desc: "FL shortcuts, scale helper, 16-step → MIDI export, and mixer routing notes for producers.",
    bg: "linear-gradient(135deg,#ff4b8b,#5b1030)",
    emoji: "🎹",
    Icon: Piano,
  },
  {
    id: "qr",
    name: "QR maker",
    tag: "Links & codes",
    desc: "Turn a URL or short note into a downloadable QR image.",
    bg: "linear-gradient(135deg,#23a559,#0b3d24)",
    emoji: "▣",
    Icon: QrCode,
  },
  {
    id: "color",
    name: "Color studio",
    tag: "HEX · RGB · contrast",
    desc: "Pick brand colors and check contrast against white and black.",
    bg: "linear-gradient(135deg,#faa61a,#5c3b0b)",
    emoji: "🎨",
    Icon: Pipette,
  },
  {
    id: "text",
    name: "Text lab",
    tag: "Count · case · slug",
    desc: "Word counts, casing, slugify, and tidy whitespace for titles and bios.",
    bg: "linear-gradient(135deg,#5865f2,#1b1f5c)",
    emoji: "Aa",
    Icon: CaseSensitive,
  },
  {
    id: "checksum",
    name: "File checksum",
    tag: "SHA-256 / 384 / 512",
    desc: "Hash a local file to verify downloads or release assets.",
    bg: "linear-gradient(135deg,#eb459e,#4a0b3a)",
    emoji: "#",
    Icon: FileDigit,
  },
  {
    id: "metronome",
    name: "Metronome",
    tag: "Practice tempo",
    desc: "Click track with adjustable BPM and time signature.",
    bg: "linear-gradient(135deg,#f23f42,#5c0b12)",
    emoji: "⏱",
    Icon: Timer,
  },
  {
    id: "bpm",
    name: "BPM tap",
    tag: "Estimate tempo",
    desc: "Tap along with a song to read an estimated BPM.",
    bg: "linear-gradient(135deg,#57f287,#0b3d24)",
    emoji: "♩",
    Icon: Activity,
  },
  {
    id: "json",
    name: "JSON lab",
    tag: "Pretty · minify",
    desc: "Format, minify, and validate JSON for APIs and webhooks.",
    bg: "linear-gradient(135deg,#fee75c,#5c4b0b)",
    emoji: "{}",
    Icon: Braces,
  },
  {
    id: "token",
    name: "Token gen",
    tag: "Passwords · UUIDs",
    desc: "Generate strong passwords or UUIDs with Web Crypto.",
    bg: "linear-gradient(135deg,#00a8fc,#0b2a5c)",
    emoji: "🔑",
    Icon: KeyRound,
  },
  {
    id: "base64",
    name: "Base64",
    tag: "Encode · decode",
    desc: "Convert UTF-8 text to Base64 and back for tokens and payloads.",
    bg: "linear-gradient(135deg,#4e5058,#1e1f22)",
    emoji: "64",
    Icon: Binary,
  },
  {
    id: "keyscale",
    name: "Key & scale finder",
    tag: "Notes · chords · keyboard",
    desc: "Every scale and the chords in key, with a playable keyboard.",
    bg: "linear-gradient(135deg,#eb459e,#3a0b5c)",
    emoji: "🎹",
    Icon: Music2,
  },
  {
    id: "splits",
    name: "Royalty splits",
    tag: "Streams → payouts",
    desc: "Split estimated streaming money between artists, producers and writers.",
    bg: "linear-gradient(135deg,#ffd400,#5c3b0b)",
    emoji: "💸",
    Icon: ChartPie,
  },
  {
    id: "focus",
    name: "Focus timer",
    tag: "Pomodoro",
    desc: "25-minute focus sessions with short and long breaks.",
    bg: "linear-gradient(135deg,#f23f42,#3d0b1a)",
    emoji: "🍅",
    Icon: Timer,
  },
  {
    id: "units",
    name: "Unit converter",
    tag: "Length · weight · temp · data",
    desc: "Convert between metric, imperial, speed and file sizes.",
    bg: "linear-gradient(135deg,#00a8fc,#0b3d5c)",
    emoji: "📏",
    Icon: Ruler,
  },
  {
    id: "tip",
    name: "Tip & split",
    tag: "Bills with friends",
    desc: "Add a tip and split the bill evenly in seconds.",
    bg: "linear-gradient(135deg,#57f287,#0b4d2a)",
    emoji: "🧾",
    Icon: Calculator,
  },
  {
    id: "notes",
    name: "Quick notes",
    tag: "Saved on this device",
    desc: "Jot down lyrics, ideas and lists — no account needed.",
    bg: "linear-gradient(135deg,#fee75c,#5c4b0b)",
    emoji: "📝",
    Icon: NotebookPen,
  },
];

export default function AppsHub({ mobile }: { mobile?: boolean }) {
  const appsTool = useApp((s) => s.appsTool);
  const hub = useApp((s) => s.hub);
  const [tool, setTool] = useState<ToolId | null>((appsTool as ToolId) || null);

  useEffect(() => {
    // Prefer the dedicated Bump hub (realtime live shell) over the nested Apps tool
    if (hub === "bump") return;
    if (appsTool && TOOLS.some((t) => t.id === appsTool)) setTool(appsTool as ToolId);
  }, [hub, appsTool]);

  function backToGrid() {
    setTool(null);
    useApp.setState({ appsTool: null, hub: "apps" });
  }

  if (tool === "bump") {
    // Nested open from the Apps grid — still fine; openBump() uses hub:"bump"
    return (
      <div className="flex h-full min-h-0 flex-col bg-chat">
        <BumpHub mobile={mobile} onBack={backToGrid} />
      </div>
    );
  }
  if (tool === "browser") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#0b1220]">
        <BrowserHub mobile={mobile} onBack={backToGrid} />
      </div>
    );
  }
  if (tool === "linkbio") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#07060f]">
        <LinkBioHub mobile={mobile} onBack={backToGrid} />
      </div>
    );
  }
  if (tool === "image") return <ImageStudio mobile={mobile} onBack={backToGrid} />;
  if (tool === "pdf") return <PdfEditor mobile={mobile} onBack={backToGrid} />;
  if (tool === "music") return <MusicCheck mobile={mobile} onBack={backToGrid} />;
  if (tool === "spotify-td") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-chat">
        <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
          <button onClick={backToGrid} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back to apps">
            <ArrowLeft className="size-5" />
          </button>
          <ShieldAlert className="size-5 text-[#1DB954]" />
          <span className="min-w-0 flex-1 truncate font-bold">Spotify takedown</span>
          <button onClick={() => studioGo("takedowns")} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">
            Full Studio
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto max-w-2xl">
            <SpotifyTakedown />
          </div>
        </div>
      </div>
    );
  }
  if (tool === "upc") return <UpcGenerator mobile={mobile} onBack={backToGrid} />;
  if (tool === "pitch") return <PitchSheet mobile={mobile} onBack={backToGrid} />;
  if (tool === "metadata") return <MetadataPack mobile={mobile} onBack={backToGrid} />;
  if (tool === "release") return <ReleaseChecklist mobile={mobile} onBack={backToGrid} />;
  if (tool === "promo") return <PromoStudio mobile={mobile} onBack={backToGrid} />;
  if (tool === "voicefx") return <VoiceChangerApp mobile={mobile} onBack={backToGrid} />;
  if (tool === "flstudio") return <FlStudioLab mobile={mobile} onBack={backToGrid} />;
  if (tool === "qr") return <QrMaker mobile={mobile} onBack={backToGrid} />;
  if (tool === "color") return <ColorStudio mobile={mobile} onBack={backToGrid} />;
  if (tool === "text") return <TextLab mobile={mobile} onBack={backToGrid} />;
  if (tool === "checksum") return <Checksum mobile={mobile} onBack={backToGrid} />;
  if (tool === "metronome") return <Metronome mobile={mobile} onBack={backToGrid} />;
  if (tool === "bpm") return <BpmTap mobile={mobile} onBack={backToGrid} />;
  if (tool === "json") return <JsonLab mobile={mobile} onBack={backToGrid} />;
  if (tool === "token") return <TokenGen mobile={mobile} onBack={backToGrid} />;
  if (tool === "base64") return <Base64Lab mobile={mobile} onBack={backToGrid} />;
  if (tool === "focus") return <FocusTimer mobile={mobile} onBack={backToGrid} />;
  if (tool === "units") return <UnitConverter mobile={mobile} onBack={backToGrid} />;
  if (tool === "tip") return <TipSplit mobile={mobile} onBack={backToGrid} />;
  if (tool === "keyscale") return <KeyScale mobile={mobile} onBack={backToGrid} />;
  if (tool === "splits") return <RoyaltySplits mobile={mobile} onBack={backToGrid} />;
  if (tool === "notes") return <QuickNotes mobile={mobile} onBack={backToGrid} />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        {mobile && (
          <button onClick={() => useApp.setState({ mobileTab: "me", appsTool: null })} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <AppWindow className="size-5 text-[#00a8fc]" />
        <span className={cn("font-bold", mobile ? "text-2xl tracking-tight" : "text-base")}>Apps</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-3 sm:p-5">
          <button
            type="button"
            onClick={() => openBump()}
            className="group relative w-full overflow-hidden rounded-3xl text-left ring-1 ring-[#22c55a]/40 transition hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg,#166534 0%,#0b3d24 45%,#14532d 100%)" }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(34,197,94,.35),transparent_55%)]" />
            <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/wump-icon.png"
                alt=""
                className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-white/15 sm:size-20"
                width={80}
                height={80}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-[#86efac]" />
                  <span className="text-[11px] font-bold tracking-[0.14em] text-[#86efac] uppercase">Live · realtime</span>
                </div>
                <div className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Wump</div>
                <p className="mt-1 max-w-xl text-sm text-white/75">
                  Real OpenStreetMap · Live friend pins · invite links. Built into Nexus here, plus a separate Wump iOS app with the same account.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#14532d] shadow-sm group-hover:bg-[#dcfce7]">
                Open in Nexus
              </span>
            </div>
          </button>

          <TestFlightInvites />

          <IpaDownloads />

          <p className="text-sm text-sub">Creator &amp; artist utilities — UPC, pitch sheets, metadata packs, and more. File tools stay on-device; Music ID and Spotify takedown use server keys when connected.</p>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
            {TOOLS.filter((item) => item.id !== "bump").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "browser") {
                    openBrowser();
                    setTool("browser");
                    return;
                  }
                  if (item.id === "linkbio") {
                    openLinkBio();
                    setTool("linkbio");
                    return;
                  }
                  setTool(item.id);
                  useApp.setState({ appsTool: item.id, hub: "apps" });
                }}
                className="group overflow-hidden rounded-2xl bg-side text-left transition hover:-translate-y-0.5 active:scale-[.97]"
              >
                <div className="relative grid h-24 place-items-center overflow-hidden text-4xl sm:h-36 sm:text-6xl" style={{ background: item.bg }}>
                  {item.iconSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.iconSrc}
                      alt=""
                      className="size-16 rounded-[22px] object-cover sm:size-24 sm:rounded-[28px] shadow-lg shadow-black/40 ring-1 ring-white/20 transition group-hover:scale-105"
                      width={96}
                      height={96}
                    />
                  ) : (
                    <span className="transition group-hover:scale-110">{item.emoji}</span>
                  )}
                  <item.Icon className="absolute top-3 left-3 size-5 text-white" />
                </div>
                <div className="p-3 sm:p-4">
                  <div className="truncate text-[15px] font-bold sm:text-lg">{item.name}</div>
                  <div className="truncate text-xs font-semibold text-sub">{item.tag}</div>
                  <p className="mt-1 hidden text-sm text-sub sm:block">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
