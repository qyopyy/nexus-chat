"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Trash2, Webhook } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { supabase, errorText } from "@/lib/supabase";
import { runBotCommand, sendMessage } from "@/lib/data";
import Modal from "@/components/ui/Modal";

const FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://fcnabeudhdlugruqzezn.supabase.co"}/functions/v1/bots`;

type Hook = { id: string; name: string; token: string; uses: number; created_by: string; created_at: string };

const COMMANDS: { bot: string; emoji: string; cmd: string; hint: string }[] = [
  { bot: "Nexus Bot", emoji: "🤖", cmd: "/help", hint: "list every command" },
  { bot: "Nexus Bot", emoji: "🎲", cmd: "/roll 2d6", hint: "roll dice" },
  { bot: "Nexus Bot", emoji: "🪙", cmd: "/flip", hint: "heads or tails" },
  { bot: "Nexus Bot", emoji: "🎱", cmd: "/8ball Will it chart?", hint: "magic 8-ball" },
  { bot: "Nexus Bot", emoji: "🤔", cmd: "/choose pizza, sushi, tacos", hint: "pick one" },
  { bot: "Music Bot", emoji: "🎵", cmd: "/isrc Song Title — Artist", hint: "Audia ISRC (Distribution plan)" },
  { bot: "Music Bot", emoji: "🔎", cmd: "/song ", hint: "find a track + link" },
  { bot: "Music Bot", emoji: "💿", cmd: "/upc ", hint: "look up an album by UPC" },
  { bot: "Order Bot", emoji: "💜", cmd: "/premium", hint: "plans & prices" },
  { bot: "Order Bot", emoji: "🧾", cmd: "/orders", hint: "your order status" },
];

/** bots (slash commands) + incoming webhooks for one chat */
export default function BotsPanel({ conversationId, open, onClose }: { conversationId: string; open: boolean; onClose: () => void }) {
  const me = useApp((s) => s.userId);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"bots" | "webhooks">("bots");

  const load = useCallback(async () => {
    const { data } = await supabase.from("chat_webhooks").select("id, name, token, uses, created_by, created_at").eq("conversation_id", conversationId).order("created_at");
    setHooks((data ?? []) as Hook[]);
  }, [conversationId]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const run = async (cmd: string) => {
    if (cmd.endsWith(" ")) {
      const arg = prompt(cmd.trim() === "/song" ? "Track name" : "UPC code");
      if (!arg) return;
      cmd += arg;
    }
    onClose();
    await sendMessage(conversationId, cmd);
    void runBotCommand(conversationId, cmd);
  };
  const url = (h: Hook) => `${FN}?id=${h.id}&token=${h.token}`;
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast("Copied", "success"));

  return (
    <Modal open={open} onClose={onClose} title="Bots & webhooks" subtitle="Type a / command in the chat, or connect apps with a webhook" className="max-w-lg">
      <div className="mb-3 flex rounded-full bg-black/25 p-0.5 text-sm">
        {(["bots", "webhooks"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1.5 font-semibold capitalize ${tab === t ? "bg-active" : ""}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "bots" ? (
        <div className="max-h-[55vh] space-y-1 overflow-y-auto">
          {COMMANDS.map((c) => (
            <button key={c.cmd} onClick={() => void run(c.cmd)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
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
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-sub">
            Anything that can POST JSON (GitHub, Zapier, Make, IFTTT, your own scripts…) can post into this chat. Same format as Discord: <code className="rounded bg-black/30 px-1">{`{"content":"Hi","username":"CI"}`}</code>
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
                          if (!confirm(`Remove webhook “${h.name}”? Apps using it will stop posting.`)) return;
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
                  <button
                    onClick={() => copy(`curl -X POST "${url(h)}" -H "Content-Type: application/json" -d '{"content":"Hello from ${h.name.replace(/'/g, "")}"}'`)}
                    className="mt-1 text-xs text-accent hover:underline"
                  >
                    Copy test command (curl)
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
