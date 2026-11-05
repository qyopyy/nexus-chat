"use client";

import { useEffect, useState } from "react";
import { useApp, toast } from "@/store/app";
import { supabase } from "@/lib/supabase";
import { setPref, usePrefs, PREF_DEFAULTS, fmtClock, fmtDateShort, type MessageSoundId } from "@/lib/prefs";
import { connectSpotify, disconnectSpotify, setShare, startSpotifySync, syncNow, refreshLink, useSpotifyUser } from "@/lib/spotifyUser";
import { NowPlayingCard, SpotifyMark, liveNow } from "@/components/profile/NowPlaying";
import { download } from "@/lib/dsp";
import { roleRank } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { UserStatus } from "@/lib/types";
import { H, Label, Select, Slider, Toggle } from "./settingsUi";
import { claimUsername, loadAliases, makePrimary, releaseUsername, useAliases } from "@/lib/usernames";
import { NexusCredit, copyNexusAppLink } from "@/components/ui/NexusCredit";
import { shareAppUrl } from "@/lib/seo";
import { MESSAGE_SOUNDS, sfx } from "@/lib/sounds";

const Hr = () => <div className="my-8 h-px bg-line" />;

/* ───────────────────────── Connections ───────────────────────── */

export function ConnectionsSection() {
  const { connected, link, loaded, share } = useSpotifyUser();
  const np = useApp((s) => liveNow(s.userId ? s.profiles[s.userId]?.now_playing : null));
  const staff = useApp((s) => roleRank(s.userId ? s.profiles[s.userId]?.site_role : null) >= 3);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    startSpotifySync();
    void refreshLink();
  }, []);

  return (
    <>
      <H>Connections</H>
      <p className="-mt-3 mb-6 text-sm text-sub">Link your accounts to show what you&apos;re up to. Only you can connect or remove them.</p>

      <div className="overflow-hidden rounded-2xl bg-side ring-1 ring-line">
        <div className="flex items-center gap-3 p-4" style={{ background: "linear-gradient(135deg,#1DB95433,transparent)" }}>
          <SpotifyMark className="size-11" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">Spotify</div>
            <div className="text-sm text-sub">
              {connected ? (
                <>
                  Connected as <b className="text-txt">{link?.name ?? "you"}</b>
                  {link?.product && <span> · {link.product === "premium" ? "Premium" : "Free"}</span>}
                </>
              ) : (
                "Show “Listening to” on your profile with the song, artist, album and cover."
              )}
            </div>
          </div>
          {connected && link?.avatar && <img src={link.avatar} alt="" className="size-10 rounded-full object-cover" />}
        </div>

        <div className="space-y-1 p-4 pt-2">
          {!loaded ? (
            <div className="h-11 animate-pulse rounded-full bg-hover" />
          ) : !connected ? (
            <>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await connectSpotify();
                  } catch (e) {
                    toast((e as Error).message, "error");
                    setBusy(false);
                  }
                }}
                className="w-full rounded-full bg-[#1DB954] py-3 font-bold text-black transition hover:brightness-110 active:scale-[.99] disabled:opacity-60"
              >
                {busy ? "Opening Spotify…" : "Connect Spotify"}
              </button>
              <ul className="mt-3 space-y-1 text-sm text-sub">
                <li>🎧 Your profile, member list and friends list show what you&apos;re playing — live, with a progress bar</li>
                <li>🔄 Keeps updating every minute even when Nexus is closed</li>
                <li>📚 Unlocks your Spotify library in Music</li>
                <li>🔒 We only read what you&apos;re playing and your library — never your password</li>
              </ul>
            </>
          ) : (
            <>
              <Toggle label="Display “Listening to” on my profile" hint="Shows the track, artists, album and cover to everyone who opens your profile." checked={share} onChange={(v) => void setShare(v)} />
              {share && (
                <div className="pt-3">
                  <Label>Preview</Label>
                  {np ? (
                    <NowPlayingCard np={np} />
                  ) : (
                    <div className="rounded-xl bg-black/20 p-4 text-sm text-sub">Nothing playing right now. Start a song on Spotify — it shows up here within a few seconds.</div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-3">
                <button
                  onClick={async () => {
                    await syncNow(true);
                    toast("Synced with Spotify", "success");
                  }}
                  className="rounded-full bg-hover px-4 py-2 text-sm font-semibold"
                >
                  Sync now
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Disconnect Spotify? Your “Listening to” disappears from your profile.")) await disconnectSpotify();
                  }}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-dnd hover:bg-dnd/10"
                >
                  Disconnect
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {staff && (
        <p className="mt-3 rounded-lg bg-idle/10 p-3 text-xs text-idle">
          Admin note: while the Spotify app is in Development Mode, Spotify only lets accounts listed under User Management in the Spotify developer dashboard sign in. Request extended access there to open it to everyone.
        </p>
      )}
    </>
  );
}

/* ───────────────────────── Privacy & Safety ───────────────────────── */

type Privacy = {
  dm_from: "everyone" | "servers" | "friends" | "nobody";
  friend_requests: "everyone" | "mutuals" | "nobody";
  game_invites: boolean;
  show_stats: boolean;
  show_online: boolean;
  read_receipts: boolean;
  profile_discoverable: boolean;
};
const PRIV_DEF: Privacy = {
  dm_from: "servers",
  friend_requests: "everyone",
  game_invites: true,
  show_stats: true,
  show_online: true,
  read_receipts: true,
  profile_discoverable: true,
};

export function PrivacySection() {
  const me = useApp((s) => s.userId);
  const myStatus = useApp((s) => s.myStatus);
  const [p, setP] = useState<Privacy | null>(null);
  const sp = useSpotifyUser();
  useEffect(() => {
    if (!me) return;
    void supabase
      .from("user_privacy")
      .select("dm_from,friend_requests,game_invites,show_stats,show_online,read_receipts,profile_discoverable")
      .eq("user_id", me)
      .maybeSingle()
      .then(({ data }) => {
        const raw = (data as Privacy | null) ?? null;
        // Legacy: "everyone" used to mean friends+servers before true Everyone existed
        const dm =
          raw?.dm_from === "everyone" || raw?.dm_from === "servers" || raw?.dm_from === "friends" || raw?.dm_from === "nobody"
            ? raw.dm_from
            : PRIV_DEF.dm_from;
        setP({ ...PRIV_DEF, ...raw, dm_from: dm });
      });
    startSpotifySync();
  }, [me]);

  const save = async (patch: Partial<Privacy>) => {
    if (!me || !p) return;
    const next = { ...p, ...patch };
    setP(next);
    const { error } = await supabase.from("user_privacy").upsert({ user_id: me, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) {
      setP(p);
      toast(error.message, "error");
    } else toast("Saved", "success");
  };

  return (
    <>
      <H>Privacy &amp; Safety</H>
      {!p ? (
        <div className="h-40 animate-pulse rounded-xl bg-side" />
      ) : (
        <>
          <Label>Who can start a DM with you</Label>
          <p className="mb-2 text-sm text-sub">Applies to new chats only — existing conversations stay open.</p>
          <Select
            value={p.dm_from}
            onChange={(v) => void save({ dm_from: v as Privacy["dm_from"] })}
            options={[
              { value: "everyone", label: "Everyone on Nexus" },
              { value: "servers", label: "Friends and people in my servers" },
              { value: "friends", label: "Friends only" },
              { value: "nobody", label: "Nobody (no new DMs)" },
            ]}
          />
          <div className="h-6" />
          <Label>Friend requests</Label>
          <Select
            value={p.friend_requests}
            onChange={(v) => void save({ friend_requests: v as Privacy["friend_requests"] })}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "mutuals", label: "Friends of friends and server members" },
              { value: "nobody", label: "Nobody" },
            ]}
          />
          <div className="h-4" />
          <Toggle label="Allow game invites" hint="Friends can send you a “join my game” popup." checked={p.game_invites} onChange={(v) => void save({ game_invites: v })} />
          <Toggle label="Show my profile views and likes" hint="When off, other people can still like your profile but won't see the numbers." checked={p.show_stats} onChange={(v) => void save({ show_stats: v })} />
          <Toggle label="Show when I'm online" hint="Off hides your green/idle/busy status from other people." checked={p.show_online} onChange={(v) => void save({ show_online: v })} />
          <Toggle label="Send read receipts" hint="When off, others won't see that you've read their DMs." checked={p.read_receipts} onChange={(v) => void save({ read_receipts: v })} />
          <Toggle label="Discoverable in search" hint="When off, your profile is harder to find from People search." checked={p.profile_discoverable} onChange={(v) => void save({ profile_discoverable: v })} />
        </>
      )}

      <Hr />
      <Label>Activity</Label>
      <div className="mb-2">
        <Select
          value={myStatus}
          onChange={(v) => useApp.setState({ myStatus: v as UserStatus })}
          options={[
            { value: "online", label: "🟢 Online" },
            { value: "idle", label: "🌙 Idle" },
            { value: "dnd", label: "⛔ Do not disturb" },
            { value: "invisible", label: "👻 Invisible (appear offline)" },
          ]}
        />
      </div>
      {sp.connected ? (
        <Toggle label="Share what I'm listening to on Spotify" checked={sp.share} onChange={(v) => void setShare(v)} />
      ) : (
        <p className="py-2 text-sm text-sub">Connect Spotify in Connections to show what you&apos;re listening to.</p>
      )}
      <p className="pt-3 text-sm text-sub">Typing indicators and live typing are in Chat &amp; Typing.</p>
    </>
  );
}

