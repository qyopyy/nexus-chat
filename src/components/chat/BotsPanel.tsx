"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Copy, Link2, Plus, Server, Trash2, Webhook } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { supabase, errorText } from "@/lib/supabase";
import { runBotCommand, sendMessage } from "@/lib/data";
import {
  SYSTEM_BOTS,
  botInviteUrl,
  botPublicUrl,
  communityWebhookUrl,
  createCommunityBot,
  deleteCommunityBot,
  installBotToSpace,
  listCommunityBots,
  listSpaceBotInstalls,
  uninstallBot,
  type BotCard,
  type BotCommandDef,
  type CommunityBot,
  type SystemBotKey,
} from "@/lib/bots";
import Modal from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

const FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://fcnabeudhdlugruqzezn.supabase.co"}/functions/v1/bots`;

type Hook = { id: string; name: string; token: string; uses: number; created_by: string; created_at: string };

const COMMANDS: { bot: string; emoji: string; cmd: string; hint: string }[] = [
  { bot: "Nexus Bot", emoji: "🤖", cmd: "/help", hint: "list every command" },
  { bot: "Nexus Bot", emoji: "🎲", cmd: "/roll 2d6", hint: "roll dice" },
  { bot: "Nexus Bot", emoji: "🪙", cmd: "/flip", hint: "heads or tails" },
  { bot: "Nexus Bot", emoji: "🎱", cmd: "/8ball Will it chart?", hint: "magic 8-ball" },
  { bot: "Nexus Bot", emoji: "🤔", cmd: "/choose pizza, sushi, tacos", hint: "pick one" },
  { bot: "Music Bot", emoji: "🎵", cmd: "/isrc Song Title — Artist", hint: "Audia ISRC (Distribution plan)" },
  { bot: "Music Bot", emoji: "🔎", cmd: "/song ", hint: "find a track (Spotify-first)" },
  { bot: "Music Bot", emoji: "💿", cmd: "/upc ", hint: "look up an album by UPC" },
  { bot: "Spotify Bot", emoji: "🎧", cmd: "/spotify ", hint: "search Spotify tracks" },
  { bot: "Spotify Bot", emoji: "💿", cmd: "/album ", hint: "search Spotify albums" },
  { bot: "Spotify Bot", emoji: "🎤", cmd: "/artist ", hint: "search Spotify artists" },
  { bot: "Fun Bot", emoji: "😄", cmd: "/joke", hint: "random joke" },
  { bot: "Fun Bot", emoji: "📌", cmd: "/fact", hint: "music fact" },
  { bot: "Fun Bot", emoji: "✊", cmd: "/rps rock", hint: "rock paper scissors" },
  { bot: "Fun Bot", emoji: "⭐", cmd: "/rate ", hint: "rate anything /10" },
  { bot: "Fun Bot", emoji: "💘", cmd: "/ship a, b", hint: "compatibility %" },
  { bot: "Trivia Bot", emoji: "🧠", cmd: "/trivia", hint: "start a round" },
  { bot: "Trivia Bot", emoji: "✅", cmd: "/answer ", hint: "guess the answer" },
  { bot: "Order Bot", emoji: "💜", cmd: "/premium", hint: "plans & prices" },
  { bot: "Order Bot", emoji: "🧾", cmd: "/orders", hint: "your order status" },
];

type Tab = "directory" | "commands" | "create" | "webhooks" | "server";

