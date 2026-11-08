import './globals.css';
import Link from 'next/link';
import React from 'react';

export const metadata = { title: 'Nexus Ecosystem', description: 'The ultimate continuity and creator platform' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#050505] text-white flex h-screen overflow-hidden font-sans">
        <aside className="w-64 bg-[#0a0a0a] border-r border-neutral-800 flex flex-col">
          <div className="p-6">
            <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-[#00f2fe] to-[#fe0979]">
              NEXUS
            </h1>
          </div>
          <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
            <Link href="/" className="block px-4 py-2 rounded-xl text-sm font-bold text-neutral-400 hover:bg-neutral-900 hover:text-white transition-all">🏠 Home</Link>
            <Link href="/tiktok" className="block px-4 py-2 rounded-xl text-sm font-bold text-neutral-400 hover:bg-neutral-900 hover:text-white transition-all">🎬 TikTok Studio</Link>
            <Link href="/devices" className="block px-4 py-2 rounded-xl text-sm font-bold text-neutral-400 hover:bg-neutral-900 hover:text-white transition-all">📱 Device Sync</Link>
            <Link href="/chat" className="block px-4 py-2 rounded-xl text-sm font-bold text-neutral-400 hover:bg-neutral-900 hover:text-white transition-all">💬 Chat & Translator</Link>
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto bg-[#050505]">{children}</main>
      </body>
    </html>
  );
}