/* ───────────────────────── Accessibility ───────────────────────── */

export function AccessibilitySection() {
  const p = usePrefs();
  return (
    <>
      <H>Accessibility</H>
      <Label>Motion</Label>
      <Toggle label="Reduce motion" hint="Turns off animations, transitions and moving effects across the app." checked={p.reduceMotion} onChange={(v) => setPref("reduceMotion", v)} />
      <Toggle label="Play chat effects" hint="Fireworks, confetti and other full-screen message effects." checked={p.chatEffects} onChange={(v) => setPref("chatEffects", v)} />
      <Toggle label="Show animated profile effects" hint="Effects on other people's profiles (yours always shows for you)." checked={p.othersProfileFx} onChange={(v) => setPref("othersProfileFx", v)} />
      <Hr />
      <Label>Visibility</Label>
      <Toggle label="High contrast" hint="Brighter text and borders, strong focus outlines." checked={p.highContrast} onChange={(v) => setPref("highContrast", v)} />
      <Toggle label="Always underline links" checked={p.underlineLinks} onChange={(v) => setPref("underlineLinks", v)} />
      <Toggle label="Larger buttons" hint="Bigger tap targets for touch and motor accessibility." checked={p.bigTargets} onChange={(v) => setPref("bigTargets", v)} />
      <div className="py-3">
        <div className="mb-1 font-medium">Color saturation</div>
        <Slider value={p.saturation - 40} max={60} onChange={(v) => setPref("saturation", Math.round(40 + v))} format={(v) => `${Math.round(40 + v)}%`} />
      </div>
    </>
  );
}

