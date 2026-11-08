'use client';
import React from 'react';

export default function CustomTikTokEditor() {
  return (
    <div className="flex flex-col h-[800px] w-full bg-[#121212] text-white font-sans rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl">
      {/* Top Nav */}
      <div className="flex justify-between items-center p-4 border-b border-neutral-800 bg-[#0a0a0a]">
        <div className="flex gap-4">
          <button className="text-neutral-400 hover:text-white font-bold text-sm">Media</button>
          <button className="text-neutral-400 hover:text-white font-bold text-sm">Audio</button>
          <button className="text-white font-bold text-sm border-b-2 border-[#00f2fe] pb-1">Effects & FX</button>
          <button className="text-neutral-400 hover:text-white font-bold text-sm">Text</button>
        </div>
        <div className="flex items-center gap-3">
          <select className="bg-neutral-900 border border-neutral-700 text-xs px-2 py-1 rounded">
            <option>1080p 60fps</option>
            <option>4K 60fps</option>
          </select>
          <button className="bg-[#fe0979] hover:bg-[#d60866] text-white px-5 py-1.5 rounded-full text-sm font-bold shadow-[0_0_15px_rgba(254,9,121,0.4)]">
            Export
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* FX Sidebar */}
        <div className="w-64 border-r border-neutral-800 bg-[#0a0a0a] p-4 overflow-y-auto">
          <h3 className="text-xs font-bold text-neutral-500 uppercase mb-4">Trending FX</h3>
          <div className="grid grid-cols-2 gap-2">
            {['3D Zoom', 'Flash Warning', 'Chromatic', 'VHS Blur', 'Motion Blur', 'RGB Split'].map(fx => (
              <button key={fx} className="bg-neutral-900 border border-neutral-800 p-3 rounded-lg text-xs font-semibold hover:border-[#00f2fe] hover:bg-neutral-800 transition-all">
                {fx}
              </button>
            ))}
          </div>
        </div>

        {/* Preview Player */}
        <div className="flex-1 bg-black flex items-center justify-center p-4 relative">
          <div className="w-[320px] h-[568px] bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-center shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center text-neutral-700">9:16 Canvas</div>
            <div className="absolute bottom-4 right-4 text-xs font-bold bg-black/60 px-2 py-1 rounded">00:00:14:23</div>
          </div>
        </div>
      </div>

      {/* Timeline Editor */}
      <div className="h-72 bg-[#0a0a0a] border-t border-neutral-800 p-4 flex flex-col gap-2 overflow-x-auto relative">
        {/* Playhead */}
        <div className="absolute top-0 bottom-0 left-32 w-0.5 bg-[#fe0979] z-20">
          <div className="w-3 h-3 bg-[#fe0979] absolute -top-1.5 -left-[5px] rounded-full"></div>
        </div>

        <div className="flex gap-4 mb-2 text-xs font-bold text-neutral-400 pl-2">
          <button className="hover:text-white">✂️ Split (Cmd+K)</button>
          <button className="hover:text-white">🚀 Velocity</button>
          <button className="hover:text-white">✨ Keyframe</button>
        </div>
        
        <div className="flex flex-col gap-1 min-w-[800px]">
          {/* Video Track */}
          <div className="flex items-center gap-2">
            <span className="w-16 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Video</span>
            <div className="flex-1 h-14 bg-blue-900/30 border border-blue-800/50 rounded-md flex items-center px-1">
              <div className="h-full w-1/4 bg-blue-600/40 border border-blue-500 rounded-sm text-xs p-1">IMG_492.MOV</div>
              <div className="h-full w-2/4 bg-blue-600/40 border border-blue-500 rounded-sm text-xs p-1 ml-1 relative">
                IMG_493.MOV
                <div className="absolute bottom-1 left-1 bg-black/50 px-1 rounded text-[8px] text-[#00f2fe]">1.5x Speed</div>
              </div>
            </div>
          </div>
          
          {/* FX Track */}
          <div className="flex items-center gap-2 mt-1">
            <span className="w-16 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">FX</span>
            <div className="flex-1 h-8 bg-purple-900/30 border border-purple-800/50 rounded-md flex items-center px-1">
              <div className="ml-32 w-1/4 h-full bg-purple-500/40 border border-purple-400 rounded-sm text-[10px] p-1 flex items-center">Flash Warning</div>
            </div>
          </div>

          {/* Audio Track (Beats) */}
          <div className="flex items-center gap-2 mt-1">
            <span className="w-16 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Audio</span>
            <div className="flex-1 h-12 bg-emerald-900/30 border border-emerald-800/50 rounded-md flex items-end px-1 relative">
              {/* Fake Audio Waveform */}
              <div className="w-full h-full opacity-50 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjIwIj48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMTRiODg2Ii8+PC9zdmc+')] bg-repeat-x bg-center"></div>
              {/* Beat Markers */}
              <div className="absolute top-0 bottom-0 left-[25%] w-px bg-yellow-400/50"></div>
              <div className="absolute top-0 bottom-0 left-[75%] w-px bg-yellow-400/50"></div>
              <div className="absolute top-1 left-2 text-[10px] text-emerald-400 font-bold">Trending_Song_BassBoosted.wav</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
