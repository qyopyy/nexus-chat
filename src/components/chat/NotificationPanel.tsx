"use client";

import { emojiPlain } from "@/lib/customEmoji";
import { Bell, CheckCheck, X } from "lucide-react";
import {
  markNotificationsRead,
  openLocalNotification,
  openNotification,
  setNotificationPanelOpen,
  useNotificationInbox,
} from "@/lib/notifications";
import { fmtClock } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import Avatar from "@/components/ui/Avatar";

/** Realtime messaging notification inbox — powered by Supabase + FCM companion store. */
export default function NotificationPanel({ mobile }: { mobile?: boolean }) {
  const open = useNotificationInbox((s) => s.open);
  const items = useNotificationInbox((s) => s.items);
  const localItems = useNotificationInbox((s) => s.localItems);
  const unread = useNotificationInbox((s) => s.unread);
  const loaded = useNotificationInbox((s) => s.loaded);
  const empty = loaded && !items.length && !localItems.length;

  if (!open) return null;

  return (
    <div className={cn("absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-2xl", mobile ? "inset-x-3 top-14 max-h-[70vh]" : "top-12 right-3 w-[360px] max-h-[min(70vh,520px)]")}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Bell className="size-4 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Notifications</div>
          <div className="text-[11px] text-sub">{unread ? `${unread} unread · live` : "Caught up · live from server"}</div>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => void markNotificationsRead()}
            className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10"
          >
            <CheckCheck className="size-3.5" /> Read all
          </button>
        )}
        <button type="button" aria-label="Close" onClick={() => setNotificationPanelOpen(false)} className="grid size-8 place-items-center rounded-full hover:bg-hover">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : empty ? (
          <p className="px-4 py-10 text-center text-sm text-sub">No notifications yet.</p>
        ) : (
          <ul>
            {localItems.map((it) => (
              <li key={it.id} className="border-b border-white/5 last:border-0">
                <button
                  type="button"
                  onClick={() => openLocalNotification(it)}
                  className={cn("flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-hover", !it.read_at && "bg-accent/5")}
                >
                  <span className="grid size-9 place-items-center rounded-full bg-white/10">⏰</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate text-sm", !it.read_at ? "font-bold" : "font-semibold")}>{it.title}</span>
                      {!it.read_at && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                    </div>
                    <div className="truncate text-[12px] text-sub">{emojiPlain(it.body)}</div>
                    <div className="mt-0.5 text-[10px] text-faint">{fmtClock(new Date(it.created_at))}</div>
                  </div>
                </button>
              </li>
            ))}
            {items.map((it) => (
              <li key={it.id} className="border-b border-white/5 last:border-0">
                <button
                  type="button"
                  onClick={() => void openNotification(it)}
                  className={cn("flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-hover", !it.read_at && "bg-accent/5")}
                >
                  {it.actor_id ? <Avatar userId={it.actor_id} size={36} /> : <span className="grid size-9 place-items-center rounded-full bg-white/10">💬</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate text-sm", !it.read_at ? "font-bold" : "font-semibold")}>{it.title}</span>
                      {!it.read_at && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                    </div>
                    <div className="truncate text-[12px] text-sub">{emojiPlain(it.body)}</div>
                    <div className="mt-0.5 text-[10px] text-faint">{fmtClock(new Date(it.created_at))}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-line px-3 py-2 text-[10px] text-sub">
        Messages sync to Nexus servers · event reminders stay on this device
      </div>
    </div>
  );
}

export function NotificationBellButton({ className }: { className?: string }) {
  const unread = useNotificationInbox((s) => s.unread);
  const open = useNotificationInbox((s) => s.open);
  return (
    <button
      type="button"
      aria-label="Message notifications"
      onClick={() => setNotificationPanelOpen(!open)}
      className={cn("relative grid size-10 place-items-center rounded-full text-accent active:bg-white/10 hover:bg-hover", className)}
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] rounded-full bg-dnd px-1 text-center text-[10px] leading-[16px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
