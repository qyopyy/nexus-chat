"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Users, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import {
  bumpCreateGroup,
  bumpGroupInviteLink,
  bumpGroupMembers,
  bumpJoinGroup,
  bumpLeaveGroup,
  bumpListGroups,
  type WumpGroup,
} from "@/lib/bump";
import { WUMP } from "@/lib/wumpBrand";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { cn } from "@/lib/utils";

export default function WumpGroups({ friendIds }: { friendIds: string[] }) {
  const me = useApp((s) => s.userId);
  const profiles = useApp((s) => s.profiles);
  const [groups, setGroups] = useState<WumpGroup[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setGroups(await bumpListGroups());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!openId) {
      setMembers([]);
      return;
    }
    void bumpGroupMembers(openId).then(setMembers);
  }, [openId]);

  async function create() {
    const name = window.prompt("Group name", "Crew");
    if (!name?.trim()) return;
    setCreating(true);
    const g = await bumpCreateGroup(name.trim(), picked);
    setCreating(false);
    if (!g) return;
    setPicked([]);
    await reload();
    setOpenId(g.id);
    const link = bumpGroupInviteLink(g.invite_code);
    try {
      await navigator.clipboard.writeText(link);
      toast("Group invite link copied", "success");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="rounded-2xl bg-side p-4 ring-1 ring-white/5">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Users className="size-4 text-accent" /> {WUMP} groups
        </div>
        <p className="mb-3 text-xs text-sub">
          Create a crew — members always see each other&apos;s Live pins on the map. Share the invite link to add more people.
        </p>

        {friendIds.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 text-[11px] font-bold tracking-wide text-sub uppercase">Add friends when creating</div>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {friendIds.map((id) => {
                const on = picked.includes(id);
                const label = profiles[id]?.display_name || profiles[id]?.username || "Friend";
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== id) : [...p, id]))}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                      on ? "bg-accent text-white" : "bg-white/5 text-sub hover:bg-white/10",
                    )}
                  >
                    <Avatar userId={id} size={18} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={creating || !me}
            onClick={() => void create()}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            <Plus className="size-3.5" /> Create group
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Paste group invite code or link"
            className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-accent"
          />
          <button
            type="button"
            disabled={!joinCode.trim()}
            onClick={() => {
              const code = joinCode.trim().split("/").pop() || joinCode.trim();
              void bumpJoinGroup(code).then(() => {
                setJoinCode("");
                void reload();
              });
            }}
            className="rounded-xl bg-white/10 px-4 text-sm font-bold disabled:opacity-40"
          >
            Join
          </button>
        </div>
      </section>

      {!groups.length ? (
        <p className="py-6 text-center text-sm text-sub">No groups yet — create one for your friends.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="rounded-2xl bg-side ring-1 ring-white/5">
              <button
                type="button"
                onClick={() => setOpenId(openId === g.id ? null : g.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-accent/20 text-accent">
                  <Users className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{g.name}</span>
                  <span className="text-[11px] text-sub">
                    {g.member_count} members · {g.my_role}
                  </span>
                </span>
              </button>
              {openId === g.id && (
                <div className="space-y-2 border-t border-white/5 px-4 py-3">
                  <div className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
                    <code className="min-w-0 flex-1 truncate text-[11px]">{bumpGroupInviteLink(g.invite_code)}</code>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full hover:bg-white/10"
                      onClick={() => {
                        void navigator.clipboard.writeText(bumpGroupInviteLink(g.invite_code));
                        toast("Copied", "success");
                      }}
                    >
                      <Copy className="size-4" />
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {members.map((m) => (
                      <li key={m.user_id} className="flex items-center gap-2 py-1">
                        <Avatar userId={m.user_id} size={28} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          <NameTag userId={m.user_id} />
                        </span>
                        <span className="text-[10px] font-bold tracking-wide text-sub uppercase">{m.role}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() =>
                      void bumpLeaveGroup(g.id).then(() => {
                        setOpenId(null);
                        void reload();
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-dnd hover:bg-dnd/10"
                  >
                    <X className="size-3.5" /> {g.owner_id === me ? "Delete group" : "Leave group"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
