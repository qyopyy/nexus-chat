"use client";

/**
 * DDEX ERN 4.3 NewReleaseMessage + delivery package (XML + resources + MD5 hash sums), built in the browser.
 * Sender = your DDEX Party ID (DPID); recipient = the DSP / distributor's DPID. The package follows the common
 * batch layout: <batch>/<UPC>/<UPC>.xml + resources/, plus BatchComplete_<batch>.xml.
 */
import { supabase, errorText } from "./supabase";
import { distFileBlob } from "./dist";
import { md5Blob } from "./md5";
import { makeZip, saveBlob, type ZipEntry } from "./zipStore";
import type { DistRelease, DistTrack } from "./types";

export type DdexRecipient = { dpid: string; name: string };
export type DdexConfig = { sender_dpid: string | null; sender_name: string | null; label_name: string | null; recipients: DdexRecipient[]; test_mode: boolean; updated_at: string };
export type DdexLog = { id: number; release_id: string; recipient_dpid: string; recipient_name: string | null; message_id: string; update_indicator: string; test: boolean; created_at: string };

export const DPID_RE = /^PADPIDA[0-9A-Z]{10,11}$/;

export async function getDdex() {
  const { data, error } = await supabase.rpc("admin_get_ddex");
  if (error) throw new Error(errorText(error));
  return data as DdexConfig;
}
export async function saveDdex(p: Partial<DdexConfig>) {
  const { data, error } = await supabase.rpc("admin_set_ddex", { p });
  if (error) throw new Error(errorText(error));
  return data as DdexConfig;
}
export async function ddexLog(releaseId: string) {
  const { data } = await supabase.rpc("ddex_release_log", { p_release: releaseId });
  return (data ?? []) as DdexLog[];
}

