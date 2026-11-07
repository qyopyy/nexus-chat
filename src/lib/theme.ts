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
  light: {
    name: "Daylight",
    colors: { rail: "#e3e5e8", side: "#f2f3f5", chat: "#ffffff", panel: "#f2f3f5", hover: "#e8eaed", active: "#dcdfe4", input: "#e3e5e8", line: "#d4d7dc", txt: "#060607", sub: "#4e5058", faint: "#80848e", accent: "#5865f2", accent2: "#4752c4", bubbleMe: "#5865f2", bubble: "#e3e5e8", menu: "#ffffff", wall: "#f2f3f5" },
  },
  ocean: {
    name: "Deep Ocean",
    colors: { rail: "#06121c", side: "#0a1c2a", chat: "#0d2436", panel: "#081823", hover: "#143247", active: "#1a4059", input: "#123040", line: "#1a3a4f", txt: "#e8f4ff", sub: "#8fb4cc", faint: "#5e8096", accent: "#38bdf8", accent2: "#0ea5e9", bubbleMe: "#0c4a6e", bubble: "#123040", menu: "#040e16", wall: "#0a1c2a" },
  },
  graphite: {
    name: "Graphite Pro",
    colors: { rail: "#121417", side: "#181b20", chat: "#1e2228", panel: "#16191e", hover: "#2a2f37", active: "#353b45", input: "#252a32", line: "#2e343e", txt: "#eef0f3", sub: "#9aa3af", faint: "#6b7380", accent: "#a3e635", accent2: "#84cc16", bubbleMe: "#365314", bubble: "#252a32", menu: "#0d0f12", wall: "#181b20" },
  },
  vaporwave: {
    name: "Vaporwave",
    colors: { rail: "#1a0a2e", side: "#240e3d", chat: "#2d1450", panel: "#1e0b35", hover: "#3d1a66", active: "#4f2280", input: "#35185a", line: "#452070", txt: "#ffe6fb", sub: "#d4a5ff", faint: "#9b6bc9", accent: "#ff71ce", accent2: "#01cdfe", bubbleMe: "#6b1f7a", bubble: "#35185a", menu: "#12061f", wall: "#240e3d" },
  },
  ember: {
    name: "Ember",
    colors: { rail: "#140a08", side: "#1c100c", chat: "#241612", panel: "#18100c", hover: "#352018", active: "#462a1f", input: "#2e1c16", line: "#3a261c", txt: "#ffe8df", sub: "#c4a090", faint: "#8a6e60", accent: "#ff5722", accent2: "#ff9800", bubbleMe: "#7a2e14", bubble: "#2e1c16", menu: "#0e0705", wall: "#1c100c" },
  },
  juice999: {
    name: "Juice WRLD 999",
    colors: {
      rail: "#0a0a0a",
      side: "#121212",
      chat: "#0d0d0d",
      panel: "#101010",
      hover: "#1c1c1c",
      active: "#2a1010",
      input: "#181818",
      line: "#2a1515",
      txt: "#f5f5f5",
      sub: "#b8a0a0",
      faint: "#7a6060",
      accent: "#e10600",
      accent2: "#ff2a2a",
      bubbleMe: "#5c0a0a",
      bubble: "#1a1212",
      menu: "#080808",
      wall: "#0a0a0a",
    },
  },
  ksubi: {
    name: "Ksubi Black",
    colors: {
      rail: "#0b0b0b",
      side: "#141414",
      chat: "#101010",
      panel: "#121212",
      hover: "#1f1f1f",
      active: "#2a2a2a",
      input: "#1a1a1a",
      line: "#2c2c2c",
      txt: "#f2f2f2",
      sub: "#9a9a9a",
      faint: "#666666",
      accent: "#ffffff",
      accent2: "#d4d4d4",
      bubbleMe: "#2e2e2e",
      bubble: "#1a1a1a",
      menu: "#080808",
      wall: "#0f0f0f",
    },
  },
  ksubiDenim: {
    name: "Ksubi Denim",
    colors: {
      rail: "#0c1420",
      side: "#122033",
      chat: "#15263c",
      panel: "#101c2c",
      hover: "#1c334d",
      active: "#254463",
      input: "#18304a",
      line: "#2a4566",
      txt: "#e8f0fa",
      sub: "#9bb0c9",
      faint: "#6a8099",
      accent: "#5b8def",
      accent2: "#3d6fd4",
      bubbleMe: "#1e3a5f",
      bubble: "#18304a",
      menu: "#0a1018",
      wall: "#122033",
    },
  },
  ksubiBlood: {
    name: "Ksubi Blood",
    colors: {
      rail: "#120808",
      side: "#1a0c0c",
      chat: "#210f0f",
      panel: "#160a0a",
      hover: "#321616",
      active: "#4a1c1c",
      input: "#2a1212",
      line: "#3a1a1a",
      txt: "#ffe8e8",
      sub: "#c49a9a",
      faint: "#8a6666",
      accent: "#c41e3a",
      accent2: "#8b0000",
      bubbleMe: "#5c1414",
      bubble: "#2a1212",
      menu: "#0c0606",
      wall: "#1a0c0c",
    },
  },
  ksubiBone: {
    name: "Ksubi Bone",
    colors: {
      rail: "#1a1814",
      side: "#24201a",
      chat: "#2c271f",
      panel: "#1e1b16",
      hover: "#3a342a",
      active: "#4a4336",
      input: "#322c24",
      line: "#433c30",
      txt: "#f5efe4",
      sub: "#b8ad9a",
      faint: "#8a7f6e",
      accent: "#e8dcc8",
      accent2: "#c4b49a",
      bubbleMe: "#4a4030",
      bubble: "#322c24",
      menu: "#14120e",
      wall: "#24201a",
    },
  },
  ksubiAcid: {
    name: "Ksubi Acid",
    colors: {
      rail: "#0c1008",
      side: "#12180c",
      chat: "#182010",
      panel: "#10160a",
      hover: "#243018",
      active: "#324022",
      input: "#1c2814",
      line: "#2a3820",
      txt: "#f2ffe8",
      sub: "#a8c090",
      faint: "#708060",
      accent: "#c8ff00",
      accent2: "#a3e635",
      bubbleMe: "#3a5018",
      bubble: "#1c2814",
      menu: "#080c04",
      wall: "#12180c",
    },
  },
  ksubiPink: {
    name: "Ksubi Pink",
    colors: {
      rail: "#140a12",
      side: "#1e101a",
      chat: "#261420",
      panel: "#180e16",
      hover: "#3a1e30",
      active: "#4e2840",
      input: "#301824",
      line: "#422030",
      txt: "#ffe8f4",
      sub: "#d0a0b8",
      faint: "#9a7088",
      accent: "#ff4da6",
      accent2: "#ff7ab8",
      bubbleMe: "#6b2048",
      bubble: "#301824",
      menu: "#0e080c",
      wall: "#1e101a",
    },
  },
};

