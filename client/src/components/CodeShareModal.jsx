import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Y from 'yjs';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yCollab } from 'y-codemirror.next';
import { Awareness } from 'y-protocols/awareness';
import { X, Copy, Check, Code2, Send } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useSocketIOYjsProvider } from '../hooks/useSocketIOYjsProvider';
import socketManager from '../socket';

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', ext: javascript({ jsx: true, typescript: false }) },
  { id: 'typescript', label: 'TypeScript', ext: javascript({ jsx: true, typescript: true }) },
  { id: 'python', label: 'Python', ext: python() },
  { id: 'html', label: 'HTML', ext: html() },
  { id: 'css', label: 'CSS', ext: css() },
  { id: 'json', label: 'JSON', ext: json() },
  { id: 'markdown', label: 'Markdown', ext: markdown() },
  { id: 'plain', label: 'Plain Text', ext: null },
];

export default function CodeShareModal({ isOpen, onClose, roomCode, onSendCode }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [langId, setLangId] = useState('javascript');
  const [copied, setCopied] = useState(false);

  // One Yjs doc per roomCode — recreated only when roomCode changes
  const ydocRef = useRef(null);
  const awarenessRef = useRef(null);
  const ytextRef = useRef(null);

  // Lazy-ref initialization — runs synchronously in render so refs are always set before
  // yCollab extensions are built. Mutation of refs in render is allowed (no state update).
  if (!ydocRef.current) {
    const doc = new Y.Doc();
    ydocRef.current = doc;
    awarenessRef.current = new Awareness(doc);
    ytextRef.current = doc.getText('codemirror');
  }

  // Destroy doc on unmount or roomCode change (roomCode is stable in practice)
  useEffect(() => {
    return () => {
      awarenessRef.current?.destroy();
      ydocRef.current?.destroy();
      ydocRef.current = null;
      awarenessRef.current = null;
      ytextRef.current = null;
    };
  }, [roomCode]);

  // Wire up the Socket.IO Yjs provider
  useSocketIOYjsProvider(socketManager, roomCode, ydocRef.current, isOpen);

  const langDef = useMemo(() => LANGUAGES.find((l) => l.id === langId), [langId]);

  const extensions = useMemo(() => {
    const exts = [];
    if (langDef?.ext) exts.push(langDef.ext);
    if (ytextRef.current && awarenessRef.current) {
      exts.push(yCollab(ytextRef.current, awarenessRef.current));
    }
    return exts;
  }, [langDef]);

  const handleCopy = () => {
    const text = ytextRef.current?.toString() || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSend = () => {
    const code = ytextRef.current?.toString() || '';
    if (!code.trim()) return;
    onSendCode?.(code, langId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-500" />
            <span className="font-semibold text-sm dark:text-white">Code Share</span>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              Live · everyone in room can edit
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Language selector */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-x-auto">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => setLangId(l.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                langId === l.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto min-h-0">
          <CodeMirror
            height="100%"
            theme={isDark ? oneDark : 'light'}
            extensions={extensions}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              indentOnInput: true,
            }}
            style={{ height: '100%', minHeight: '300px', fontSize: '13px' }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="text-xs text-gray-400">Changes sync instantly with everyone in the room</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors dark:text-gray-300"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleSend}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Send to Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