const x = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const iso = (secs: number | null | undefined) => {
  const s = Math.max(0, Math.round(secs ?? 0));
  return `PT${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}H` : ""}${Math.floor((s % 3600) / 60)}M${s % 60}S`;
};
const LANG: Record<string, string> = { english: "en", hungarian: "hu", spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt", russian: "ru", polish: "pl", dutch: "nl", swedish: "sv", turkish: "tr", arabic: "ar", japanese: "ja", korean: "ko", chinese: "zh", romanian: "ro", czech: "cs", slovak: "sk", greek: "el", ukrainian: "uk", hindi: "hi", instrumental: "zxx" };
const lang = (l?: string | null) => LANG[(l || "English").trim().toLowerCase()] ?? ((l || "").length === 2 ? l!.toLowerCase() : "en");
const names = (s?: string | null) => (s || "").split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?)\s*/i).map((v) => v.trim()).filter(Boolean);
const ext = (p: string | null | undefined, d: string) => (p?.split(".").pop() || d).toLowerCase();
const codec = (e: string) => (e === "flac" ? "FLAC" : e === "mp3" ? "MP3" : "PCM");
const pad2 = (n: number) => String(n).padStart(2, "0");

export type DdexFile = { path: string; blob: Blob; md5: string };
export type DdexBuildInput = {
  release: DistRelease;
  tracks: DistTrack[];
  cfg: DdexConfig;
  recipient: DdexRecipient;
  update: boolean;
  test: boolean;
  audio: Record<string, DdexFile>; // by track id
  cover: DdexFile;
};

/** ERN 4.3 NewReleaseMessage XML */
export function buildErn43({ release: r, tracks, cfg, recipient, update, test, audio, cover }: DdexBuildInput, messageId: string) {
  const upc = String(r.upc ?? "").replace(/\D/g, "");
  const label = cfg.label_name || r.label_name || cfg.sender_name || "Independent";
  const year = r.copyright_year || new Date(r.release_date).getFullYear();
  const holder = r.copyright_holder || label;
  const genre = r.primary_genre || "Pop";
  const explicitRelease = tracks.some((t) => t.explicit);

  // parties: artists, writers, producers, label
  const parties = new Map<string, string>(); // name → ref
  const party = (name: string) => {
    const k = name.trim();
    if (!parties.has(k)) parties.set(k, `P${parties.size + 1}`);
    return parties.get(k)!;
  };
  const relArtists = names(r.primary_artist_name);
  relArtists.forEach(party);
  const labelRef = party(label);

  const displayArtists = (main: string[], feats: string[]) =>
    [
      ...main.map((n, i) => `<DisplayArtist SequenceNumber="${i + 1}"><ArtistPartyReference>${party(n)}</ArtistPartyReference><DisplayArtistRole>MainArtist</DisplayArtistRole></DisplayArtist>`),
      ...feats.map((n, i) => `<DisplayArtist SequenceNumber="${main.length + i + 1}"><ArtistPartyReference>${party(n)}</ArtistPartyReference><DisplayArtistRole>FeaturedArtist</DisplayArtistRole></DisplayArtist>`),
    ].join("");
  const artistLine = (main: string[], feats: string[]) => `${main.join(" & ")}${feats.length ? ` feat. ${feats.join(" & ")}` : ""}`;

  const sound = tracks
    .map((t, i) => {
      const ref = `A${i + 1}`;
      const main = names(t.primary_artist_name || r.primary_artist_name);
      const feats = names(t.featured_artist_names);
      const contributors: [string, string][] = [
        ...names(t.composer).map((n) => [n, "Composer"] as [string, string]),
        ...names(t.songwriter).map((n) => [n, "ComposerLyricist"] as [string, string]),
        ...names(t.lyricist).map((n) => [n, "Lyricist"] as [string, string]),
        ...names(t.producer).map((n) => [n, "Producer"] as [string, string]),
        ...names(t.mixer).map((n) => [n, "MixingEngineer"] as [string, string]),
        ...names(t.mastering_engineer).map((n) => [n, "MasteringEngineer"] as [string, string]),
        ...names(t.remixer).map((n) => [n, "Remixer"] as [string, string]),
      ];
      const f = audio[t.id];
      const e = ext(t.audio_path, "wav");
      return `
    <SoundRecording>
      <ResourceReference>${ref}</ResourceReference>
      <Type>MusicalWorkSoundRecording</Type>
      <SoundRecordingEdition>
        <ResourceId><ISRC>${x((t.isrc || "").replace(/[^A-Z0-9]/gi, "").toUpperCase())}</ISRC></ResourceId>
        <PLine><Year>${year}</Year><PLineText>${x(`℗ ${year} ${holder}`)}</PLineText></PLine>
        <TechnicalDetails>
          <TechnicalResourceDetailsReference>T${i + 1}</TechnicalResourceDetailsReference>
          <DeliveryFile>
            <Type>AudioFile</Type>
            <AudioCodecType>${codec(e)}</AudioCodecType>
            <File><URI>${x(f.path.split("/").slice(-2).join("/"))}</URI><HashSum><Algorithm>MD5</Algorithm><HashSumValue>${f.md5}</HashSumValue></HashSum></File>
          </DeliveryFile>
        </TechnicalDetails>
      </SoundRecordingEdition>
      <DisplayTitleText>${x(t.title)}</DisplayTitleText>
      <DisplayTitle><TitleText>${x(t.title)}</TitleText></DisplayTitle>
      <DisplayArtistName>${x(artistLine(main, feats))}</DisplayArtistName>
      ${displayArtists(main, feats)}
      ${contributors.map(([n, role], k) => `<Contributor SequenceNumber="${k + 1}"><ContributorPartyReference>${party(n)}</ContributorPartyReference><Role>${role}</Role></Contributor>`).join("")}
      <Duration>${iso(t.duration)}</Duration>
      <ParentalWarningType>${t.explicit ? "Explicit" : "NotExplicit"}</ParentalWarningType>
      <LanguageOfPerformance>${lang(t.language || r.language)}</LanguageOfPerformance>
    </SoundRecording>`;
    })
    .join("");

  const image = `
    <Image>
      <ResourceReference>A${tracks.length + 1}</ResourceReference>
      <Type>FrontCoverImage</Type>
      <ResourceId><ProprietaryId Namespace="DPID:${x(cfg.sender_dpid)}">${x(upc)}_cover</ProprietaryId></ResourceId>
      <TechnicalDetails>
        <TechnicalResourceDetailsReference>T${tracks.length + 1}</TechnicalResourceDetailsReference>
        <File><URI>${x(cover.path.split("/").slice(-1)[0])}</URI><HashSum><Algorithm>MD5</Algorithm><HashSumValue>${cover.md5}</HashSumValue></HashSum></File>
      </TechnicalDetails>
    </Image>`;

  const totalDur = tracks.reduce((a, t) => a + (t.duration ?? 0), 0);
  const relType = r.release_type === "Album" ? "Album" : r.release_type === "EP" ? "EP" : "Single";
  const relMain = relArtists.length ? relArtists : [r.primary_artist_name];
  const mainRelease = `
    <Release>
      <ReleaseReference>R0</ReleaseReference>
      <ReleaseType>${relType}</ReleaseType>
      <ReleaseId><ICPN>${x(upc)}</ICPN></ReleaseId>
      <DisplayTitleText>${x(r.title)}</DisplayTitleText>
      <DisplayTitle><TitleText>${x(r.title)}</TitleText></DisplayTitle>
      <DisplayArtistName>${x(artistLine(relMain, []))}</DisplayArtistName>
      ${displayArtists(relMain, [])}
      <ReleaseLabelReference>${labelRef}</ReleaseLabelReference>
      <Duration>${iso(totalDur)}</Duration>
      <PLine><Year>${year}</Year><PLineText>${x(`℗ ${year} ${holder}`)}</PLineText></PLine>
      <CLine><Year>${year}</Year><CLineText>${x(`© ${year} ${holder}`)}</CLineText></CLine>
      <Genre><GenreText>${x(genre)}</GenreText>${r.secondary_genre ? `<SubGenre>${x(r.secondary_genre)}</SubGenre>` : ""}</Genre>
      <OriginalReleaseDate>${x(r.release_date)}</OriginalReleaseDate>
      <ParentalWarningType>${explicitRelease ? "Explicit" : "NotExplicit"}</ParentalWarningType>
      <ResourceGroup>
        <ResourceGroup>
          <SequenceNumber>1</SequenceNumber>
          ${tracks.map((_, i) => `<ResourceGroupContentItem><SequenceNumber>${i + 1}</SequenceNumber><ReleaseResourceReference>A${i + 1}</ReleaseResourceReference></ResourceGroupContentItem>`).join("")}
        </ResourceGroup>
        <LinkedReleaseResourceReference>A${tracks.length + 1}</LinkedReleaseResourceReference>
      </ResourceGroup>
    </Release>`;
  const trackReleases = tracks
    .map(
      (t, i) => `
    <TrackRelease>
      <ReleaseReference>R${i + 1}</ReleaseReference>
      <ReleaseId><ISRC>${x((t.isrc || "").replace(/[^A-Z0-9]/gi, "").toUpperCase())}</ISRC></ReleaseId>
      <ReleaseResourceReference>A${i + 1}</ReleaseResourceReference>
      <ReleaseLabelReference>${labelRef}</ReleaseLabelReference>
      <Genre><GenreText>${x(genre)}</GenreText></Genre>
    </TrackRelease>`,
    )
    .join("");

  const deal = (ref: string) => `
    <ReleaseDeal>
      <DealReleaseReference>${ref}</DealReleaseReference>
      <Deal><DealTerms><TerritoryCode>Worldwide</TerritoryCode><ValidityPeriod><StartDate>${x(r.release_date)}</StartDate></ValidityPeriod><CommercialModelType>SubscriptionModel</CommercialModelType><UseType>OnDemandStream</UseType><UseType>NonInteractiveStream</UseType></DealTerms></Deal>
      <Deal><DealTerms><TerritoryCode>Worldwide</TerritoryCode><ValidityPeriod><StartDate>${x(r.release_date)}</StartDate></ValidityPeriod><CommercialModelType>AdvertisementSupportedModel</CommercialModelType><UseType>OnDemandStream</UseType><UseType>NonInteractiveStream</UseType></DealTerms></Deal>
      <Deal><DealTerms><TerritoryCode>Worldwide</TerritoryCode><ValidityPeriod><StartDate>${x(r.release_date)}</StartDate></ValidityPeriod><CommercialModelType>PayAsYouGoModel</CommercialModelType><UseType>PermanentDownload</UseType></DealTerms></Deal>
    </ReleaseDeal>`;

  const partyList = [...parties.entries()].map(([n, ref]) => `<Party><PartyReference>${ref}</PartyReference><PartyName><FullName>${x(n)}</FullName></PartyName></Party>`).join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ddex.net/xml/ern/43 http://ddex.net/xml/ern/43/release-notification.xsd" LanguageAndScriptCode="en" AvsVersionId="4">
  <MessageHeader>
    <MessageThreadId>${x(messageId)}</MessageThreadId>
    <MessageId>${x(messageId)}</MessageId>
    <MessageSender><PartyId>${x(cfg.sender_dpid)}</PartyId><PartyName><FullName>${x(cfg.sender_name || label)}</FullName></PartyName></MessageSender>
    <MessageRecipient><PartyId>${x(recipient.dpid)}</PartyId><PartyName><FullName>${x(recipient.name)}</FullName></PartyName></MessageRecipient>
    <MessageCreatedDateTime>${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</MessageCreatedDateTime>
    <MessageControlType>${test ? "TestMessage" : "LiveMessage"}</MessageControlType>
  </MessageHeader>
  <PartyList>
    ${partyList}
  </PartyList>
  <ResourceList>${sound}${image}
  </ResourceList>
  <ReleaseList>${mainRelease}${trackReleases}
  </ReleaseList>
  <DealList>${deal("R0")}
  </DealList>
</ern:NewReleaseMessage>
<!-- ${update ? "UpdateMessage" : "OriginalMessage"} generated by Nexus Distro -->
`;
}

