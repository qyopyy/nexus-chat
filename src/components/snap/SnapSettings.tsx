"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/store/app";
import { checkForUpdateNow } from "@/lib/liveUpdate";
import { mfaForgetThisDevice, mfaTrustedUntil } from "@/lib/mfa";
import { trustUntilLabel } from "@/lib/mfaTrust";
import { GRID_STYLES, hashPin, validPin, type SnapPrefs } from "@/lib/snapPrefs";
import { isIOSDevice } from "@/lib/snapDevice";
import { clearSnapLocalData, getPin, resetPrefs, savePin, setPrefs, usePrefs } from "@/lib/snapPrefsStore";
import { cn } from "@/lib/utils";

/** Settings, privacy and location for Nexus Snap. Everything is saved on this device the moment you change it. */
export default function SnapSettings({ onClose }: { onClose: () => void }) {
  const p = usePrefs();
  const [pinStep, setPinStep] = useState<null | "new">(null);
  const [pinText, setPinText] = useState("");
  const [armed, setArmed] = useState<"" | "signout" | "clear" | "reset">("");
  const [busy, setBusy] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  useEffect(() => {
    void mfaTrustedUntil().then(setTrustedUntil);
  }, []);

  const set = <K extends keyof SnapPrefs>(k: K, v: SnapPrefs[K]) => setPrefs({ [k]: v } as Partial<SnapPrefs>);

  const chooseGeo = (v: SnapPrefs["geoTag"]) => {
    set("geoTag", v);
    if (v === "off" || typeof navigator === "undefined" || !navigator.geolocation) return;
    // ask for permission now, while the person is looking at what it is for
    navigator.geolocation.getCurrentPosition(
      () => undefined,
      (e) => {
        set("geoTag", "off");
        toast(e.code === 1 ? "Location is blocked for Snap. Allow it in your phone's Settings." : "Couldn't get your location.", "error");
      },
      { timeout: 12000, maximumAge: 60000 },
    );
  };

  const toggleLevel = async (on: boolean) => {
    if (on) {
      const D = (typeof DeviceMotionEvent !== "undefined" ? DeviceMotionEvent : null) as unknown as { requestPermission?: () => Promise<string> } | null;
      if (D?.requestPermission) {
        try {
          if ((await D.requestPermission()) !== "granted") return toast("Motion access is needed for the level guide.", "error");
        } catch {
          return toast("Motion access is needed for the level guide.", "error");
        }
      }
    }
    set("levelGuide", on);
  };

  const toggleLock = (on: boolean) => {
    if (!on) {
      savePin(null);
      return set("appLock", false);
    }
    setPinText("");
    setPinStep("new");
  };

  const savePinNow = async () => {
    if (!validPin(pinText)) return toast("Use 4 to 8 digits.", "error");
    savePin(await hashPin(pinText));
    set("appLock", true);
    setPinStep(null);
    setPinText("");
    toast("Screen lock is on");
  };

  const checkUpdates = async () => {
    setBusy(true);
    const r = await checkForUpdateNow();
    setBusy(false);
    toast(r === "offline" ? "Couldn't check. Are you online?" : r === "latest" ? "You have the newest version." : "Updating…", r === "offline" ? "error" : "success");
  };

  const confirm = (k: "signout" | "clear" | "reset", run: () => void | Promise<void>) => {
    if (armed !== k) {
      setArmed(k);
      setTimeout(() => setArmed((a) => (a === k ? "" : a)), 4000);
      return;
    }
    setArmed("");
    void run();
  };

  const signOut = async () => {
    savePin(null);
    set("appLock", false);
    await supabase.auth.signOut();
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#0b0b10] text-white">
      <header className="flex items-center gap-2 px-3 pb-2 pt-safe-3">
        <button type="button" onClick={onClose} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <ChevronLeft className="size-5" />
        </button>
        <b className="flex-1 text-center text-sm tracking-wide">SETTINGS</b>
        <span className="size-10" />
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-safe-2 text-sm">
        <Group title="Camera">
          <Switch label="Tap to focus" hint="Tap the picture to focus and set exposure" on={p.tapFocus} onChange={(v) => set("tapFocus", v)} />
          <Switch label="Exposure slider" hint="Brightness slider after you tap (if your camera allows it)" on={p.exposureSlider} onChange={(v) => set("exposureSlider", v)} />
          <Switch label="Hold to lock focus" hint="Press and hold the picture to lock focus and exposure" on={p.focusLock} onChange={(v) => set("focusLock", v)} />
          <Switch label="Pinch and wheel zoom" hint="Smooth pinch on the phone, mouse wheel on a computer" on={p.pinchZoom} onChange={(v) => set("pinchZoom", v)} />
          {typeof navigator !== "undefined" && isIOSDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints) && (
            <Switch label="Use the iPhone Camera app" hint="Off = the Nexus Snap camera (effects, avatar, timer, zoom dial). On = the shutter opens the real iPhone Camera instead." on={p.nativeCamera} onChange={(v) => set("nativeCamera", v)} />
          )}
          <Switch label="Enhance zoomed photos" hint="When you zoom in digitally, the photo is enlarged in gentle steps and its edges are sharpened so it stays crisp. Done on your phone, nothing is uploaded." on={p.zoomEnhance} onChange={(v) => set("zoomEnhance", v)} />
          <Switch label="Zoom buttons and dial" hint="Lens buttons (.5 1× 2 3 5) with a ruler dial you can drag, like the iPhone camera" on={p.zoomControl} onChange={(v) => set("zoomControl", v)} />
          <Switch label="Double-tap to flip camera" on={p.doubleTapFlip} onChange={(v) => set("doubleTapFlip", v)} />
          <Switch label="Level guide" hint="A line that turns green when the phone is straight" on={p.levelGuide} onChange={(v) => void toggleLevel(v)} />
          <Choice label="Grid" value={p.gridStyle} options={GRID_STYLES.map((g) => [g, g[0].toUpperCase() + g.slice(1)])} onChange={(v) => set("gridStyle", v)} />
          <Switch label="Shutter sound" on={p.shutterSound} onChange={(v) => set("shutterSound", v)} />
          <Switch label="Timer beeps" on={p.timerBeep} onChange={(v) => set("timerBeep", v)} />
          <Switch label="Vibration" on={p.haptics} onChange={(v) => set("haptics", v)} />
          <Switch label="Screen flash" hint="Brief white flash when a photo is taken" on={p.screenFlash} onChange={(v) => set("screenFlash", v)} />
          <Switch label="Keep screen awake" on={p.keepAwake} onChange={(v) => set("keepAwake", v)} />
          <Choice label="Opens in" value={p.startMode} options={[["photo", "Photo"], ["video", "Video"]]} onChange={(v) => set("startMode", v)} />
          <Choice label="Starts with" value={p.startFacing} options={[["environment", "Back camera"], ["user", "Selfie camera"]]} onChange={(v) => set("startFacing", v)} />
          <Choice label="Longest video" value={String(p.maxVideoSec)} options={[["30", "30 s"], ["60", "1 min"], ["180", "3 min"]]} onChange={(v) => set("maxVideoSec", Number(v) as SnapPrefs["maxVideoSec"])} />
        </Group>

        <Group title="Resolution">
          <Switch label="Auto resolution" hint="Picks the best size for your phone, screen and connection" on={p.autoQuality} onChange={(v) => set("autoQuality", v)} />
          <Switch label="Data saver" hint="Smaller photos and videos, faster uploads" on={p.dataSaver} onChange={(v) => set("dataSaver", v)} />
        </Group>

        <Group title="Saving and sharing">
          <Switch label="Save to Nexus Drive automatically" hint="Off: you choose Save after each shot" on={p.autoSave} onChange={(v) => set("autoSave", v)} />
          <Switch label="Copy link automatically" on={p.autoCopyLink} onChange={(v) => set("autoCopyLink", v)} />
          <Switch label="Also download a copy" hint="Keeps a copy in your phone's downloads" on={p.downloadCopy} onChange={(v) => set("downloadCopy", v)} />
          <Switch label="Ask before deleting" on={p.confirmDelete} onChange={(v) => set("confirmDelete", v)} />
          <Switch label="Links allow download" on={p.linkDownload} onChange={(v) => set("linkDownload", v)} />
          <Choice label="Download limit" value={String(p.maxDownloads)} options={[["0", "None"], ["1", "1"], ["5", "5"], ["10", "10"]]} onChange={(v) => set("maxDownloads", Number(v) as SnapPrefs["maxDownloads"])} />
        </Group>

        <Group title="Privacy and location">
          <Choice label="Tag photos with location" value={p.geoTag} options={[["off", "Off"], ["approx", "Approx. 1 km"], ["precise", "Precise"]]} onChange={chooseGeo} />
          <Switch label="Send location with Snaps" hint="Adds a map link when you send a Snap in chat. Needs a location tag above." on={p.locationInSend} onChange={(v) => set("locationInSend", v)} disabled={p.geoTag === "off"} />
          <Switch label="Receive Nexus Drops" hint="Off: nobody can send you pictures from nearby or by username" on={p.receiveDrops} onChange={(v) => set("receiveDrops", v)} />
          <Choice label="Nearby visible for" value={String(p.nearbyMinutes)} options={[["5", "5 min"], ["10", "10 min"], ["30", "30 min"]]} onChange={(v) => set("nearbyMinutes", Number(v) as SnapPrefs["nearbyMinutes"])} />
          <Switch label="Hide screen when app is closed" hint="Blanks the picture in the app switcher" on={p.privacyScreen} onChange={(v) => set("privacyScreen", v)} />
          <Switch label="Screen lock (PIN)" hint="Asks for a PIN when you open Snap. Saved only on this phone." on={p.appLock && !!getPin()} onChange={toggleLock} />
          {pinStep && (
            <div className="flex gap-2 rounded-2xl bg-white/5 p-3">
              <input
                value={pinText}
                onChange={(e) => setPinText(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
                type="password"
                autoComplete="off"
                placeholder="New PIN, 4 to 8 digits"
                className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 outline-none placeholder:text-white/40"
              />
              <button type="button" onClick={() => void savePinNow()} className="rounded-full bg-white px-4 py-2 font-bold text-black">
                Save
              </button>
              <button type="button" onClick={() => setPinStep(null)} className="rounded-full bg-white/10 px-3 py-2">
                Cancel
              </button>
            </div>
          )}
          {trustedUntil && (
            <Button
              onClick={() =>
                void mfaForgetThisDevice().then(() => {
                  setTrustedUntil(null);
                  toast("This device will ask for your 2FA code again");
                })
              }
            >
              Forget this device for 2FA (remembered until {trustUntilLabel(trustedUntil)})
            </Button>
          )}
          <p className="px-1 text-xs text-white/45">Photos you take are saved without camera metadata. Location is only used if you turn it on above and is never stored by Snap itself.</p>
        </Group>

        <Group title="Layout">
          <Switch label="Left-handed controls" on={p.leftHanded} onChange={(v) => set("leftHanded", v)} />
          <Switch label="Big shutter button" on={p.bigShutter} onChange={(v) => set("bigShutter", v)} />
          <Switch label="Show Nexus Drop button" on={p.showDropButton} onChange={(v) => set("showDropButton", v)} />
          <Switch label="Show front/back label" on={p.cameraBadge} onChange={(v) => set("cameraBadge", v)} />
          <Switch label="Show hint line" on={p.showHints} onChange={(v) => set("showHints", v)} />
          <Switch label="Reduce motion" hint="No flash or pulsing" on={p.reduceMotion} onChange={(v) => set("reduceMotion", v)} />
        </Group>

        <Group title="App">
          <Button onClick={() => void checkUpdates()} disabled={busy}>
            {busy ? "Checking…" : "Check for updates now"}
          </Button>
          <p className="px-1 text-xs text-white/45">Snap also updates by itself within seconds of a new version going live.</p>
          <a href="/privacy" target="_blank" rel="noopener" className="block rounded-2xl bg-white/10 px-4 py-3 text-center font-semibold hover:bg-white/15">
            Privacy policy
          </a>
          <Button onClick={() => confirm("reset", resetPrefs)} danger={armed === "reset"}>
            {armed === "reset" ? "Tap again to reset all settings" : "Reset settings"}
          </Button>
          <Button
            onClick={() =>
              confirm("clear", () => {
                clearSnapLocalData();
                toast("Local Snap data cleared");
              })
            }
            danger={armed === "clear"}
          >
            {armed === "clear" ? "Tap again to clear local data" : "Clear local data on this phone"}
          </Button>
          <Button onClick={() => confirm("signout", signOut)} danger>
            {armed === "signout" ? "Tap again to sign out" : "Sign out"}
          </Button>
        </Group>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-[11px] font-bold uppercase tracking-widest text-white/45">{title}</h3>
      {children}
    </section>
  );
}

function Switch({ label, hint, on, onChange, disabled }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 text-left disabled:opacity-40">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-xs text-white/45">{hint}</span>}
      </span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-emerald-500" : "bg-white/20")}>
        <span className={cn("absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform", on && "translate-x-4")} />
      </span>
    </button>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: (readonly [T, string])[] | [string, string][]; onChange: (v: T) => void }) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3">
      <span className="mb-2 block font-semibold">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {(options as [T, string][]).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", value === k ? "bg-white text-black" : "bg-white/10 text-white/80")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Button({ onClick, danger, disabled, children }: { onClick: () => void; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn("w-full rounded-2xl px-4 py-3 text-center font-semibold disabled:opacity-50", danger ? "bg-rose-600/80 hover:bg-rose-600" : "bg-white/10 hover:bg-white/15")}>
      {children}
    </button>
  );
}
