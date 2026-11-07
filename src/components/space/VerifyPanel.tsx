"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2, Send, CircleX } from "lucide-react";
import { useApp } from "@/store/app";
import { applyForVerification, latestVerifyRequest, type VerifyRequest } from "@/lib/serverVerify";
import VerifiedServerBadge from "@/components/ui/VerifiedServerBadge";

/** Apply for the verified checkmark (owners) / see status (everyone). */
export default function VerifyPanel({ spaceId, owner }: { spaceId: string; owner: boolean }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  const memberCount = useApp((s) => s.spaceMembers[spaceId]?.length ?? 0);
  const [req, setReq] = useState<VerifyRequest | null | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [links, setLinks] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void latestVerifyRequest(spaceId).then(setReq);
  }, [spaceId, space?.verified]);

  if (!space) return null;

  const perks = (
    <ul className="mt-2 space-y-1 text-[13px] text-sub">
      <li>✓ Green checkmark after the server name — sidebar, server list, invites and embeds</li>
      <li>✓ The owner and admins get a “Verified server” section on their profiles, by role</li>
      <li>✓ Free for every server — the Nexus team reviews each application</li>
    </ul>
  );

  if (space.verified) {
    return (
      <div className="rounded-2xl border border-[#23A55A]/40 bg-[#23A55A]/10 p-4">
        <div className="flex items-center gap-2 text-lg font-black">
          {space.name} <VerifiedServerBadge size={20} />
        </div>
        <p className="mt-1 text-sm text-sub">
          This server is verified{space.verified_at ? ` since ${new Date(space.verified_at).toLocaleDateString()}` : ""}.
        </p>
        {perks}
      </div>
    );
  }

  const cooldownUntil =
    req?.status === "rejected" && req.reviewed_at ? new Date(new Date(req.reviewed_at).getTime() + 14 * 864e5) : null;
  const coolingDown = cooldownUntil && cooldownUntil > new Date();

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-side p-4">
        <div className="flex items-center gap-2 text-base font-black">
          Get verified <VerifiedServerBadge size={18} />
        </div>
        <p className="mt-1 text-sm text-sub">For official artist, label, creator and community servers.</p>
        {perks}
      </div>

      {req === undefined ? (
        <p className="text-sm text-sub">Loading…</p>
      ) : req?.status === "pending" ? (
        <div className="flex items-start gap-3 rounded-2xl bg-idle/10 p-4 ring-1 ring-idle/30">
          <Clock className="mt-0.5 size-5 shrink-0 text-idle" />
          <div>
            <div className="font-bold">Application under review</div>
            <p className="text-sm text-sub">Sent {new Date(req.created_at).toLocaleDateString()}. Nexus Bot will DM the owner with the decision.</p>
          </div>
        </div>
      ) : (
        <>
          {req?.status === "rejected" && (
            <div className="flex items-start gap-3 rounded-2xl bg-dnd/10 p-4 ring-1 ring-dnd/30">
              <CircleX className="mt-0.5 size-5 shrink-0 text-dnd" />
              <div>
                <div className="font-bold">Last application wasn’t approved</div>
                {req.note && <p className="text-sm text-sub">“{req.note}”</p>}
                {coolingDown && <p className="text-sm text-sub">You can apply again on {cooldownUntil!.toLocaleDateString()}.</p>}
              </div>
            </div>
          )}
          {owner ? (
            !coolingDown && (
              <div className="space-y-2 rounded-2xl bg-side p-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Why should this server be verified?</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                    placeholder="Who runs it, what it's for, who it represents (artist, label, brand, creator)…"
                    className="min-h-28 w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <span className="text-[11px] text-faint">{reason.trim().length}/1000 · at least 20 characters</span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold tracking-wide text-sub uppercase">Official links (one per line, up to 5)</span>
                  <textarea
                    value={links}
                    onChange={(e) => setLinks(e.target.value)}
                    placeholder={"https://open.spotify.com/artist/…\nhttps://instagram.com/…"}
                    className="min-h-20 w-full rounded-xl border border-line bg-transparent px-3 py-2 font-mono text-[13px] outline-none focus:border-accent"
                  />
                </label>
                <p className="text-[11px] text-faint">{memberCount} members right now · active, well-moderated servers get approved faster.</p>
                <button
                  disabled={sending || reason.trim().length < 20}
                  onClick={async () => {
                    setSending(true);
                    const list = links
                      .split(/\s+/)
                      .map((l) => l.trim())
                      .filter((l) => /^https:\/\//i.test(l))
                      .slice(0, 5);
                    const r = await applyForVerification(spaceId, reason, list);
                    setSending(false);
                    if (r) setReq(r);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-2.5 font-bold text-white disabled:opacity-50"
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Apply for verification
                </button>
              </div>
            )
          ) : (
            <p className="rounded-2xl bg-side p-4 text-sm text-sub">Only the server owner can apply.</p>
          )}
        </>
      )}
    </div>
  );
}
