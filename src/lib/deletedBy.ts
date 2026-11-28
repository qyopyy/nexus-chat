// "Removed by ..." label for messages a staff member deleted (set server-side by mod_delete_message).

export type DeletedInfo = { deleted_at?: string | null; deleted_by?: string | null; deleted_by_role?: string | null; author_id: string };

const LABEL: Record<string, { icon: string; text: string }> = {
  owner: { icon: "👑", text: "Removed by the founder" },
  admin: { icon: "🛡️", text: "Removed by an admin" },
  moderator: { icon: "🔨", text: "Removed by a moderator" },
};

/** Null for a normal "Message deleted" (author deleted it, or an older deletion with no record). */
export function removedBy(m: DeletedInfo): { icon: string; text: string; role: string } | null {
  if (!m.deleted_at || !m.deleted_by || m.deleted_by === m.author_id) return null;
  const hit = LABEL[m.deleted_by_role ?? ""];
  return hit ? { ...hit, role: m.deleted_by_role as string } : null;
}
