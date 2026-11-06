/** Discord-style startup tips / fun facts shown under the welcome splash. */

export const WELCOME_FACTS: string[] = [
  "Did you know? You can mute a server without leaving — right-click it in settings or the server menu.",
  "Tip: Hold the send button to add a message effect before it flies off.",
  "Fun fact: Shorts can be up to 3 minutes — vertical video, TikTok energy, Nexus style.",
  "Pro tip: Spoilers use ||double pipes|| so friends can choose when to peek.",
  "Did you know? Press ↑ in an empty chat box to edit your last message.",
  "Tip: Drag files into chat, or paste a screenshot straight from your clipboard.",
  "Fun fact: Themes live in Settings → Appearance — Core, Vibe, and Ksubi packs (try Ksubi Pink).",
  "Tip: Nexus Drive holds any file with unlimited storage and Proton-style private share links.",
  "Fun fact: Chat and Drive video uploads lock to Full HD at 60fps for crisp playback.",
  "Pro tip: Customize the left rail — folders, reorder icons, and share a layout template.",
  "Did you know? Wump (formerly Bump) shares a rounded location so friends and family can find you nearby.",
  "Tip: Turn Button FX off in Sounds if you want silent taps.",
  "Fun fact: NexusGram stories expire in 24h or 48h — post a vibe, then let it fade.",
  "Pro tip: Favorite servers float to the top of your rail until you set a custom order.",
  "Did you know? Type discordo on the desktop welcome screen for a tiny easter egg.",
  "Tip: Slow mode keeps busy channels readable — set it per channel if you're staff.",
  "Fun fact: Voice calls show live ping so you can spot a laggy connection early.",
  "Pro tip: Upload menu music from your user panel and listen while you browse.",
  "Did you know? You can import BetterDiscord / Vencord .theme.css in Appearance.",
  "Tip: Use the Groups filter in chats to see only group DMs.",
  "Fun fact: Nexus Radio lets people listen and jam together in real time.",
  "Pro tip: Pin important messages so the whole channel can find them later.",
  "Did you know? Mark a whole server as read with one tap from My Servers.",
  "Tip: Compact mode in Appearance squeezes more chat into one screen.",
  "Fun fact: Pulse is the Twitter-style feed — short posts, big energy.",
  "Pro tip: Link a YouTube channel in Shorts → YouTube to watch original embeds.",
  "Did you know? Gift links can unlock Lighting premium for a friend.",
  "Tip: Reorder servers with the ↕ button, then left-click ↑↓ — no drag needed.",
  "Fun fact: The welcome chime is synthesized in your browser — no audio files shipped.",
  "Pro tip: Do Not Disturb mutes notifications and incoming call rings.",
  "Did you know? Animated wallpapers and video backgrounds work with glass panels.",
  "Tip: Escape closes reply mode, pickers, and most popups in one hit.",
];

const EGG_FACTS: string[] = [
  "Discordo fact: this title only flips on the Windows .exe and Mac .dmg shells.",
  "Discordo tip: the blurple flash is temporary — Nexus comes back in a blink.",
  "Discordo: you typed the secret. Absolute cinema.",
];

/** Stable-ish pick for this session so remounts don't flicker a new tip. */
export function pickWelcomeFact(egg = false): string {
  const pool = egg ? EGG_FACTS : WELCOME_FACTS;
  if (typeof window === "undefined") return pool[0];
  const key = egg ? "nexus.welcome.eggFact" : "nexus.welcome.fact";
  try {
    const cached = sessionStorage.getItem(key);
    if (cached && pool.includes(cached)) return cached;
  } catch {
    /* ignore */
  }
  // Prefer a fact the user hasn't seen recently
  let idx = Math.floor(Math.random() * pool.length);
  try {
    const last = Number(localStorage.getItem("nexus.welcome.factIdx") ?? "-1");
    if (!egg && pool.length > 1 && idx === last) idx = (idx + 1) % pool.length;
    if (!egg) localStorage.setItem("nexus.welcome.factIdx", String(idx));
    const fact = pool[idx];
    sessionStorage.setItem(key, fact);
    return fact;
  } catch {
    return pool[idx];
  }
}
