import React from 'react';
import AutoEditGenerator from '@/components/tiktok_studio/AutoEditGenerator';
import TikTokManualEditor from '@/components/tiktok_studio/TikTokManualEditor';

export default function TikTokStudioPage() {
  return (
    <div className="p-8 space-y-10 animate-in max-w-[1600px] mx-auto">
      <h1 className="text-3xl font-black">TikTok Studio</h1>
      <AutoEditGenerator />
      <TikTokManualEditor />
    </div>
  );
}
