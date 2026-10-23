/**
 * Appearance system (BetterDiscord / Vencord style).
 * Everything is CSS variables, so Tailwind utilities like `bg-side` follow the theme.
 * `paint` must stay self-contained plain JS — it's also stringified into a
 * pre-paint <script> (see ThemeBoot) so themes apply without a flash.
 */

export type ThemeColors = {
  rail: string;
  side: string;
  chat: string;
  panel: string;
  hover: string;
  active: string;
  input: string;
  line: string;
  txt: string;
  sub: string;
  faint: string;
  accent: string;
  accent2: string;
  bubbleMe: string;
  bubble: string;
  menu: string;
  wall: string;
};

export type ThemeDef = { name: string; colors: ThemeColors };

export const THEMES: Record<string, ThemeDef> = {
  discord: {
    name: "Discord Dark",
    colors: { rail: "#1e1f22", side: "#2b2d31", chat: "#313338", panel: "#232428", hover: "#35373c", active: "#404249", input: "#383a40", line: "#3f4147", txt: "#dbdee1", sub: "#949ba4", faint: "#6d6f78", accent: "#2aabee", accent2: "#229ed9", bubbleMe: "#2b5278", bubble: "#2b2d31", menu: "#111214", wall: "#1b2733" },
  },
  telegram: {
    name: "Telegram Night",
    colors: { rail: "#0e1621", side: "#17212b", chat: "#0e1621", panel: "#131c26", hover: "#202b36", active: "#2b5278", input: "#242f3d", line: "#1f2a35", txt: "#f5f5f5", sub: "#8b9ba9", faint: "#6c7883", accent: "#5288c1", accent2: "#4a7ab0", bubbleMe: "#2b5278", bubble: "#182533", menu: "#0b121a", wall: "#0e1621" },
  },
  midnight: {
    name: "Midnight AMOLED",
    colors: { rail: "#000000", side: "#050505", chat: "#000000", panel: "#0a0a0a", hover: "#141414", active: "#1f1f1f", input: "#111111", line: "#1a1a1a", txt: "#e8e8e8", sub: "#8a8a8a", faint: "#5c5c5c", accent: "#7c5cff", accent2: "#6a4cf0", bubbleMe: "#2a1f5c", bubble: "#121212", menu: "#000000", wall: "#000000" },
  },
  nord: {
    name: "Nord",
    colors: { rail: "#242933", side: "#2e3440", chat: "#3b4252", panel: "#2a303c", hover: "#434c5e", active: "#4c566a", input: "#434c5e", line: "#4c566a", txt: "#eceff4", sub: "#a9b1c1", faint: "#7b8394", accent: "#88c0d0", accent2: "#81a1c1", bubbleMe: "#5e81ac", bubble: "#434c5e", menu: "#20242c", wall: "#2e3440" },
  },
  dracula: {
    name: "Dracula",
    colors: { rail: "#1e1f29", side: "#21222c", chat: "#282a36", panel: "#191a21", hover: "#343746", active: "#44475a", input: "#343746", line: "#44475a", txt: "#f8f8f2", sub: "#a4a6c0", faint: "#6272a4", accent: "#bd93f9", accent2: "#a77bf3", bubbleMe: "#5a3d8a", bubble: "#343746", menu: "#15161d", wall: "#1f2029" },
  },
  catppuccin: {
    name: "Catppuccin Mocha",
    colors: { rail: "#11111b", side: "#181825", chat: "#1e1e2e", panel: "#14141f", hover: "#313244", active: "#45475a", input: "#313244", line: "#313244", txt: "#cdd6f4", sub: "#a6adc8", faint: "#7f849c", accent: "#cba6f7", accent2: "#b48ef0", bubbleMe: "#45386b", bubble: "#313244", menu: "#0d0d15", wall: "#181825" },
  },
  rosepine: {
    name: "Rosé Pine",
    colors: { rail: "#141221", side: "#1f1d2e", chat: "#191724", panel: "#16141f", hover: "#26233a", active: "#393552", input: "#26233a", line: "#2a273f", txt: "#e0def4", sub: "#908caa", faint: "#6e6a86", accent: "#ebbcba", accent2: "#e0a8a6", bubbleMe: "#3e2f45", bubble: "#26233a", menu: "#100e1a", wall: "#191724" },
  },
  cyberpunk: {
    name: "Cyberpunk",
    colors: { rail: "#0a0014", side: "#120024", chat: "#0d001a", panel: "#0f001e", hover: "#22003f", active: "#3a0066", input: "#1a0033", line: "#2b0052", txt: "#f0f0ff", sub: "#b39ddb", faint: "#7e57c2", accent: "#ff2a6d", accent2: "#05d9e8", bubbleMe: "#5c0a3a", bubble: "#1d0638", menu: "#07000f", wall: "#0d001a" },
  },
  forest: {
    name: "Forest",
    colors: { rail: "#0f1712", side: "#16211a", chat: "#1b2a21", panel: "#131d17", hover: "#24382c", active: "#2f4a3a", input: "#22342a", line: "#2a3f32", txt: "#e3efe6", sub: "#9db8a6", faint: "#6f8a78", accent: "#4ade80", accent2: "#22c55e", bubbleMe: "#1f5135", bubble: "#22342a", menu: "#0b120e", wall: "#16211a" },
  },
  sunset: {
    name: "Sunset",
    colors: { rail: "#1a0f14", side: "#24141b", chat: "#2b1820", panel: "#1f1117", hover: "#3a2029", active: "#4d2a36", input: "#382029", line: "#41242f", txt: "#fbe9e7", sub: "#d1a3a8", faint: "#9a6b72", accent: "#ff8a5b", accent2: "#ff6b6b", bubbleMe: "#6b2d3a", bubble: "#382029", menu: "#140b0f", wall: "#24141b" },
  },
};