/* ───────────────────── Chat behaviour (inside Chat & Typing) ───────────────────── */

export function ChatPrefsBlock() {
  const p = usePrefs();
  const now = new Date();
  return (
    <>
      <Hr />
      <Label>Messages</Label>
      <Toggle label="Enter sends the message" hint={p.enterToSend ? "Shift + Enter makes a new line." : "Enter makes a new line — press Ctrl/⌘ + Enter to send."} checked={p.enterToSend} onChange={(v) => setPref("enterToSend", v)} />
      <Toggle label="Big emoji" hint="Messages with only emoji show large." checked={p.jumboEmoji} onChange={(v) => setPref("jumboEmoji", v)} />
      <Toggle label="Always reveal spoilers" hint="Text wrapped in ||double bars|| is hidden until clicked." checked={p.spoilersAutoReveal} onChange={(v) => setPref("spoilersAutoReveal", v)} />
      <Toggle label="Play message effects" checked={p.chatEffects} onChange={(v) => setPref("chatEffects", v)} />
      <Hr />
      <Label>Time &amp; date</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-sm text-sub">Clock</div>
          <Select
            value={p.clock}
            onChange={(v) => setPref("clock", v as typeof p.clock)}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "24", label: "24-hour (14:05)" },
              { value: "12", label: "12-hour (2:05 PM)" },
            ]}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-sub">Date</div>
          <Select
            value={p.dateFormat}
            onChange={(v) => setPref("dateFormat", v as typeof p.dateFormat)}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "dmy", label: "Day / month / year" },
              { value: "mdy", label: "Month / day / year" },
              { value: "ymd", label: "Year-month-day" },
            ]}
          />
        </div>
      </div>
      <p className="mt-2 text-sm text-sub">
        Preview: {fmtClock(now)} · {fmtDateShort(now)}
      </p>
      <Hr />
      <Label>Sounds</Label>
      <Toggle label="App sounds" hint="Message, join/leave, mute and screen-share sounds." checked={p.uiSounds} onChange={(v) => setPref("uiSounds", v)} />
      <Toggle
        label="Button FX"
        hint="Soft click sound when you tap buttons and links. Toggle on or off anytime."
        checked={p.buttonFx !== false}
        onChange={(v) => setPref("buttonFx", v)}
      />
      <Toggle
        label="Welcome screen"
        hint="Discord-style splash with a soft chime when Nexus opens. Turn off to skip it."
        checked={p.welcomeSplash !== false}
        onChange={(v) => setPref("welcomeSplash", v)}
      />
      <Toggle label="Call ringtone" checked={p.ringtone} onChange={(v) => setPref("ringtone", v)} />
      <Toggle
        label="Incoming message sound"
        hint="Plays when someone messages you (respects Do Not Disturb and mute)."
        checked={p.messageSounds !== false}
        onChange={(v) => setPref("messageSounds", v)}
      />
      <Toggle
        label="Send sound"
        hint="Short click when you send a message."
        checked={p.sendSounds !== false}
        onChange={(v) => setPref("sendSounds", v)}
      />
      <div className={cn("space-y-4 py-2", !p.uiSounds && "pointer-events-none opacity-50")}>
        <SoundPicker
          label="Incoming sound"
          value={p.messageSound ?? "ping"}
          onChange={(v) => {
            setPref("messageSound", v);
            sfx.previewMessage(v, "recv");
          }}
          onPreview={() => sfx.previewMessage(p.messageSound ?? "ping", "recv")}
        />
        <SoundPicker
          label="Send sound"
          value={p.sendSound ?? "pop"}
          onChange={(v) => {
            setPref("sendSound", v);
            sfx.previewMessage(v, "send");
          }}
          onPreview={() => sfx.previewMessage(p.sendSound ?? "pop", "send")}
        />
      </div>
      <div className={cn("py-3", !p.uiSounds && p.buttonFx === false && p.welcomeSplash === false && "pointer-events-none opacity-50")}>
        <div className="mb-1 font-medium">Sound volume</div>
        <Slider value={p.uiVolume} max={1} onChange={(v) => setPref("uiVolume", v)} format={(v) => `${Math.round(v * 100)}%`} />
      </div>
    </>
  );
}

