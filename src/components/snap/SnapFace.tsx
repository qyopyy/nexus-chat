"use client";

/** Round profile picture (or the first letter on the person's colour). */
export default function SnapFace({ url, name, color, size = 40 }: { url?: string | null; name?: string | null; color?: string | null; size?: number }) {
  const letter = (name || "?").trim().slice(0, 1).toUpperCase() || "?";
  const bg = color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#5865F2";
  return url && /^https:\/\//.test(url) ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full bg-white/10 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 select-none place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: bg, fontSize: size * 0.4 }}>
      {letter}
    </span>
  );
}
