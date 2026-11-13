"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Disc3, ExternalLink } from "lucide-react";
import {
  DISTRIBUTION_PANEL_LINKS,
  DISTRIBUTION_PANEL_URL,
  distributionPanelUrl,
  openDistributionPanel,
  useDistributionPanelEnabled,
} from "@/lib/distributionPanel";
import { isNativeApp } from "@/lib/useMobile";

export default function DistributionPanelCard({ tone = "nexus" }: { tone?: "nexus" | "acetate" }) {
  const enabled = useDistributionPanelEnabled();
  const [native, setNative] = useState(false);
  useEffect(() => setNative(isNativeApp()), []);
  const acetate = tone === "acetate";
  const card = acetate ? "rounded-3xl p-5" : "rounded-3xl bg-side p-5 sm:p-6";
  const muted = acetate ? "text-[#a3988c]" : "text-sub";
  const primary = acetate
    ? "rounded-full bg-[#e4a15a] px-5 py-2.5 text-sm font-bold text-[#100e0c]"
    : "rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white";
  const secondary = acetate
    ? "rounded-full px-4 py-2 text-sm font-semibold"
    : "rounded-full bg-black/25 px-4 py-2 text-sm font-semibold";

  return (
    <div className={card} style={acetate ? { background: "var(--ac-card, #1a1612)", color: "var(--ac-text, #f3eadf)" } : undefined}>
      <div className="flex items-start gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-2xl"
          style={acetate ? { background: "var(--ac-accent, #e4a15a)", color: "var(--ac-accent-text, #100e0c)" } : { background: "#e4a15a", color: "#100e0c" }}
        >
          <Disc3 className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.16em] uppercase" style={acetate ? { color: "var(--ac-accent, #e4a15a)" } : { color: "#e4a15a" }}>
            Distribution
          </p>
          <h2 className={acetate ? "font-serif text-3xl" : "text-2xl font-black tracking-tight"}>Panel</h2>
        </div>
      </div>
      <p className={`mt-4 text-sm leading-relaxed ${muted}`}>
        Releases, splits, and the rest of distribution live on the Nexus panel. It opens on its own so a sign-in there stays with the panel
        {native ? ", in the in-app browser" : ", in a new tab"}.
      </p>
      {!enabled ? (
        <p className={`mt-4 text-sm ${muted}`}>An admin has turned the panel entry off.</p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            <PanelAnchor path="/" className={primary}>
              Open the panel <ExternalLink className="ml-1 inline size-3.5" />
            </PanelAnchor>
            {DISTRIBUTION_PANEL_LINKS.filter((link) => link.path !== "/").map((link) => (
              <PanelAnchor
                key={link.id}
                path={link.path}
                className={secondary}
                style={acetate ? { background: "var(--ac-bg, #100e0c)" } : undefined}
              >
                {link.label}
              </PanelAnchor>
            ))}
          </div>
          <p className={`mt-4 truncate text-xs ${muted}`}>{DISTRIBUTION_PANEL_URL}</p>
        </>
      )}
    </div>
  );
}

function PanelAnchor({
  path,
  className,
  style,
  children,
}: {
  path: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <a
      href={distributionPanelUrl(path)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      onClick={(event) => {
        if (!isNativeApp()) return;
        event.preventDefault();
        openDistributionPanel(path);
      }}
    >
      {children}
    </a>
  );
}
