import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * A simple reload button shown in the app header.
 * Works identically on Capacitor (Android/iOS) and Electron desktop.
 */
export function AppRefreshButton({ className = '' }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRefreshing(true);
    setTimeout(() => window.location.reload(), 400);
  };

  return (
    <button
      onClick={handleRefresh}
      className={`p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all text-gray-500 dark:text-gray-400 flex items-center justify-center group ${className}`}
      title="Refresh App"
    >
      <RefreshCw className={`w-5 h-5 transition-all duration-500 ${isRefreshing ? 'animate-spin text-blue-500 scale-110' : 'group-hover:rotate-180 group-active:scale-90'}`} />
    </button>
  );
}
