"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, Copy, Download, Grid3x3, Images, Link2, MessageSquarePlus, Mic, MicOff, PersonStanding, Radar, RefreshCw, RotateCcw, Search, Send, Settings as SettingsIcon, Share2, Shirt, SlidersHorizontal, Sparkles, Timer, Trash2, Type, UserPlus, Video, X, Zap, ZapOff } from "lucide-react";
import { toast, useApp, conversationTitle, openModal } from "@/store/app";
import { sendMessage } from "@/lib/data";
import { createShare, removeVault, shareLink, uploadVault, type VaultFile, type VaultShare } from "@/lib/protect";
import {
  SNAP_EFFECTS,
  SNAP_EXPIRY,
  SNAP_FOLDER,
  SNAP_QUALITY,
  SNAP_RATIOS,
  applyEffect,
  baseMime,
  cameraErrorMessage,
  cropRect,
  effectByKey,
  expiryKey,
  fitBox,
  fitWithin,
  formatDuration,
  needsCanvasPipeline,
  nextTimer,
  parseExpiry,
  parseTimer,
  pickVideoMime,
  qualityByKey,
  ratioByKey,
  snapFileName,
  snapShareText,
  type Facing,
} from "@/lib/snap";
import { CAPTION_MAX, SNAP_OVERLAYS, SNAP_STICKERS, cleanCaption, decorate, hasDeco, overlayKey, stampText, stickerKey } from "@/lib/snapFx";
import { CUSTOM_SCENE, normalizeSceneKey, fileToSceneImage, sceneImageFromUrl, type SceneImage } from "@/lib/snapAvatar";
import { DEFAULT_AVATAR, normalizeAvatar, type VAvatar } from "@/lib/vavatar";
import { cn } from "@/lib/utils";
import SnapAvatarEditor from "./SnapAvatarEditor";
import SnapAvatarStage, { type AvatarHandle } from "./SnapAvatarStage";
import SnapGallery from "./SnapGallery";
import SnapShareSheet from "./SnapShareSheet";
import { roundPosition, sendText, snapNote, type GridStyle, type SnapPrefs } from "@/lib/snapPrefs";
import { getPrefs, setLastGeo, setPrefs, usePrefs } from "@/lib/snapPrefsStore";
import { SnapZoom } from "./SnapZoom";
import { DIGITAL_ZOOM, clampZoom, digitalCrop, easeZoom, wheelFactor } from "@/lib/snapZoom";
import { isIOSDevice, streamIsDead } from "@/lib/snapDevice";
import { constraintLadder, effectiveQualityKey, isCompactHeight, isLevel, pinchDistance, pinchZoom, rollFromGravity, tapToVideoPoint, upgradeTo, type DeviceInfo } from "@/lib/snapDevice";
import { shutterClick, timerBeep } from "@/lib/snapAudio";
import SnapSettings from "./SnapSettings";
import SnapProfile from "./SnapProfile";
import SnapPeople from "./SnapPeople";
import SnapFace from "./SnapFace";
import { dropTo } from "@/lib/snapDropNet";
import { statusLabel } from "@/lib/snapDrop";
import type { SnapUser } from "@/lib/snapShare";
import SnapDrop from "./SnapDrop";
import SnapVoice from "./SnapVoice";
import { Act, Sheet, copyText } from "./SnapUi";

type Mode = "photo" | "video";
type Shot = { file: File; url: string; video: boolean; durationMs: number | null };
type FocusCaps = { focusModes: string[]; exposureModes: string[]; exposure: { min: number; max: number; step: number } | null };

