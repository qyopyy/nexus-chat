"use client";

import { Copy, Globe2 } from "lucide-react";
import { toast } from "@/store/app";
import { Card, H } from "./Studio";

const SHORT =
  "Nexus Project (nexusproject.cc) and Audia Music Recordings LLC are owned and operated by the same person. Nexus is the platform; Audia Music Recordings is the label that releases music worldwide through it.";

const LONG = `${SHORT}

Why the website and the label share details: Nexus Project provides the website, apps and tools (Studio, distribution dashboard, smart links and pre-save pages). Audia Music Recordings LLC, a Delaware limited liability company, is the licensed label and rights holder that delivers releases to stores and streaming services worldwide using those tools. Because both are run by the same owner, the nexusproject.cc domain, support contact and company details can be used for Audia Music Recordings LLC in distributor, store and platform paperwork.`;

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, "success");
  } catch {
    toast("Couldn't copy. Select the text and copy it manually.", "error");
  }
}

export default function LabelIdentity() {
  return (
    <>
      <H>Label &amp; website</H>
      <Card title="Nexus Project × Audia Music Recordings LLC" right={<Globe2 className="size-5 text-sub" aria-hidden />}>
        <p className="text-sm text-sub">Use this wording when a distributor, store or platform asks how the Nexus website and Audia Music Recordings LLC are connected.</p>
        <p className="mt-3 rounded-xl bg-black/20 p-3 text-sm leading-relaxed">{SHORT}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy(SHORT, "Short statement copied")} className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
            <Copy className="size-4" aria-hidden /> Copy short version
          </button>
          <button type="button" onClick={() => void copy(LONG, "Full statement copied")} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold">
            <Copy className="size-4" aria-hidden /> Copy full version
          </button>
        </div>
      </Card>
    </>
  );
}
