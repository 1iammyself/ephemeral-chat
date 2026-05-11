import { useState } from 'react';
import { Lock, Code2, Activity, Eye, PanelLeft, PanelRight, FileText, RefreshCw, Zap, Volume2, VolumeX, Search } from 'lucide-react';
import { hapticSuccess } from '../utils/platform';

const FEATURES = [
  { icon: Lock,  label: 'Secrets', color: 'violet',  key: 'secrets' },
  { icon: Code2, label: 'Code',    color: 'blue',    key: 'code' },
  { icon: Activity, label: 'Watch', color: 'red',    key: 'watch' },
];

export default function RoomToolsPanel({
  previewEnabled, setPreviewEnabled,
  sidebarPosition, setSidebarPosition,
  hasNewLogs,
  onOpenPanel,
  setShowActivityLogs, setHasNewLogs,
  verbalCode = null,
  isHost = false,
  soundEnabled = true,
  toggleSound,
  showSearch = false,
  setShowSearch,
  clearSearch,
  onClose,
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const featureActions = {
    secrets: () => { onOpenPanel?.('secrets'); onClose?.(); },
    code:    () => { onOpenPanel?.('code');    onClose?.(); },
    watch:   () => { onOpenPanel?.('watch');   onClose?.(); },
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => window.location.reload(), 400);
  };

  const handleCopyCode = () => {
    if (!verbalCode) return;
    navigator.clipboard.writeText(verbalCode);
    hapticSuccess();
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleToggleSearch = () => {
    if (showSearch) { clearSearch?.(); setShowSearch?.(false); }
    else setShowSearch?.(true);
    onClose?.();
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {/* Feature grid — 4 items */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1 mb-2">Features</p>
        <div className="grid grid-cols-3 gap-2">
          {FEATURES.map(({ icon: Icon, label, color, key }) => (
            <button
              key={key}
              onClick={featureActions[key]}
              className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-${color}-50 dark:hover:bg-${color}-900/20 border border-transparent hover:border-${color}-200/60 dark:hover:border-${color}-800/40 transition-all active:scale-95`}
            >
              <Icon className={`w-5 h-5 text-${color}-500 dark:text-${color}-400`} />
              <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 leading-none">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preferences */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1 mb-1">Preferences</p>
        <div className="space-y-0.5">

          {/* Sound FX toggle */}
          {toggleSound && (
            <button
              onClick={() => { toggleSound(); }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {soundEnabled
                  ? <Volume2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  : <VolumeX className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
                <span className="text-xs text-gray-700 dark:text-gray-300">Sound Effects</span>
              </div>
              <div className={`relative w-8 h-4.5 rounded-full transition-colors flex items-center ${soundEnabled ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <div className={`absolute w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${soundEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </div>
            </button>
          )}

          {/* Search messages */}
          {setShowSearch && (
            <button
              onClick={handleToggleSearch}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors ${showSearch ? 'bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}
            >
              <Search className={`w-4 h-4 ${showSearch ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`} />
              <span className={`text-xs ${showSearch ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {showSearch ? 'Close Search' : 'Search Messages'}
              </span>
            </button>
          )}

          {/* Typing preview toggle */}
          <button
            onClick={() => { const n = !previewEnabled; setPreviewEnabled(n); localStorage.setItem('typingPreview_enabled', String(n)); }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-xs text-gray-700 dark:text-gray-300">Live Typing Preview</span>
            </div>
            <div className={`relative w-8 h-4.5 rounded-full transition-colors flex items-center ${previewEnabled ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <div className={`absolute w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${previewEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* Sidebar position */}
          <button
            onClick={() => setSidebarPosition(p => p === 'right' ? 'left' : 'right')}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
          >
            {sidebarPosition === 'right'
              ? <PanelLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              : <PanelRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />}
            <span className="text-xs text-gray-700 dark:text-gray-300">
              Move panel to {sidebarPosition === 'right' ? 'left' : 'right'}
            </span>
          </button>

          {/* Activity logs */}
          <button
            onClick={() => { setShowActivityLogs(true); setHasNewLogs(false); onClose?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
          >
            <div className="relative">
              <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              {hasNewLogs && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />}
            </div>
            <span className="text-xs text-gray-700 dark:text-gray-300">Activity Logs</span>
            {hasNewLogs && <span className="ml-auto text-[10px] font-bold text-red-500">New</span>}
          </button>

          {/* Copy join code — host only */}
          {isHost && verbalCode && (
            <button
              onClick={handleCopyCode}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
            >
              <Zap className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span className="text-xs text-gray-700 dark:text-gray-300">
                {codeCopied ? 'Copied!' : 'Copy Join Code'}
              </span>
              {!codeCopied && (
                <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[90px]">{verbalCode}</span>
              )}
            </button>
          )}

          {/* Refresh / Reload */}
          <button
            onClick={handleRefresh}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-all duration-500 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
            <span className="text-xs text-gray-700 dark:text-gray-300">Refresh / Reload</span>
          </button>

        </div>
      </div>
    </div>
  );
}
