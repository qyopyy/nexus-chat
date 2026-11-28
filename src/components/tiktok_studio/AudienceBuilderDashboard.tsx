'use client';
import React from 'react';

export default function AudienceBuilderDashboard() {
  return (
    <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl text-white font-sans max-w-4xl">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">📈 TikTok Growth Engine</h2>
      
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
          <p className="text-xs text-neutral-400 font-bold uppercase mb-1">Optimal Post Time</p>
          <p className="text-2xl font-black text-[#00f2fe]">7:45 PM</p>
          <p className="text-xs text-emerald-400 mt-1">+24% engagement expected</p>
        </div>
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
          <p className="text-xs text-neutral-400 font-bold uppercase mb-1">Audience Retention</p>
          <p className="text-2xl font-black text-white">42% <span className="text-sm font-normal text-neutral-500">at 3s</span></p>
          <p className="text-xs text-red-400 mt-1">Hook needs improvement</p>
        </div>
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700">
          <p className="text-xs text-neutral-400 font-bold uppercase mb-1">Viral Probability</p>
          <p className="text-2xl font-black text-[#fe0979]">87%</p>
          <p className="text-xs text-neutral-400 mt-1">Based on current edit style</p>
        </div>
      </div>

      <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4">🔥 Currently Trending Sounds & Tags</h3>
      <div className="bg-black/50 rounded-xl p-4 border border-neutral-800">
        <div className="flex gap-2 flex-wrap mb-4">
          {['#POV', '#Corecore', '#Edit', '#VFX', '#AnimeEdit'].map(tag => (
            <span key={tag} className="bg-neutral-800 px-3 py-1 rounded-full text-xs font-bold cursor-pointer hover:bg-[#00f2fe] hover:text-black transition-colors">{tag}</span>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center bg-neutral-800 p-3 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-xl">🎵</span>
              <div>
                <p className="text-sm font-bold">Midnight City (Sped Up)</p>
                <p className="text-xs text-neutral-400">4.2M videos • Rising</p>
              </div>
            </div>
            <button className="text-xs font-bold bg-white text-black px-3 py-1.5 rounded-full hover:bg-neutral-200">Use Sound</button>
          </div>
        </div>
      </div>
    </div>
  );
}
