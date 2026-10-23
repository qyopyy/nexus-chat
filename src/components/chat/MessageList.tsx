"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useApp } from "@/store/app";
import { useChat } from "@/store/chat";
import { loadOlder } from "@/lib/data";
import { formatDay, sameDay } from "@/lib/utils";
import MessageBubble from "./MessageBubble";
import type { Message } from "@/lib/types";

const GROUP_GAP = 5 * 60 * 1000;

export default function MessageList({ conversationId, initialUnread }: { conversationId: string; initialUnread: number }) {
  const messages = useChat((s) => s.messages);
  const loading = useChat((s) => s.loading);
  const hasMore = useChat((s) => s.hasMore);
  const jumpTo = useChat((s) => s.jumpTo);
  const me = useApp((s) => s.userId);
  const kind = useApp((s) => s.convKinds[conversationId]);
  const showNames = kind !== "dm";

  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const snapshot = useRef<{ height: number; top: number; firstId: string | undefined } | null>(null);
  const lastCount = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [unreadMarker, setUnreadMarker] = useState<string | null>(null);

  // place the "NEW" divider once, on first load
  useEffect(() => {
    if (unreadMarker || initialUnread <= 0 || messages.length === 0) return;
    const others = messages.filter((m) => m.author_id !== me);
    const target = others[Math.max(0, others.length - initialUnread)];
    if (target) setUnreadMarker(target.id);
  }, [messages, initialUnread, me, unreadMarker]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const snap = snapshot.current;
    if (snap && messages[0]?.id !== snap.firstId) {
      // older messages were prepended — keep the viewport anchored
      el.scrollTop = el.scrollHeight - snap.height + snap.top;
      snapshot.current = null;
    } else if (messages.length !== lastCount.current) {
      const last = messages[messages.length - 1];
      const firstLoad = lastCount.current === 0;
      if (firstLoad || atBottom.current || last?.author_id === me) {
        el.scrollTop = el.scrollHeight;
      }
    }
    lastCount.current = messages.length;
  }, [messages, me]);

  // keep pinned to bottom while images load
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!jumpTo) return;
    const node = ref.current?.querySelector<HTMLElement>(`[data-mid="${jumpTo}"]`);
    if (node) {
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      node.classList.remove("flash");
      void node.offsetWidth;
      node.classList.add("flash");
    }
    useChat.setState({ jumpTo: null });
  }, [jumpTo]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = dist < 120;
    setShowJump(dist > 600);
    if (el.scrollTop < 240 && hasMore && !loading && !snapshot.current) {
      snapshot.current = { height: el.scrollHeight, top: el.scrollTop, firstId: messages[0]?.id };
      void loadOlder().then(() => {
        // nothing was prepended → release snapshot
        if (snapshot.current && useChat.getState().messages[0]?.id === snapshot.current.firstId) snapshot.current = null;
      });
    }
  }

  const byId = useMemo(() => {
    const map: Record<string, Message> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} onScroll={onScroll} className="chat-wallpaper h-full overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col px-2 py-4 sm:px-6">
          {!hasMore && messages.length > 0 && (
            <div className="mb-6 self-center rounded-2xl bg-black/30 px-4 py-2 text-center text-sm text-sub">This is the beginning of the conversation ✨</div>
          )}
          {loading && messages.length === 0 && <SkeletonRows />}
          {!loading && messages.length === 0 && (
            <div className="mt-24 self-center rounded-2xl bg-black/30 px-6 py-5 text-center">
              <div className="mb-1 text-4xl">👋</div>
              <div className="font-semibold">No messages here yet</div>
              <div className="text-sm text-sub">Send a message or drop a file to get things started.</div>
            </div>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const d = new Date(m.created_at);
            const newDay = !prev || !sameDay(new Date(prev.created_at), d);
            const joinsPrev =
              !!prev && !newDay && prev.author_id === m.author_id && d.getTime() - new Date(prev.created_at).getTime() < GROUP_GAP;
            const joinsNext =
              !!next &&
              next.author_id === m.author_id &&
              sameDay(new Date(next.created_at), d) &&
              new Date(next.created_at).getTime() - d.getTime() < GROUP_GAP &&
              next.id !== unreadMarker;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="sticky top-2 z-10 my-3 self-center rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
                    {formatDay(m.created_at)}
                  </div>
                )}
                {m.id === unreadMarker && (
                  <div className="my-2 flex items-center gap-2">
                    <div className="h-px flex-1 bg-dnd" />
                    <span className="rounded bg-dnd px-1.5 text-[10px] font-bold text-white">NEW</span>
                  </div>
                )}
                <MessageBubble
                  message={m}
                  mine={m.author_id === me}
                  first={!joinsPrev || m.id === unreadMarker}
                  last={!joinsNext}
                  showNames={showNames}
                  replied={m.reply_to_id ? byId[m.reply_to_id] ?? null : null}
                />
              </Fragment>
            );
          })}
        </div>
      </div>
      {showJump && (
        <button
          onClick={() => ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })}
          className="absolute right-6 bottom-4 grid size-11 animate-pop place-items-center rounded-full bg-side text-txt shadow-xl hover:bg-hover"
          aria-label="Jump to latest"
        >
          <ChevronDown className="size-6" />
        </button>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-4">
      {[60, 40, 75, 30, 55].map((w, i) => (
        <div key={i} className={i % 2 ? "flex justify-end" : "flex"}>
          <div className="h-10 animate-pulse rounded-2xl bg-white/5" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}