export type FontDef = { name: string; stack: string; url: string | null };

const g = (family: string, weights = "400;500;600;700") =>
  `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weights}&display=swap`;

export const FONTS: Record<string, FontDef> = {
  default: { name: "Default (Inter)", stack: '"Inter", ui-sans-serif, system-ui, sans-serif', url: g("Inter") },
  system: { name: "System UI", stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', url: null },
  nunito: { name: "Nunito", stack: '"Nunito", sans-serif', url: g("Nunito") },
  poppins: { name: "Poppins", stack: '"Poppins", sans-serif', url: g("Poppins") },
  montserrat: { name: "Montserrat", stack: '"Montserrat", sans-serif', url: g("Montserrat") },
  spacegrotesk: { name: "Space Grotesk", stack: '"Space Grotesk", sans-serif', url: g("Space Grotesk") },
  outfit: { name: "Outfit", stack: '"Outfit", sans-serif', url: g("Outfit") },
  ubuntu: { name: "Ubuntu", stack: '"Ubuntu", sans-serif', url: g("Ubuntu", "400;500;700") },
  roboto: { name: "Roboto", stack: '"Roboto", sans-serif', url: g("Roboto", "400;500;700") },
  comic: { name: "Comic Neue", stack: '"Comic Neue", "Comic Sans MS", cursive', url: g("Comic Neue", "400;700") },
  mono: { name: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace', url: g("JetBrains Mono") },
  pixel: { name: "Pixel (Silkscreen)", stack: '"Silkscreen", monospace', url: g("Silkscreen", "400;700") },
};

export type Appearance = {
  theme: string;
  accent: string | null;
  bgImage: string | null;
  bgBlur: number; // px
  bgDim: number; // 0.3..1 brightness
  panelOpacity: number; // 0.4..1
  font: string;
  uiScale: number; // root font-size px (14..18)
  messageSize: number; // px
  compact: boolean;
  reduceMotion: boolean;
  customCss: string;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "discord",
  accent: null,
  bgImage: null,
  bgBlur: 0,
  bgDim: 0.75,
  panelOpacity: 0.78,
  font: "default",
  uiScale: 16,
  messageSize: 15,
  compact: false,
  reduceMotion: false,
  customCss: "",
};

export const APPEARANCE_KEY = "nexus.appearance";

/* eslint-disable no-var */
// Plain ES5-style on purpose: this function is stringified into the boot script.
export function paint(a: Appearance, themes: Record<string, ThemeDef>, fonts: Record<string, FontDef>) {
  var root = document.documentElement;
  var t = themes[a.theme] || themes.discord;
  var c = t.colors as unknown as Record<string, string>;
  var glass = !!a.bgImage;
  var op = a.panelOpacity == null ? 0.78 : a.panelOpacity;
  function rgba(hex: string, al: number) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return "rgb(" + ((n >> 16) & 255) + " " + ((n >> 8) & 255) + " " + (n & 255) + " / " + al + ")";
  }
  var names: Record<string, string> = {
    rail: "rail", side: "side", chat: "chat", panel: "panel", hover: "hover", active: "active", input: "input", line: "line",
    txt: "txt", sub: "sub", faint: "faint", accent: "accent", accent2: "accent-2", bubbleMe: "bubble-me", bubble: "bubble", menu: "menu", wall: "wall",
  };
  var see: Record<string, number> = { rail: 1, side: 1, chat: 1, panel: 1, wall: 0.25, input: 1, bubble: 1 };
  for (var k in names) {
    var v = c[k];
    if (a.accent && (k === "accent" || k === "accent2")) v = a.accent;
    if (glass && see[k]) v = rgba(v, Math.min(1, op * see[k]));
    root.style.setProperty("--color-" + names[k], v);
  }
  root.style.setProperty("--app-bg", glass ? 'url("' + String(a.bgImage).replace(/"/g, "%22") + '")' : "none");
  root.style.setProperty("--app-bg-blur", (a.bgBlur || 0) + "px");
  root.style.setProperty("--app-bg-dim", String(a.bgDim == null ? 0.75 : a.bgDim));
  root.classList.toggle("glass", glass);
  root.classList.toggle("reduce-motion", !!a.reduceMotion);
  root.classList.toggle("compact", !!a.compact);
  root.setAttribute("data-theme", a.theme);

  var f = fonts[a.font] || fonts["default"];
  root.style.setProperty("--app-font", f.stack);
  var link = document.getElementById("nexus-font") as HTMLLinkElement | null;
  if (f.url) {
    if (!link) {
      link = document.createElement("link");
      link.id = "nexus-font";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== f.url) link.href = f.url;
  } else if (link) {
    link.remove();
  }
  root.style.fontSize = (a.uiScale || 16) + "px";
  root.style.setProperty("--msg-size", (a.messageSize || 15) + "px");

  var css = document.getElementById("nexus-custom-css");
  if (!css) {
    css = document.createElement("style");
    css.id = "nexus-custom-css";
    document.head.appendChild(css);
  }
  css.textContent = a.customCss || "";
}
/* eslint-enable no-var */

// ------------------------------------------------------------------ avatar decorations

export const DECORATIONS: { id: string; name: string }[] = [
  { id: "", name: "None" },
  { id: "rainbow", name: "Rainbow" },
  { id: "fire", name: "Inferno" },
  { id: "neon", name: "Neon Pulse" },
  { id: "galaxy", name: "Galaxy" },
  { id: "gold", name: "Golden" },
  { id: "ice", name: "Frost" },
  { id: "toxic", name: "Toxic" },
  { id: "love", name: "Lovestruck" },
];

// ------------------------------------------------------------------ site roles

export type SiteRole = "owner" | "admin" | "moderator" | "vip" | "member";

export const ROLE_INFO: Record<SiteRole, { label: string; icon: string; color: string; rank: number; nameClass: string }> = {
  owner: { label: "Owner", icon: "👑", color: "#f0b232", rank: 4, nameClass: "name-owner" },
  admin: { label: "Admin", icon: "🛡️", color: "#ed4245", rank: 3, nameClass: "name-admin" },
  moderator: { label: "Moderator", icon: "🔨", color: "#3ba55d", rank: 2, nameClass: "name-mod" },
  vip: { label: "VIP", icon: "💎", color: "#eb459e", rank: 1, nameClass: "name-vip" },
  member: { label: "Member", icon: "", color: "", rank: 0, nameClass: "" },
};

export function roleRank(r: string | null | undefined) {
  return ROLE_INFO[(r ?? "member") as SiteRole]?.rank ?? 0;
}
