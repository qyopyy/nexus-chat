"use client";

import { useEffect, useState } from "react";
import { finishSpotifyLogin } from "@/lib/spotifyUser";

export default function SpotifyCallback() {
  const [msg, setMsg] = useState("Connecting your Spotify…");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code");
    const err = q.get("error");
    if (err || !code) {
      setMsg(err === "access_denied" ? "Spotify connection cancelled." : "Spotify didn't send a login code.");
      setTimeout(() => window.location.replace("/"), 1800);
      return;
    }
    finishSpotifyLogin(code)
      .then(() => {
        setMsg("Spotify connected ✓");
        window.location.replace("/?spotify=connected");
      })
      .catch((e: Error) => {
        setMsg(e.message);
        setTimeout(() => window.location.replace("/"), 3000);
      });
  }, []);
  return (
    <div className="grid h-dvh place-items-center bg-[#0b0c10] p-6 text-center text-white">
      <div>
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[#1DB954] text-3xl">♫</div>
        <p className="text-lg font-semibold">{msg}</p>
      </div>
    </div>
  );
}
