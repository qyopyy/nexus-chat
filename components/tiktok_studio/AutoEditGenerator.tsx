'use client';
import React, { useState } from 'react';

export default function AutoEditGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState('hyper-sync');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const generateViralEdit = () => {
    if (!file) return;
    setIsProcessing(true);
    
    // Simulate AI Beat Detection & Rendering Process
    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 15);
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setTimeout(() => setIsProcessing(false), 500);
      }
      setProgress(current);
    }, 400);
  };

  return (
    <div className="p-6 bg-[#0a0a0a] border border-neutral-800 rounded-3xl text-white w-full max-w-2xl shadow-2xl font-sans">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">
          <span className="text-[#00f2fe]">Auto</span><span className="text-[#fe0979]">Viral</span> Editor
        </h2>
        <span className="bg-neutral-800 px-3 py-1 rounded-full text-xs font-bold border border-neutral-700">HD 60FPS</span>
      </div>

      {!isProcessing && progress !== 100 && (
        <div className="space-y-6">
          <div className="border-2 border-dashed border-neutral-700 rounded-2xl p-10 flex flex-col items-center justify-center hover:border-[#00f2fe] transition-colors cursor-pointer relative">
            <input type="file" accept="audio/mp3, audio/wav, video/mp4" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            <span className="text-4xl mb-3">🎵</span>
            <p className="font-bold text-lg">Upload MP3, WAV, or MP4</p>
            <p className="text-neutral-500 text-sm mt-1">{file ? file.name : 'AI will extract beats and auto-sync clips'}</p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-neutral-400 mb-3 uppercase tracking-wider">Select Edit Style</h3>
            <div className="grid grid-cols-3 gap-3">
              {['Hyper-Sync', 'Velocity/SlowMo', 'Glitch Core'].map((s) => (
                <button 
                  key={s} 
                  onClick={() => setStyle(s.toLowerCase())}
                  className={`p-3 rounded-xl border font-bold text-sm transition-all ${style === s.toLowerCase() ? 'bg-gradient-to-r from-[#00f2fe]/20 to-[#fe0979]/20 border-[#00f2fe] text-white' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={generateViralEdit}
            disabled={!file}
            className="w-full py-4 bg-white text-black font-extrabold rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✨ Generate TikTok Edit
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="py-12 flex flex-col items-center justify-center space-y-4">
          <div className="w-full bg-neutral-900 rounded-full h-3 mb-2 overflow-hidden border border-neutral-800">
            <div className="bg-gradient-to-r from-[#00f2fe] to-[#fe0979] h-3 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
          </div>
          <p className="text-[#00f2fe] font-bold animate-pulse">
            {progress < 30 ? 'Analyzing audio beats & drops...' : progress < 70 ? 'Applying velocity & 3D zooms...' : 'Rendering HD 60fps...'}
          </p>
          <span className="text-4xl font-black">{progress}%</span>
        </div>
      )}

      {progress === 100 && !isProcessing && (
        <div className="flex flex-col items-center space-y-4 animate-in fade-in zoom-in duration-500">
          <div className="w-64 h-96 bg-neutral-900 border-2 border-[#fe0979] rounded-xl flex items-center justify-center overflow-hidden relative">
            <span className="absolute top-2 right-2 bg-black/50 backdrop-blur px-2 py-1 rounded text-[10px] font-bold">Preview</span>
            <span className="text-neutral-600">Video Player</span>
          </div>
          <div className="flex gap-3 w-full">
            <button className="flex-1 py-3 bg-neutral-800 font-bold rounded-xl hover:bg-neutral-700">Download MP4</button>
            <button className="flex-1 py-3 bg-[#fe0979] text-white font-bold rounded-xl hover:bg-[#d60866]">Post to TikTok</button>
          </div>
        </div>
      )}
    </div>
  );
}