function locate(mode: SnapPrefs["geoTag"]): Promise<{ lat: number; lng: number } | null> {
  if (mode === "off" || typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((res) =>
    navigator.geolocation.getCurrentPosition(
      (p) => res(roundPosition(p.coords.latitude, p.coords.longitude, mode)),
      () => res(null),
      { timeout: 4000, maximumAge: 120000, enableHighAccuracy: mode === "precise" },
    ),
  );
}

function downloadFile(file: File) {
  try {
    const u = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = u;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  } catch {
    /* best effort */
  }
}

function readDevice(): DeviceInfo {
  const n = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  return {
    screenW: typeof screen !== "undefined" ? screen.width : 390,
    screenH: typeof screen !== "undefined" ? screen.height : 844,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2,
    memoryGb: n.deviceMemory,
    cores: n.hardwareConcurrency,
    saveData: n.connection?.saveData,
    effectiveType: n.connection?.effectiveType,
  };
}
type Saved = { vault: VaultFile; share: VaultShare; link: string };

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

/**
 * Nexus Snap: built-in camera for photos and videos (front and back), effects, quality and ratio.
 * Every capture is saved to the Nexus Drive vault (folder "Snap") with a nexusproject.cc/s/<token> link,
 * and can be sent to any Nexus user by username or email. Used full-screen in the chat app, the Apps hub and the Snap IPA.
 */
export default function SnapCamera({
  onClose,
  chatId,
  onAttach,
}: {
  onClose?: () => void;
  /** open conversation: shows "Send in this chat" */
  chatId?: string | null;
  /** composer hook: puts the photo or video in the message box */
  onAttach?: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const avatarRef = useRef<AvatarHandle>(null);
  const micRef = useRef<(() => void) | null>(null);

  const prefs = usePrefs();
  const prefsRef = useRef<SnapPrefs>(prefs);
  prefsRef.current = prefs;
  const [mode, setMode] = useState<Mode>(() => getPrefs().startMode);
  const [facing, setFacing] = useState<Facing>(() => getPrefs().startFacing);
  const [isIos, setIsIos] = useState(false);
  const nativeRef = useRef<HTMLInputElement>(null);
  const [dev] = useState<DeviceInfo>(readDevice);
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && isCompactHeight(window.innerHeight));
  const [settings, setSettings] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [target, setTarget] = useState<SnapUser | null>(null);
  const [sendingTo, setSendingTo] = useState(false);
  const myProfile = useApp((st) => (st.userId ? st.profiles[st.userId] : undefined));
  const [ring, setRing] = useState<{ x: number; y: number; locked: boolean; k: number } | null>(null);
  const [focusCaps, setFocusCaps] = useState<FocusCaps>({ focusModes: [], exposureModes: [], exposure: null });
  const [ev, setEv] = useState(0);
  const [showEv, setShowEv] = useState(false);
  const [roll, setRoll] = useState<number | null>(null);
  const [delArmed, setDelArmed] = useState(false);
  const saveSeq = useRef(0);
  const geoRef = useRef<{ lat: number; lng: number } | null>(null);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quality, setQuality] = useState(() => qualityByKey(store.get("snap.quality")).key);
  const [ratio, setRatio] = useState(() => ratioByKey(store.get("snap.ratio")).key);
  const [effect, setEffect] = useState(() => effectByKey(store.get("snap.effect")).key);
  const [expiry, setExpiry] = useState<number | null>(() => parseExpiry(store.get("snap.expiry")));
  const [panel, setPanel] = useState<null | "effects" | "settings" | "caption">(null);
  const [timer, setTimer] = useState(() => parseTimer(store.get("snap.timer")));
  const [countdown, setCountdown] = useState<number | null>(null);
  const [grid, setGrid] = useState(() => store.get("snap.grid") === "1");
  const [flashOn, setFlashOn] = useState(() => store.get("snap.flash") === "1");
  const [torchOk, setTorchOk] = useState(false);
  const [screenLight, setScreenLight] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number; digital?: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  const capsRef = useRef<{ min: number; max: number; step: number; digital?: boolean } | null>(null);
  const zoomNow = useRef(1);
  const zoomTarget = useRef(1);
  const zoomLoop = useRef<number | null>(null);
  const zoomShown = useRef({ v: 1, t: 0 });
  const zoomLock = useRef(false);
  const hwZoom = useRef<{ busy: boolean; pending: number | null }>({ busy: false, pending: null });
  const zoomBoxRef = useRef<HTMLDivElement>(null);
  const [mirror, setMirror] = useState(() => store.get("snap.mirror") === "1");
  const [overlay, setOverlay] = useState(() => overlayKey(store.get("snap.overlay")));
  const [caption, setCaption] = useState("");
  const [sticker, setSticker] = useState("");
  const [avatarOn, setAvatarOn] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [scene, setScene] = useState(() => normalizeSceneKey(store.get("snap.scene")));
  const [bg, setBg] = useState<SceneImage | null>(null);
  const [avOverride, setAvOverride] = useState<VAvatar | null>(null);
  const [editor, setEditor] = useState(false);
  const profileAv = useApp((st) => (st.userId ? st.profiles[st.userId]?.vavatar : null));
  const myAv = useMemo(() => (profileAv ? normalizeAvatar(profileAv) : DEFAULT_AVATAR), [profileAv]);
  const avCfg = avOverride ?? myAv;
  const [err, setErr] = useState<string | null>(null);
  const [noMic, setNoMic] = useState(false);
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [recMs, setRecMs] = useState<number | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "done" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [failMsg, setFailMsg] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [gallery, setGallery] = useState(false);
  const [voice, setVoice] = useState(false);
  const [picker, setPicker] = useState(false);
  const [toUser, setToUser] = useState(false);
  const [drop, setDrop] = useState(false);
  const [flash, setFlash] = useState(false);

  const qKey = effectiveQualityKey(quality, prefs.autoQuality, prefs.dataSaver, dev);
  const q = qualityByKey(qKey);
  const ratioDef = ratioByKey(ratio);
  const fx = effectByKey(effect);
  const recording = recMs !== null;

  const pick = {
    quality(k: string) {
      setQuality(qualityByKey(k).key);
      store.set("snap.quality", k);
    },
    ratio(k: string) {
      setRatio(ratioByKey(k).key);
      store.set("snap.ratio", k);
    },
    effect(k: string) {
      setEffect(effectByKey(k).key);
      store.set("snap.effect", k);
    },
    timer() {
      const n = nextTimer(timer);
      setTimer(n);
      store.set("snap.timer", String(n));
    },
    grid() {
      setGrid(!grid);
      store.set("snap.grid", grid ? "0" : "1");
    },
    flash() {
      setFlashOn(!flashOn);
      store.set("snap.flash", flashOn ? "0" : "1");
    },
    mirror(on: boolean) {
      setMirror(on);
      store.set("snap.mirror", on ? "1" : "0");
    },
    overlay(k: string) {
      setOverlay(overlayKey(k));
      store.set("snap.overlay", overlayKey(k));
    },
    scene(k: string) {
      setScene(normalizeSceneKey(k));
      store.set("snap.scene", normalizeSceneKey(k));
    },
    expiry(h: number | null) {
      setExpiry(h);
      store.set("snap.expiry", expiryKey(h));
    },
  };

  // live preview box = exactly the area that gets saved
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setBox(fitBox(el.clientWidth, el.clientHeight, avatarOn ? (ratioDef.r ?? 9 / 16) : ratioDef.r));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratioDef.r, shot, avatarOn]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (cdRef.current) clearInterval(cdRef.current);
    cdRef.current = null;
    micRef.current?.();
    micRef.current = null;
    setCountdown(null);
    const r = recRef.current;
    recRef.current = null;
    if (r && r.state !== "inactive") {
      r.onstop = null;
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecMs(null);
    setReady(false);
  }, []);

  const start = useCallback(
    async (f: Facing, withAudio: boolean, qk: string) => {
      stop();
      setErr(null);
      setNoMic(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr(cameraErrorMessage(null, window.isSecureContext));
        return;
      }
      const qq = qualityByKey(qk);
      // ask for the best size first, then ease off (some phones refuse an exact size) before giving up
      const open = async (audio: boolean) => {
        let last: unknown = null;
        for (const c of constraintLadder(f, qq, audio)) {
          try {
            return await navigator.mediaDevices.getUserMedia(c);
          } catch (e) {
            last = e;
            const n = (e as { name?: string } | null)?.name;
            if (n === "NotAllowedError" || n === "SecurityError" || n === "NotFoundError") break;
          }
        }
        throw last;
      };
      let s: MediaStream | null = null;
      try {
        s = await open(withAudio);
      } catch (e) {
        if (withAudio) {
          // no microphone (or blocked): still let people record silent video
          try {
            s = await open(false);
            setNoMic(true);
          } catch (e2) {
            setErr(cameraErrorMessage(e2, window.isSecureContext));
            return;
          }
        } else {
          setErr(cameraErrorMessage(e, window.isSecureContext));
          return;
        }
      }
      streamRef.current = s;
      try {
        const track = s.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as {
          torch?: boolean;
          zoom?: { min: number; max: number; step?: number };
          focusMode?: string[];
          exposureMode?: string[];
          exposureCompensation?: { min: number; max: number; step?: number };
          width?: { max?: number };
          height?: { max?: number };
        };
        const ec = caps.exposureCompensation;
        setFocusCaps({
          focusModes: Array.isArray(caps.focusMode) ? caps.focusMode : [],
          exposureModes: Array.isArray(caps.exposureMode) ? caps.exposureMode : [],
          exposure: ec && ec.max > ec.min ? { min: ec.min, max: ec.max, step: ec.step || 0.5 } : null,
        });
        setEv(0);
        // the first ask can come back smaller than the camera can really do: use the full size for this quality
        const up = upgradeTo(qq, track.getSettings(), caps);
        if (up) void track.applyConstraints({ width: { ideal: up.width }, height: { ideal: up.height } }).catch(() => undefined);
        setTorchOk(!!caps.torch);
        // real lens zoom where the camera has it; otherwise zoom the picture digitally (iPhone web views)
        const hw = caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.01 } : null;
        const zc = hw ?? { ...DIGITAL_ZOOM, step: 0.01, digital: true };
        capsRef.current = zc;
        setZoomCaps(zc);
        const cur = hw ? Number((track.getSettings() as { zoom?: number }).zoom) : 1;
        const first = clampZoom(Number.isFinite(cur) && cur > 0 ? cur : Math.max(1, zc.min), zc);
        zoomNow.current = first;
        zoomTarget.current = first;
        paintZoom(first, true);
      } catch {
        setTorchOk(false);
        capsRef.current = null;
        setZoomCaps(null);
      }
      const v = videoRef.current;
      if (v) {
        v.srcObject = s;
        await v.play().catch(() => undefined);
      }
      setReady(true);
    },
    [stop],
  );

  // (re)start the camera when the side, mode or quality changes
  useEffect(() => {
    if (shot || gallery || voice || avatarOn) return;
    void start(facing, mode === "video", qKey);
    return stop;
  }, [facing, mode, qKey, shot, gallery, voice, avatarOn, start, stop]);

  // short screens (iPhone SE, split view, landscape) get tighter controls
  useEffect(() => {
    const on = () => setCompact(isCompactHeight(window.innerHeight));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    setIsIos(isIOSDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
  }, []);

  // iOS stops the camera when another app (like the iPhone Camera) takes it. Bring it back when we return.
  useEffect(() => {
    if (shot || gallery || voice || avatarOn) return;
    const back = () => {
      if (document.visibilityState !== "visible" || recording) return;
      if (streamRef.current && streamIsDead(streamRef.current.getVideoTracks()[0])) void start(facing, mode === "video", qKey);
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    window.addEventListener("pageshow", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
      window.removeEventListener("pageshow", back);
    };
  }, [shot, gallery, voice, avatarOn, recording, facing, mode, qKey, start]);

  // keep the screen on while the camera is open
  useEffect(() => {
    if (!prefs.keepAwake) return;
    type Lock = { release: () => Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<Lock> } }).wakeLock;
    if (!wl) return;
    let lock: Lock | null = null;
    let dead = false;
    const get = () =>
      void wl
        .request("screen")
        .then((l) => (dead ? void l.release().catch(() => undefined) : (lock = l)))
        .catch(() => undefined);
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [prefs.keepAwake]);

  // level guide: roll angle from the accelerometer
  useEffect(() => {
    if (!prefs.levelGuide || shot || avatarOn) {
      setRoll(null);
      return;
    }
    const on = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;
      // iPhones and Androids report gravity with opposite signs; folding it makes "upright" 0 on both
      const s = g.y < 0 ? -1 : 1;
      setRoll(rollFromGravity(g.x * s, Math.abs(g.y)));
    };
    window.addEventListener("devicemotion", on);
    return () => window.removeEventListener("devicemotion", on);
  }, [prefs.levelGuide, shot, avatarOn]);

  // torch (back camera lamp) follows the flash button
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchOk) return;
    void track.applyConstraints({ advanced: [{ torch: flashOn && mode === "video" } as MediaTrackConstraintSet] }).catch(() => undefined);
  }, [flashOn, torchOk, mode, ready]);

  // ---- zoom: one glide engine for pinch, the lens chips, the dial, the slider and the mouse wheel
  function paintZoom(z: number, force = false) {
    const caps = capsRef.current;
    if (caps?.digital) {
      const el = zoomBoxRef.current;
      if (el) el.style.transform = z > 1.0005 ? `scale(${z})` : "";
    } else if (caps) {
      const h = hwZoom.current;
      if (h.busy) h.pending = z;
      else {
        h.busy = true;
        const track = streamRef.current?.getVideoTracks()[0];
        const done = () => {
          h.busy = false;
          if (h.pending !== null) {
            const next = h.pending;
            h.pending = null;
            paintZoom(next);
          }
        };
        if (track) void track.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }).then(done, done);
        else done();
      }
    }
    // the readout re-renders at ~30 per second so the glide stays light
    const now = performance.now();
    if (force || now - zoomShown.current.t > 33 || Math.abs(z - zoomShown.current.v) > 0.5) {
      zoomShown.current = { v: z, t: now };
      setZoom(z);
    }
  }
  const runZoom = () => {
    if (zoomLoop.current !== null) return;
    let last = performance.now();
    const tick = (t: number) => {
      const next = easeZoom(zoomNow.current, zoomTarget.current, Math.min(64, t - last));
      last = t;
      zoomNow.current = next;
      const arrived = next === zoomTarget.current;
      paintZoom(next, arrived);
      zoomLoop.current = arrived ? null : requestAnimationFrame(tick);
    };
    zoomLoop.current = requestAnimationFrame(tick);
  };
  const applyZoom = (z: number) => {
    const caps = capsRef.current;
    if (!caps || zoomLock.current) return;
    zoomTarget.current = clampZoom(z, caps);
    runZoom();
  };
  useEffect(
    () => () => {
      if (zoomLoop.current !== null) cancelAnimationFrame(zoomLoop.current);
    },
    [],
  );

  // ---- tap to focus, hold to lock, pinch to zoom, double-tap to flip
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<{ t: number; x: number; y: number; moved: boolean; held: boolean; pinch?: { d: number; z: number }; hold?: ReturnType<typeof setTimeout> } | null>(null);
  const lastTap = useRef(0);
  const lockedRef = useRef(false);

  const setFocusModes = (track: MediaStreamTrack, focus: string, exposure: string, poi?: { x: number; y: number }) => {
    const adv: Record<string, unknown> = {};
    if (poi) adv.pointsOfInterest = [poi];
    if (focusCaps.focusModes.includes(focus)) adv.focusMode = focus;
    if (focusCaps.exposureModes.includes(exposure)) adv.exposureMode = exposure;
    if (Object.keys(adv).length) void track.applyConstraints({ advanced: [adv as MediaTrackConstraintSet] }).catch(() => undefined);
  };

  const focusAt = (cx: number, cy: number, lock: boolean) => {
    const el = boxRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const r = el.getBoundingClientRect();
    const px = cx - r.left;
    const py = cy - r.top;
    lockedRef.current = lock;
    setRing({ x: px, y: py, locked: lock, k: Date.now() });
    if (ringTimer.current) clearTimeout(ringTimer.current);
    if (!lock) ringTimer.current = setTimeout(() => setRing(null), 1500);
    if (prefsRef.current.exposureSlider && focusCaps.exposure) {
      setShowEv(true);
      if (evTimer.current) clearTimeout(evTimer.current);
      evTimer.current = setTimeout(() => setShowEv(false), 4000);
    }
    if (prefsRef.current.haptics) {
      try {
        navigator.vibrate?.(lock ? 25 : 8);
      } catch {
        /* not supported */
      }
    }
    const track = streamRef.current?.getVideoTracks()[0];
    const pt = tapToVideoPoint(px, py, r.width, r.height, v.videoWidth, v.videoHeight, facing === "user");
    if (!track || !pt) return;
    // one focus pass at the tapped spot; then either stay (lock) or go back to automatic
    setFocusModes(track, "single-shot", "continuous", pt);
    setTimeout(() => setFocusModes(track, lock ? "manual" : "continuous", lock ? "manual" : "continuous"), 900);
  };

  const unlockFocus = () => {
    lockedRef.current = false;
    setRing(null);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) setFocusModes(track, "continuous", "continuous");
  };

  const gestureOn = !avatarOn && ready && !err;
  const onDown = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (gest.current?.hold) clearTimeout(gest.current.hold);
      gest.current = { t: 0, x: 0, y: 0, moved: true, held: false, pinch: { d: pinchDistance(a, b) || 1, z: zoomTarget.current } };
      return;
    }
    if (pointers.current.size > 2) return;
    const g: NonNullable<typeof gest.current> = { t: Date.now(), x: e.clientX, y: e.clientY, moved: false, held: false };
    if (prefsRef.current.tapFocus && prefsRef.current.focusLock) {
      g.hold = setTimeout(() => {
        if (gest.current === g && !g.moved) {
          g.held = true;
          focusAt(g.x, g.y, true);
        }
      }, 550);
    }
    gest.current = g;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gest.current;
    if (!g) return;
    if (pointers.current.size === 2 && g.pinch) {
      if (prefsRef.current.pinchZoom && zoomCaps) {
        const [a, b] = [...pointers.current.values()];
        applyZoom(pinchZoom(g.pinch.z, pinchDistance(a, b) / g.pinch.d, zoomCaps.min, zoomCaps.max));
      }
    } else if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) {
      g.moved = true;
      if (g.hold) clearTimeout(g.hold);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    const g = gest.current;
    if (pointers.current.size === 0) gest.current = null;
    if (!had || !g) return;
    if (g.hold) clearTimeout(g.hold);
    if (g.moved || g.pinch || g.held) return;
    const now = Date.now();
    if (prefsRef.current.doubleTapFlip && !recording && now - lastTap.current < 320) {
      lastTap.current = 0;
      setFacing((f) => (f === "user" ? "environment" : "user"));
      return;
    }
    lastTap.current = now;
    if (!prefsRef.current.tapFocus) return;
    if (lockedRef.current) unlockFocus();
    focusAt(e.clientX, e.clientY, false);
  };
  const onCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (gest.current?.hold) clearTimeout(gest.current.hold);
    if (pointers.current.size === 0) gest.current = null;
  };

  const applyEv = (v: number) => {
    setEv(v);
    const track = streamRef.current?.getVideoTracks()[0];
    void track?.applyConstraints({ advanced: [{ exposureCompensation: v } as MediaTrackConstraintSet] }).catch(() => undefined);
    if (evTimer.current) clearTimeout(evTimer.current);
    evTimer.current = setTimeout(() => setShowEv(false), 4000);
  };

  const pickBgImage = async (f: File) => {
    try {
      const img = await fileToSceneImage(f);
      setBg(img);
      pick.scene(CUSTOM_SCENE);
      try {
        localStorage.setItem("snap.sceneImg", img.dataUrl);
      } catch {
        toast("Picture is used now, but it is too big to remember for next time.");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read that picture", "error");
    }
  };
  const clearBgImage = () => {
    setBg(null);
    if (scene === CUSTOM_SCENE) pick.scene("ksubi999");
    try {
      localStorage.removeItem("snap.sceneImg");
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    const d = store.get("snap.sceneImg");
    if (d) void sceneImageFromUrl(d).then(setBg).catch(() => undefined);
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.url);
    },
    [shot],
  );

  const save = useCallback(
    async (file: File, durationMs: number | null, geo: { lat: number; lng: number } | null) => {
      const seq = ++saveSeq.current;
      const live = () => seq === saveSeq.current; // false once you went back or took another shot
      setPhase("saving");
      setProgress(0);
      setFailMsg("");
      setSaved(null);
      try {
        const vault = await uploadVault(file, SNAP_FOLDER, (p) => live() && setProgress(p), {
          kind: file.type.startsWith("video/") ? "video" : "artwork",
          note: snapNote(geo),
          duration_ms: durationMs,
          original: true,
        });
        const pr = prefsRef.current;
        const share = await createShare(vault.id, { expiresInHours: expiry, maxDownloads: pr.maxDownloads || null, password: "", download: pr.linkDownload });
        const link = shareLink(share);
        if (!live()) return;
        setSaved({ vault, share, link });
        setPhase("done");
        if (pr.autoCopyLink) void copyText(link).then((ok) => ok && toast("Link copied", "success"));
      } catch (e) {
        if (!live()) return;
        setFailMsg(e instanceof Error ? e.message : "Couldn't save to your vault.");
        setPhase("failed");
      }
    },
    [expiry],
  );

  /** where the shot was taken (only when location tags are on), then save */
  const begin = useCallback(
    async (file: File, durationMs: number | null) => {
      const seq = saveSeq.current + 1;
      setPhase("saving");
      const geo = await locate(prefsRef.current.geoTag);
      if (seq !== saveSeq.current + 1) return; // went back while locating
      geoRef.current = geo;
      setLastGeo(geo);
      await save(file, durationMs, geo);
    },
    [save],
  );

  const finish = useCallback(
    (file: File, video: boolean, durationMs: number | null) => {
      stop();
      setShot({ file, url: URL.createObjectURL(file), video, durationMs });
      if (prefsRef.current.downloadCopy) downloadFile(file);
      if (prefsRef.current.autoSave) void begin(file, durationMs);
      else setPhase("idle");
    },
    [stop, begin],
  );

  const takePhoto = useCallback(() => {
    let cv: HTMLCanvasElement;
    const av = avatarOn ? avatarRef.current : null;
    let pixelFx = effect !== "none";
    if (av) {
      const snap = av.snapshot();
      if (!snap) {
        toast("The avatar isn't ready yet.", "error");
        return;
      }
      cv = snap;
      if (av.filtered) pixelFx = false; // already painted on the avatar canvas
    } else {
      const v = videoRef.current;
      if (!v || !ready || !v.videoWidth) return;
      const c0 = cropRect(v.videoWidth, v.videoHeight, ratioDef.r);
      const c = capsRef.current?.digital ? digitalCrop(c0.sx, c0.sy, c0.sw, c0.sh, zoomNow.current) : c0;
      const { w, h } = fitWithin(c.sw, c.sh, q.maxEdge);
      cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const cx = cv.getContext("2d");
      if (!cx) {
        toast("Couldn't take the photo. Try again.", "error");
        return;
      }
      cx.imageSmoothingEnabled = true;
      cx.imageSmoothingQuality = "high"; // crisper when the picture is scaled down or digitally zoomed
      if (mirror && facing === "user") {
        cx.translate(w, 0);
        cx.scale(-1, 1);
      }
      cx.drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
      cx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    if (pixelFx) {
      const img = ctx.getImageData(0, 0, cv.width, cv.height);
      applyEffect(img.data, effect);
      ctx.putImageData(img, 0, 0);
    }
    const when = new Date();
    if (hasDeco({ overlay, caption, sticker })) decorate(ctx, cv.width, cv.height, { overlay, caption, sticker, when });
    if (prefsRef.current.screenFlash && !prefsRef.current.reduceMotion) {
      setFlash(true);
      setTimeout(() => setFlash(false), 160);
    }
    if (prefsRef.current.shutterSound) shutterClick();
    if (prefsRef.current.haptics) {
      try {
        navigator.vibrate?.(15);
      } catch {
        /* not supported */
      }
    }
    cv.toBlob(
      (blob) => {
        if (!blob) {
          toast("Couldn't take the photo. Try again.", "error");
          return;
        }
        const name = av ? snapFileName(when, "user").replace("snap-", "snap-avatar-") : snapFileName(when, facing);
        finish(new File([blob], name, { type: "image/jpeg" }), false, null);
      },
      "image/jpeg",
      q.jpeg,
    );
  }, [avatarOn, ready, ratioDef.r, q.maxEdge, q.jpeg, effect, facing, mirror, overlay, caption, sticker, finish]);

  const stopRecording = useCallback(() => {
    const r = recRef.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  const startRecording = useCallback(async () => {
    const av = avatarOn ? avatarRef.current : null;
    const stream = streamRef.current;
    const v = videoRef.current;
    zoomLock.current = false;
    if (av ? !avatarReady : !stream || !v || !ready) return;
    if (typeof MediaRecorder === "undefined") {
      toast("Video recording isn't supported in this browser. Update it, or use the photo mode.", "error");
      return;
    }
    const fmt = pickVideoMime((m) => MediaRecorder.isTypeSupported(m));
    let source: MediaStream;
    if (av) {
      const rs = await av.recordStream(true);
      if (!rs) return;
      source = rs.stream;
      micRef.current = rs.release;
      if (rs.silent) toast("Microphone is blocked, recording without sound.");
    } else if (!stream || !v) {
      return;
    } else if (!needsCanvasPipeline(effect, ratio) && !(capsRef.current?.digital && zoomNow.current > 1.001)) {
      source = stream;
      zoomLock.current = !!capsRef.current?.digital; // a raw stream can't be zoomed digitally mid-recording
    } else {
      source = stream;
      const c = cropRect(v.videoWidth, v.videoHeight, ratioDef.r);
      const { w, h } = fitWithin(c.sw, c.sh, q.videoH >= 2160 ? 3840 : q.videoH >= 1080 ? 1920 : 1280);
      const cv = document.createElement("canvas");
      cv.width = w - (w % 2);
      cv.height = h - (h % 2);
      const ctx = cv.getContext("2d");
      const canFilter = !!ctx && "filter" in ctx;
      if (ctx && typeof cv.captureStream === "function") {
        const css = canFilter ? fx.css : "none";
        if (effect !== "none" && !canFilter) toast("Effects on video need a newer browser. Recording without the effect.");
        const draw = () => {
          if (canFilter) ctx.filter = css;
          const k = capsRef.current?.digital ? digitalCrop(c.sx, c.sy, c.sw, c.sh, zoomNow.current) : c;
          ctx.drawImage(v, k.sx, k.sy, k.sw, k.sh, 0, 0, cv.width, cv.height);
          rafRef.current = requestAnimationFrame(draw);
        };
        draw();
        const cs = cv.captureStream(30);
        stream.getAudioTracks().forEach((t) => cs.addTrack(t));
        source = cs;
      } else if (effect !== "none" || ratioDef.r !== null) {
        toast("Effects and ratio apply to photos only on this browser.");
      }
    }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(source, fmt ? { mimeType: fmt.mime, videoBitsPerSecond: q.videoBps } : { videoBitsPerSecond: q.videoBps });
    } catch {
      try {
        rec = new MediaRecorder(source);
      } catch {
        cancelAnimationFrame(rafRef.current);
        micRef.current?.();
        micRef.current = null;
        toast("Couldn't start recording on this device.", "error");
        return;
      }
    }
    const chunks: Blob[] = [];
    const t0 = Date.now();
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      cancelAnimationFrame(rafRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      recRef.current = null;
      micRef.current?.();
      micRef.current = null;
      const ms = Date.now() - t0;
      const mime = baseMime(rec.mimeType || fmt?.mime || "video/webm");
      const blob = new Blob(chunks, { type: mime });
      if (blob.size === 0) {
        setRecMs(null);
        toast("Nothing was recorded. Try again.", "error");
        return;
      }
      const ext = mime.includes("mp4") ? "mp4" : mime.includes("quicktime") ? "mov" : "webm";
      finish(new File([blob], snapFileName(new Date(), av ? "user" : facing, ext), { type: mime }), true, ms);
    };
    recRef.current = rec;
    rec.start(1000);
    setRecMs(0);
    if (prefsRef.current.haptics) {
      try {
        navigator.vibrate?.(20);
      } catch {
        /* not supported */
      }
    }
    tickRef.current = setInterval(() => {
      const ms = Date.now() - t0;
      setRecMs(ms);
      if (ms >= prefsRef.current.maxVideoSec * 1000) stopRecording();
    }, 250);
  }, [avatarOn, avatarReady, ready, effect, ratio, ratioDef.r, q.videoH, q.videoBps, fx.css, facing, finish, stopRecording]);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const run = useCallback(async () => {
    if (mode === "video") {
      await startRecording();
      return;
    }
    // front camera has no lamp: light the screen for a moment instead
    if (flashOn && !torchOk && facing === "user" && !avatarOn) {
      setScreenLight(true);
      await sleep(380);
      takePhoto();
      setScreenLight(false);
      return;
    }
    if (flashOn && torchOk && facing === "environment" && !avatarOn) {
      const track = streamRef.current?.getVideoTracks()[0];
      await track?.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] }).catch(() => undefined);
      await sleep(350);
      takePhoto();
      await track?.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => undefined);
      return;
    }
    takePhoto();
  }, [mode, flashOn, torchOk, facing, avatarOn, startRecording, takePhoto]);

  /** iPhone: hand the shot to the real Camera app (its own focus, zoom, HDR, Night mode and lenses). */
  const nativeOn = isIos && prefs.nativeCamera && !avatarOn;
  const shoot = () => {
    if (recording) return stopRecording();
    if (nativeOn) {
      nativeRef.current?.click();
      return;
    }
    if (cdRef.current) {
      clearInterval(cdRef.current);
      cdRef.current = null;
      setCountdown(null);
      return;
    }
    if (timer <= 0) return void run();
    let n = timer;
    setCountdown(n);
    if (prefsRef.current.timerBeep) timerBeep();
    cdRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (cdRef.current) clearInterval(cdRef.current);
        cdRef.current = null;
        setCountdown(null);
        void run();
      } else {
        setCountdown(n);
        if (prefsRef.current.timerBeep) timerBeep(n === 1);
      }
    }, 1000);
  };

  const retake = () => {
    saveSeq.current++; // an upload still running no longer touches the screen
    geoRef.current = null;
    setLastGeo(null);
    setDelArmed(false);
    setShot(null);
    setSaved(null);
    setPhase("idle");
    setPicker(false);
    setToUser(false);
  };

  const discard = async () => {
    if (prefsRef.current.confirmDelete && !delArmed) {
      setDelArmed(true);
      setTimeout(() => setDelArmed(false), 3500);
      return;
    }
    setDelArmed(false);
    if (saved) await removeVault(saved.vault).catch(() => undefined);
    toast("Deleted from your vault");
    retake();
  };

  const copyLink = async () => {
    if (!saved) return;
    toast((await copyText(saved.link)) ? "Link copied" : saved.link, "success");
  };

  const shareSheet = async () => {
    if (!saved) return;
    try {
      if (navigator.share) await navigator.share({ title: "Nexus Snap", url: saved.link });
      else await copyLink();
    } catch {
      /* cancelled */
    }
  };

  const sendHere = async (convId: string, asLink: boolean) => {
    if (!shot) return;
    await sendMessage(convId, asLink && saved ? sendText(snapShareText(saved.link, shot.video ? "video" : "image"), geoRef.current, prefsRef.current.locationInSend) : "", asLink ? null : shot.file);
    toast("Sent", "success");
    setPicker(false);
    onClose?.();
  };

  const sendToTarget = async () => {
    if (!target || !saved || !shot) return;
    setSendingTo(true);
    try {
      const st = await dropTo(target, shot.file, saved.vault, expiry);
      toast(statusLabel(st, target.display_name || target.username), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send.", "error");
    } finally {
      setSendingTo(false);
    }
  };

  const attachAndClose = (f: File) => {
    onAttach?.(f);
    onClose?.();
  };

  const shutterOuter = prefs.bigShutter ? "size-[92px]" : compact ? "size-[62px]" : "size-[76px]";
  const shutterInner = prefs.bigShutter ? "size-[68px]" : compact ? "size-[44px]" : "size-14";
  const chats = useApp((s) => s.chatList);
  const state = useApp.getState();
  const mirrored = facing === "user";

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white">
      <div className="pointer-events-none absolute inset-0 z-30 bg-white transition-opacity duration-150" style={{ opacity: flash ? 0.85 : 0 }} />
      <header className={cn("relative z-20 flex items-center gap-2 px-3 pt-safe-3", compact ? "pb-1" : "pb-2")}>
        {shot ? (
          <button type="button" onClick={retake} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <ChevronLeft className="size-6" />
          </button>
        ) : onClose ? (
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-5" />
          </button>
        ) : (
          <span className="size-10" />
        )}
        <div className="flex-1 text-center text-sm font-extrabold tracking-wide">
          {recording ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1 text-xs">
              <span className="size-2 animate-pulse rounded-full bg-white" />
              {formatDuration(recMs ?? 0)}
            </span>
          ) : !shot && myProfile ? (
            <button type="button" onClick={() => setProfileOpen(true)} aria-label="Your profile" className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 hover:bg-white/20">
              <SnapFace url={myProfile.avatar_url} name={myProfile.display_name || myProfile.username} color={myProfile.avatar_color} size={28} />
              <span className="truncate text-xs font-bold">@{myProfile.username}</span>
            </button>
          ) : (
            "NEXUS SNAP"
          )}
        </div>
        {!shot && !avatarOn ? (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            disabled={recording}
            aria-label={facing === "user" ? "Switch to back camera" : "Switch to front camera"}
            className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
          >
            <RefreshCw className="size-5" />
          </button>
        ) : (
          <span className="size-10" />
        )}
      </header>

      {!shot ? (
        <>
          <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#0a0a10]">
            <div ref={boxRef} className="relative overflow-hidden bg-black" style={box && box.w ? { width: box.w, height: box.h } : { width: "100%", height: "100%" }}>
              <div ref={zoomBoxRef} className={cn("absolute inset-0 origin-center will-change-transform", avatarOn && "hidden")}>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={cn("h-full w-full object-cover", mirrored && "-scale-x-100")}
                  style={{ filter: fx.css === "none" ? undefined : fx.css }}
                />
              </div>
              {avatarOn && (
                <SnapAvatarStage ref={avatarRef} cfg={avCfg} sceneKey={scene} bg={bg} ratio={ratioDef.r} longEdge={Math.min(q.maxEdge, 1920)} fxCss={fx.css} onReady={setAvatarReady} />
              )}
              <PreviewDeco overlay={overlay} caption={caption} sticker={sticker} grid={grid && !avatarOn && prefs.gridStyle !== "off" ? prefs.gridStyle : null} />
              {gestureOn && (
                <div
                  className="absolute inset-0 z-[5] touch-none"
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onCancel}
                  onWheel={(e) => {
                    if (prefsRef.current.pinchZoom) applyZoom(zoomTarget.current * wheelFactor(e.deltaY));
                  }}
                />
              )}
              {zoomCaps && gestureOn && prefs.zoomControl && (
                <SnapZoom range={zoomCaps} zoom={zoom} onTarget={applyZoom} disabled={recording && zoomLock.current} haptics={prefs.haptics} />
              )}
              {ring && (
                <span className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2" style={{ left: ring.x, top: ring.y }}>
                  <span className={cn("block size-16 rounded-full border-2", ring.locked ? "border-amber-300" : "border-yellow-300")} />
                  {ring.locked && <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-extrabold text-black">AE/AF LOCK</span>}
                </span>
              )}
              {showEv && focusCaps.exposure && prefs.exposureSlider && (
                <div className={cn("absolute inset-x-6 z-[7] flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs", zoomCaps && prefs.zoomControl ? "bottom-16" : "bottom-3")}>
                  <span aria-hidden>☀</span>
                  <input type="range" min={focusCaps.exposure.min} max={focusCaps.exposure.max} step={focusCaps.exposure.step} value={ev} onChange={(e) => applyEv(Number(e.target.value))} className="w-full accent-yellow-300" aria-label="Brightness" />
                </div>
              )}
              {roll !== null && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[4] flex justify-center">
                  <span className={cn("h-0.5 w-2/3 rounded", isLevel(roll) ? "bg-emerald-400" : "bg-white/70")} style={{ transform: `rotate(${-roll}deg)` }} />
                </div>
              )}
              {countdown !== null && (
                <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
                  <span className="text-[120px] font-black leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,.8)]">{countdown}</span>
                </div>
              )}
              {target && (
                <button type="button" onClick={() => setTarget(null)} aria-label={`Stop sending to ${target.username}`} className="absolute left-1/2 top-2 z-[8] -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-extrabold text-black">
                  To @{target.username} ✕
                </button>
              )}
              {!avatarOn && prefs.cameraBadge && <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold">{facing === "user" ? "FRONT" : "BACK"}</span>}
              {noMic && mode === "video" && (
                <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold">
                  <MicOff className="size-3" /> No sound
                </span>
              )}
            </div>
            <div className={cn("absolute top-3 z-10 flex flex-col", prefs.leftHanded ? "left-2" : "right-2", compact ? "gap-1.5" : "gap-2")}>
              {!avatarOn && (
                <Tool label={flashOn ? "Flash on" : "Flash off"} on={flashOn} onClick={pick.flash}>
                  {flashOn ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
                </Tool>
              )}
              <Tool label={timer ? `Timer ${timer} seconds` : "Timer off"} on={timer > 0} onClick={pick.timer}>
                {timer ? <b className="text-sm">{timer}s</b> : <Timer className="size-5" />}
              </Tool>
              {!avatarOn && (
                <Tool label="Grid" on={grid} onClick={pick.grid}>
                  <Grid3x3 className="size-5" />
                </Tool>
              )}
              <Tool label="Caption and frames" on={panel === "caption" || !!caption || !!sticker || overlay !== "none"} onClick={() => setPanel((p) => (p === "caption" ? null : "caption"))}>
                <Type className="size-5" />
              </Tool>
              <Tool label="Voice messages" on={voice} onClick={() => !recording && setVoice(true)}>
                <Mic className="size-5" />
              </Tool>
              <Tool label={avatarOn ? "Back to camera" : "Full-body avatar"} on={avatarOn} onClick={() => !recording && setAvatarOn((v) => !v)}>
                <PersonStanding className="size-5" />
              </Tool>
              {avatarOn && (
                <Tool label="Avatar look and background" on={editor} onClick={() => setEditor(true)}>
                  <Shirt className="size-5" />
                </Tool>
              )}
              <Tool label="Find people" on={peopleOpen || !!target} onClick={() => !recording && setPeopleOpen(true)}>
                <Search className="size-5" />
              </Tool>
              <Tool label="Settings" on={settings} onClick={() => !recording && setSettings(true)}>
                <SettingsIcon className="size-5" />
              </Tool>
            </div>
            {err && !avatarOn && (
              <div className="absolute inset-0 grid place-items-center bg-[#0a0a10] p-8 text-center">
                <div className="max-w-sm space-y-4">
                  <Camera className="mx-auto size-10 text-white/50" />
                  <p className="text-sm text-white/80">{err}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={() => void start(facing, mode === "video", qKey)} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black">
                      Try again
                    </button>
                    <label className="cursor-pointer rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
                      {mode === "video" ? "Pick a video" : "Pick a photo"}
                      <input
                        type="file"
                        accept={mode === "video" ? "video/*" : "image/*"}
                        capture={facing}
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) finish(f, f.type.startsWith("video/"), null);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <input
            ref={nativeRef}
            type="file"
            accept={mode === "video" ? "video/*" : "image/*"}
            capture={facing === "user" ? "user" : "environment"}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) finish(f, f.type.startsWith("video/") || /\.(mov|mp4|m4v)$/i.test(f.name), null);
            }}
          />
          <div className={cn("relative z-20 px-4 pb-safe-2", compact ? "pt-1.5" : "pt-3")}>
            {panel === "effects" && (
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
                {SNAP_EFFECTS.map((e) => (
                  <button key={e.key} type="button" onClick={() => pick.effect(e.key)} className={cn("shrink-0 rounded-full px-3 py-1.5 font-semibold", effect === e.key ? "bg-white text-black" : "bg-white/10 text-white/80")}>
                    {e.label}
                  </button>
                ))}
              </div>
            )}
            {panel === "caption" && (
              <div className="mb-3 space-y-2 rounded-2xl bg-white/5 p-3 text-[11px]">
                <input
                  value={caption}
                  onChange={(e) => setCaption(cleanCaption(e.target.value.slice(0, CAPTION_MAX)))}
                  placeholder="Add a caption (photos)"
                  maxLength={CAPTION_MAX}
                  className="w-full rounded-full bg-white/10 px-4 py-2 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
                />
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button type="button" onClick={() => setSticker("")} className={cn("shrink-0 rounded-full px-3 py-1.5 font-semibold", !sticker ? "bg-white text-black" : "bg-white/10")}>
                    No sticker
                  </button>
                  {SNAP_STICKERS.map((e) => (
                    <button key={e} type="button" onClick={() => setSticker(stickerKey(e) === sticker ? "" : e)} className={cn("shrink-0 rounded-full px-2.5 py-1 text-base", sticker === e ? "bg-white" : "bg-white/10")}>
                      {e}
                    </button>
                  ))}
                </div>
                <Row label="Frame">
                  {SNAP_OVERLAYS.map((o) => (
                    <Chip key={o.key} on={overlay === o.key} onClick={() => pick.overlay(o.key)}>
                      {o.label}
                    </Chip>
                  ))}
                </Row>
                <p className="text-white/40">Captions, stickers and frames are burned into photos.</p>
              </div>
            )}
            {panel === "settings" && (
              <div className="mb-3 space-y-2 rounded-2xl bg-white/5 p-3 text-[11px]">
                <Row label="Quality">
                  <Chip on={prefs.autoQuality && !prefs.dataSaver} onClick={() => setPrefs({ autoQuality: true, dataSaver: false })} disabled={recording}>
                    Auto
                  </Chip>
                  {SNAP_QUALITY.map((o) => (
                    <Chip
                      key={o.key}
                      on={!prefs.autoQuality && !prefs.dataSaver && quality === o.key}
                      onClick={() => {
                        setPrefs({ autoQuality: false, dataSaver: false });
                        pick.quality(o.key);
                      }}
                      disabled={recording}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </Row>
                <Row label="Ratio">
                  {SNAP_RATIOS.map((o) => (
                    <Chip key={o.key} on={ratio === o.key} onClick={() => pick.ratio(o.key)} disabled={recording}>
                      {o.label}
                    </Chip>
                  ))}
                </Row>
                <Row label="Selfies">
                  <Chip on={!mirror} onClick={() => pick.mirror(false)}>
                    Natural
                  </Chip>
                  <Chip on={mirror} onClick={() => pick.mirror(true)}>
                    Mirrored
                  </Chip>
                </Row>
                {zoomCaps && !avatarOn && (
                  <Row label="Zoom">
                    <input type="range" min={zoomCaps.min} max={zoomCaps.max} step={zoomCaps.step} value={zoom} onChange={(e) => applyZoom(Number(e.target.value))} className="w-full accent-white" aria-label="Zoom" />
                  </Row>
                )}
                <Row label="Link lasts">
                  {SNAP_EXPIRY.map((o) => (
                    <Chip key={o.label} on={expiry === o.hours} onClick={() => pick.expiry(o.hours)}>
                      {o.label}
                    </Chip>
                  ))}
                </Row>
              </div>
            )}

            {!recording && (
              <div className={cn("flex items-center justify-center gap-1 text-xs font-bold", compact ? "mb-1.5" : "mb-3")}>
                {(["photo", "video"] as Mode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 capitalize", mode === m ? "bg-white text-black" : "text-white/70")}>
                    {m === "photo" ? <Camera className="size-3.5" /> : <Video className="size-3.5" />}
                    {m}
                  </button>
                ))}
              </div>
            )}

            <div className={cn("flex items-center justify-between", compact ? "mb-1" : "mb-2", prefs.leftHanded && "flex-row-reverse")}>
              <button type="button" onClick={() => setGallery(true)} disabled={recording} aria-label="Gallery" className="grid size-12 place-items-center rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-40">
                <Images className="size-6" />
              </button>
              {mode === "photo" ? (
                <button type="button" onClick={shoot} disabled={avatarOn ? !avatarReady : !ready} aria-label={countdown !== null ? "Cancel timer" : "Take photo"} className={cn("grid place-items-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-40", shutterOuter)}>
                  <span className={cn("rounded-full bg-white", shutterInner)} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={shoot}
                  disabled={avatarOn ? !avatarReady : !ready}
                  aria-label={recording ? "Stop recording" : "Start recording"}
                  className={cn("grid place-items-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-40", shutterOuter)}
                >
                  <span className={cn("bg-rose-600 transition-all", recording ? "size-7 rounded-md" : cn("rounded-full", shutterInner))} />
                </button>
              )}
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setPanel((p) => (p === "effects" ? null : "effects"))} aria-label="Effects" className={cn("grid size-12 place-items-center rounded-2xl hover:bg-white/20", panel === "effects" || effect !== "none" ? "bg-white text-black" : "bg-white/10")}>
                  <Sparkles className="size-5" />
                </button>
                <button type="button" onClick={() => setPanel((p) => (p === "settings" ? null : "settings"))} aria-label="Quality and ratio" className={cn("grid size-12 place-items-center rounded-2xl hover:bg-white/20", panel === "settings" ? "bg-white text-black" : "bg-white/10")}>
                  <SlidersHorizontal className="size-5" />
                </button>
              </div>
            </div>
            {prefs.showHints && !compact && (
              <p className="text-center text-[11px] text-white/45">
                {avatarOn ? "Avatar · " : ""}
                {nativeOn ? "Opens the iPhone Camera · " : ""}
                {prefs.dataSaver ? "Data saver" : prefs.autoQuality ? `Auto ${q.label}` : q.label} · {ratioDef.label}
                {effect !== "none" ? ` · ${fx.label}` : ""} · {prefs.autoSave ? "saved to your Nexus Drive" : "not saved until you tap Save"}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="relative min-h-0 flex-1 bg-[#0a0a10]">
            {shot.video ? (
              <video src={shot.url} controls playsInline autoPlay loop className="h-full w-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.url} alt="Your photo" className="h-full w-full object-contain" />
            )}
          </div>
          <div className="relative z-20 space-y-3 px-4 pb-safe-2 pt-3">
            <div className="rounded-2xl bg-white/10 p-3 text-sm">
              {phase === "saving" && (
                <div>
                  <div className="mb-1.5 flex justify-between text-xs text-white/70">
                    <span>Saving to your Nexus Drive…</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full bg-white transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} />
                  </div>
                </div>
              )}
              {phase === "done" && saved && (
                <div className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-emerald-400" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{saved.link}</span>
                  <button type="button" onClick={() => void copyLink()} className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15" aria-label="Copy link">
                    <Copy className="size-4" />
                  </button>
                </div>
              )}
              {phase === "idle" && !saved && (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-white/70">Not saved yet</span>
                  <button type="button" onClick={() => void begin(shot.file, shot.durationMs)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">
                    Save to Nexus Drive
                  </button>
                </div>
              )}
              {phase === "failed" && (
                <div className="space-y-2">
                  <p className="text-xs text-rose-300">Couldn&apos;t save to your vault: {failMsg}</p>
                  <button type="button" onClick={() => void save(shot.file, shot.durationMs, geoRef.current)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">
                    Try again
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Act icon={<RotateCcw className="size-5" />} label="Retake" onClick={retake} />
              <Act icon={<Share2 className="size-5" />} label="Share link" onClick={() => void shareSheet()} disabled={!saved} />
              <Act icon={<UserPlus className="size-5" />} label="To a user" onClick={() => setToUser(true)} disabled={!saved} />
              {target && <Act icon={<Send className="size-5" />} label={sendingTo ? "Sending…" : `To @${target.username}`.slice(0, 14)} onClick={() => void sendToTarget()} disabled={!saved || sendingTo} />}
              {prefs.showDropButton && <Act icon={<Radar className="size-5" />} label="Nexus Drop" onClick={() => setDrop(true)} disabled={!saved} />}
              {chatId ? (
                <Act icon={<Send className="size-5" />} label="Send here" onClick={() => void sendHere(chatId, false)} />
              ) : (
                <Act icon={<Send className="size-5" />} label="To a chat" onClick={() => setPicker(true)} />
              )}
              {onAttach ? (
                <Act
                  icon={<MessageSquarePlus className="size-5" />}
                  label="Add to msg"
                  onClick={() => {
                    onAttach(shot.file);
                    onClose?.();
                  }}
                />
              ) : (
                <a href={shot.url} download={shot.file.name} className="grid place-items-center gap-1 rounded-2xl bg-white/10 py-2.5 text-[11px] font-semibold hover:bg-white/20">
                  <Download className="size-5" />
                  Download
                </a>
              )}
              <Act icon={<Trash2 className="size-5" />} label={delArmed ? "Tap again" : "Delete"} onClick={() => void discard()} disabled={!saved} />
            </div>
          </div>
        </>
      )}

      {picker && (
        <Sheet title="Send to…" onClose={() => setPicker(false)}>
          {chats.length === 0 && <p className="p-4 text-sm text-white/60">No chats yet.</p>}
          {chats.map((c) => (
            <div key={c.id} className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{conversationTitle(state, c.id) || "Chat"}</span>
              <button type="button" onClick={() => void sendHere(c.id, false)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black">
                {shot?.video ? "Video" : "Photo"}
              </button>
              <button type="button" disabled={!saved} onClick={() => void sendHere(c.id, true)} className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                <Link2 className="size-3.5" /> Link
              </button>
            </div>
          ))}
        </Sheet>
      )}
      {toUser && saved && <SnapShareSheet file={saved.vault} expiry={expiry} onClose={() => setToUser(false)} />}
      {drop && saved && shot && <SnapDrop file={saved.vault} expiry={expiry} getFile={async () => shot.file} onClose={() => setDrop(false)} />}
      {screenLight && <div className="pointer-events-none absolute inset-0 z-[45] bg-white" />}
      {editor && (
        <SnapAvatarEditor
          cfg={avCfg}
          onCfg={setAvOverride}
          scene={scene}
          onScene={pick.scene}
          hasImage={!!bg}
          onImage={(f) => void pickBgImage(f)}
          onClearImage={clearBgImage}
          onOpenStudio={onClose ? () => (onClose(), openModal("settings", "vavatar")) : undefined}
          onClose={() => setEditor(false)}
        />
      )}
      {settings && <SnapSettings onClose={() => setSettings(false)} />}
      {profileOpen && <SnapProfile onClose={() => setProfileOpen(false)} />}
      {peopleOpen && (
        <SnapPeople
          current={target}
          onClose={() => setPeopleOpen(false)}
          onPick={(u) => {
            setTarget(u);
            setPeopleOpen(false);
            toast(`Your next Snap goes to @${u.username}`);
          }}
        />
      )}
      {voice && <SnapVoice onClose={() => setVoice(false)} chatId={chatId} />}
      {gallery && <SnapGallery onClose={() => setGallery(false)} expiry={expiry} chatId={chatId} onAttachFile={onAttach ? attachAndClose : undefined} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-white/50">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn("rounded-full px-2.5 py-1 font-semibold disabled:opacity-40", on ? "bg-white text-black" : "bg-white/10 text-white/80")}>
      {children}
    </button>
  );
}

function Tool({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={on} className={cn("grid size-10 place-items-center rounded-full backdrop-blur max-[380px]:size-9", on ? "bg-white text-black" : "bg-black/45 text-white hover:bg-black/60")}>
      {children}
    </button>
  );
}

/** what the photo will look like: caption bar, sticker, frame and grid drawn over the live preview (burned in at capture) */
function PreviewDeco({ overlay, caption, sticker, grid }: { overlay: string; caption: string; sticker: string; grid: GridStyle | null }) {
  const cap = cleanCaption(caption);
  return (
    <div className="pointer-events-none absolute inset-0">
      {grid && <div className="absolute inset-0 opacity-40" style={{ backgroundImage: gridImage(grid) }} />}
      {(overlay === "vignette" || overlay === "film") && <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.5) 100%)" }} />}
      {overlay === "polaroid" && (
        <>
          <div className="absolute inset-x-0 top-0 h-[4.5%] bg-[#f6f3ec]" />
          <div className="absolute inset-y-0 left-0 w-[4.5%] bg-[#f6f3ec]" />
          <div className="absolute inset-y-0 right-0 w-[4.5%] bg-[#f6f3ec]" />
          <div className="absolute inset-x-0 bottom-0 h-[15%] bg-[#f6f3ec]" />
        </>
      )}
      {overlay === "date" && <span className="absolute bottom-3 right-4 font-mono text-sm font-bold text-[#ff9a1f]" style={{ textShadow: "0 0 6px rgba(255,120,0,.9)" }}>{stampText(new Date())}</span>}
      {sticker && <span className="absolute right-[10%] top-[12%] rotate-12 text-5xl">{sticker}</span>}
      {cap && <div className="absolute inset-x-0 top-[76%] bg-black/60 px-2 py-1.5 text-center text-sm font-bold">{cap}</div>}
    </div>
  );
}

const line = (dir: "right" | "bottom", at: number) => `linear-gradient(to ${dir}, transparent ${at - 0.15}%, #fff ${at}%, transparent ${at + 0.15}%)`;

/** CSS background for each grid style (thirds, centre cross, golden ratio, diagonals) */
function gridImage(style: GridStyle): string {
  switch (style) {
    case "center":
      return [line("right", 50), line("bottom", 50)].join(",");
    case "golden":
      return [line("right", 38.2), line("right", 61.8), line("bottom", 38.2), line("bottom", 61.8)].join(",");
    case "diagonal":
      return "linear-gradient(to top right, transparent 49.8%, #fff 50%, transparent 50.2%), linear-gradient(to bottom right, transparent 49.8%, #fff 50%, transparent 50.2%)";
    default:
      return [line("right", 33.3), line("right", 66.6), line("bottom", 33.3), line("bottom", 66.6)].join(",");
  }
}
