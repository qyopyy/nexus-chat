"use client";

import { usePhoneAgent } from "@/lib/phoneLink";
import { useLocatorReporter } from "@/lib/locator";
import { useApp } from "@/store/app";
import { stopFindEffects } from "@/lib/phoneLink";
import { useReminderClock } from "@/lib/chatReminders";

const COPY: Record<string, string> = {
  camera: "Your computer asked this phone to take a photo. The camera opens only if you allow it.",
  voice: "Your computer asked for an 8 second voice memo. The microphone starts only if you allow it.",
  sign_out: "Your computer asked this phone to sign out of Nexus.",
  screenshot: "Your computer asked for a screenshot. Nothing is captured until you take one and choose the image.",
  gallery: "Your computer asked for photos. The gallery opens only if you allow it, and you pick the pictures.",
  clipboard_pull: "Your computer asked to read this phone's clipboard. It is read only if you allow it.",
};

export default function PhoneCommandHost() {
  const userId = useApp((s) => s.userId);
  useLocatorReporter(userId);
  useReminderClock(userId);
  const agent = usePhoneAgent(userId);

  return (
    <>
      {agent.lost && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-6 text-center text-white">
          <div>
            <p className="text-xs tracking-[0.2em] text-white/60 uppercase">Nexus · lost device</p>
            <h1 className="mt-2 font-serif text-4xl">This device is marked lost</h1>
            <p className="mx-auto mt-3 max-w-md text-lg">{agent.lost.lost_message || "The owner of this Nexus account marked it lost."}</p>
          </div>
        </div>
      )}
      {agent.prompt && (
        <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-w-lg rounded-t-3xl bg-[#161616] p-4 text-[#f4f1ea] shadow-2xl">
          <p className="text-sm">{COPY[agent.prompt.kind] || "Your computer asked this phone to do something."}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-full bg-[#f4f1ea] px-4 py-2 text-sm font-semibold text-[#070709]" onClick={agent.allow}>Allow</button>
            <button type="button" className="rounded-full bg-white/10 px-4 py-2 text-sm" onClick={() => { stopFindEffects(); agent.deny(); }}>Not now</button>
          </div>
        </div>
      )}
    </>
  );
}
