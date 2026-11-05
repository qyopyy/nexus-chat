"use client";

import { useEffect, useState } from "react";
import { Copy, ImagePlus, Link2, Lock, Palette, Shield, Trash2 } from "lucide-react";
import { useApp, toast } from "@/store/app";
import {
  ROLE_PERMS,
  assignRole,
  clearSpaceMedia,
  createInvite,
  createRole,
  deleteRole,
  inviteLink,
  listInvites,
  listMemberRoles,
  listRoles,
  revokeInvite,
  setSpaceAppearance,
  setVanity,
  uploadSpaceImage,
} from "@/lib/spaceExtras";
import type { SpaceInvite, SpaceMember, SpaceRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";

const EMPTY_M: SpaceMember[] = [];
const COLORS = ["#5865F2", "#3BA55D", "#FAA61A", "#ED4245", "#EB459E", "#2AABEE", "#9B59B6", "#1ABC9C", "#F47B67", "#23272A"];

/** Look & feel — icon, banner, background, name, color */
export function LookPanel({ spaceId, staff }: { spaceId: string; staff: boolean }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId))!;
  const [name, setName] = useState(space.name);
  const [desc, setDesc] = useState(space.description ?? "");
  const [color, setColor] = useState(space.icon_color);
  useEffect(() => {
    setName(space.name);
    setDesc(space.description ?? "");
    setColor(space.icon_color);
  }, [space.id, space.name, space.description, space.icon_color]);

  const pick = (kind: "icon" | "banner" | "background") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void uploadSpaceImage(spaceId, f, kind);
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <div className="relative h-28 overflow-hidden rounded-2xl bg-side">
        {space.banner_url || space.background_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={space.banner_url || space.background_url || ""} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${space.icon_color}, #0b0b0f)` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-3 left-3 flex items-center gap-3">
          <div className="grid size-14 place-items-center overflow-hidden rounded-2xl text-lg font-black text-white shadow-lg ring-2 ring-white/20" style={{ background: space.icon_color }}>
            {space.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={space.icon_url} alt="" className="size-full object-cover" />
            ) : (
              space.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <div className="text-lg font-black text-white drop-shadow">{space.name}</div>
            {space.description && <div className="text-xs text-white/80">{space.description}</div>}
          </div>
        </div>
      </div>

      {staff && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["icon", "Icon", space.icon_url],
                ["banner", "Banner", space.banner_url],
                ["background", "Background", space.background_url],
              ] as const
            ).map(([kind, label, url]) => (
              <div key={kind} className="rounded-xl bg-side p-2">
                <div className="mb-1 text-[10px] font-bold tracking-wide text-sub uppercase">{label}</div>
                <button onClick={() => pick(kind)} className="flex h-16 w-full items-center justify-center overflow-hidden rounded-lg bg-black/25 hover:bg-black/40">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5 text-sub" />
                  )}
                </button>
                {url && (
                  <button onClick={() => void clearSpaceMedia(spaceId, kind)} className="mt-1 w-full text-[11px] text-dnd hover:underline">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Server name</span>
            <input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Short description</span>
            <textarea value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} className="min-h-16 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent" placeholder="What is this server about?" />
          </label>
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-bold tracking-wide text-sub uppercase">
              <Palette className="size-3.5" /> Accent color
            </div>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={cn("size-8 rounded-full ring-2", color === c ? "ring-white" : "ring-transparent")} style={{ background: c }} />
              ))}
            </div>
          </div>
          <button
            onClick={() => void setSpaceAppearance(spaceId, { name: name.trim(), description: desc, icon_color: color })}
            className="w-full rounded-full bg-accent py-2.5 font-bold text-white"
          >
            Save look
          </button>
        </>
      )}
    </div>
  );
}

