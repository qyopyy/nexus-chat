"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AppWindow,
  ArrowLeft,
  Binary,
  Braces,
  CaseSensitive,
  FileDigit,
  FilePen,
  Fingerprint,
  ImageUpscale,
  KeyRound,
  Globe,
  Link2,
  MapPin,
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
import SpotifyTakedown from "@/components/music/SpotifyTakedown";
import BumpHub from "@/components/bump/BumpHub";
import BrowserHub from "@/components/browser/BrowserHub";
import LinkBioHub, { openLinkBio } from "@/components/linkbio/LinkBioHub";
import IpaDownloads from "@/components/apps/IpaDownloads";
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
  | "qr"
  | "color"
  | "text"
  | "checksum"
  | "metronome"
  | "bpm"
  | "json"
  | "token"
  | "base64";

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
    name: "Docs editor",
    tag: "PDF · text · pages · stamps",
    desc: "Professional PDF tools: styled text, page rotate, blanks, watermarks, page numbers, undo/redo.",
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
  if (tool === "qr") return <QrMaker mobile={mobile} onBack={backToGrid} />;
  if (tool === "color") return <ColorStudio mobile={mobile} onBack={backToGrid} />;
  if (tool === "text") return <TextLab mobile={mobile} onBack={backToGrid} />;
  if (tool === "checksum") return <Checksum mobile={mobile} onBack={backToGrid} />;
  if (tool === "metronome") return <Metronome mobile={mobile} onBack={backToGrid} />;
  if (tool === "bpm") return <BpmTap mobile={mobile} onBack={backToGrid} />;
  if (tool === "json") return <JsonLab mobile={mobile} onBack={backToGrid} />;
  if (tool === "token") return <TokenGen mobile={mobile} onBack={backToGrid} />;
  if (tool === "base64") return <Base64Lab mobile={mobile} onBack={backToGrid} />;

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

          <IpaDownloads />

          <p className="text-sm text-sub">Creator utilities. File tools stay on-device; Music ID and Spotify takedown use server keys when connected.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                className="group overflow-hidden rounded-2xl bg-side text-left transition hover:-translate-y-0.5"
              >
                <div className="relative grid h-36 place-items-center overflow-hidden text-6xl" style={{ background: item.bg }}>
                  {item.iconSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.iconSrc}
                      alt=""
                      className="size-24 rounded-[28px] object-cover shadow-lg shadow-black/40 ring-1 ring-white/20 transition group-hover:scale-105"
                      width={96}
                      height={96}
                    />
                  ) : (
                    <span className="transition group-hover:scale-110">{item.emoji}</span>
                  )}
                  <item.Icon className="absolute top-3 left-3 size-5 text-white" />
                </div>
                <div className="p-4">
                  <div className="text-lg font-bold">{item.name}</div>
                  <div className="text-xs font-semibold text-sub">{item.tag}</div>
                  <p className="mt-1 text-sm text-sub">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
