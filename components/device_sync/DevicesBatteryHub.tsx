'use client';
import React, { useState } from 'react';
export default function DevicesBatteryHub() {
  const [activeTab, setActiveTab] = useState('current');
  return (
    <div className="p-6 bg-[#0a0a0a] border border-neutral-800 rounded-3xl text-white w-full max-w-md shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
          Devices & Battery Sync
        </h2>
      </div>
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl mb-4">
        <div className="flex justify-between items-start mb-4">
          <div><h3 className="font-bold text-lg">iPhone 16 Pro Max</h3></div>
          <span className="text-emerald-400 text-xs px-2 py-1 bg-emerald-500/20 rounded-full font-bold">⚡ 82%</span>
        </div>
      </div>
      <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl mb-4">
        <h3 className="font-bold mb-4">🎧 AirPods Pro (2nd Gen)</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-neutral-800 rounded-xl p-3"><span className="text-xs">Left</span><br/><b>100%</b></div>
          <div className="bg-neutral-800 rounded-xl p-3 border border-emerald-500/30"><span className="text-xs text-emerald-400">Case</span><br/><b className="text-emerald-400">⚡ 45%</b></div>
          <div className="bg-neutral-800 rounded-xl p-3"><span className="text-xs">Right</span><br/><b>98%</b></div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4 border-t border-neutral-800 pt-4">
        <button className="bg-neutral-900 p-3 rounded-xl hover:bg-neutral-800 text-xs">🔒 Lock</button>
        <button className="bg-neutral-900 p-3 rounded-xl hover:bg-neutral-800 text-xs">🔊 Vol</button>
        <button className="bg-neutral-900 p-3 rounded-xl hover:bg-neutral-800 text-xs">📸 Cam</button>
        <button className="bg-blue-900/30 p-3 rounded-xl hover:bg-blue-900/50 text-xs text-blue-400">📱 Screen</button>
      </div>
    </div>
  );
}
