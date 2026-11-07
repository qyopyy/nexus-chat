"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useEmojis, requestEmoji, parseEmojiToken } from "@/lib/customEmoji";

/** Renders a custom emoji by id (falls back to :name: while loading or if deleted). */
export function CustomEmojiImg({ id, name, className, big }: { id: string; name: string; className?: string; big?: boolean }) {
  const e = useEmojis((s) => s.byId[id]);
  useEffect(() => {
    if (e === undefined) requestEmoji(id);
  }, [e, id]);
  if (!e) {
    return <span className={cn("text-sub", className)}>{`:${name}:`}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={e.url}
      alt={`:${e.name}:`}
      title={`:${e.name}:`}
      draggable={false}
      loading="lazy"
      className={cn("inline-block object-contain align-[-0.3em]", big ? "size-12" : "size-[1.375em]", className)}
    />
  );
}

/** A reaction / any emoji string: unicode stays text, `<:name:id>` becomes the image. */
export function EmojiText({ value, className }: { value: string; className?: string }) {
  const t = parseEmojiToken(value);
  if (t) return <CustomEmojiImg id={t.id} name={t.name} className={cn("size-[1.15em] align-[-0.2em]", className)} />;
  return <span className={className}>{value}</span>;
}
