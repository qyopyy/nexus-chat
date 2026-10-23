"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Pencil, Reply, SendHorizontal, Smile, X } from "lucide-react";
import { useApp, conversationTitle } from "@/store/app";
import { useChat } from "@/store/chat";
import { sendMessage } from "@/lib/data";
import { sendTyping } from "@/lib/realtime";
import { cn, formatBytes } from "@/lib/utils";
import EmojiPicker from "@/components/ui/EmojiPicker";

const MAX_FILE = 25 * 1024 * 1024;

export default function Composer({
  conversationId,
  file,
  setFile,
}: {
  conversationId: string;
  file: File | null;
  setFile: (f: File | null) => void;
}) {
  const me = useApp((s) => s.userId);
  const title = useApp((s) => conversationTitle(s, conversationId));
  const kind = useApp((s) => s.convKinds[conversationId]);
  const replyTo = useChat((s) => s.replyTo);
  const replyAuthor = useApp((s) => (replyTo ? s.profiles[replyTo.author_id]?.display_name : undefined));
  const [text, setText] = useState("");
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    area.current?.focus();
  }, [conversationId, replyTo]);

  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  useEffect(() => {
    if (file && file.size > MAX_FILE) {
      alert(`That file is ${formatBytes(file.size)} — the limit is 25 MB.`);
      setFile(null);
    }
  }, [file, setFile]);

  // auto-grow
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  function submit() {
    if (!text.trim() && !file) return;
    void sendMessage(conversationId, text, file);
    setText("");
    setFile(null);
  }

  const placeholder = kind === "text" ? `Message #${title}` : kind === "dm" ? `Message @${title}` : "Write a message…";

  return (
    <div className="shrink-0 bg-wall px-2 pb-3 sm:px-6">
      <div className="mx-auto max-w-4xl">
        {(replyTo || file) && (
          <div className="flex items-center gap-3 rounded-t-xl border-b border-black/20 bg-side px-3 py-2">
            {replyTo ? (
              <>
                <Reply className="size-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1 border-l-2 border-accent pl-2">
                  <div className="text-xs font-semibold text-accent">Reply to {replyAuthor ?? "message"}</div>
                  <div className="truncate text-sm text-sub">{replyTo.content || replyTo.attachment_name}</div>
                </div>
                <button onClick={() => useChat.setState({ replyTo: null })} className="text-sub hover:text-txt" aria-label="Cancel reply">
                  <X className="size-5" />
                </button>
              </>
            ) : null}
            {file && (
              <div className={cn("flex min-w-0 items-center gap-2", replyTo ? "ml-2" : "flex-1")}>
                {preview ? (
                  <img src={preview} alt="" className="size-12 rounded-lg object-cover" />
                ) : (
                  <div className="grid size-12 place-items-center rounded-lg bg-accent text-white">
                    <FileText className="size-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-sub">{formatBytes(file.size)}</div>
                </div>
                <button onClick={() => setFile(null)} className="ml-auto text-sub hover:text-txt" aria-label="Remove file">
                  <X className="size-5" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className={cn("relative flex items-end gap-1 bg-side px-2 py-1.5", replyTo || file ? "rounded-b-xl" : "rounded-xl")}>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
              e.target.value = "";
            }}
          />
          <button onClick={() => fileInput.current?.click()} className="grid size-10 shrink-0 place-items-center rounded-full text-sub hover:text-txt" title="Attach a file">
            <Paperclip className="size-5" />
          </button>

          <textarea
            ref={area}
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value);
              if (me && e.target.value) sendTyping(me);
            }}
            onPaste={(e) => {
              const f = e.clipboardData.files?.[0];
              if (f) {
                e.preventDefault();
                setFile(f);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              } else if (e.key === "ArrowUp" && !text) {
                const mine = [...useChat.getState().messages].reverse().find((m) => m.author_id === me && !m.deleted_at && !m.attachment_url && !m.pending);
                if (mine) {
                  e.preventDefault();
                  useChat.setState({ editingId: mine.id });
                }
              } else if (e.key === "Escape") {
                useChat.setState({ replyTo: null });
              }
            }}
            className="max-h-[220px] min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-6 outline-none placeholder:text-sub"
          />

          <div className="relative">
            <button onClick={() => setPicker((v) => !v)} className="grid size-10 place-items-center rounded-full text-sub hover:text-idle" title="Emoji">
              <Smile className="size-5" />
            </button>
            {picker && (
              <EmojiPicker
                className="absolute right-0 bottom-12"
                onClose={() => setPicker(false)}
                onPick={(e) => {
                  setText((t) => t + e);
                  area.current?.focus();
                }}
              />
            )}
          </div>

          <button
            onClick={submit}
            disabled={!text.trim() && !file}
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full transition",
              text.trim() || file ? "bg-accent text-white hover:bg-accent-2" : "text-sub",
            )}
            title="Send"
          >
            <SendHorizontal className="size-5" />
          </button>
        </div>
        <EditHint />
      </div>
    </div>
  );
}

function EditHint() {
  const editing = useChat((s) => s.editingId);
  if (!editing) return null;
  return (
    <div className="mt-1 flex items-center gap-1 px-2 text-xs text-sub">
      <Pencil className="size-3" /> Editing message — enter to save, escape to cancel
    </div>
  );
}
