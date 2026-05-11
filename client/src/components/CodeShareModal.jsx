import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Y from 'yjs';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
import { nord } from '@uiw/codemirror-theme-nord';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { php } from '@codemirror/lang-php';
import { yCollab } from 'y-codemirror.next';
import { Awareness } from 'y-protocols/awareness';
import { X, Copy, Check, Code2, Send, WrapText, Ruler } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useSocketIOYjsProvider } from '../hooks/useSocketIOYjsProvider';
import socketManager from '../socket';

// ─── Language definitions ─────────────────────────────────────────────────
// Mirrors lite-xl's language_*.lua plugin approach: each entry maps a label,
// file extensions (for auto-detect), and a CodeMirror language extension.
const LANGUAGES = [
  { id: 'javascript', label: 'JS',     ext: javascript({ jsx: true }),                  exts: ['js','jsx','mjs','cjs'] },
  { id: 'typescript', label: 'TS',     ext: javascript({ jsx: true, typescript: true }), exts: ['ts','tsx','mts']       },
  { id: 'python',     label: 'Python', ext: python(),                                    exts: ['py','pyw','pyi']       },
  { id: 'html',       label: 'HTML',   ext: html(),                                      exts: ['html','htm']           },
  { id: 'css',        label: 'CSS',    ext: css(),                                       exts: ['css','pcss']           },
  { id: 'json',       label: 'JSON',   ext: json(),                                      exts: ['json','jsonc']         },
  { id: 'markdown',   label: 'MD',     ext: markdown(),                                  exts: ['md','mdx','markdown']  },
  { id: 'cpp',        label: 'C/C++',  ext: cpp(),                                       exts: ['c','cpp','h','hpp','cc','cxx','hxx'] },
  { id: 'java',       label: 'Java',   ext: java(),                                      exts: ['java']                 },
  { id: 'sql',        label: 'SQL',    ext: sql(),                                       exts: ['sql']                  },
  { id: 'xml',        label: 'XML',    ext: xml(),                                       exts: ['xml','svg','xaml','xsd','xsl'] },
  { id: 'php',        label: 'PHP',    ext: php(),                                       exts: ['php','phtml']          },
  { id: 'plain',      label: 'Text',   ext: null,                                        exts: ['txt']                  },
];

// ─── Theme definitions ────────────────────────────────────────────────────
// Inspired by lite-xl's /data/colors/ directory: default, fall, summer, textadept.
// We translate the spirit of each into well-known CodeMirror themes.
const THEMES = [
  { id: 'one-dark',     label: 'One Dark',     cm: oneDark,     dark: true  },
  { id: 'dracula',      label: 'Dracula',       cm: dracula,     dark: true  },
  { id: 'github-dark',  label: 'GitHub Dark',   cm: githubDark,  dark: true  },
  { id: 'nord',         label: 'Nord',          cm: nord,        dark: true  },
  { id: 'github-light', label: 'GitHub Light',  cm: githubLight, dark: false },
  { id: 'light',        label: 'Light',         cm: 'light',     dark: false },
];

// ─── Static extensions (lite-xl plugin equivalents) ──────────────────────

