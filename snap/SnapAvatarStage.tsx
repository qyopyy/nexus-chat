"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { isMobileDevice, startAvatar, type AvatarEngine, type VAvatar } from "@/lib/vavatar";
import { avatarSize, drawFullBody, type SceneImage } from "@/lib/snapAvatar";

export type AvatarHandle = {
  /** copy of the current frame */
  snapshot: () => HTMLCanvasElement | null;
  /** video (+ microphone if allowed) for MediaRecorder; call release() when done */
  recordStream: (withAudio: boolean) => Promise<{ stream: MediaStream; release: () => void; silent: boolean } | null>;
  /** true when the colour effect is already painted on the canvas (otherwise the caller applies it to photos) */
  filtered: boolean;
};

const canFilter = () => typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;

/** Live full-body avatar that follows your face (front camera, on-device) and stands in the chosen scene. */
const SnapAvatarStage = forwardRef<
  AvatarHandle,
  { cfg: VAvatar; sceneKey: string; bg: SceneImage | null; ratio: number | null; longEdge: number; fxCss: string; onReady: (ok: boolean) => void }
>(function SnapAvatarStage({ cfg, sceneKey, bg, ratio, longEdge, fxCss, onReady }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const eng = useRef<AvatarEngine | null>(null);
  const live = useRef({ sceneKey, bg, fxCss });
  live.current = { sceneKey, bg, fxCss };
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const [mode, setMode] = useState<"loading" | "face" | "voice">("loading");
  const filtered = canFilter();

  useEffect(() => {
    const { w, h } = avatarSize(ratio, longEdge, isMobileDevice());
    const e = startAvatar({
      cfg: cfgRef.current,
      width: w,
      height: h,
      camera: true,
      onMode: setMode,
      render: (g, c, p, W, H, t) => {
        const L = live.current;
        const f = canFilter();
        if (f) g.filter = L.fxCss === "none" ? "none" : L.fxCss;
        drawFullBody(g, c, p, W, H, t, { sceneKey: L.sceneKey, img: L.bg?.el ?? null, imgSize: L.bg ? { w: L.bg.w, h: L.bg.h } : undefined });
        if (f) g.filter = "none";
      },
    });
    e.canvas.className = "h-full w-full object-cover";
    host.current?.appendChild(e.canvas);
    eng.current = e;
    onReady(true);
    return () => {
      e.stop();
      e.canvas.remove();
      eng.current = null;
      onReady(false);
    };
    // onReady is stable enough: it only flips a boolean in the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio, longEdge]);

  useEffect(() => {
    eng.current?.setLook(cfg);
  }, [cfg]);

  useImperativeHandle(
    ref,
    () => ({
      filtered,
      snapshot() {
        const src = eng.current?.canvas;
        if (!src) return null;
        const c = document.createElement("canvas");
        c.width = src.width;
        c.height = src.height;
        c.getContext("2d")?.drawImage(src, 0, 0);
        return c;
      },
      async recordStream(withAudio) {
        const e = eng.current;
        if (!e) return null;
        const tracks: MediaStreamTrack[] = [...e.stream().getVideoTracks()];
        let mic: MediaStream | null = null;
        if (withAudio && navigator.mediaDevices?.getUserMedia) {
          try {
            mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            tracks.push(...mic.getAudioTracks());
          } catch {
            mic = null;
          }
        }
        return { stream: new MediaStream(tracks), silent: withAudio && !mic, release: () => mic?.getTracks().forEach((t) => t.stop()) };
      },
    }),
    [filtered],
  );

  return (
    <div className="relative h-full w-full" style={!filtered && fxCss !== "none" ? { filter: fxCss } : undefined}>
      <div ref={host} className="h-full w-full" />
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold">
        {mode === "face" ? "AVATAR · FACE TRACKING" : mode === "loading" ? "AVATAR · LOADING…" : "AVATAR · VOICE MODE"}
      </span>
    </div>
  );
});
export default SnapAvatarStage;
