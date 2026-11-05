"use client";

import { useEffect, useState } from "react";
import { Ban, Check, Search, Shield, Trash2, UserRoundPen } from "lucide-react";
import { toast, useApp } from "@/store/app";
import { myRank } from "@/lib/admin";
import { cn } from "@/lib/utils";
import {
  adminSetUsername,
  gramAdminStats,
  gramGo,
  listOpenReports,
  mediaUrl,
  modRemoveGramPost,
  recentGramPosts,
  reviewReport,
  type Post,
} from "@/lib/gram";
import { listUsers } from "@/lib/admin";
import Avatar from "@/components/ui/Avatar";
import type { AdminUserRow } from "@/lib/types";

export default function GramAdmin() {
  const rank = myRank();
  const [tab, setTab] = useState<"overview" | "posts" | "reports" | "usernames">("overview");
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (rank < 2) return;
    void gramAdminStats().then(setStats);
  }, [rank]);

  if (rank < 2) {
    return <p className="px-6 py-16 text-center text-sm text-sub">Staff only — moderators and admins can open this panel.</p>;
  }

  return (
    <div className="pb-12">
      <div className="border-b border-line/50 px-4 py-5">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-sub uppercase">
          <Shield className="size-4 text-accent" /> NexusGram Admin
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Moderation &amp; tools</h1>
        <p className="mt-1 text-sm text-sub">Review reports, remove posts, and rename accounts.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line/50 px-3 py-2">
        {(
          [
            ["overview", "Overview"],
            ["posts", "Recent posts"],
            ["reports", "Reports"],
            ...(rank >= 3 ? ([["usernames", "Usernames"]] as const) : []),
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold", tab === id ? "bg-txt text-chat" : "text-sub hover:bg-hover")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
          {[
            ["Posts", stats?.posts],
            ["Shorts", stats?.shorts],
            ["Live stories", stats?.stories_live],
            ["Follows", stats?.follows],
            ["Likes", stats?.likes],
            ["Open reports", stats?.reports_open],
          ].map(([label, n]) => (
            <div key={String(label)} className="rounded-2xl border border-line/60 bg-side/40 px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums">{n ?? "—"}</div>
              <div className="text-xs text-sub">{label}</div>
            </div>
          ))}
        </div>
      )}
      {tab === "posts" && <RecentPosts />}
      {tab === "reports" && <Reports />}
      {tab === "usernames" && rank >= 3 && <UsernameTool />}
    </div>
  );
}

function RecentPosts() {
  const [rows, setRows] = useState<Post[] | null>(null);
  const profiles = useApp((s) => s.profiles);
  useEffect(() => {
    void recentGramPosts().then(setRows);
  }, []);
  if (!rows) return <p className="p-6 text-sm text-sub">Loading…</p>;
  return (
    <div className="divide-y divide-line/40">
      {rows.map((p) => {
        const m = p.media[0];
        return (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => gramGo(p.kind === "short" ? { view: "shorts", start: p.id } : { view: "post", id: p.id })} className="size-14 shrink-0 overflow-hidden rounded-xl bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(m?.type === "video" ? m.poster : m?.path)} alt="" className="size-full object-cover" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">@{profiles[p.author_id]?.username ?? "…"} · {p.kind}</div>
              <div className="truncate text-xs text-sub">{p.caption || "No caption"}</div>
            </div>
            <button
              onClick={async () => {
                const reason = prompt("Remove post? Reason:") ?? "";
                if (reason === null) return;
                if (await modRemoveGramPost(p.id, reason)) setRows((r) => (r ?? []).filter((x) => x.id !== p.id));
              }}
              className="grid size-9 place-items-center rounded-full text-dnd hover:bg-dnd/10"
              title="Remove"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Reports() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listOpenReports>> | null>(null);
  useEffect(() => {
    void listOpenReports().then(setRows);
  }, []);
  if (!rows) return <p className="p-6 text-sm text-sub">Loading…</p>;
  if (!rows.length) return <p className="px-6 py-12 text-center text-sm text-sub">No open reports.</p>;
  return (
    <div className="space-y-2 p-4">
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl border border-line/60 p-3">
          <div className="text-sm font-semibold">{r.reason}</div>
          <div className="mt-1 text-xs text-sub">
            {r.post_id ? (
              <button className="text-accent hover:underline" onClick={() => gramGo({ view: "post", id: r.post_id! })}>
                Open post
              </button>
            ) : (
              "Story report"
            )}{" "}
            · {new Date(r.created_at).toLocaleString()}
          </div>
          <div className="mt-2 flex gap-2">
            {r.post_id && (
              <button
                onClick={async () => {
                  if (await modRemoveGramPost(r.post_id!, r.reason)) {
                    await reviewReport(r.id, "removed");
                    setRows((x) => (x ?? []).filter((i) => i.id !== r.id));
                  }
                }}
                className="inline-flex items-center gap-1 rounded-full bg-dnd/15 px-3 py-1.5 text-xs font-bold text-dnd"
              >
                <Ban className="size-3.5" /> Remove post
              </button>
            )}
            <button
              onClick={async () => {
                if (await reviewReport(r.id, "dismissed")) setRows((x) => (x ?? []).filter((i) => i.id !== r.id));
              }}
              className="inline-flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-bold"
            >
              <Check className="size-3.5" /> Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsernameTool() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => void listUsers(q.trim()).then(setUsers), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="p-4">
      <label className="flex items-center gap-2 rounded-2xl border border-line/60 bg-side/30 px-3 py-2">
        <Search className="size-4 text-sub" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <div className="mt-3 space-y-1">
        {users.slice(0, 40).map((u) => (
          <div key={u.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-hover">
            <Avatar userId={u.id} size={36} plain />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">@{u.username}</div>
              <div className="truncate text-xs text-sub">{u.display_name} · {u.site_role}</div>
            </div>
            <button
              disabled={!!busy}
              onClick={async () => {
                const next = prompt(`New username for @${u.username}`, u.username);
                if (!next || next === u.username) return;
                setBusy(u.id);
                try {
                  const name = await adminSetUsername(u.id, next);
                  toast(`Renamed to @${name}`, "success");
                  setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, username: name } : x)));
                } catch (e) {
                  toast(String((e as Error).message ?? e), "error");
                }
                setBusy(null);
              }}
              className="inline-flex items-center gap-1 rounded-full bg-hover px-3 py-1.5 text-xs font-bold"
            >
              <UserRoundPen className="size-3.5" /> Rename
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
