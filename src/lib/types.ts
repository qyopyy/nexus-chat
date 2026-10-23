export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  custom_status: string | null;
  created_at: string;
  site_role: "owner" | "admin" | "moderator" | "vip" | "member";
  avatar_decoration: string | null;
  banner_color: string | null;
  bio: string | null;
  banned_until: string | null;
  ban_reason: string | null;
};

export type Badge = {
  id: string;
  key: string | null;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  priority: number;
};

export type UserBadge = { user_id: string; badge_id: string; granted_at: string };

export type AdminUserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  site_role: Profile["site_role"];
  banned_until: string | null;
  ban_reason: string | null;
  created_at: string;
  email: string | null;
  message_count: number;
};

export type AdminAction = {
  id: number;
  actor_id: string | null;
  target_id: string | null;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
};

export type Space = {
  id: string;
  name: string;
  icon_color: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
};

export type SpaceMember = {
  space_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
};

export type ConversationKind = "dm" | "group" | "text" | "voice";

export type Conversation = {
  id: string;
  kind: ConversationKind;
  name: string | null;
  space_id: string | null;
  position: number;
  created_at: string;
  last_message_at: string | null;
};

export type ChatListItem = {
  id: string;
  kind: "dm" | "group";
  name: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message: string | null;
  last_author_id: string | null;
  other_user_id: string | null;
  member_count: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  author_id: string;
  content: string;
  reply_to_id: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  /** client-only: optimistic message not yet confirmed */
  pending?: boolean;
};

export type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  conversation_id: string;
};

export type UserStatus = "online" | "idle" | "dnd" | "invisible";

export type PresenceState = {
  user_id: string;
  status: Exclude<UserStatus, "invisible">;
  voice: string | null;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  online_at: string;
};
