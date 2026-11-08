import React from 'react';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import ChatTranslatorInput from '@/components/chat/ChatTranslatorInput';

export default function ChatPage() {
  return (
    <div className="p-10 animate-in">
      <h1 className="text-3xl font-black mb-8">Nexus Chat & Translation</h1>
      <div className="space-y-6 max-w-2xl">
        <ChatTranslatorInput />
        <VoiceRecorder />
      </div>
    </div>
  );
}
