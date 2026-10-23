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
  links?: ProfileLink[];
  banner_url?: string | null;
  profile_song?: string | null;
  now_playing?: NowPlaying | null;
  forum_name?: string | null;
  member_no?: number | null;
  muted_until?: string | null;
  mute_reason?: string | null;
};

export type ProfileLink = { type: string; url: string; label?: string };
export type NowPlaying = { title: string; artist: string; url?: string | null; image?: string | null; at: string };

export type ArtistPage = {
  id: string;
  spotify_id: string | null;
  handle: string;
  name: string;
  image_url: string | null;
  bio: string | null;
  owner_id: string | null;
  verified: boolean;
  created_at: string;
};

export type ArtistPost = {
  id: string;
  page_id: string;
  author_id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  link_url: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type ArtistComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  deleted_at: string | null;
  created_at: string;
};

export type ArtistClaim = {
  id: string;
  spotify_id: string;
  artist_name: string;
  artist_image: string | null;
  requested_handle: string;
  user_id: string;
  proof: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type SpaceTrack = {
  id: string;
  space_id: string;
  title: string;
  artist: string | null;
  url: string;
  kind: "upload" | "spotify";
  duration: number | null;
  added_by: string | null;
  removed_at: string | null;
  created_at: string;
};

export type SpacePlayer = {
  space_id: string;
  track_id: string | null;
  is_playing: boolean;
  position: number;
  updated_at: string;
  updated_by: string | null;
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
  muted_until?: string | null;
  member_no?: number | null;
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
  music_enabled?: boolean;
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
  /** full-screen effect: confetti | hearts | fireworks | lasers | balloons | snow */
  effect?: string | null;
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
