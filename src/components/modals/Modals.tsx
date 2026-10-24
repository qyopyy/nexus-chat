"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Hash, Volume2 } from "lucide-react";
import { useApp, closeModal } from "@/store/app";
import { createChannel, createGroup, createSpace, friendIds, joinSpace } from "@/lib/data";
import { cn } from "@/lib/utils";
import Modal, { Button } from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import SettingsModal from "./SettingsModal";
import PremiumModal from "@/components/premium/PremiumModal";

export default function Modals() {
  const modal = useApp((s) => s.modal);
  const arg = useApp((s) => s.modalArg);
  switch (modal) {
    case "settings":
      return <SettingsModal initial={arg} />;
    case "premium":
      return <PremiumModal focus={arg} />;
    case "createSpace":
      return <CreateSpaceModal />;
    case "newGroup":
      return <NewGroupModal />;
    case "createChannel":
      return arg ? <CreateChannelModal spaceId={arg} /> : null;
    case "spaceInvite":
      return arg ? <InviteModal spaceId={arg} /> : null;
    default:
      return null;
  }
}

function CreateSpaceModal() {
  const me = useApp((s) => (s.userId ? s.profiles[s.userId] : undefined));
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState(`${me?.display_name ?? "My"}'s space`);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={closeModal}
      title={tab === "create" ? "Create a space" : "Join a space"}
      subtitle={tab === "create" ? "Your place to hang out with friends — text channels, voice channels, streaming." : "Enter an invite code from a friend."}
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="ghost" onClick={() => (setTab(tab === "create" ? "join" : "create"), setErr(null))}>
            {tab === "create" ? "Have an invite? Join" : "Back to create"}
          </Button>
          <Button
            disabled={busy || (tab === "create" ? !name.trim() : !code.trim())}
            onClick={async () => {
              setBusy(true);
              if (tab === "create") {
                await createSpace(name.trim());
                closeModal();
              } else {
                const e = await joinSpace(code);
                if (e) setErr(e);
                else closeModal();
              }
              setBusy(false);
            }}
          >
            {tab === "create" ? "Create" : "Join Space"}
          </Button>
        </div>
      }
    >
      {tab === "create" ? (
        <label className="block">
          <span className="mb-2 block text-xs font-bold tracking-wide text-sub uppercase">Space name</span>
          <input autoFocus value={name} maxLength={64} onChange={(e) => setName(e.target.value)} className="w-full rounded-md bg-rail px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/60" />
        </label>
      ) : (
        <label className="block">
          <span className="mb-2 block text-xs font-bold tracking-wide text-sub uppercase">Invite code</span>
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. a1b2c3d4" className={cn("w-full rounded-md bg-rail px-3 py-2.5 font-mono outline-none focus:ring-2", err ? "ring-2 ring-dnd" : "focus:ring-accent/60")} />
          {err && <span className="mt-2 block text-sm text-dnd">{err}</span>}
        </label>
      )}
    </Modal>
  );
}

function NewGroupModal() {
  const profiles = useApp((s) => s.profiles);
  const friendships = useApp((s) => s.friendships);
  const friends = useMemo(() => friendIds(), [friendships]); // eslint-disable-line react-hooks/exhaustive-deps
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const shown = friends.filter((id) => `${profiles[id]?.display_name} ${profiles[id]?.username}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal
      open
      onClose={closeModal}
      title="New group"
      subtitle="Telegram-style group chat with voice & video calls."
      footer={
        <Button
          disabled={picked.length === 0}
          onClick={async () => {
            await createGroup(name.trim() || picked.map((id) => profiles[id]?.display_name).join(", "), picked);
            closeModal();
          }}
        >
          Create Group ({picked.length})
        </Button>
      }
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className="mb-3 w-full rounded-md bg-rail px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent/60" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends" className="mb-2 w-full rounded-md bg-rail px-3 py-2 text-sm outline-none" />
      <div className="max-h-72 overflow-y-auto">
        {friends.length === 0 && <p className="py-6 text-center text-sm text-sub">Add some friends first.</p>}
        {shown.map((id) => {
          const on = picked.includes(id);
          return (
            <button
              key={id}
              onClick={() => setPicked(on ? picked.filter((x) => x !== id) : [...picked, id])}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 hover:bg-hover"
            >
              <Avatar userId={id} size={36} />
              <span className="flex-1 text-left font-medium">{profiles[id]?.display_name}</span>
              <span className={cn("grid size-5 place-items-center rounded border-2", on ? "border-accent bg-accent" : "border-sub")}>{on && <Check className="size-3.5 text-white" />}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function CreateChannelModal({ spaceId }: { spaceId: string }) {
  const [kind, setKind] = useState<"text" | "voice">("text");
  const [name, setName] = useState("");
  return (
    <Modal
      open
      onClose={closeModal}
      title="Create Channel"
      footer={
        <>
          <Button variant="ghost" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              await createChannel(spaceId, name, kind);
              closeModal();
            }}
          >
            Create Channel
          </Button>
        </>
      }
    >
      <span className="mb-2 block text-xs font-bold tracking-wide text-sub uppercase">Channel type</span>
      <div className="mb-4 space-y-2">
        {(["text", "voice"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn("flex w-full items-center gap-3 rounded-md px-3 py-3 text-left", kind === k ? "bg-active" : "bg-side hover:bg-hover")}>
            {k === "text" ? <Hash className="size-6 text-sub" /> : <Volume2 className="size-6 text-sub" />}
            <span className="flex-1">
              <span className="block font-medium capitalize">{k}</span>
              <span className="block text-xs text-sub">{k === "text" ? "Send messages, images, GIFs, opinions" : "Hang out with voice, video and screen share"}</span>
            </span>
            <span className={cn("size-4 rounded-full border-2", kind === k ? "border-[5px] border-white" : "border-sub")} />
          </button>
        ))}
      </div>
      <span className="mb-2 block text-xs font-bold tracking-wide text-sub uppercase">Channel name</span>
      <div className="flex items-center gap-2 rounded-md bg-rail px-3">
        {kind === "text" ? <Hash className="size-4 text-sub" /> : <Volume2 className="size-4 text-sub" />}
        <input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="new-channel" className="flex-1 bg-transparent py-2.5 outline-none" />
      </div>
    </Modal>
  );
}

function InviteModal({ spaceId }: { spaceId: string }) {
  const space = useApp((s) => s.spaces.find((x) => x.id === spaceId));
  const [copied, setCopied] = useState(false);
  if (!space) return null;
  return (
    <Modal open onClose={closeModal} title={`Invite friends to ${space.name}`} subtitle="Share this code — they can join from “Add a Space → Join”.">
      <div className="flex items-center gap-2 rounded-md bg-rail p-1.5 pl-3">
        <code className="flex-1 font-mono text-lg tracking-widest">{space.invite_code}</code>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(space.invite_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={cn("flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white", copied ? "bg-ok" : "bg-accent hover:bg-accent-2")}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </Modal>
  );
}
