export type ReleaseNote = {
  app: "Nexus" | "Acetate";
  version: string;
  items: { title: string; body: string }[];
};

export const NEXUS_RELEASE: ReleaseNote = {
  app: "Nexus",
  version: "1.9.0",
  items: [
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
  version: "1.2.0",
  items: [
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
