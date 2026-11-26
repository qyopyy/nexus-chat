export type ReleaseNote = {
  app: "Nexus" | "Acetate";
  version: string;
  items: { title: string; body: string }[];
};

export const NEXUS_RELEASE: ReleaseNote = {
  app: "Nexus",
  version: "1.9.1",
  items: [
    {
      title: "New game: Cul-de-Sac Heroes",
      body: "Games → Cul-de-Sac Heroes. Turn-based co-op tactics: pick a kid hero, defend the street through 5 waves and a Mega Mower boss. Play a solo squad or 2–4 friends live with a room code.",
    },
    {
      title: "Encrypted DMs",
      body: "Settings → Privacy & Safety → Encrypted DMs. Turn it on (both of you) and the text of one-to-one DMs is encrypted on your device — Nexus servers, notifications and backups only see scrambled text. Photos, files and groups aren't covered yet.",
    },
    {
      title: "Edit link previews",
      body: "On your own messages, tap the pencil on a link card to change its title, description or picture, or hide the preview entirely.",
    },
    {
      title: ".mov → .mp4 everywhere",
      body: "iPhone .mov videos are converted to .mp4 automatically in chat, Nexus-gram, Drop, Cloud, posts and wallpapers so they play for everyone.",
    },
    {
      title: "Screen sharing, fixed",
      body: "Clearer errors when sharing is blocked, sharper text while presenting, live quality changes and system audio that no longer gets echo-cancelled.",
    },
    {
      title: "Nexus Guard",
      body: "Me tab → Nexus Guard. Scan any link before you tap it, keep a 24/7 watchlist that messages you if a link turns dangerous, and see a protection score with ad-blocking DNS, IP hiding and iOS privacy steps.",
    },
    {
      title: "Security keys for 2FA",
      body: "Settings → Account has a Security key option: link a Flipper Zero (U2F app), YubiKey or other hardware key as a second factor, next to Authy and passkeys. Existing accounts can turn it on there any time.",
    },
    {
      title: "Pre-save auto-scan",
      body: "Paste an ISRC, UPC, Spotify URI or any streaming link in a pre-save page and Nexus finds the release on Spotify, Apple Music, Deezer and more, then fills in your buttons.",
    },
    {
      title: "Share & Link, front and center",
      body: "Phone Link and Drop now have their own page (Me tab → Phone Link & Drop, or the sidebar). Send a file to your other devices or a friend over any network, and tap Save on iPhone to put it in Files or Photos.",
    },
    {
      title: "Faster to open",
      body: "Studio, Games, Apps, Radio, Live and the other big screens now load when you open them instead of with the app, so Nexus starts quicker.",
    },
    {
      title: "Distribution panel",
      body: "Panel is in the sidebar, Apps, and Settings. It opens the music distribution dashboard in a new tab, or in the iPhone in-app browser so that sign-in stays there.",
    },
    {
      title: "A note that stays with the chat",
      body: "Each conversation has a private scratch note. Only you can read it, and it follows you to your other signed-in devices.",
    },
    {
      title: "Drops wait until they open",
      body: "A file stays in your inbox if the browser blocks the download. It is marked taken only after a window actually opens.",
    },
    {
      title: "Phone Link finishes the action",
      body: "A command stays pending if the phone never confirms it, so a missed ring or a failed paste can run again. Two tabs on the same phone won't both fire it.",
    },
    {
      title: "Wump map, tightened",
      body: "Search stops when you leave the map. Naming a dropped pin no longer wipes a route. The live-friend count uses the same age as the pins, and a pin keeps the person you tapped.",
    },
    {
      title: "Location stays on your terms",
      body: "Leaving Locator stops the web watch. If you turn sharing off on another device, this one picks that up within a minute and stops publishing.",
    },
    {
      title: "Wilds on the map",
      body: "Catch original Wump creatures on your block. Invite friends with a room code. They see the same street block, not your exact pin.",
    },
    {
      title: "Voice memos on iPhone",
      body: "Memos record in a format the phone can play, and an empty recording is refused instead of saved.",
    },
    {
      title: "Cloud and polls",
      body: "One Cloud file that fails no longer blocks the rest of the queue. A poll vote snaps back if it did not save, and a poll that never posts is removed.",
    },
  ],
};

export const ACETATE_RELEASE: ReleaseNote = {
  app: "Acetate",
  version: "1.2.1",
  items: [
    {
      title: "Distribution panel",
      body: "Distribution is in the sidebar, the phone tabs, and Account. Releases and splits open on the panel. On iPhone that is the in-app browser.",
    },
    {
      title: "Vault tracks on this device",
      body: "Keep versions you own in Vault on the phone. They play from that copy when the signed link is gone, and Account lists what is saved so you can remove it.",
    },
    {
      title: "Queue and projects",
      body: "Move songs up or down, and clearing the queue clears it on your other devices. The queue comes back after a reload. Projects opens the project list.",
    },
    {
      title: "Vault uploads",
      body: "A batch shows which file is going up. One file that fails does not throw away the ones that already landed.",
    },
    {
      title: "Bring",
      body: "A SoundCloud import tells you when it lands in Vault. Saving a conversion keeps the format as the version label. A partial playlist says what that means.",
    },
  ],
};
