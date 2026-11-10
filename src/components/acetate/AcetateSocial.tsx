"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  inviteCollaborator,
  loadCollaborators,
  loadNotices,
  loadPublicProfile,
  markNotices,
  removeCollaborator,
  reportAcetateError,
  setFollow,
  toggleLike,
  type AcetateCollaborator,
  type AcetateNotice,
  type AcetatePublicProfile,
} from "@/lib/acetate";
import { useApp } from "@/store/app";
import { loadProfiles } from "@/lib/data";
import { AcetateMark } from "./AcetateBits";

export function NotifyBell({ notices, onChanged }: { notices: AcetateNotice[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const unread = notices.filter((notice) => !notice.read_at).length;
  return (
    <div className="relative">
      <button type="button" aria-label="Notifications" onClick={() => setOpen((v) => !v)} className="relative rounded-full border border-[#3c342c] px-3 py-1 text-xs">
        Inbox
        {unread > 0 && <span className="ml-1 rounded-full bg-[#e4a15a] px-1.5 text-[#100e0c]">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-[#3c342c] bg-[#1a1612] p-2 shadow-xl">
          <div className="mb-1 flex items-center justify-between px-1 text-xs text-[#a3988c]">
            <span>Comments and invites</span>
            <button
              type="button"
              onClick={() => {
                void markNotices().then(onChanged).catch(reportAcetateError);
              }}
            >
              Mark read
            </button>
          </div>
          {notices.length === 0 && <p className="px-1 py-3 text-sm text-[#a3988c]">Nothing new.</p>}
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {notices.map((notice) => (
              <li key={notice.id}>
                <button
                  type="button"
                  onClick={() => {
                    void markNotices(notice.id).then(onChanged).catch(reportAcetateError);
                  }}
                  className={`w-full rounded-xl px-2 py-2 text-left text-sm ${notice.read_at ? "text-[#a3988c]" : "bg-[#2a241c]"}`}
                >
                  {notice.body}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Collaborators({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<AcetateCollaborator[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"listener" | "editor">("listener");
  const profiles = useApp((s) => s.profiles);

  async function refresh() {
    const next = await loadCollaborators(projectId);
    setRows(next);
    await loadProfiles(next.map((row) => row.user_id));
  }

  useEffect(() => {
    void refresh();
    // refresh is recreated each render; load once per project
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <section className="mt-4 rounded-3xl border border-[#3c342c] p-3">
      <h3 className="font-serif text-xl">Collaborators</h3>
      <p className="text-xs text-[#a3988c]">Editors can rename and comment. They cannot upload into your storage or see file paths.</p>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void inviteCollaborator(projectId, name.trim(), role)
            .then(() => {
              setName("");
              return refresh();
            })
            .catch(reportAcetateError);
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nexus username" className="min-w-32 flex-1 rounded-xl border border-[#3c342c] bg-transparent px-3 py-2 text-sm outline-none" />
        <select value={role} onChange={(e) => setRole(e.target.value as "listener" | "editor")} className="rounded-xl border border-[#3c342c] bg-[#1a1612] px-2 text-sm">
          <option value="listener">Listener</option>
          <option value="editor">Editor</option>
        </select>
        <button type="submit" className="rounded-full bg-[#f3eadf] px-3 text-sm font-semibold text-[#100e0c]">Invite</button>
      </form>
      <ul className="mt-2 space-y-1">
        {rows.map((row) => (
          <li key={row.user_id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">@{profiles[row.user_id]?.username || row.user_id.slice(0, 8)} · {row.role}</span>
            <button type="button" className="text-xs text-[#d4653a]" onClick={() => void removeCollaborator(projectId, row.user_id).then(refresh).catch(reportAcetateError)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LikeButton({ trackId, onDone }: { trackId: string; onDone?: () => void }) {
  return (
    <button
      type="button"
      className="rounded-full border border-[#3c342c] px-4 py-2 text-sm"
      onClick={() => {
        void toggleLike(trackId).then(onDone).catch(reportAcetateError);
      }}
    >
      Like
    </button>
  );
}

export default function AcetateProfile({ username }: { username: string }) {
  const [page, setPage] = useState<AcetatePublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setPage(await loadPublicProfile(username));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that profile");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  return (
    <div className="h-full overflow-y-auto bg-[#100e0c] text-[#f3eadf]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link href="/acetate" className="flex items-center gap-2">
          <AcetateMark size={28} />
          <span className="font-serif text-xl">Acetate</span>
        </Link>
        <Link href="/acetate/app" className="text-sm text-[#a3988c]">Library</Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16">
        {error && <p className="text-[#d4653a]">{error}</p>}
        {page && !page.ok && <p>No artist by that name.</p>}
        {page?.ok && (
          <>
            <p className="text-sm text-[#a3988c]">@{page.username}</p>
            <h1 className="font-serif text-4xl">{page.display_name}</h1>
            <p className="mt-2 text-sm text-[#a3988c]">{page.followers ?? 0} followers · {page.following ?? 0} following</p>
            <button
              type="button"
              className="mt-4 rounded-full bg-[#e4a15a] px-4 py-2 text-sm font-semibold text-[#100e0c]"
              onClick={() => {
                if (!page.id) return;
                void setFollow(page.id, !page.is_following).then(load).catch(reportAcetateError);
              }}
            >
              {page.is_following ? "Following" : "Follow"}
            </button>
            <ul className="mt-6 space-y-2">
              {(page.tracks ?? []).length === 0 && <li className="text-sm text-[#a3988c]">No public cuts yet. Private work stays in the library.</li>}
              {(page.tracks ?? []).map((track) => (
                <li key={track.id} className="flex items-center gap-3 rounded-2xl border border-[#3c342c] px-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{track.title}</span>
                    <span className="text-xs text-[#a3988c]">{track.status || "demo"} · {track.likes} likes</span>
                  </span>
                  <button type="button" className="text-sm text-[#e4a15a]" onClick={() => void toggleLike(track.id).then(load).catch(reportAcetateError)}>
                    {track.liked ? "Liked" : "Like"}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