// lineguide.lua → vertical 80-column guide using CSS background gradient
const RULER_EXT = EditorView.theme({
  '.cm-content': {
    backgroundImage: [
      'linear-gradient(',
      '90deg,',
      'transparent calc(4px + 79ch),',
      'rgba(127,127,127,0.18) calc(4px + 79ch),',
      'rgba(127,127,127,0.18) calc(5px + 79ch),',
      'transparent calc(5px + 79ch)',
      ')',
    ].join(''),
    backgroundRepeat: 'no-repeat',
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────

// detectindent.lua equivalent: infer language from file extension
function detectLang(filename) {
  if (!filename) return null;
  const ext = filename.split('.').pop().toLowerCase();
  return LANGUAGES.find(l => l.exts?.includes(ext))?.id ?? null;
}

function calcStats(text) {
  return {
    lines: text ? (text.match(/\n/g)?.length ?? 0) + 1 : 1,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    chars: text.length,
  };
}

// ─── Component ────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { theme: 'one-dark', fontSize: 13, lineWrap: false, showRuler: false, tabSize: 2 };

export default function CodeShareModal({ isOpen, onClose, roomCode, onSendCode, embedded = false }) {
  const { theme } = useTheme();

  const [langId,    setLangId]    = useState('javascript');
  const [filename,  setFilename]  = useState('');
  const [copied,    setCopied]    = useState(false);
  const [settings,  setSettings]  = useState(DEFAULT_SETTINGS);
  const [stats,     setStats]     = useState({ lines: 1, words: 0, chars: 0 });

  // ── Yjs setup ────────────────────────────────────────────────────────────
  const ydocRef      = useRef(null);
  const awarenessRef = useRef(null);
  const ytextRef     = useRef(null);

  // Lazy init — runs synchronously in render so refs are ready before any hook
  if (!ydocRef.current) {
    const doc = new Y.Doc();
    ydocRef.current      = doc;
    awarenessRef.current = new Awareness(doc);
    ytextRef.current     = doc.getText('codemirror');
  }

  useEffect(() => () => {
    awarenessRef.current?.destroy();
    ydocRef.current?.destroy();
    ydocRef.current = awarenessRef.current = ytextRef.current = null;
  }, [roomCode]);

  useSocketIOYjsProvider(socketManager, roomCode, ydocRef.current, isOpen);

  // ── Live stats (statusview.lua equivalent) ────────────────────────────
  useEffect(() => {
    const ytext = ytextRef.current;
    if (!ytext) return;
    const update = () => setStats(calcStats(ytext.toString()));
    ytext.observe(update);
    return () => ytext.unobserve(update);
  }, []);

  // ── Filename → language auto-detect ──────────────────────────────────
  useEffect(() => {
    const detected = detectLang(filename);
    if (detected) setLangId(detected);
  }, [filename]);

  // Default theme to match system dark/light when first opened
  useEffect(() => {
    setSettings(s => ({
      ...s,
      theme: theme === 'dark' ? 'one-dark' : 'github-light',
    }));
  }, [theme]);

  // ── Derived values ────────────────────────────────────────────────────
  const langDef  = useMemo(() => LANGUAGES.find(l => l.id === langId),        [langId]);
  const themeDef = useMemo(() => THEMES.find(t => t.id === settings.theme) ?? THEMES[0], [settings.theme]);

  // linewrapping.lua, lineguide.lua, detectindent.lua equivalents
  const extensions = useMemo(() => {
    const exts = [];
    if (langDef?.ext)      exts.push(langDef.ext);
    if (settings.lineWrap) exts.push(EditorView.lineWrapping);
    if (settings.showRuler) exts.push(RULER_EXT);
    exts.push(EditorState.tabSize.of(settings.tabSize));
    if (ytextRef.current && awarenessRef.current) {
      exts.push(yCollab(ytextRef.current, awarenessRef.current));
    }
    return exts;
  }, [langDef, settings.lineWrap, settings.showRuler, settings.tabSize]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const set    = (key, val) => setSettings(s => ({ ...s, [key]: val }));
  const toggle = (key)      => setSettings(s => ({ ...s, [key]: !s[key] }));

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

  if (!isOpen && !embedded) return null;

  // ── Style helpers ─────────────────────────────────────────────────────
  const e       = embedded;
  const border  = e ? 'border-white/[0.07]' : 'border-gray-200 dark:border-gray-700';
  const rowBase = `flex items-center gap-1.5 px-3 py-1.5 flex-shrink-0 overflow-x-auto scrollbar-hide`;
  const sepCls  = `w-px h-3.5 flex-shrink-0 mx-0.5 ${e ? 'bg-white/10' : 'bg-gray-200 dark:bg-gray-700'}`;

  const iconBtn = (active) =>
    `p-1.5 rounded transition-colors flex-shrink-0 ${
      active
        ? 'text-blue-400 bg-blue-500/15'
        : e
          ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  const pillBtn = (active) =>
    `flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
      active
        ? 'bg-blue-500 text-white'
        : e
          ? 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 border border-white/10'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
    }`;

  return (
    <div className={e
      ? 'w-full h-full overflow-auto'
      : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm'
    }>
      <div className={e
        ? 'w-full h-full flex flex-col bg-white dark:bg-gray-900 overflow-hidden'
        : `relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl
           border ${border} bg-white dark:bg-gray-900 overflow-hidden`
      }>

        {/* ── Header (non-embedded only) ─────────────────────────────── */}
        {!e && (
          <div className={`flex items-center justify-between px-4 py-3 border-b ${border} flex-shrink-0`}>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-blue-500" />
              <span className="font-semibold text-sm dark:text-white">Code Share</span>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                Live · everyone can edit
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        )}

        {/* ── Language bar (scrollable pill tabs) ───────────────────── */}
        <div className={`${rowBase} border-b ${border} ${e ? 'bg-white/[0.02]' : 'bg-gray-50/50 dark:bg-gray-800/20'}`}>
          {LANGUAGES.map(l => (
            <button key={l.id} onClick={() => setLangId(l.id)} className={pillBtn(langId === l.id)}>
              {l.label}
            </button>
          ))}
          {/* Filename input — triggers language auto-detection (like lite-xl syntax.lua) */}
          <input
            type="text"
            placeholder="file.ext"
            value={filename}
            onChange={ev => setFilename(ev.target.value)}
            title="Type a filename to auto-detect language"
            className={`ml-auto flex-shrink-0 w-24 text-xs px-2 py-0.5 rounded border bg-transparent
              focus:outline-none transition-colors
              ${e
                ? 'border-white/10 text-gray-400 placeholder-gray-600 focus:border-blue-500/50'
                : 'border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 placeholder-gray-400 focus:border-blue-400'
              }`}
          />
        </div>

        {/* ── Settings toolbar (lite-xl plugin toolbar equivalent) ───── */}
        <div className={`${rowBase} border-b ${border} ${e ? 'bg-black/20' : 'bg-gray-50 dark:bg-gray-800/40'}`}>

          {/* Theme picker — colors/*.lua equivalent */}
          <select
            value={settings.theme}
            onChange={ev => set('theme', ev.target.value)}
            className={`text-xs rounded px-1.5 py-0.5 border outline-none cursor-pointer flex-shrink-0 transition-colors
              ${e
                ? 'bg-white/5 border-white/10 text-gray-300'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}
          >
            {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>

          <div className={sepCls} />

          {/* Font size control — lite-xl's config.font equivalent */}
          <button
            onClick={() => set('fontSize', Math.max(10, settings.fontSize - 1))}
            className={iconBtn(false)}
            title="Decrease font size"
          >
            <span className="text-[10px] font-bold leading-none select-none">A-</span>
          </button>
          <span className={`text-[10px] tabular-nums w-5 text-center flex-shrink-0 select-none
            ${e ? 'text-gray-500' : 'text-gray-400'}`}>
            {settings.fontSize}
          </span>
          <button
            onClick={() => set('fontSize', Math.min(22, settings.fontSize + 1))}
            className={iconBtn(false)}
            title="Increase font size"
          >
            <span className="text-[10px] font-bold leading-none select-none">A+</span>
          </button>

          <div className={sepCls} />

          {/* Tab size — detectindent.lua equivalent */}
          <button
            onClick={() => set('tabSize', settings.tabSize === 2 ? 4 : 2)}
            className={`${iconBtn(false)} font-mono text-[10px] font-bold`}
            title={`Tab size: ${settings.tabSize} spaces (click to toggle)`}
          >
            {settings.tabSize}sp
          </button>

          <div className={sepCls} />

          {/* Line wrap — linewrapping.lua equivalent */}
          <button
            onClick={() => toggle('lineWrap')}
            className={iconBtn(settings.lineWrap)}
            title={settings.lineWrap ? 'Disable line wrap' : 'Enable line wrap'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* 80-column guide — lineguide.lua equivalent */}
          <button
            onClick={() => toggle('showRuler')}
            className={iconBtn(settings.showRuler)}
            title={settings.showRuler ? 'Hide 80-column guide' : 'Show 80-column guide'}
          >
            <Ruler className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Editor ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto min-h-0">
          <CodeMirror
            height="100%"
            theme={themeDef.cm}
            extensions={extensions}
            basicSetup={{
              lineNumbers:        true,
              foldGutter:         true,
              highlightActiveLine: true,
              bracketMatching:    true,
              closeBrackets:      true,
              autocompletion:     true,
              indentOnInput:      true,
            }}
            style={{ height: '100%', minHeight: '200px', fontSize: `${settings.fontSize}px` }}
          />
        </div>

        {/* ── Status bar + actions (statusview.lua equivalent) ────────── */}
        <div className={`flex items-center justify-between gap-2 px-4 py-2 flex-shrink-0 border-t ${border}`}>
          {/* Live word/line/char counts */}
          <div className={`flex items-center gap-3 text-[10px] font-mono ${e ? 'text-gray-600' : 'text-gray-400'}`}>
            <span>{stats.lines} {stats.lines === 1 ? 'line' : 'lines'}</span>
            <span>{stats.words} {stats.words === 1 ? 'word' : 'words'}</span>
            <span>{stats.chars} chars</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors
                ${e
                  ? 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                  : 'border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300'
                }`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleSend}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
