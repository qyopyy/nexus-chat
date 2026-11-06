"use client";

import { useEffect, useState } from "react";
import {
  AudioLines,
  Circle,
  FlipHorizontal2,
  LayoutGrid,
  MicOff,
  PhoneCall,
  Sparkles,
  Square,
  SwitchCamera,
  UserRound,
} from "lucide-react";
import {
  canRecordCall,
  currentVoiceFxLabel,
  cycleNoiseMode,
  cycleVoiceFx,
  flipCamera,
  noiseModeLabel,
  playSound,
  ringAgain,
  setCallLayout,
  startCallRecording,
  stopCallRecording,
  toggleMirrorSelf,
  toggleWhisper,
  useCall,
  voiceQualityLabel,
} from "@/lib/call";
import { loadMySounds, loadPinnedSounds, resolveSoundById, useSounds } from "@/lib/soundboard";
import { cn } from "@/lib/utils";

/** Compact quality + recording + layout tools for the call chrome */
export function CallStatusChips() {
  const quality = useCall((s) => s.callQuality);
  const ping = useCall((s) => s.callPingMs);
  const recording = useCall((s) => s.recording);
  const started = useCall((s) => s.recordingStartedAt);
  const noise = useCall((s) => s.settings.noiseMode);
  const clearActive = useCall((s) => s.clearActive);
  const vq = useCall((s) => s.settings.voiceQuality);
  const stereo = useCall((s) => s.settings.stereoStudio);
  const fx = useCall((s) => s.settings.voiceFx);
  const whisper = useCall((s) => !!s.settings.whisper);
  const model = useCall((s) => s.voiceModel);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [recording]);
  const secs = recording && started ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(quality || ping != null) && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide tabular-nums",
            (quality ?? "good") === "good" ? "bg-ok/20 text-ok" : quality === "ok" ? "bg-idle/20 text-idle" : "bg-dnd/25 text-dnd",
          )}
          title="Voice call ping (round-trip) + link quality"
        >
          {ping != null ? `${ping} ms` : "…"}
          {quality ? ` · ${quality === "good" ? "Good" : quality === "ok" ? "Fair" : "Weak"}` : ""}
        </span>
      )}
      <span className="rounded-full bg-accent/25 px-2 py-0.5 text-[10px] font-bold text-white/90" title="Opus bitrate">
        {voiceQualityLabel(vq)}
        {stereo && vq >= 320 ? " · stereo" : ""}
      </span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70" title="Noise processing">
        {noiseModeLabel(noise)}
        {noise === "ai" && clearActive === false ? " · fallback" : ""}
      </span>
      {fx && fx !== "off" && (
        <span className="rounded-full bg-[#a855f7]/30 px-2 py-0.5 text-[10px] font-semibold text-white/90" title="Voice changer">
          {currentVoiceFxLabel()}
          {fx === "custom" && model ? "" : ""}
        </span>
      )}
      {whisper && (
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/80">Whisper</span>
      )}
      {recording && (
        <span className="inline-flex items-center gap-1 rounded-full bg-dnd/30 px-2 py-0.5 text-[10px] font-bold text-white">
          <span className="size-1.5 animate-pulse rounded-full bg-dnd" /> REC {mm}:{ss}
        </span>
      )}
    </div>
  );
}

