"use client";

import { useEffect, useState } from "react";
import { Hash, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { joinSpace } from "@/lib/data";
import { toast, useApp } from "@/store/app";
import { cn, initials } from "@/lib/utils";
import type { InvitePreview } from "@/lib/invitePage";

const INVITE_RE =
  /(?:https?:\/\/[^\s]+)?(?:\/i\/|\?join=)([a-z0-9_-]{2,64})\b/i;

export function extractInviteCode(text: string): string | null {
  const m = text.match(INVITE_RE);
  return m?.[1]?.toLowerCase() ?? null;
}

/** In-chat / embed-style server invite card for /i/CODE or ?join=CODE links. */
export default function ServerInvite({ text }: { text: string }) {
  const code = extractInviteCode(text);
  const spaces = useApp((s) => s.spaces);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("space_invite_preview", { p_code: code });
      if (cancelled || error || !data) return;
      setPreview(data as InvitePreview);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!code) return null;
  const already = preview ? spaces.some((s) => s.id === preview.id) : false;

  return (
    <div
      className={cn(
        "mt-1.5 w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#1a1d24] text-left shadow-lg",
      )}
    >
      <div
        className="relative h-24 bg-cover bg-center"
        style={
          preview?.banner_url
            ? { backgroundImage: `linear-gradient(180deg, transparent, #1a1d24), url(${preview.banner_url})` }
            : { background: `linear-gradient(135deg, ${preview?.icon_color ?? "#2aabee"}99, #1a1d24)` }
        }
      />
      <div className="relative -mt-7 px-3 pb-3">
        <div
          className="mb-2 grid size-14 place-items-center overflow-hidden rounded-2xl border-4 border-[#1a1d24] text-sm font-black text-white shadow-lg"
          style={{ background: preview?.icon_color ?? "#2aabee" }}
        >
          {preview?.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.icon_url} alt="" className="size-full object-cover" />
          ) : (
            initials(preview?.name ?? code)
          )}
        </div>
        <div className="text-[10px] font-bold tracking-widest text-accent uppercase">Server invite</div>
        <div className="truncate text-base font-black">{preview?.name ?? `Invite · ${code}`}</div>
        {preview?.description ? <p className="mt-0.5 line-clamp-2 text-xs text-sub">{preview.description}</p> : null}
        <div className="mt-2 flex items-center gap-3 text-[11px] font-semibold text-sub">
          {preview && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" />
              {preview.member_count.toLocaleString()}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Hash className="size-3.5" />
            {code}
          </span>
        </div>
        <button
          disabled={busy || already}
          onClick={async () => {
            if (already) {
              if (preview) useApp.setState({ spaceId: preview.id, hub: null, mobileTab: "spaces" });
              return;
            }
            setBusy(true);
            const err = await joinSpace(code);
            setBusy(false);
            if (err) toast(err, "error");
            else toast("Joined the server", "success");
          }}
          className="mt-3 w-full rounded-full bg-accent py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {already ? "Open server" : busy ? "Joining…" : "Join server"}
        </button>
      </div>
    </div>
  );
}