export type DdexProblem = string;
export function ddexProblems(r: DistRelease, tracks: DistTrack[], cfg: DdexConfig | null): DdexProblem[] {
  const p: string[] = [];
  if (!cfg?.sender_dpid) p.push("Add your DDEX Party ID in Settings → DDEX");
  if (!cfg?.recipients?.length) p.push("Add at least one recipient (DSP / distributor DPID) in Settings → DDEX");
  if (!/^\d{12,14}$/.test(String(r.upc ?? "").replace(/\D/g, ""))) p.push("The release needs a UPC/EAN (12–14 digits)");
  if (!r.artwork_path) p.push("Cover artwork is missing");
  if (!tracks.length) p.push("No tracks");
  tracks.forEach((t) => {
    if (!t.audio_path) p.push(`“${t.title}” has no audio`);
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test((t.isrc || "").replace(/[^A-Z0-9]/gi, "").toUpperCase())) p.push(`“${t.title}” needs a valid ISRC`);
  });
  return p;
}

export type DdexProgress = { step: string; done: number; total: number };

/** download files, hash them, write the ERN and zip the whole batch */
export async function buildDdexPackage(r: DistRelease, tracks: DistTrack[], cfg: DdexConfig, recipient: DdexRecipient, opts: { update: boolean; test: boolean }, onProgress: (p: DdexProgress) => void) {
  const upc = String(r.upc).replace(/\D/g, "");
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
  const batch = stamp;
  const root = `${batch}/${upc}`;
  const total = tracks.length + 2;
  let done = 0;
  const step = (s: string) => onProgress({ step: s, done: done++, total });

  step("Cover artwork");
  const coverBlob = await distFileBlob(r.artwork_path!);
  const cover: DdexFile = { path: `${root}/resources/${upc}.${ext(r.artwork_path, "jpg")}`, blob: coverBlob, md5: await md5Blob(coverBlob) };
  const audio: Record<string, DdexFile> = {};
  for (const [i, t] of tracks.entries()) {
    step(`Audio ${i + 1}/${tracks.length} — ${t.title}`);
    const b = await distFileBlob(t.audio_path!);
    audio[t.id] = { path: `${root}/resources/${upc}_01_${pad2(i + 1)}.${ext(t.audio_path, "wav")}`, blob: b, md5: await md5Blob(b) };
  }
  step("Writing ERN 4.3 message");
  const messageId = `${(cfg.sender_dpid || "NEXUS").slice(-6)}${stamp}`;
  // resources sit next to the XML: URIs are relative ("resources/…")
  const xml = buildErn43({ release: r, tracks, cfg, recipient, update: opts.update, test: opts.test, audio, cover: { ...cover, path: `resources/${cover.path.split("/").pop()}` } }, messageId);
  const entries: ZipEntry[] = [
    { name: `${root}/${upc}.xml`, data: xml },
    { name: cover.path, data: cover.blob },
    ...tracks.map((t) => ({ name: audio[t.id].path, data: audio[t.id].blob })),
    {
      name: `${batch}/BatchComplete_${batch}.xml`,
      data: `<?xml version="1.0" encoding="UTF-8"?>\n<BatchComplete><BatchId>${batch}</BatchId><MessageSender>${x(cfg.sender_dpid)}</MessageSender><MessageRecipient>${x(recipient.dpid)}</MessageRecipient><NumberOfMessages>1</NumberOfMessages><Message><MessageId>${x(messageId)}</MessageId><URL>${upc}/${upc}.xml</URL><ReleaseICPN>${upc}</ReleaseICPN></Message></BatchComplete>\n`,
    },
  ];
  onProgress({ step: "Zipping", done: total, total });
  const zip = await makeZip(entries);
  saveBlob(zip, `DDEX_${recipient.name.replace(/[^\w-]+/g, "_")}_${upc}_${batch}.zip`);
  await supabase.rpc("ddex_log_delivery", { p_release: r.id, p_dpid: recipient.dpid, p_name: recipient.name, p_message_id: messageId, p_update: opts.update ? "UpdateMessage" : "OriginalMessage", p_test: opts.test });
  return { messageId, batch, xml };
}