/** Custom invite codes + vanity URL */
export function InvitesPanel({ spaceId, staff, owner }: { spaceId: string; staff: boolean; owner: boolean }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId))!;
  const [list, setList] = useState<SpaceInvite[] | null>(null);
  const [vanity, setVanityLocal] = useState(space.vanity_code ?? "");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [hours, setHours] = useState("");
  const reload = () => void listInvites(spaceId).then(setList);
  useEffect(() => {
    reload();
    setVanityLocal(space.vanity_code ?? "");
  }, [spaceId, space.vanity_code]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (c: string) => {
    void navigator.clipboard.writeText(inviteLink(c));
    toast("Invite link copied", "success");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-side p-3">
        <div className="text-xs font-bold tracking-wide text-sub uppercase">Default invite</div>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 truncate font-mono text-sm">{space.invite_code}</code>
          <button onClick={() => copy(space.invite_code)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white">
            <Copy className="size-3.5" />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-sub">Always works. Share {inviteLink(space.invite_code).replace(/^https?:\/\//, "")}</p>
      </div>

      {owner && (
        <div className="rounded-2xl bg-side p-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-bold tracking-wide text-sub uppercase">
            <Link2 className="size-3.5" /> Custom vanity code
          </div>
          <div className="flex gap-2">
            <input
              value={vanity}
              onChange={(e) => setVanityLocal(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))}
              placeholder="my-crew"
              className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 font-mono text-sm outline-none"
            />
            <button onClick={() => void setVanity(spaceId, vanity)} className="rounded-lg bg-accent px-3 py-2 text-sm font-bold text-white">
              Save
            </button>
          </div>
        </div>
      )}

      {staff && (
        <div className="space-y-2 rounded-2xl bg-side p-3">
          <div className="text-xs font-bold tracking-wide text-sub uppercase">New custom invite</div>
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} placeholder="Label (Friends, Stream viewers…)" className="w-full rounded-lg bg-rail px-3 py-2 text-sm outline-none" />
          <input value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))} placeholder="Custom code (optional)" className="w-full rounded-lg bg-rail px-3 py-2 font-mono text-sm outline-none" />
          <div className="flex gap-2">
            <input value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Max uses" className="w-1/2 rounded-lg bg-rail px-3 py-2 text-sm outline-none" />
            <input value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Expires (hours)" className="w-1/2 rounded-lg bg-rail px-3 py-2 text-sm outline-none" />
          </div>
          <button
            onClick={async () => {
              const row = await createInvite(spaceId, {
                label: label || undefined,
                code: code || undefined,
                maxUses: maxUses ? Number(maxUses) : null,
                expiresHours: hours ? Number(hours) : null,
              });
              if (row) {
                setLabel("");
                setCode("");
                setMaxUses("");
                setHours("");
                reload();
                toast("Invite created", "success");
              }
            }}
            className="w-full rounded-full bg-accent py-2 text-sm font-bold text-white"
          >
            Create invite
          </button>
        </div>
      )}

      <div className="space-y-1">
        <div className="text-xs font-bold tracking-wide text-sub uppercase">Active invites</div>
        {list === null ? (
          <p className="text-sm text-sub">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-sub">No custom invites yet.</p>
        ) : (
          list.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 rounded-xl bg-side px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm font-bold">{inv.code}</div>
                <div className="text-[11px] text-sub">
                  {inv.label ? `${inv.label} · ` : ""}
                  {inv.uses}
                  {inv.max_uses ? `/${inv.max_uses}` : ""} uses
                  {inv.expires_at ? ` · expires ${new Date(inv.expires_at).toLocaleString()}` : ""}
                </div>
              </div>
              <button onClick={() => copy(inv.code)} className="rounded-lg bg-hover p-2" aria-label="Copy">
                <Copy className="size-4" />
              </button>
              {staff && (
                <button
                  onClick={async () => {
                    if (await revokeInvite(inv.id)) reload();
                  }}
                  className="rounded-lg bg-dnd/15 p-2 text-dnd"
                  aria-label="Revoke"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Custom colored roles with permission toggles */
export function RolesPanel({ spaceId, staff }: { spaceId: string; staff: boolean }) {
  const members = useApp((s) => s.spaceMembers[spaceId] ?? EMPTY_M);
  const [roles, setRoles] = useState<SpaceRole[] | null>(null);
  const [assigns, setAssigns] = useState<{ user_id: string; role_id: string }[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#EB459E");
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [pickUser, setPickUser] = useState<string>("");
  const [pickRole, setPickRole] = useState<string>("");

  const reload = async () => {
    const [r, a] = await Promise.all([listRoles(spaceId), listMemberRoles(spaceId)]);
    setRoles(r);
    setAssigns(a);
  };
  useEffect(() => {
    void reload();
  }, [spaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <p className="text-sm text-sub">Custom roles sit on top of Owner / Admin / Member. Give people a color and optional powers.</p>

      {staff && (
        <div className="space-y-2 rounded-2xl bg-side p-3">
          <div className="flex items-center gap-1 text-xs font-bold tracking-wide text-sub uppercase">
            <Shield className="size-3.5" /> New role
          </div>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Role name" className="min-w-0 flex-1 rounded-lg bg-rail px-3 py-2 text-sm outline-none" />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg bg-transparent" />
          </div>
          <div className="grid grid-cols-2 gap-1">
            {ROLE_PERMS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 rounded-lg bg-rail/60 px-2 py-1.5 text-xs">
                <input type="checkbox" checked={!!perms[p.key]} onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })} />
                {p.label}
              </label>
            ))}
          </div>
          <button
            onClick={async () => {
              if (!name.trim()) return;
              const row = await createRole(spaceId, name.trim(), color, perms);
              if (row) {
                setName("");
                setPerms({});
                void reload();
                toast("Role created", "success");
              }
            }}
            className="w-full rounded-full bg-accent py-2 text-sm font-bold text-white"
          >
            Create role
          </button>
        </div>
      )}

      <div className="space-y-1">
        {(roles ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-side px-3 py-2">
            <span className="size-3 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1 font-semibold" style={{ color: r.color }}>
              {r.name}
            </span>
            <span className="text-[11px] text-sub">{Object.values(r.perms || {}).filter(Boolean).length} perks</span>
            {staff && (
              <button onClick={async () => (await deleteRole(r.id)) && reload()} className="rounded-lg p-1.5 text-dnd hover:bg-dnd/15">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        {roles?.length === 0 && <p className="text-sm text-sub">No custom roles yet.</p>}
      </div>

      {staff && roles && roles.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-side p-3">
          <div className="text-xs font-bold tracking-wide text-sub uppercase">Assign role</div>
          <select value={pickUser} onChange={(e) => setPickUser(e.target.value)} className="w-full rounded-lg bg-rail px-3 py-2 text-sm">
            <option value="">Pick member…</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {useApp.getState().profiles[m.user_id]?.display_name ?? m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
          <select value={pickRole} onChange={(e) => setPickRole(e.target.value)} className="w-full rounded-lg bg-rail px-3 py-2 text-sm">
            <option value="">Pick role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            disabled={!pickUser || !pickRole}
            onClick={async () => {
              if (await assignRole(spaceId, pickUser, pickRole, true)) {
                void reload();
                toast("Role assigned", "success");
              }
            }}
            className="w-full rounded-full bg-accent py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Assign
          </button>
          <div className="space-y-1 pt-1">
            {assigns.map((a) => {
              const role = roles.find((r) => r.id === a.role_id);
              if (!role) return null;
              return (
                <div key={`${a.user_id}-${a.role_id}`} className="flex items-center gap-2 rounded-lg bg-rail/50 px-2 py-1.5 text-sm">
                  <Avatar userId={a.user_id} size={22} plain />
                  <span className="min-w-0 flex-1 truncate">
                    <NameTag userId={a.user_id} badges={false} />
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${role.color}33`, color: role.color }}>
                    {role.name}
                  </span>
                  <button onClick={async () => (await assignRole(spaceId, a.user_id, a.role_id, false)) && reload()} className="text-dnd">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function LockHint({ locked }: { locked?: boolean }) {
  if (!locked) return null;
  return <Lock className="size-3.5 shrink-0 text-sub" />;
}