function SoundPicker({
  label,
  value,
  onChange,
  onPreview,
}: {
  label: string;
  value: MessageSoundId;
  onChange: (v: MessageSoundId) => void;
  onPreview: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-sm text-sub">{label}</div>
        <button
          type="button"
          onClick={onPreview}
          className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10"
        >
          Preview
        </button>
      </div>
      <Select
        value={value}
        onChange={(v) => onChange(v as MessageSoundId)}
        options={MESSAGE_SOUNDS.map((s) => ({ value: s.id, label: s.label }))}
      />
      <p className="mt-1 text-[11px] text-faint">{MESSAGE_SOUNDS.find((s) => s.id === value)?.hint}</p>
    </div>
  );
}

/* ───────────────────────── Data & Advanced ───────────────────────── */

const KEYS: [string, string][] = [
  ["Enter", "Send message"],
  ["Shift + Enter", "New line"],
  ["Ctrl/⌘ + Enter", "Send (when Enter makes a new line)"],
  ["↑ in an empty box", "Edit your last message"],
  ["Esc", "Cancel reply / close a window"],
  ["**bold** / __underline__ / ~~strike~~", "Discord-style formatting"],
  ["||spoiler||", "Spoiler (click to reveal)"],
  ["{c:blue}text{/c}", "Colored text"],
  ["{v:30s}secret{/v}", "Vanish selection after duration"],
  ["{rainbow}wow{/rainbow}", "Rainbow text"],
];

