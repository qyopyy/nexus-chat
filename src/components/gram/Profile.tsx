"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Camera, Clapperboard, Copy, Grid3x3, Heart, ImagePlus, MessageCircle, Play, UserPlus, X } from "lucide-react";
import { useApp, toast } from "@/store/app";
import { openDM, sendFriendRequest, updateMyProfile, uploadAvatar, uploadBanner } from "@/lib/data";
import { cn } from "@/lib/utils";
import { changeUsername, fmt, followList, gramGo, mediaUrl, profile, publicProfileUrl, setFollow, useGram, type GramProfile } from "@/lib/gram";
import type { ProfileLink } from "@/lib/types";
import Avatar from "@/components/ui/Avatar";
import NameTag from "@/components/ui/NameTag";
import { LinkRow } from "@/components/ui/ProfileCard";
import { Ring } from "./Stories";
import { detectPlatform } from "@/lib/links";

export default function Profile({ username }: { username: string }) {
  const meId = useApp((s) => s.userId);
  const friendships = useApp((s) => s.friendships);
  const [p, setP] = useState<GramProfile | null | undefined>(undefined);
  const [tab, setTab] = useState<"post" | "short">("post");
  const [edit, setEdit] = useState(false);
  const [list, setList] = useState<{ which: "followers" | "following"; ids: string[] } | null>(null);
  const live = useApp((s) => (p ? s.profiles[p.id] : undefined));

  const load = useCallback(() => void profile(username).then(setP), [username]);
  useEffect(() => load(), [load]);

  if (p === undefined) return <div className="grid h-60 place-items-center text-sub">Loading…</div>;
  if (p === null) return <div className="grid h-60 place-items-center text-sub">This account doesn&apos;t exist.</div>;
  const mine = p.id === meId;
  const fr = friendships.find((f) => (f.requester_id === p.id && f.addressee_id === meId) || (f.addressee_id === p.id && f.requester_id === meId));
  const grid = p.grid.filter((g) => g.kind === tab);
  const banner = live?.banner_url ?? p.banner_url;

  return (
    <div className="pb-10">
      {/* background */}
      <div className="relative h-44 w-full overflow-hidden sm:h-56 sm:rounded-b-3xl" style={{ background: banner ? undefined : `linear-gradient(135deg, ${p.banner_color || p.avatar_color || "#5865f2"}, #12062b)` }}>
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-chat via-transparent to-transparent" />
      </div>

      <div className="relative -mt-14 px-4">
        <div className="flex items-end gap-4">
          {p.stories.length ? <Ring userId={p.id} size={104} unseen onClick={() => useGram.setState({ story: { authors: [p.id], index: 0 } })} /> : <Avatar userId={p.id} size={112} plain className="ring-4 ring-chat" />}
          <div className="mb-1 grid flex-1 grid-cols-3 text-center">
            <Stat n={p.posts} label="posts" />
            <Stat n={p.followers} label="followers" onClick={async () => setList({ which: "followers", ids: await followList(p.id, "followers") })} />
            <Stat n={p.following} label="following" onClick={async () => setList({ which: "following", ids: await followList(p.id, "following") })} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xl font-black">
          {live?.display_name ?? p.display_name}
          {p.verified && <BadgeCheck className="size-5 text-[#4cb3ff]" aria-label="Verified" />}
        </div>
        <div className="text-sm text-sub">
          @{live?.username ?? p.username} · {fmt(p.likes)} likes{p.follows_you && !mine ? " · follows you" : ""}
        </div>
        {(live?.bio ?? p.bio) && <p className="mt-2 text-sm whitespace-pre-wrap">{live?.bio ?? p.bio}</p>}
        {!!(live?.links ?? []).length && (
          <div className="mt-3 space-y-0.5 rounded-2xl bg-white/[0.04] p-1.5">
            {(live?.links ?? [])
              .filter((l) => l.url)
              .map((l, i) => {
                const href = /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`;
                const type = l.type && l.type !== "link" ? l.type : detectPlatform(href).id;
                return <LinkRow key={i} link={{ ...l, type, url: href }} />;
              })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {mine ? (
            <>
              <button onClick={() => setEdit(true)} className="min-h-11 min-w-[42%] flex-1 rounded-xl bg-hover px-3 py-2.5 text-sm font-bold hover:bg-active">
                Edit profile
              </button>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(publicProfileUrl(live?.username ?? p.username));
                  toast("Public page link copied", "success");
                }}
                className="flex min-h-11 min-w-[42%] flex-1 items-center justify-center gap-1.5 rounded-xl bg-hover px-3 py-2.5 text-sm font-bold hover:bg-active"
              >
                <Copy className="size-4 shrink-0" /> Share
              </button>
              <button onClick={() => useGram.setState({ create: "story", remixOf: null })} className="min-h-11 rounded-xl bg-hover px-3 py-2.5 text-sm font-bold hover:bg-active">
                + Story
              </button>
            </>
          ) : (
            <>
              <button
                onClick={async () => {
                  const on = !p.is_following;
                  if (await setFollow(p.id, on)) setP({ ...p, is_following: on, followers: p.followers + (on ? 1 : -1) });
                }}
                className={cn("min-h-11 min-w-[42%] flex-1 rounded-xl px-3 py-2.5 text-sm font-bold", p.is_following ? "bg-hover hover:bg-active" : "bg-accent text-white")}
              >
                {p.is_following ? "Following" : p.follows_you ? "Follow back" : "Follow"}
              </button>
              <button onClick={() => void openDM(p.id).then(() => useApp.setState({ hub: null, mobileTab: "chats" }))} className="flex min-h-11 min-w-[42%] flex-1 items-center justify-center gap-1.5 rounded-xl bg-hover px-3 py-2.5 text-sm font-bold hover:bg-active">
                <MessageCircle className="size-4 shrink-0" /> Message
              </button>
              {fr?.status !== "accepted" && (
                <button
                  disabled={fr?.status === "pending"}
                  onClick={async () => {
                    const err = await sendFriendRequest(p.username);
                    if (err) toast(err, "error");
                  }}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-hover px-3 py-2.5 text-sm font-bold hover:bg-active disabled:opacity-50 sm:w-auto"
                  title="Add friend"
                >
                  <UserPlus className="size-4 shrink-0" /> {fr?.status === "pending" ? "Requested" : "Add friend"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex border-b border-line/60">
        {(
          [
            ["post", <Grid3x3 key="g" className="size-5" />, "Posts"],
            ["short", <Clapperboard key="s" className="size-5" />, "Shorts"],
          ] as const
        ).map(([k, icon, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-semibold", tab === k ? "border-b-2 border-txt" : "text-sub")}>
            {icon} {l}
          </button>
        ))}
      </div>
      {grid.length === 0 ? (
        <div className="py-14 text-center text-sm text-sub">{mine ? (tab === "post" ? "Share your first post" : "Post your first Short") : "Nothing here yet."}</div>
      ) : (
        <div className={cn("grid gap-0.5", tab === "short" ? "grid-cols-3" : "grid-cols-3")}>
          {grid.map((g) => (
            <button key={g.id} onClick={() => gramGo(g.kind === "short" ? { view: "shorts", start: g.id } : { view: "post", id: g.id })} className={cn("group relative overflow-hidden bg-black", tab === "short" ? "aspect-[9/16]" : "aspect-square")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(g.cover.type === "video" ? g.cover.poster : g.cover.path)} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              {g.kind === "short" ? (
                <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-xs font-bold text-white drop-shadow">
                  <Play className="size-3.5 fill-white" /> {fmt(g.view_count)}
                </span>
              ) : (
                g.count > 1 && <span className="absolute top-1.5 right-1.5 rounded bg-black/50 px-1 text-[10px] font-bold text-white">1/{g.count}</span>
              )}
              <span className="absolute inset-0 hidden items-center justify-center gap-3 bg-black/40 text-sm font-bold text-white group-hover:flex">
                <Heart className="size-4 fill-white" /> {fmt(g.like_count)}
              </span>
            </button>
          ))}
        </div>
      )}

      {edit && <EditProfile onClose={() => (setEdit(false), load())} />}
      {list && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setList(null)}>
          <div className="max-h-[75vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-chat p-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center">
              <span className="flex-1 font-bold capitalize">{list.which}</span>
              <button onClick={() => setList(null)} className="grid size-8 place-items-center rounded-full hover:bg-hover" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {list.ids.length === 0 ? (
              <p className="py-6 text-center text-sm text-sub">No one yet.</p>
            ) : (
              list.ids.map((id) => <ListRow key={id} id={id} onOpen={() => setList(null)} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ListRow({ id, onOpen }: { id: string; onOpen: () => void }) {
  const u = useApp((s) => s.profiles[id]);
  return (
    <button onClick={() => (onOpen(), u && gramGo({ view: "profile", username: u.username }))} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-hover">
      <Avatar userId={id} size={40} plain />
      <span className="min-w-0">
        <span className="block truncate font-semibold">
          <NameTag userId={id} badges={false} />
        </span>
        <span className="block truncate text-xs text-sub">@{u?.username}</span>
      </span>
    </button>
  );
}

function Stat({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="rounded-xl py-1 hover:bg-hover disabled:hover:bg-transparent">
      <div className="text-lg font-black tabular-nums">{fmt(n)}</div>
      <div className="text-xs text-sub">{label}</div>
    </button>
  );
}

/** edit avatar, background, name, username, bio */
export function EditProfile({ onClose }: { onClose: () => void }) {
  const meId = useApp((s) => s.userId)!;
  const me = useApp((s) => s.profiles[meId]);
  const [name, setName] = useState(me?.display_name ?? "");
  const [user, setUser] = useState(me?.username ?? "");
  const [bio, setBio] = useState(me?.bio ?? "");
  const [links, setLinks] = useState<ProfileLink[]>(me?.links?.length ? me.links : [{ type: "website", url: "", label: "" }]);
  const [busy, setBusy] = useState<string | null>(null);
  const av = useRef<HTMLInputElement>(null);
  const bg = useRef<HTMLInputElement>(null);
  const inp = "w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent";

  const save = async () => {
    setBusy("Saving…");
    try {
      if (user.trim().toLowerCase() !== me?.username) {
        const u = await changeUsername(user);
        setUser(u);
        toast(`Username changed to @${u}`, "success");
      }
      const cleanLinks = links
        .map((l) => ({
          type: (l.type || "link").slice(0, 40),
          url: l.url.trim().slice(0, 300),
          label: (l.label || "").trim().slice(0, 40),
          ...(l.followers != null && l.followers > 0 ? { followers: l.followers } : {}),
        }))
        .filter((l) => l.url);
      await updateMyProfile({
        display_name: name.trim().slice(0, 32) || me?.display_name,
        bio: bio.slice(0, 190) || null,
        links: cleanLinks.slice(0, 6),
      });
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-[86] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-chat sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-36 overflow-hidden" style={{ background: me?.banner_url ? undefined : `linear-gradient(135deg, ${me?.avatar_color ?? "#5865f2"}, #12062b)` }}>
          {me?.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.banner_url} alt="" className="h-full w-full object-cover" />
          )}
          <input ref={bg} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setBusy("Uploading background…"); await uploadBanner(f); setBusy(null); } }} />
          <button onClick={() => bg.current?.click()} className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white">
            <ImagePlus className="size-4" /> Background
          </button>
          <button onClick={onClose} className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-black/60 text-white" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="-mt-12 px-5">
          <div className="relative w-fit">
            <Avatar userId={meId} size={96} plain className="ring-4 ring-chat" />
            <input ref={av} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setBusy("Uploading photo…"); await uploadAvatar(f); setBusy(null); } }} />
            <button onClick={() => av.current?.click()} className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full bg-accent text-white ring-4 ring-chat" aria-label="Change profile photo">
              <Camera className="size-4" />
            </button>
          </div>
        </div>
        <div className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Name</span>
            <input className={inp} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Username — your public page is /u/{user || "…"}</span>
            <div className="flex items-center rounded-xl border border-line focus-within:border-accent">
              <span className="pl-3 text-sm text-sub">@</span>
              <input className="w-full bg-transparent px-1 py-2 text-sm outline-none" value={user} maxLength={24} onChange={(e) => setUser(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} />
            </div>
            <span className="mt-1 block text-[11px] text-sub">3–24 letters, numbers, _ or . — you can change it twice a week.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-sub">Bio ({(bio ?? "").length}/190)</span>
            <textarea className={cn(inp, "min-h-20")} value={bio ?? ""} maxLength={190} onChange={(e) => setBio(e.target.value)} />
          </label>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-sub">
              <span>Share links (shown on your public /u page)</span>
              {links.length < 6 && (
                <button type="button" onClick={() => setLinks([...links, { type: "link", url: "", label: "" }])} className="font-semibold text-accent">
                  + Add
                </button>
              )}
            </div>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr] gap-2">
                  <input className={inp} placeholder="Label" value={l.label ?? ""} maxLength={40} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className={inp} placeholder="https://…" value={l.url} maxLength={300} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                </div>
              ))}
            </div>
          </div>
          <button disabled={!!busy} onClick={() => void save()} className="w-full rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50">
            {busy ?? "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