function PinnedSoundPads({ mobile }: { mobile?: boolean }) {
  const mine = useSounds((s) => s.mine);
  const [pins, setPins] = useState(() => loadPinnedSounds());
  useEffect(() => {
    void loadMySounds();
    const onFocus = () => setPins(loadPinnedSounds());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const sounds = pins.map((id) => resolveSoundById(id, mine)).filter(Boolean);
  if (!sounds.length) return null;
  if (mobile) {
    return (
      <>
        {sounds.map((s) => (
          <Mini key={s!.id} label={s!.emoji} onClick={() => void playSound(s!)}>
            <span className="text-lg leading-none">{s!.emoji}</span>
          </Mini>
        ))}
      </>
    );
  }
  return (
    <>
      {sounds.map((s) => (
        <Icon key={s!.id} title={`Play ${s!.name}`} onClick={() => void playSound(s!)}>
          <span className="text-base leading-none">{s!.emoji}</span>
        </Icon>
      ))}
    </>
  );
}

export function CallExtraControls({ mobile }: { mobile?: boolean }) {
  const layout = useCall((s) => s.layout);
  const recording = useCall((s) => s.recording);
  const video = useCall((s) => !!s.localCam);
  const avatarOn = useCall((s) => s.avatarOn);
  const alone = useCall((s) => Object.keys(s.participants).length === 0);
  const noise = useCall((s) => s.settings.noiseMode);
  const mirror = useCall((s) => s.settings.mirrorSelf !== false);
  const fx = useCall((s) => s.settings.voiceFx);
  const whisper = useCall((s) => !!s.settings.whisper);

  if (mobile) {
    return (
      <div className="mb-2 flex flex-wrap items-center justify-center gap-3">
        <Mini label={layout === "gallery" ? "Gallery" : "Speaker"} onClick={() => setCallLayout(layout === "gallery" ? "speaker" : "gallery")}>
          {layout === "gallery" ? <LayoutGrid className="size-5" /> : <UserRound className="size-5" />}
        </Mini>
        {video && !avatarOn && (
          <Mini label="Flip" onClick={() => void flipCamera()}>
            <SwitchCamera className="size-5" />
          </Mini>
        )}
        {canRecordCall() && (
          <Mini
            label={recording ? "Stop" : "Record"}
            danger={recording}
            onClick={() => (recording ? stopCallRecording(true) : startCallRecording())}
          >
            {recording ? <Square className="size-5 fill-current" /> : <Circle className="size-5" />}
          </Mini>
        )}
        <Mini label="Noise" onClick={() => void cycleNoiseMode()}>
          <Sparkles className="size-5" />
        </Mini>
        <Mini label="FX" onClick={() => void cycleVoiceFx()}>
          <AudioLines className="size-5" />
        </Mini>
        <Mini label="Whisper" onClick={() => toggleWhisper()}>
          <MicOff className="size-5" />
        </Mini>
        <PinnedSoundPads mobile />
        {alone && (
          <Mini label="Ring" onClick={() => void ringAgain()}>
            <PhoneCall className="size-5" />
          </Mini>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Icon
        title={layout === "gallery" ? "Speaker view (G)" : "Gallery view (G)"}
        on={layout === "speaker"}
        onClick={() => setCallLayout(layout === "gallery" ? "speaker" : "gallery")}
      >
        {layout === "gallery" ? <LayoutGrid className="size-5" /> : <UserRound className="size-5" />}
      </Icon>
      {video && !avatarOn && (
        <Icon title="Flip camera" onClick={() => void flipCamera()}>
          <SwitchCamera className="size-5" />
        </Icon>
      )}
      {video && !avatarOn && (
        <Icon title={mirror ? "Unmirror selfie" : "Mirror selfie"} on={mirror} onClick={() => toggleMirrorSelf()}>
          <FlipHorizontal2 className="size-5" />
        </Icon>
      )}
      <Icon title={`Noise: ${noiseModeLabel(noise)} (cycle)`} on={noise !== "off"} onClick={() => void cycleNoiseMode()}>
        <Sparkles className="size-5" />
      </Icon>
      <Icon title={`Voice FX: ${currentVoiceFxLabel()} (F)`} on={!!fx && fx !== "off"} onClick={() => void cycleVoiceFx()}>
        <AudioLines className="size-5" />
      </Icon>
      <Icon title={whisper ? "Whisper on (W)" : "Whisper (W)"} on={whisper} onClick={() => toggleWhisper()}>
        <MicOff className="size-5" />
      </Icon>
      <PinnedSoundPads />
      {canRecordCall() && (
        <Icon
          title={recording ? "Stop & download recording (Shift+R)" : "Record call audio (Shift+R)"}
          off={recording}
          onClick={() => (recording ? stopCallRecording(true) : startCallRecording())}
        >
          {recording ? <Square className="size-5 fill-current" /> : <Circle className="size-5" />}
        </Icon>
      )}
      {alone && (
        <Icon title="Ring again" onClick={() => void ringAgain()}>
          <PhoneCall className="size-5" />
        </Icon>
      )}
    </div>
  );
}

function Icon({
  children,
  title,
  onClick,
  on,
  off,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  on?: boolean;
  off?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "grid size-10 place-items-center rounded-full transition",
        off ? "bg-white text-dnd hover:bg-white/90" : on ? "bg-ok/90 text-white" : "bg-[#2b2d31] text-white/85 hover:bg-[#3a3c42]",
      )}
    >
      {children}
    </button>
  );
}

function Mini({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1" aria-label={label}>
      <span className={cn("grid size-11 place-items-center rounded-full active:scale-90", danger ? "bg-dnd text-white" : "bg-white/15 text-white")}>{children}</span>
      <span className="text-[10px] font-medium text-white/75">{label}</span>
    </button>
  );
}
