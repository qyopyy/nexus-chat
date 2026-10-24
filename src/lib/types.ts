export type ProfileEffect = "none" | "aurora" | "stars" | "hearts" | "snow" | "matrix" | "confetti" | "fire" | "bubbles" | "neon";
export type ProfileBorder = "none" | "rainbow" | "neon" | "gold" | "fire" | "ice";
export type ProfileTheme = "none" | "midnight" | "sunset" | "ocean" | "forest" | "candy" | "mono";

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
  view_count?: number;
  like_count?: number;
  profile_effect?: ProfileEffect | null;
  profile_border?: ProfileBorder | null;
  profile_theme?: ProfileTheme | null;
  forum_name?: string | null;
  member_no?: number | null;
  muted_until?: string | null;
  mute_reason?: string | null;
  channel_description?: string | null;
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

// ------------------------------------------------------------------ distribution (Tunearo)
export type DistStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "sending"
  | "pending"
  | "approved"
  | "rejected"
  | "live"
  | "takedown_requested"
  | "taken_down"
  | "error";

export type DistArtist = {
  id: string;
  owner_id: string;
  name: string;
  spotify_id: string | null;
  apple_id: string | null;
  bio: string | null;
  tunearo_id: string | null;
  created_at: string;
};

export type DistRelease = {
  id: string;
  owner_id: string;
  title: string;
  primary_artist_name: string;
  artist_ids: string[];
  release_type: "Single" | "EP" | "Album";
  primary_genre: string;
  secondary_genre: string | null;
  release_date: string;
  label_name: string;
  language: string | null;
  explicit: boolean;
  copyright_year: number | null;
  copyright_holder: string | null;
  territories_include: string;
  territories_exclude: string | null;
  artwork_path: string | null;
  upc: string | null;
  status: DistStatus;
  staff_note: string | null;
  rejection_reason: string | null;
  last_error: string | null;
  tunearo_id: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Split = { name: string; role: string; share: number; email?: string; ipi?: string };

export type DistTrack = {
  id: string;
  release_id: string;
  position: number;
  title: string;
  primary_artist_name: string | null;
  featured_artist_names: string | null;
  explicit: boolean;
  isrc: string | null;
  language: string | null;
  lyrics: string | null;
  composer: string | null;
  producer: string | null;
  songwriter: string | null;
  lyricist: string | null;
  mixer: string | null;
  mastering_engineer: string | null;
  publisher: string | null;
  remixer: string | null;
  audio_path: string | null;
  audio_name: string | null;
  audio_bytes: number | null;
  duration: number | null;
  tunearo_track_id: string | null;
  audio_sent: boolean;
  bpm: number | null;
  musical_key: string | null;
  lufs: number | null;
  true_peak: number | null;
  splits: Split[];
  created_at: string;
};

// ------------------------------------------------------------------ videos
export type VideoLink = { label: string; url: string };

export type Video = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  slug: string | null;
  links: VideoLink[];
  tags: string[];
  category: string | null;
  visibility: "public" | "unlisted" | "private";
  status: "uploading" | "ready" | "failed";
  made_for_kids: boolean;
  comments_enabled: boolean;
  video_path: string | null;
  thumb_url: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  bytes: number | null;
  views: number;
  likes: number;
  dislikes: number;
  comment_count: number;
  publish_at: string | null;
  published_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoComment = {
  id: string;
  video_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  pinned: boolean;
  deleted_at: string | null;
  created_at: string;
};