export type FontDef = { name: string; stack: string; url: string | null };

const g = (family: string, weights = "400;500;600;700") =>
  `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weights}&display=swap`;

export const FONTS: Record<string, FontDef> = {
  default: { name: "Default (Inter)", stack: '"Inter", ui-sans-serif, system-ui, sans-serif', url: g("Inter") },
  system: { name: "System UI", stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', url: null },
  // Sans
  manrope: { name: "Manrope", stack: '"Manrope", sans-serif', url: g("Manrope") },
  dmSans: { name: "DM Sans", stack: '"DM Sans", sans-serif', url: g("DM Sans") },
  jakarta: { name: "Plus Jakarta", stack: '"Plus Jakarta Sans", sans-serif', url: g("Plus Jakarta Sans") },
  nunito: { name: "Nunito", stack: '"Nunito", sans-serif', url: g("Nunito") },
  poppins: { name: "Poppins", stack: '"Poppins", sans-serif', url: g("Poppins") },
  montserrat: { name: "Montserrat", stack: '"Montserrat", sans-serif', url: g("Montserrat") },
  spacegrotesk: { name: "Space Grotesk", stack: '"Space Grotesk", sans-serif', url: g("Space Grotesk") },
  outfit: { name: "Outfit", stack: '"Outfit", sans-serif', url: g("Outfit") },
  ubuntu: { name: "Ubuntu", stack: '"Ubuntu", sans-serif', url: g("Ubuntu", "400;500;700") },
  roboto: { name: "Roboto", stack: '"Roboto", sans-serif', url: g("Roboto", "400;500;700") },
  ibmPlex: { name: "IBM Plex Sans", stack: '"IBM Plex Sans", sans-serif', url: g("IBM Plex Sans", "400;500;600;700") },
  syne: { name: "Syne", stack: '"Syne", sans-serif', url: g("Syne", "400;500;600;700") },
  // Serif / display
  sourceSerif: { name: "Source Serif", stack: '"Source Serif 4", Georgia, serif', url: g("Source Serif 4") },
  literata: { name: "Literata", stack: '"Literata", Georgia, serif', url: g("Literata") },
  fraunces: { name: "Fraunces", stack: '"Fraunces", Georgia, serif', url: g("Fraunces") },
  newsreader: { name: "Newsreader", stack: '"Newsreader", Georgia, serif', url: g("Newsreader") },
  // Fun / mono
  comic: { name: "Comic Neue", stack: '"Comic Neue", "Comic Sans MS", cursive', url: g("Comic Neue", "400;700") },
  mono: { name: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace', url: g("JetBrains Mono") },
  ibmMono: { name: "IBM Plex Mono", stack: '"IBM Plex Mono", ui-monospace, monospace', url: g("IBM Plex Mono", "400;500;600;700") },
  pixel: { name: "Pixel (Silkscreen)", stack: '"Silkscreen", monospace', url: g("Silkscreen", "400;700") },
};

/** Groups for Appearance → Font picker */
export const FONT_GROUPS: { id: string; label: string; fonts: string[] }[] = [
  { id: "sans", label: "Sans", fonts: ["default", "system", "manrope", "dmSans", "jakarta", "nunito", "poppins", "montserrat", "spacegrotesk", "outfit", "ubuntu", "roboto", "ibmPlex", "syne"] },
  { id: "serif", label: "Serif", fonts: ["sourceSerif", "literata", "fraunces", "newsreader"] },
  { id: "mono", label: "Mono & fun", fonts: ["mono", "ibmMono", "comic", "pixel"] },
];

/** Groups for Appearance → Theme picker (keeps Ksubi Pink discoverable) */
export const THEME_GROUPS: { id: string; label: string; themes: string[] }[] = [
  {
    id: "core",
    label: "Core",
    themes: ["discord", "telegram", "midnight", "nord", "dracula", "catppuccin", "rosepine", "light", "graphite"],
  },
  {
    id: "vibe",
    label: "Vibe",
    themes: ["cyberpunk", "forest", "sunset", "ocean", "vaporwave", "ember", "juice999"],
  },
  {
    id: "ksubi",
    label: "Ksubi",
    themes: ["ksubi", "ksubiDenim", "ksubiBlood", "ksubiBone", "ksubiAcid", "ksubiPink"],
  },
];

export type Appearance = {
  theme: string;
  accent: string | null;
  bgImage: string | null;
  /** optional looping video wallpaper (mp4/webm) — used with glass mode */
  bgVideo: string | null;
  /** curated animated CSS preset id, or null */
  bgAnim: string | null;
  bgBlur: number; // px
  bgDim: number; // 0.3..1 brightness
  panelOpacity: number; // 0.4..1
  font: string;
  uiScale: number; // root font-size px (14..18)
  messageSize: number; // px
  compact: boolean;
  /** Chat / Bump DM bubbles with tails (Telegram/Discord style) */
  messageBubbles: boolean;
  reduceMotion: boolean;
  customCss: string;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "discord",
  accent: null,
  bgImage: null,
  bgVideo: null,
  bgAnim: null,
  bgBlur: 0,
  bgDim: 0.75,
  panelOpacity: 0.78,
  font: "default",
  uiScale: 16,
  messageSize: 15,
  compact: false,
  messageBubbles: true,
  reduceMotion: false,
  customCss: "",
};

/** Curated animated wallpapers (CSS). Safe — no remote fetch. */
export const BG_ANIMS: Record<string, { name: string; css: string }> = {
  juice999: {
    name: "999 Pulse",
    css: `html.bg-anim-juice999 body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:
      radial-gradient(ellipse 80% 50% at 50% -10%,rgba(225,6,0,.35),transparent 55%),
      radial-gradient(circle at 85% 80%,rgba(255,42,42,.12),transparent 40%),
      repeating-linear-gradient(0deg,transparent,transparent 48px,rgba(225,6,0,.04) 48px,rgba(225,6,0,.04) 49px);
      animation:juice999pulse 8s ease-in-out infinite alternate}
      @keyframes juice999pulse{from{opacity:.75;filter:saturate(1)}to{opacity:1;filter:saturate(1.25)}}
      html.bg-anim-juice999 body::after{content:"999";position:fixed;right:4%;bottom:8%;z-index:0;pointer-events:none;font-size:clamp(64px,18vw,180px);font-weight:900;letter-spacing:-.06em;color:rgba(225,6,0,.08);line-height:1}`,
  },
  aurora: {
    name: "Aurora",
    css: `html.bg-anim-aurora body::before{background:linear-gradient(125deg,#0b1026,#1b2a6b,#0d9488,#7c3aed,#0b1026)!important;background-size:400% 400%!important;animation:nexusAurora 18s ease infinite!important;filter:brightness(var(--app-bg-dim,.75))!important}
@keyframes nexusAurora{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`,
  },
  mesh: {
    name: "Mesh pulse",
    css: `html.bg-anim-mesh body::before{background:
      radial-gradient(at 20% 20%,#5865f288 0,transparent 45%),
      radial-gradient(at 80% 10%,#eb459e77 0,transparent 40%),
      radial-gradient(at 50% 80%,#23a55a66 0,transparent 45%),
      #0b0d12!important;background-size:140% 140%!important;animation:nexusMesh 22s ease-in-out infinite alternate!important;filter:brightness(var(--app-bg-dim,.75))!important}
@keyframes nexusMesh{from{background-position:0% 0%}to{background-position:100% 100%}}`,
  },
  waves: {
    name: "Neon waves",
    css: `html.bg-anim-waves body::before{background:repeating-linear-gradient(100deg,#050510 0 12%,#ff2a6d33 12% 14%,#050510 14% 28%,#05d9e833 28% 30%)!important;background-size:220% 100%!important;animation:nexusWaves 14s linear infinite!important;filter:brightness(var(--app-bg-dim,.75)) blur(var(--app-bg-blur,0px))!important}
@keyframes nexusWaves{from{background-position:0 0}to{background-position:220% 0}}`,
  },
  stars: {
    name: "Starfield",
    css: `html.bg-anim-stars body::before{background:
      radial-gradient(1px 1px at 10% 20%,#fff8,transparent),
      radial-gradient(1px 1px at 30% 60%,#fff6,transparent),
      radial-gradient(1.5px 1.5px at 70% 40%,#fff9,transparent),
      radial-gradient(1px 1px at 90% 80%,#fff5,transparent),
      radial-gradient(1px 1px at 50% 10%,#fff7,transparent),
      #050714!important;animation:nexusStars 40s linear infinite!important;filter:brightness(var(--app-bg-dim,.75))!important}
@keyframes nexusStars{from{transform:translate3d(0,0,0)}to{transform:translate3d(-40px,-60px,0)}}`,
  },
  lava: {
    name: "Lava lamp",
    css: `html.bg-anim-lava body::before{background:
      radial-gradient(circle at 30% 40%,#ff5722aa 0 18%,transparent 42%),
      radial-gradient(circle at 70% 60%,#ff9800aa 0 16%,transparent 40%),
      radial-gradient(circle at 50% 20%,#e11d48aa 0 14%,transparent 38%),
      #1a0a08!important;background-size:160% 160%!important;animation:nexusLava 16s ease-in-out infinite alternate!important;filter:brightness(var(--app-bg-dim,.75)) blur(calc(var(--app-bg-blur,0px) + 8px))!important}
@keyframes nexusLava{from{background-position:0% 30%}to{background-position:100% 70%}}`,
  },
  ksubiPink: {
    name: "Ksubi Pink",
    css: `html.bg-anim-ksubiPink body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:
      radial-gradient(ellipse 90% 55% at 50% -15%,rgba(255,77,166,.42),transparent 58%),
      radial-gradient(circle at 12% 78%,rgba(255,122,184,.18),transparent 42%),
      radial-gradient(circle at 88% 30%,rgba(236,72,153,.14),transparent 38%),
      repeating-linear-gradient(0deg,transparent,transparent 52px,rgba(255,77,166,.045) 52px,rgba(255,77,166,.045) 53px);
      animation:ksubiPinkPulse 9s ease-in-out infinite alternate}
      @keyframes ksubiPinkPulse{from{opacity:.78;filter:saturate(1) hue-rotate(0deg)}to{opacity:1;filter:saturate(1.28) hue-rotate(-6deg)}}
      html.bg-anim-ksubiPink body::after{content:"♡";position:fixed;left:6%;bottom:10%;z-index:0;pointer-events:none;font-size:clamp(72px,16vw,160px);font-weight:700;color:rgba(255,77,166,.09);line-height:1}`,
  },
};

/** Map common BetterDiscord / Discord CSS variables → Nexus theme keys */
const BD_MAP: Record<string, keyof ThemeColors> = {
  "--background-tertiary": "rail",
  "--background-secondary": "side",
  "--background-primary": "chat",
  "--background-secondary-alt": "panel",
  "--background-modifier-hover": "hover",
  "--background-modifier-active": "active",
  "--background-modifier-selected": "active",
  "--input-background": "input",
  "--background-modifier-accent": "line",
  "--text-normal": "txt",
  "--text-muted": "sub",
  "--channels-default": "faint",
  "--brand-experiment": "accent",
  "--brand-experiment-560": "accent2",
  "--brand-500": "accent",
  "--header-primary": "txt",
  "--header-secondary": "sub",
};

/** Parse a BetterDiscord `.theme.css` (or any Discord :root CSS) into a partial Appearance. */
export function parseDiscordThemeCss(raw: string): Partial<Appearance> & { themeName?: string; colors?: Partial<ThemeColors> } {
  const css = String(raw || "");
  const name =
    css.match(/\/\*\s*Name:\s*(.+?)\s*\*\//i)?.[1]?.trim() ||
    css.match(/@name\s+(.+)/i)?.[1]?.trim() ||
    undefined;
  const block = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || css;
  const colors: Partial<ThemeColors> = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;}{]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const key = BD_MAP[m[1].toLowerCase()];
    if (!key) continue;
    let val = m[2].trim();
    // Discord often uses hsl(a) — keep as-is if not hex; paint() expects hex for rgba glass.
    const hex = val.match(/#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i)?.[0];
    if (hex) colors[key] = hex.length === 9 ? `#${hex.slice(1, 7)}` : hex;
  }
  // Prefer @import-only themes as customCss
  const imports = [...css.matchAll(/@import\s+url\((['"]?)([^)'"]+)\1\)\s*;?/gi)].map((x) => `@import url("${x[2]}");`).join("\n");
  const out: Partial<Appearance> & { themeName?: string; colors?: Partial<ThemeColors> } = { themeName: name, colors };
  if (imports) out.customCss = imports + (Object.keys(colors).length ? `\n\n${css}` : `\n\n${css}`);
  else if (Object.keys(colors).length < 3) out.customCss = css; // raw QuickCSS fallback
  return out;
}

export const APPEARANCE_KEY = "nexus.appearance";

/* eslint-disable no-var */
// Plain ES5-style on purpose: this function is stringified into the boot script.
export function paint(
  a: Appearance,
  themes: Record<string, ThemeDef>,
  fonts: Record<string, FontDef>,
  anims?: Record<string, { name: string; css: string }>,
) {
  var root = document.documentElement;
  var t = themes[a.theme] || themes.discord;
  var c = t.colors as unknown as Record<string, string>;
  var glass = !!(a.bgImage || a.bgVideo || a.bgAnim);
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
  root.style.setProperty("--app-bg", a.bgImage ? 'url("' + String(a.bgImage).replace(/"/g, "%22") + '")' : "none");
  root.style.setProperty("--app-bg-blur", (a.bgBlur || 0) + "px");
  root.style.setProperty("--app-bg-dim", String(a.bgDim == null ? 0.75 : a.bgDim));
  root.classList.toggle("glass", glass);
  root.classList.toggle("glass-video", !!a.bgVideo);
  root.classList.toggle("reduce-motion", !!a.reduceMotion);
  root.classList.toggle("compact", !!a.compact);
  root.setAttribute("data-theme", a.theme);
  // animated CSS wallpaper class
  var prevAnim = root.getAttribute("data-bg-anim");
  if (prevAnim) root.classList.remove("bg-anim-" + prevAnim);
  if (a.bgAnim) {
    root.setAttribute("data-bg-anim", a.bgAnim);
    root.classList.add("bg-anim-" + a.bgAnim);
  } else {
    root.removeAttribute("data-bg-anim");
  }
  // video wallpaper element
  var vid = document.getElementById("nexus-bg-video") as HTMLVideoElement | null;
  if (a.bgVideo) {
    if (!vid) {
      vid = document.createElement("video");
      vid.id = "nexus-bg-video";
      vid.muted = true;
      vid.loop = true;
      vid.autoplay = true;
      vid.playsInline = true;
      vid.setAttribute("playsinline", "");
      vid.setAttribute("aria-hidden", "true");
      document.body.prepend(vid);
    }
    if (vid.src !== a.bgVideo) {
      vid.src = a.bgVideo;
      void vid.play().catch(function () {});
    }
  } else if (vid) {
    vid.remove();
  }

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
  // default size on very narrow phones (≤340px) steps down one notch so layouts don't crowd; a chosen size is respected
  const base = a.uiScale || 16;
  root.style.fontSize = (base === 16 && typeof window !== "undefined" && window.innerWidth <= 340 ? 15 : base) + "px";
  root.style.setProperty("--msg-size", (a.messageSize || 15) + "px");
  root.classList.toggle("msg-bubbles", a.messageBubbles !== false);
  root.classList.toggle("msg-flat", a.messageBubbles === false);

  var css = document.getElementById("nexus-custom-css");
  if (!css) {
    css = document.createElement("style");
    css.id = "nexus-custom-css";
    document.head.appendChild(css);
  }
  var animCss = "";
  if (a.bgAnim && anims && anims[a.bgAnim]) animCss = anims[a.bgAnim].css + "\n";
  css.textContent = animCss + (a.customCss || "");
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