export function AdvancedSection() {
  const p = usePrefs();
  const me = useApp((s) => s.userId);
  const [busy, setBusy] = useState(false);

  const exportData = async () => {
    if (!me) return;
    setBusy(true);
    try {
      const [profile, msgs, friends, spaces, privacy] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", me).maybeSingle(),
        supabase.from("messages").select("*").eq("author_id", me).order("created_at", { ascending: false }).limit(10000),
        supabase.from("friendships").select("requester_id,addressee_id,status,created_at"),
        supabase.from("space_members").select("*").eq("user_id", me),
        supabase.from("user_privacy").select("*").eq("user_id", me).maybeSingle(),
      ]);
      const out = {
        exported_at: new Date().toISOString(),
        profile: profile.data,
        privacy: privacy.data,
        device_settings: usePrefs.getState(),
        friendships: friends.data ?? [],
        servers: spaces.data ?? [],
        messages: msgs.data ?? [],
      };
      download(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }), `nexus-data-${new Date().toISOString().slice(0, 10)}.json`);
      toast(`Exported ${(msgs.data ?? []).length.toLocaleString()} messages`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };

  return (
    <>
      <H>Data &amp; Advanced</H>
      <Label>Your data</Label>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void exportData()} className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {busy ? "Preparing…" : "Download my data (JSON)"}
        </button>
        <button
          onClick={async () => {
            if (!confirm("Sign out of Nexus on every device, including this one?")) return;
            await supabase.auth.signOut({ scope: "global" });
          }}
          className="rounded-full bg-hover px-4 py-2 text-sm font-semibold"
        >
          Sign out everywhere
        </button>
        <button
          onClick={() => {
            if (!confirm("Reset all settings on this device (theme, sounds, accessibility, typing)? You stay signed in.")) return;
            try {
              for (const k of Object.keys(localStorage)) if (k.startsWith("nexus")) localStorage.removeItem(k);
            } catch {
              /* storage unavailable */
            }
            usePrefs.setState({ ...PREF_DEFAULTS });
            location.reload();
          }}
          className="rounded-full px-4 py-2 text-sm font-semibold text-dnd hover:bg-dnd/10"
        >
          Reset device settings
        </button>
      </div>
      <Hr />
      <Label>Keyboard shortcuts</Label>
      <div className="divide-y divide-line/60 rounded-xl bg-side">
        {KEYS.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="text-sub">{d}</span>
            <kbd className="rounded-md bg-rail px-2 py-0.5 font-mono text-xs">{k}</kbd>
          </div>
        ))}
      </div>
      <Hr />
      <Label>Share Nexus</Label>
      <p className="mb-2 text-sm text-sub">Invite friends with the app link. Works on web and when Nexus is installed as an app.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void copyNexusAppLink()} className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white">
          Share / copy app link
        </button>
        <code className="rounded-lg bg-side px-3 py-2 text-xs break-all text-sub">{shareAppUrl()}</code>
      </div>
      <NexusCredit className="mt-4" />
      <Hr />
      <Label>Advanced</Label>
      <Toggle label="Developer mode" hint="Adds “Copy ID” to profiles for bots, support and integrations." checked={p.devMode} onChange={(v) => setPref("devMode", v)} />
    </>
  );
}

/* ───────────────────────── Usernames (inside My Account) ───────────────────────── */

export function UsernamesField() {
  const me = useApp((s) => s.userId);
  const main = useApp((s) => (s.userId ? s.profiles[s.userId]?.username : "") ?? "");
  const tier = useApp((s) => (s.userId ? s.profiles[s.userId]?.premium_tier : null));
  const list = useAliases((s) => (me ? s.byUser[me] : undefined));
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me) void loadAliases(me);
  }, [me]);
  const limit = tier ? 10 : 5;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  const clean = (s: string) => s.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_.]/g, "").slice(0, 24);
  return (
    <div>
      <Label>Usernames</Label>
      <p className="-mt-1 mb-2 text-xs text-sub">People can add you, find you and message you with any of these. Your main one shows on your profile.</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1.5 text-sm font-bold text-accent">
          @{main} <span className="rounded bg-accent px-1 text-[10px] text-white">MAIN</span>
        </span>
        {(list ?? []).map((u) => (
          <span key={u} className="group flex items-center gap-1 rounded-full bg-rail py-1 pr-1 pl-3 text-sm font-semibold">
            @{u}
            <button disabled={busy} onClick={() => void run(() => makePrimary(u), `@${u} is now your main username`)} className="rounded-full px-2 py-0.5 text-[11px] text-sub hover:bg-hover hover:text-txt" title="Make this my main username">
              Make main
            </button>
            <button
              disabled={busy}
              onClick={() => confirm(`Release @${u}? Someone else could claim it.`) && void run(() => releaseUsername(u), `Released @${u}`)}
              className="grid size-6 place-items-center rounded-full text-sub hover:bg-dnd/20 hover:text-dnd"
              aria-label={`Remove @${u}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = clean(val);
          if (v.length < 3) return toast("Usernames are at least 3 characters", "error");
          void run(async () => {
            await claimUsername(v);
            setVal("");
          }, `@${v} is yours`);
        }}
      >
        <div className="flex flex-1 items-center rounded-md bg-rail px-3 focus-within:ring-2 focus-within:ring-accent/60">
          <span className="text-sub">@</span>
          <input value={val} onChange={(e) => setVal(clean(e.target.value))} placeholder="another username" className="w-full bg-transparent px-1 py-2 outline-none" />
        </div>
        <button disabled={busy || !val || (list?.length ?? 0) >= limit} className="rounded-md bg-accent px-4 font-bold text-white disabled:opacity-50">
          Save
        </button>
      </form>
      <div className="mt-1 text-right text-xs text-faint">
        {list?.length ?? 0}/{limit} extra{!tier && " · 10 with Premium"}
      </div>
    </div>
  );
}
