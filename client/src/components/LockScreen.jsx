import { Lock } from 'lucide-react';

export default function LockScreen({ onUnlock }) {
  return (
    <div className="fixed inset-0 z-[99999] bg-gray-950/98 backdrop-blur-2xl flex flex-col items-center justify-center select-none">
      <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-300">
        <img
          src="/logo.svg"
          alt="Ephemeral Chat"
          className="w-20 h-20 opacity-70"
          draggable={false}
        />

        <div className="p-5 rounded-full bg-gray-800/80 ring-1 ring-white/10">
          <Lock className="w-10 h-10 text-gray-200" />
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-white tracking-tight">Ephemeral Chat</h1>
          <p className="text-sm text-gray-400">App is locked</p>
        </div>

        <button
          onClick={onUnlock}
          className="mt-2 px-10 py-3 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white font-semibold rounded-xl shadow-lg shadow-teal-900/40 transition-all"
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
