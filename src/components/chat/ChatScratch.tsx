"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, errorText } from "@/lib/supabase";
import { useApp } from "@/store/app";
import Sheet from "@/components/ui/Sheet";

/** Private note on a conversation. RLS keeps it to the signed-in member. */
export default function ChatScratch({ conversationId, open, onClose }: { conversationId: string; open: boolean; onClose: () => void }) {
  const userId = useApp((s) => s.userId);
  const [body, setBody] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "missing">("loading");
  const [err, setErr] = useState<string | null>(null);
  const skipSave = useRef(true);
  const ready = useRef(false);

  useEffect(() => {
    if (!open || !userId) return;
    let live = true;
    skipSave.current = true;
    ready.current = false;
    setState("loading");
    setErr(null);
    void supabase
      .from("chat_scratch")
      .select("body")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          if (/chat_scratch|schema cache|42P01|PGRST205/i.test(error.message)) setState("missing");
          else {
            setErr(errorText(error));
            setState("ready");
          }
          return;
        }
        skipSave.current = true;
        ready.current = true;
        setBody((data?.body as string | undefined) ?? "");
        setState("ready");
      });
    return () => {
      live = false;
    };
  }, [open, userId, conversationId]);

  useEffect(() => {
    if (!open || !userId || !ready.current) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      setState("saving");
      const text = body.trim().slice(0, 2000);
      const query = text
        ? supabase.from("chat_scratch").upsert({ user_id: userId, conversation_id: conversationId, body: text, updated_at: new Date().toISOString() })
        : supabase.from("chat_scratch").delete().eq("user_id", userId).eq("conversation_id", conversationId);
      void query.then(({ error }) => {
        if (error) {
          if (/chat_scratch|schema cache|42P01|PGRST205/i.test(error.message)) setState("missing");
          else setErr(errorText(error));
          setState((current) => (current === "saving" ? "ready" : current));
          return;
        }
        setErr(null);
        setState("saved");
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [body, open, userId, conversationId]);

  return (
    <Sheet open={open} onClose={onClose} title="Scratch note">
      <p className="mb-3 text-sm text-sub">Only you can see this. It stays with the chat, not inside the messages.</p>
      {state === "missing" ? (
        <p className="text-sm text-sub">Scratch notes need the latest database update. Chat still works without them.</p>
      ) : (
        <textarea
          value={body}
          maxLength={2000}
          onChange={(event) => {
            setBody(event.target.value);
            setState("ready");
          }}
          placeholder="A reminder, a lyric, a link to come back to…"
          className="min-h-36 w-full resize-y rounded-xl bg-rail px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent"
        />
      )}
      <p className="mt-2 text-xs text-sub">
        {err || (state === "saving" ? "Saving…" : state === "saved" ? "Saved on your account" : `${body.length}/2000`)}
      </p>
    </Sheet>
  );
}
