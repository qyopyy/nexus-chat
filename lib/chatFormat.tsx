"use client";

/**
 * Discord-style chat markup + Nexus extras.
 *
 * **bold**  *italic*  __underline__  ~~strike~~  ||spoiler||  `code`
 * {c:#hex|name}colored{/c}   {rainbow}…{/rainbow}   {ghost}…{/ghost}
 * {v:30}vanishes 30s after send{/v}   (also {v:5m} {v:1h})
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePrefs } from "./prefs";
import { URL_RE } from "./unfurl";
import { cn } from "./utils";
import { CustomEmojiImg } from "@/components/ui/CustomEmoji";

const NAMED: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  pink: "#ff4da6",
  rose: "#f43f5e",
  white: "#f8fafc",
  gray: "#94a3b8",
  grey: "#94a3b8",
};

export function parseVanishSecs(token: string): number | null {
  const m = /^(\d+)(s|m|h|d)?$/i.exec(token.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = (m[2] || "s").toLowerCase();
  if (u === "m") return n * 60;
  if (u === "h") return n * 3600;
  if (u === "d") return n * 86400;
  return n;
}

export function wrapSelection(text: string, start: number, end: number, open: string, close: string) {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  if (a === b) return { text: text.slice(0, a) + open + close + text.slice(b), cursor: a + open.length };
  return { text: text.slice(0, a) + open + text.slice(a, b) + close + text.slice(b), cursor: a + open.length + (b - a) + close.length };
}

function Spoiler({ children }: { children: ReactNode }) {
  const auto = usePrefs((s) => s.spoilersAutoReveal);
  const [shown, setShown] = useState(false);
  const open = auto || shown;
  return (
    <span
      role={open ? undefined : "button"}
      tabIndex={open ? undefined : 0}
      onClick={(e) => (e.stopPropagation(), setShown(true))}
      onKeyDown={(e) => e.key === "Enter" && setShown(true)}
      className={cn("rounded px-0.5 transition", open ? "bg-white/10" : "cursor-pointer bg-black text-transparent select-none hover:bg-black/80 [&_*]:invisible")}
      title={open ? undefined : "Spoiler — click to reveal"}
    >
      {children}
    </span>
  );
}

function Vanish({ secs, createdAt, children }: { secs: number; createdAt?: string; children: ReactNode }) {
  const end = useMemo(() => {
    const base = createdAt ? new Date(createdAt).getTime() : Date.now();
    return base + secs * 1000;
  }, [createdAt, secs]);
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft(Math.max(0, end - Date.now())), 250);
    return () => clearInterval(t);
  }, [end, left]);
  if (left <= 0) {
    return <span className="italic text-sub/70">··· vanished</span>;
  }
  const s = Math.ceil(left / 1000);
  const label = s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  return (
    <span className="rounded bg-accent/15 px-0.5 ring-1 ring-accent/30" title={`Disappears in ${label}`}>
      {children}
      <span className="ml-1 align-middle text-[10px] font-bold text-accent/80">{label}</span>
    </span>
  );
}

function Rainbow({ children }: { children: ReactNode }) {
  return (
    <span
      className="bg-[linear-gradient(90deg,#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ec4899)] bg-clip-text font-semibold text-transparent"
      style={{ backgroundSize: "200% 100%", animation: "nexus-rainbow 3s linear infinite" }}
    >
      {children}
    </span>
  );
}

function Ghost({ children }: { children: ReactNode }) {
  return <span className="text-sub/35 transition hover:text-txt">{children}</span>;
}

type Token =
  | { t: "text"; v: string }
  | { t: "bold" | "italic" | "under" | "strike" | "spoiler" | "code" | "rainbow" | "ghost"; kids: Token[] }
  | { t: "color"; color: string; kids: Token[] }
  | { t: "vanish"; secs: number; kids: Token[] }
  | { t: "link"; href: string }
  | { t: "emoji"; id: string; name: string; big?: boolean };

const INLINE_RE =
  /\|\|(.+?)\|\||`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(.+?)\*|\{c:([#\w]+)\}([\s\S]*?)\{\/c\}|\{rainbow\}([\s\S]*?)\{\/rainbow\}|\{ghost\}([\s\S]*?)\{\/ghost\}|\{v:([^}]+)\}([\s\S]*?)\{\/v\}|<a?:([a-z0-9_]{2,32}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/g;

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  const re = new RegExp(INLINE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push(...linkSplit(input.slice(last, m.index)));
    if (m[1] != null) out.push({ t: "spoiler", kids: tokenize(m[1]) });
    else if (m[2] != null) out.push({ t: "code", kids: [{ t: "text", v: m[2] }] });
    else if (m[3] != null) out.push({ t: "bold", kids: tokenize(m[3]) });
    else if (m[4] != null) out.push({ t: "under", kids: tokenize(m[4]) });
    else if (m[5] != null) out.push({ t: "strike", kids: tokenize(m[5]) });
    else if (m[6] != null) out.push({ t: "italic", kids: tokenize(m[6]) });
    else if (m[7] != null) {
      const raw = m[7].toLowerCase();
      const color = raw.startsWith("#") ? raw : NAMED[raw] || "#94a3b8";
      out.push({ t: "color", color, kids: tokenize(m[8] ?? "") });
    } else if (m[9] != null) out.push({ t: "rainbow", kids: tokenize(m[9]) });
    else if (m[10] != null) out.push({ t: "ghost", kids: tokenize(m[10]) });
    else if (m[11] != null) {
      const secs = parseVanishSecs(m[11]) ?? 30;
      out.push({ t: "vanish", secs, kids: tokenize(m[12] ?? "") });
    } else if (m[13] != null && m[14] != null) out.push({ t: "emoji", name: m[13], id: m[14] });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push(...linkSplit(input.slice(last)));
  return out;
}

function linkSplit(text: string): Token[] {
  const parts = text.split(URL_RE);
  const out: Token[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    if (i % 2 === 1) out.push({ t: "link", href: parts[i] });
    else out.push({ t: "text", v: parts[i] });
  }
  return out;
}

function renderTokens(tokens: Token[], keyBase: string, createdAt?: string): ReactNode[] {
  return tokens.map((tok, i) => {
    const k = `${keyBase}.${i}`;
    switch (tok.t) {
      case "text":
        return <span key={k}>{tok.v}</span>;
      case "link":
        return (
          <a key={k} href={tok.href} target="_blank" rel="noreferrer noopener" className="text-[#6ab7ff] underline-offset-2 hover:underline">
            {tok.href}
          </a>
        );
      case "bold":
        return (
          <strong key={k} className="font-bold">
            {renderTokens(tok.kids, k, createdAt)}
          </strong>
        );
      case "italic":
        return <em key={k}>{renderTokens(tok.kids, k, createdAt)}</em>;
      case "under":
        return (
          <span key={k} className="underline underline-offset-2">
            {renderTokens(tok.kids, k, createdAt)}
          </span>
        );
      case "strike":
        return (
          <span key={k} className="line-through opacity-80">
            {renderTokens(tok.kids, k, createdAt)}
          </span>
        );
      case "spoiler":
        return <Spoiler key={k}>{renderTokens(tok.kids, k, createdAt)}</Spoiler>;
      case "code":
        return (
          <code key={k} className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.9em]">
            {renderTokens(tok.kids, k, createdAt)}
          </code>
        );
      case "color":
        return (
          <span key={k} style={{ color: tok.color }} className="font-semibold">
            {renderTokens(tok.kids, k, createdAt)}
          </span>
        );
      case "rainbow":
        return <Rainbow key={k}>{renderTokens(tok.kids, k, createdAt)}</Rainbow>;
      case "ghost":
        return <Ghost key={k}>{renderTokens(tok.kids, k, createdAt)}</Ghost>;
      case "emoji":
        return <CustomEmojiImg key={k} id={tok.id} name={tok.name} big={tok.big} />;
      case "vanish":
        return (
          <Vanish key={k} secs={tok.secs} createdAt={createdAt}>
            {renderTokens(tok.kids, k, createdAt)}
          </Vanish>
        );
      default:
        return null;
    }
  });
}

/** Rich message body — Discord-like markup + colored / vanishing spans. */
export function FormattedText({ text, createdAt }: { text: string; createdAt?: string }) {
  const tokens = useMemo(() => {
    const toks = tokenize(text);
    // emoji-only messages (up to 12 custom emojis) render jumbo, like unicode emoji do
    const emojis = toks.filter((t) => t.t === "emoji");
    if (emojis.length && emojis.length <= 12 && toks.every((t) => t.t === "emoji" || (t.t === "text" && !t.v.trim())))
      return toks.map((t) => (t.t === "emoji" ? { ...t, big: true } : t));
    return toks;
  }, [text]);
  return <>{renderTokens(tokens, "r", createdAt)}</>;
}

export const FORMAT_COLORS = [
  { id: "pink", label: "Pink", hex: NAMED.pink },
  { id: "purple", label: "Purple", hex: NAMED.purple },
  { id: "red", label: "Red", hex: NAMED.red },
  { id: "orange", label: "Orange", hex: NAMED.orange },
  { id: "yellow", label: "Yellow", hex: NAMED.yellow },
  { id: "green", label: "Green", hex: NAMED.green },
  { id: "cyan", label: "Cyan", hex: NAMED.cyan },
  { id: "blue", label: "Blue", hex: NAMED.blue },
  { id: "white", label: "White", hex: NAMED.white },
];

export const VANISH_PICKS: { secs: string; label: string }[] = [
  { secs: "10s", label: "10 seconds" },
  { secs: "30s", label: "30 seconds" },
  { secs: "1m", label: "1 minute" },
  { secs: "5m", label: "5 minutes" },
  { secs: "1h", label: "1 hour" },
  { secs: "1d", label: "1 day" },
];
