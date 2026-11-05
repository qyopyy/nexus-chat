"use client";

import { useState } from "react";
import { AppWindow, ArrowLeft, FilePen, Fingerprint, ImagePlus } from "lucide-react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/utils";
import ImageResizer from "./ImageResizer";
import PdfEditor from "./PdfEditor";
import MusicCheck from "./MusicCheck";

const TOOLS = [
  {
    id: "image" as const,
    name: "Image resizer",
    tag: "Resize on this device",
    desc: "Set width and height, keep the aspect ratio, preview, and download.",
    bg: "linear-gradient(135deg,#00a8fc,#0b2a5c)",
    emoji: "🖼️",
    Icon: ImagePlus,
  },
  {
    id: "pdf" as const,
    name: "PDF editor",
    tag: "Notes, pages, download",
    desc: "Open a PDF, add text, reorder or delete pages, and save a new file.",
    bg: "linear-gradient(135deg,#faa61a,#5c2b0b)",
    emoji: "📄",
    Icon: FilePen,
  },
  {
    id: "music" as const,
    name: "Music ID check",
    tag: "Shield 360 · ACRCloud",
    desc: "Check a track against your Nexus fingerprints and ACRCloud Content ID.",
    bg: "linear-gradient(135deg,#5c0b4a,#1b0b5c)",
    emoji: "🧬",
    Icon: Fingerprint,
  },
];

export default function AppsHub({ mobile }: { mobile?: boolean }) {
  const [tool, setTool] = useState<(typeof TOOLS)[number]["id"] | null>(null);
  if (tool === "image") return <ImageResizer mobile={mobile} onBack={() => setTool(null)} />;
  if (tool === "pdf") return <PdfEditor mobile={mobile} onBack={() => setTool(null)} />;
  if (tool === "music") return <MusicCheck mobile={mobile} onBack={() => setTool(null)} />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-chat">
      <header className={cn("flex shrink-0 items-center gap-2 border-b border-black/20 px-3", mobile ? "pt-safe-3 pb-2" : "h-12")}>
        {mobile && (
          <button onClick={() => useApp.setState({ mobileTab: "me" })} className="grid size-9 place-items-center rounded-full hover:bg-hover" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <AppWindow className="size-5 text-[#00a8fc]" />
        <span className={cn("font-bold", mobile ? "text-2xl tracking-tight" : "text-base")}>Apps</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-3 sm:p-5">
          <p className="text-sm text-sub">
            Tools for files you already have. Image and PDF edits stay in the browser. Music ID check uses your Shield 360 catalogue and optional ACRCloud matching.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((item) => (
              <button key={item.id} onClick={() => setTool(item.id)} className="group overflow-hidden rounded-2xl bg-side text-left transition hover:-translate-y-0.5">
                <div className="relative grid h-36 place-items-center text-6xl" style={{ background: item.bg }}>
                  <span className="transition group-hover:scale-110">{item.emoji}</span>
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
