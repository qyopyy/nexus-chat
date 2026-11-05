"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-full place-items-center bg-[#1e1f22] p-6 text-center text-[#dbdee1]">
      <div className="max-w-md">
        <div className="text-4xl">⚠️</div>
        <h2 className="mt-3 text-2xl font-black">Something went wrong</h2>
        <p className="mt-2 text-sm text-[#949ba4]">{error.message || "Nexus hit an unexpected error."}</p>
        <button onClick={reset} className="mt-5 rounded-full bg-[#2aabee] px-5 py-2.5 text-sm font-bold text-white">
          Try again
        </button>
      </div>
    </div>
  );
}