/** bots directory, create-your-own, slash commands, webhooks, invite to server */
export default function BotsPanel({
  conversationId,
  open,
  onClose,
  spaceId,
  initialTab,
  inviteSlug,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  spaceId?: string | null;
  initialTab?: Tab;
  inviteSlug?: string | null;
}) {
  const me = useApp((s) => s.userId);
  const spaces = useApp((s) => s.spaces);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab ?? "directory");
  const [community, setCommunity] = useState<CommunityBot[]>([]);
  const [mine, setMine] = useState<CommunityBot[]>([]);
  const [installs, setInstalls] = useState<any[]>([]);
  const [inviteSpace, setInviteSpace] = useState(spaceId ?? spaces[0]?.id ?? "");
  const [pendingInvite, setPendingInvite] = useState<BotCard | null>(null);

  // create form
  const [cSlug, setCSlug] = useState("");
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cColor, setCColor] = useState("#5865F2");
  const [cCmds, setCCmds] = useState<BotCommandDef[]>([{ cmd: "hello", reply: "Hey {user}! 👋" }]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("chat_webhooks").select("id, name, token, uses, created_by, created_at").eq("conversation_id", conversationId).order("created_at");
    setHooks((data ?? []) as Hook[]);
    setCommunity(await listCommunityBots(false));
    setMine(await listCommunityBots(true));
    if (spaceId) setInstalls(await listSpaceBotInstalls(spaceId));
  }, [conversationId, spaceId]);

  useEffect(() => {
    if (open) {
      void load();
      if (initialTab) setTab(initialTab);
    }
  }, [open, load, initialTab]);

  useEffect(() => {
    if (!open || !inviteSlug) return;
    const sys = SYSTEM_BOTS.find((b) => b.slug === inviteSlug || b.key === inviteSlug);
    if (sys) {
      setPendingInvite(sys);
      setTab("server");
      return;
    }
    void (async () => {
      const list = await listCommunityBots(false);
      const hit = list.find((b) => b.slug === inviteSlug);
      if (hit) {
        setPendingInvite({
          kind: "community",
          id: hit.id,
          slug: hit.slug,
          name: hit.name,
          description: hit.description,
          color: hit.color,
          commands: hit.commands,
        });
        setTab("server");
      }
    })();
  }, [open, inviteSlug]);

  const run = async (cmd: string) => {
    if (cmd.endsWith(" ")) {
      const arg = prompt(cmd.includes("spotify") || cmd.includes("song") || cmd.includes("track") || cmd.includes("album") || cmd.includes("artist") ? "Search" : cmd.includes("upc") ? "UPC code" : cmd.includes("answer") || cmd.includes("rate") ? "Your answer" : "Argument");
      if (!arg) return;
      cmd += arg;
    }
    onClose();
    await sendMessage(conversationId, cmd);
    void runBotCommand(conversationId, cmd);
  };
  const url = (h: Hook) => `${FN}?id=${h.id}&token=${h.token}`;
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast("Copied", "success"));

  const staffSpaces = useMemo(() => spaces, [spaces]);

  async function doInvite(bot: BotCard, sid: string) {
    if (!sid) return toast("Pick a server", "error");
    setBusy(true);
    const ok =
      bot.kind === "system"
        ? await installBotToSpace(sid, { systemKey: bot.key as SystemBotKey })
        : await installBotToSpace(sid, { communityBotId: bot.id });
    setBusy(false);
    if (ok) {
      setPendingInvite(null);
      if (sid === spaceId) setInstalls(await listSpaceBotInstalls(sid));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bots" subtitle="Directory, custom bots, Spotify music, invite to servers" className="max-w-lg">
      <div className="mb-3 flex flex-wrap gap-1 rounded-2xl bg-black/25 p-1 text-xs">
        {(
          [
            ["directory", "Directory"],
            ["commands", "Commands"],
            ["create", "Create"],
            ["server", "Invite"],
            ["webhooks", "Hooks"],
          ] as const
        ).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={cn("flex-1 rounded-full px-2 py-1.5 font-semibold", tab === t ? "bg-active" : "text-sub")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "directory" && (
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          <p className="px-1 text-xs text-sub">Official bots + community bots. Open a link, copy invite, or add to a server.</p>
          {[...SYSTEM_BOTS, ...community.map((b) => ({ kind: "community" as const, id: b.id, slug: b.slug, name: b.name, description: b.description, color: b.color, commands: b.commands }))].map((b) => (
            <div key={b.slug} className="rounded-xl border border-line/70 p-3">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-2xl text-sm font-black text-white" style={{ background: b.color }}>
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{b.name}</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sub">{b.kind === "system" ? "Official" : "Community"}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-sub">{b.description}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(Array.isArray(b.commands) ? b.commands : []).slice(0, 6).map((c, i) => {
                      const label = typeof c === "string" ? c : `/${(c as BotCommandDef).cmd}`;
                      return (
                        <span key={i} className="rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => copy(botPublicUrl(b.slug))} className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                      <Link2 className="size-3.5" /> Copy /b/{b.slug}
                    </button>
                    <button onClick={() => copy(botInviteUrl(b.slug))} className="inline-flex items-center gap-1 text-xs font-semibold text-sub hover:text-txt">
                      <Server className="size-3.5" /> Invite link
                    </button>
                    <button
                      onClick={() => {
                        setPendingInvite(b);
                        setTab("server");
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sub hover:text-txt"
                    >
                      Add to server
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {mine.length > 0 && (
            <div className="pt-2">
              <div className="mb-1 px-1 text-xs font-bold tracking-wide text-sub uppercase">Your bots</div>
              {mine.map((b) => (
                <div key={b.id} className="mb-2 rounded-xl border border-line/70 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-semibold">{b.name}</span>
                    <button onClick={() => copy(communityWebhookUrl(b))} className="text-xs text-accent">
                      Webhook
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete ${b.name}?`)) return;
                        await deleteCommunityBot(b.id);
                        void load();
                      }}
                      className="grid size-7 place-items-center rounded-full text-sub hover:text-dnd"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <code className="mt-1 block truncate text-[11px] text-sub">{botPublicUrl(b.slug)}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "commands" && (
        <div className="max-h-[55vh] space-y-1 overflow-y-auto">
          {COMMANDS.map((c) => (
            <button key={c.cmd + c.hint} onClick={() => void run(c.cmd)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
              <span className="text-xl">{c.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm font-semibold">{c.cmd.trim()}</span>
                <span className="block truncate text-xs text-sub">
                  {c.bot} · {c.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === "create" && (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          <p className="text-xs text-sub">Anyone can create a bot. Add slash replies with {"{user}"}, {"{args}"}, {"{bot}"} placeholders. Invite it to a server so those commands work in channels.</p>
          <label className="block text-xs font-bold text-sub uppercase">
            Name
            <input value={cName} onChange={(e) => setCName(e.target.value)} maxLength={64} className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm font-normal normal-case text-txt outline-none focus:border-accent" placeholder="My Helper" />
          </label>
          <label className="block text-xs font-bold text-sub uppercase">
            Link slug (/b/…)
            <input
              value={cSlug}
              onChange={(e) => setCSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 31))}
              className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm font-normal normal-case text-txt outline-none focus:border-accent"
              placeholder="my-helper"
            />
          </label>
          <label className="block text-xs font-bold text-sub uppercase">
            Description
            <input value={cDesc} onChange={(e) => setCDesc(e.target.value)} maxLength={280} className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm font-normal normal-case text-txt outline-none focus:border-accent" />
          </label>
          <label className="block text-xs font-bold text-sub uppercase">
            Color
            <input type="color" value={cColor} onChange={(e) => setCColor(e.target.value)} className="mt-1 h-9 w-full cursor-pointer rounded-lg bg-transparent" />
          </label>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-sub uppercase">
              Commands
              <button
                type="button"
                onClick={() => setCCmds((x) => (x.length >= 25 ? x : [...x, { cmd: "", reply: "" }]))}
                className="normal-case text-accent"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {cCmds.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={c.cmd}
                    onChange={(e) => setCCmds((arr) => arr.map((x, j) => (j === i ? { ...x, cmd: e.target.value.replace(/^\//, "") } : x)))}
                    placeholder="hello"
                    className="w-24 rounded-lg border border-line bg-transparent px-2 py-1.5 font-mono text-sm outline-none"
                  />
                  <input
                    value={c.reply}
                    onChange={(e) => setCCmds((arr) => arr.map((x, j) => (j === i ? { ...x, reply: e.target.value } : x)))}
                    placeholder="Reply text"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2 py-1.5 text-sm outline-none"
                  />
                  <button type="button" onClick={() => setCCmds((arr) => arr.filter((_, j) => j !== i))} className="text-sub hover:text-dnd">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button
            disabled={busy || !cName.trim() || cSlug.length < 2}
            onClick={async () => {
              setBusy(true);
              const bot = await createCommunityBot({
                slug: cSlug,
                name: cName.trim(),
                description: cDesc,
                color: cColor,
                commands: cCmds.filter((c) => c.cmd.trim() && c.reply.trim()),
              });
              setBusy(false);
              if (bot) {
                setCSlug("");
                setCName("");
                setCDesc("");
                setCCmds([{ cmd: "hello", reply: "Hey {user}! 👋" }]);
                void load();
                setTab("directory");
              }
            }}
            className="w-full rounded-full bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            Create bot
          </button>
        </div>
      )}

      {tab === "server" && (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          <p className="text-xs text-sub">Server staff can invite official or community bots. Installed community bots respond to their custom commands in that server.</p>
          {pendingInvite && (
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
              <div className="font-semibold">Invite {pendingInvite.name}</div>
              <p className="text-xs text-sub">{pendingInvite.description}</p>
              <label className="mt-2 block text-xs font-bold text-sub uppercase">
                Server
                <select value={inviteSpace} onChange={(e) => setInviteSpace(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-rail px-3 py-2 text-sm font-normal normal-case text-txt">
                  <option value="">Select…</option>
                  {staffSpaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={busy || !inviteSpace} onClick={() => void doInvite(pendingInvite, inviteSpace)} className="mt-2 w-full rounded-full bg-accent py-2 text-sm font-bold text-white disabled:opacity-40">
                Add to server
              </button>
            </div>
          )}
          <div className="space-y-1">
            <div className="text-xs font-bold text-sub uppercase">Quick add</div>
            {SYSTEM_BOTS.map((b) => (
              <button
                key={b.key}
                onClick={() => {
                  setPendingInvite(b);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-hover"
              >
                <span className="size-3 rounded-full" style={{ background: b.color }} />
                <span className="flex-1 text-sm font-semibold">{b.name}</span>
                <Server className="size-3.5 text-sub" />
              </button>
            ))}
          </div>
          {spaceId && installs.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-bold text-sub uppercase">Installed here</div>
              {installs.map((i) => (
                <div key={i.id} className="mb-1 flex items-center gap-2 rounded-lg bg-white/[.04] px-2 py-2 text-sm">
                  <span className="flex-1 truncate font-semibold">
                    {i.system_key ? SYSTEM_BOTS.find((b) => b.key === i.system_key)?.name ?? i.system_key : i.community_bots?.name ?? "Bot"}
                  </span>
                  <button
                    onClick={async () => {
                      await uninstallBot(i.id);
                      setInstalls(await listSpaceBotInstalls(spaceId));
                    }}
                    className="text-xs text-dnd"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "webhooks" && (
        <div className="space-y-3">
          <p className="text-xs text-sub">
            POST JSON into this chat (Discord-compatible): <code className="rounded bg-black/30 px-1">{`{"content":"Hi","username":"CI"}`}</code>
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || !me) return;
              const { error } = await supabase.from("chat_webhooks").insert({ conversation_id: conversationId, created_by: me, name: name.trim().slice(0, 80) });
              if (error) return toast(errorText(error), "error");
              setName("");
              void load();
            }}
            className="flex gap-2"
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Webhook name (e.g. GitHub)" className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
            <button disabled={!name.trim()} className="flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              <Plus className="size-4" /> Create
            </button>
          </form>
          {hooks.length === 0 ? (
            <p className="py-4 text-center text-sm text-sub">No webhooks in this chat yet.</p>
          ) : (
            <div className="max-h-[40vh] space-y-2 overflow-y-auto">
              {hooks.map((h) => (
                <div key={h.id} className="rounded-xl border border-line/70 p-2.5">
                  <div className="flex items-center gap-2">
                    <Webhook className="size-4 text-[#5865f2]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.name}</span>
                    <span className="text-xs text-sub">{h.uses} posts</span>
                    {h.created_by === me && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Remove webhook “${h.name}”?`)) return;
                          const { error } = await supabase.from("chat_webhooks").delete().eq("id", h.id);
                          if (error) toast(errorText(error), "error");
                          else void load();
                        }}
                        className="grid size-7 place-items-center rounded-full text-sub hover:bg-dnd/15 hover:text-dnd"
                        aria-label="Remove webhook"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate rounded bg-black/30 px-2 py-1 text-[11px]">{url(h)}</code>
                    <button onClick={() => copy(url(h))} className="grid size-7 shrink-0 place-items-center rounded-full bg-hover hover:bg-active" aria-label="Copy URL">
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
