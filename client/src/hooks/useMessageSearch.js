import { useState, useCallback, useMemo } from 'react';

export function useMessageSearch(messages) {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return messages
      .filter(m => m.type !== 'system' && typeof m.content === 'string' && m.content.toLowerCase().includes(lower))
      .map(m => {
        const text = m.content;
        const start = text.toLowerCase().indexOf(lower);
        return { messageId: m.id, start, end: start + lower.length };
      });
  }, [messages, query]);

  const highlightMap = useMemo(() => {
    const map = {};
    results.forEach(r => { map[r.messageId] = r; });
    return map;
  }, [results]);

  const focusedMessageId = results[focusedIndex]?.messageId ?? null;

  const next = useCallback(() => {
    if (results.length === 0) return;
    setFocusedIndex(i => (i + 1) % results.length);
  }, [results.length]);

  const prev = useCallback(() => {
    if (results.length === 0) return;
    setFocusedIndex(i => (i - 1 + results.length) % results.length);
  }, [results.length]);

  const clear = useCallback(() => {
    setQuery('');
    setFocusedIndex(0);
  }, []);

  const updateQuery = useCallback((q) => {
    setQuery(q);
    setFocusedIndex(0);
  }, []);

  return {
    query,
    setQuery: updateQuery,
    results,
    highlightMap,
    focusedMessageId,
    focusedIndex,
    next,
    prev,
    clear,
  };
}
