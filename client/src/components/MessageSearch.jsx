import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';

export default function MessageSearch({ query, setQuery, results, focusedIndex, onNext, onPrev, onClose }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter') { e.shiftKey ? onPrev() : onNext(); }
    if (e.key === 'F3') { e.preventDefault(); e.shiftKey ? onPrev() : onNext(); }
  };

  const count = results.length;
  const label = count === 0
    ? (query.trim() ? t('search.noResults') : '')
    : t('search.resultCount', { current: focusedIndex + 1, total: count });

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-2 duration-150">
      <Search className="w-4 h-4 text-gray-400 shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('search.placeholder')}
        className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none"
      />
      {query.trim() && (
        <span className="text-xs text-gray-400 tabular-nums shrink-0 min-w-[50px] text-right">
          {label}
        </span>
      )}
      <button
        onClick={onPrev}
        disabled={count === 0}
        className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
        title={t('search.prev')}
      >
        <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </button>
      <button
        onClick={onNext}
        disabled={count === 0}
        className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
        title={t('search.next')}
      >
        <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </button>
      <button
        onClick={onClose}
        className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-1"
        title={t('search.close')}
      >
        <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </button>
    </div>
  );
}
