import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { X, Copy, Check, Send, WrapText, Ruler, Plus, Code2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useSocketIOYjsProvider } from '../hooks/useSocketIOYjsProvider';
import socketManager from '../socket';

// ─── Language registry ────────────────────────────────────────────────────────
const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', short: 'JS',   ext: javascript({ jsx: true }),                   exts: ['js','jsx','mjs','cjs'] },
  { id: 'typescript', label: 'TypeScript', short: 'TS',   ext: javascript({ jsx: true, typescript: true }), exts: ['ts','tsx','mts']       },
  { id: 'python',     label: 'Python',     short: 'Py',   ext: python(),                                    exts: ['py','pyw','pyi']       },
  { id: 'html',       label: 'HTML',       short: 'HTML', ext: html(),                                      exts: ['html','htm']           },
  { id: 'css',        label: 'CSS',        short: 'CSS',  ext: css(),                                       exts: ['css','pcss']           },
  { id: 'json',       label: 'JSON',       short: 'JSON', ext: json(),                                      exts: ['json','jsonc']         },
  { id: 'markdown',   label: 'Markdown',   short: 'MD',   ext: markdown(),                                  exts: ['md','mdx','markdown']  },
  { id: 'cpp',        label: 'C / C++',    short: 'C++',  ext: cpp(),                                       exts: ['c','cpp','h','hpp','cc','cxx'] },
  { id: 'java',       label: 'Java',       short: 'Java', ext: java(),                                      exts: ['java']                 },
  { id: 'sql',        label: 'SQL',        short: 'SQL',  ext: sql(),                                       exts: ['sql']                  },
  { id: 'xml',        label: 'XML',        short: 'XML',  ext: xml(),                                       exts: ['xml','svg','xaml']     },
  { id: 'php',        label: 'PHP',        short: 'PHP',  ext: php(),                                       exts: ['php','phtml']          },
  { id: 'plain',      label: 'Plain Text', short: 'Text', ext: null,                                        exts: ['txt']                  },
];

// ─── Theme registry ───────────────────────────────────────────────────────────
const THEMES = [
  { id: 'one-dark',     label: 'One Dark',      cm: oneDark,     dark: true  },
  { id: 'dracula',      label: 'Dracula',        cm: dracula,     dark: true  },
  { id: 'github-dark',  label: 'GitHub Dark',    cm: githubDark,  dark: true  },
  { id: 'nord',         label: 'Nord',           cm: nord,        dark: true  },
  { id: 'github-light', label: 'GitHub Light',   cm: githubLight, dark: false },
  { id: 'light',        label: 'Default Light',  cm: 'light',     dark: false },
];

// ─── 80-column ruler ─────────────────────────────────────────────────────────
const RULER_EXT = EditorView.theme({
  '.cm-content': {
    backgroundImage: [
      'linear-gradient(90deg,',
      'transparent calc(4px + 79ch),',
      'rgba(127,127,127,0.18) calc(4px + 79ch),',
      'rgba(127,127,127,0.18) calc(5px + 79ch),',
      'transparent calc(5px + 79ch))',
    ].join(''),
    backgroundRepeat: 'no-repeat',
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function presenceColor(name) {
  const palette = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#06b6d4','#3b82f6'];
  let h = 0;
  for (const c of (name || '?')) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return palette[h % palette.length];
}

let _tabSeed = 0;
function makeTab(name = 'untitled') {
  return { id: `tab-${Date.now()}-${++_tabSeed}`, name, langId: 'javascript' };
}

// ─── Presence avatar ─────────────────────────────────────────────────────────
function Avatar({ name, color, size = 22, title }) {
  const initials = (name || '?').slice(0, 2).toUpperCase();
  return (
    <div
      title={title ?? name}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: color, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 700, color: '#fff',
        letterSpacing: '-0.02em', userSelect: 'none',
        boxShadow: '0 0 0 2px rgba(255,255,255,0.15)',
      }}
    >
      {initials}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = { theme: 'one-dark', fontSize: 13, lineWrap: false, showRuler: false, tabSize: 2 };

// ─── Component ────────────────────────────────────────────────────────────────
export default function CodeShareModal({
  isOpen,
  onClose,
  roomCode,
  onSendCode,
  embedded = false,
  currentUser,
}) {
  const { theme: uiTheme } = useTheme();
  const isDark = uiTheme === 'dark';

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const [tabs,         setTabs]         = useState(() => [makeTab('main')]);
  const [activeTabId,  setActiveTabId]  = useState(() => tabs[0].id);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingName,  setEditingName]  = useState('');
  const tabInputRef = useRef(null);

  // ── Editor state ────────────────────────────────────────────────────────────
  const [filename,  setFilename]  = useState('');
  const [copied,    setCopied]    = useState(false);
  const [settings,  setSettings]  = useState(DEFAULT_SETTINGS);
  const [stats,     setStats]     = useState({ lines: 1, words: 0, chars: 0 });
  const [cursor,    setCursor]    = useState({ line: 1, col: 1 });

  // ── Presence ────────────────────────────────────────────────────────────────
  const [collaborators, setCollaborators] = useState([]);

  // ── Yjs ─────────────────────────────────────────────────────────────────────
  const ydocRef      = useRef(null);
  const awarenessRef = useRef(null);

  if (!ydocRef.current) {
    const doc = new Y.Doc();
    ydocRef.current      = doc;
    awarenessRef.current = new Awareness(doc);
  }

  useEffect(() => () => {
    awarenessRef.current?.destroy();
    ydocRef.current?.destroy();
    ydocRef.current = awarenessRef.current = null;
  }, [roomCode]);

  useSocketIOYjsProvider(socketManager, roomCode, ydocRef.current, isOpen || embedded);

  // Set local awareness presence
  useEffect(() => {
    const awareness = awarenessRef.current;
    if (!awareness) return;
    const name  = currentUser?.nickname || 'You';
    const color = presenceColor(name);
    awareness.setLocalStateField('user', { name, color, colorLight: color + '33' });

    const handleChange = () => {
      const list = [];
      awareness.getStates().forEach((state, id) => {
        if (id !== awareness.clientID && state.user) list.push({ ...state.user, clientId: id });
      });
      setCollaborators(list);
    };
    awareness.on('change', handleChange);
    return () => {
      awareness.off('change', handleChange);
      awareness.setLocalState(null);
    };
  }, [currentUser?.nickname]);

  // Observe active tab's ytext for live stats
  useEffect(() => {
    const ytext = ydocRef.current?.getText(activeTabId);
    if (!ytext) return;
    const update = () => setStats(calcStats(ytext.toString()));
    ytext.observe(update);
    update();
    return () => ytext.unobserve(update);
  }, [activeTabId]);

  // Auto-detect language from filename
  useEffect(() => {
    const detected = detectLang(filename);
    if (detected) setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, langId: detected } : t));
  }, [filename, activeTabId]);

  // Sync default editor theme with app theme
  useEffect(() => {
    setSettings(s => ({ ...s, theme: uiTheme === 'dark' ? 'one-dark' : 'github-light' }));
  }, [uiTheme]);

  // Focus tab rename input when editing
  useEffect(() => {
    if (editingTabId) setTimeout(() => tabInputRef.current?.select(), 30);
  }, [editingTabId]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) ?? tabs[0], [tabs, activeTabId]);
  const langDef   = useMemo(() => LANGUAGES.find(l => l.id === activeTab.langId), [activeTab.langId]);
  const themeDef  = useMemo(() => THEMES.find(t => t.id === settings.theme) ?? THEMES[0], [settings.theme]);

  // Rebuild extensions when tab / settings change
  const extensions = useMemo(() => {
    const exts = [];
    if (langDef?.ext)       exts.push(langDef.ext);
    if (settings.lineWrap)  exts.push(EditorView.lineWrapping);
    if (settings.showRuler) exts.push(RULER_EXT);
    exts.push(EditorState.tabSize.of(settings.tabSize));
    const ytext = ydocRef.current?.getText(activeTabId);
    if (ytext && awarenessRef.current) exts.push(yCollab(ytext, awarenessRef.current));
    return exts;
  }, [langDef, settings.lineWrap, settings.showRuler, settings.tabSize, activeTabId]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleUpdate = useCallback((vu) => {
    const pos  = vu.state.selection.main.head;
    const line = vu.state.doc.lineAt(pos);
    setCursor({ line: line.number, col: pos - line.from + 1 });
  }, []);

  const addTab = () => {
    const t = makeTab(`file${tabs.length + 1}`);
    setTabs(prev => [...prev, t]);
    setActiveTabId(t.id);
    setFilename('');
  };

  const removeTab = (id, e) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const idx  = tabs.findIndex(t => t.id === id);
    const next = tabs.filter(t => t.id !== id);
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next[Math.max(0, idx - 1)].id);
  };

  const startRename = (tab, e) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingName(tab.name);
  };

  const commitRename = () => {
    if (editingTabId && editingName.trim())
      setTabs(prev => prev.map(t => t.id === editingTabId ? { ...t, name: editingName.trim() } : t));
    setEditingTabId(null);
    setEditingName('');
  };

  const handleCopy = () => {
    const text = ydocRef.current?.getText(activeTabId)?.toString() || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSend = () => {
    const code = ydocRef.current?.getText(activeTabId)?.toString() || '';
    if (!code.trim()) return;
    onSendCode?.(code, activeTab.langId);
    onClose?.();
  };

  const set    = (key, val) => setSettings(s => ({ ...s, [key]: val }));
  const toggle = (key)      => setSettings(s => ({ ...s, [key]: !s[key] }));

  if (!isOpen && !embedded) return null;

  // ── Style tokens (theme-aware) ───────────────────────────────────────────────
  const surface  = isDark ? 'bg-[#0f0f14]'              : 'bg-white';
  const surface2 = isDark ? 'bg-[#0b0b10]'              : 'bg-gray-50';
  const surface3 = isDark ? 'bg-[#131318]'              : 'bg-gray-100/70';
  const border   = isDark ? 'border-white/[0.07]'        : 'border-gray-200';
  const text      = isDark ? 'text-gray-200'             : 'text-gray-800';
  const textMuted = isDark ? 'text-gray-500'             : 'text-gray-400';
  const textDim   = isDark ? 'text-gray-600'             : 'text-gray-400';
  const hoverBg   = isDark ? 'hover:bg-white/[0.05]'     : 'hover:bg-gray-100';
  const activeBg  = isDark ? 'bg-white/[0.07]'           : 'bg-white';
  const inputCls  = isDark
    ? 'bg-white/[0.04] border-white/[0.08] text-gray-300 placeholder-gray-600 focus:border-blue-500/50'
    : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400 focus:border-blue-400';
  const btnGhost  = isDark
    ? 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] active:bg-white/[0.1]'
    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:bg-gray-200';
  const btnActive = 'text-blue-500 bg-blue-500/10 dark:bg-blue-500/15';

  // Standalone modal wrapper
  const Wrapper = embedded ? React.Fragment : ({ children: c }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border ${border} ${surface} overflow-hidden`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${border} flex-shrink-0`}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className={`font-semibold text-sm ${text}`}>Code Studio</span>
            <span className={`text-[10px] ${textMuted} bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full`}>live · collaborative</span>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${btnGhost}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {c}
      </div>
    </div>
  );

  const wrapperProps = embedded ? {} : { children: null };

  return (
    <Wrapper {...wrapperProps}>
      <div className={`w-full h-full flex flex-col ${surface} overflow-hidden`}>

        {/* ── Tab bar + Presence ─────────────────────────────────────── */}
        <div className={`flex items-center gap-0 border-b ${border} ${surface2} flex-shrink-0 min-w-0`} style={{ height: 36 }}>

          {/* Tabs */}
          <div className="flex items-stretch flex-1 overflow-x-auto scrollbar-none min-w-0" style={{ height: '100%' }}>
            {tabs.map(tab => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`flex items-center gap-1.5 px-3 border-r ${border} cursor-pointer flex-shrink-0 transition-colors group relative ${
                    isActive ? `${activeBg} ${text}` : `${textMuted} ${hoverBg}`
                  }`}
                  style={{ height: '100%', minWidth: 80, maxWidth: 160 }}
                >
                  {/* active indicator */}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 rounded-t" />
                  )}

                  {/* tab name */}
                  {editingTabId === tab.id ? (
                    <input
                      ref={tabInputRef}
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditingTabId(null); } }}
                      onClick={e => e.stopPropagation()}
                      className="bg-transparent outline-none border-none text-xs font-medium w-full min-w-0"
                      style={{ width: Math.max(48, editingName.length * 7) }}
                    />
                  ) : (
                    <span
                      className="text-xs font-medium truncate flex-1 min-w-0 leading-none"
                      onDoubleClick={e => startRename(tab, e)}
                      title={`${tab.name} — double-click to rename`}
                    >
                      {tab.name}
                    </span>
                  )}

                  {/* close tab */}
                  {tabs.length > 1 && (
                    <button
                      onClick={e => removeTab(tab.id, e)}
                      className={`flex-shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 ${
                        isDark ? 'hover:bg-white/10 text-gray-500 hover:text-gray-300' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* New tab button */}
            <button
              onClick={addTab}
              className={`flex items-center justify-center px-2.5 flex-shrink-0 transition-colors ${textMuted} ${hoverBg}`}
              title="New tab"
              style={{ height: '100%' }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Presence avatars */}
          {collaborators.length > 0 && (
            <div className={`flex items-center gap-1.5 px-3 flex-shrink-0 border-l ${border}`} style={{ height: '100%' }}>
              <div className="flex items-center">
                {collaborators.slice(0, 4).map((c, i) => (
                  <div key={c.clientId} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: collaborators.length - i }}>
                    <Avatar name={c.name} color={c.color} size={20} title={`${c.name} is editing`} />
                  </div>
                ))}
                {collaborators.length > 4 && (
                  <span className={`ml-1.5 text-[10px] font-bold ${textMuted}`}>+{collaborators.length - 4}</span>
                )}
              </div>
              <span className={`text-[10px] ${textDim} hidden sm:inline`}>
                {collaborators.length === 1 ? '1 collaborator' : `${collaborators.length} collaborating`}
              </span>
            </div>
          )}
        </div>

        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div className={`flex items-center gap-1.5 px-2 py-1 border-b ${border} ${surface2} flex-shrink-0 overflow-x-auto scrollbar-none`}>

          {/* Language selector */}
          <select
            value={activeTab.langId}
            onChange={e => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, langId: e.target.value } : t))}
            className={`text-[11px] rounded-md px-2 py-1 border outline-none cursor-pointer flex-shrink-0 font-medium transition-colors ${
              isDark
                ? 'bg-white/[0.04] border-white/[0.08] text-gray-300'
                : 'bg-white border-gray-200 text-gray-700'
            }`}
          >
            {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
          </select>

          {/* Filename input */}
          <input
            type="text"
            placeholder="filename.ext"
            value={filename}
            onChange={e => setFilename(e.target.value)}
            title="Type a filename to auto-detect language"
            className={`text-[11px] px-2 py-1 rounded-md border bg-transparent focus:outline-none transition-colors w-28 ${inputCls}`}
          />

          {/* Separator */}
          <div className={`w-px h-4 flex-shrink-0 mx-0.5 ${isDark ? 'bg-white/[0.08]' : 'bg-gray-200'}`} />

          {/* Font size */}
          <button onClick={() => set('fontSize', Math.max(10, settings.fontSize - 1))} className={`text-[11px] font-bold px-1.5 py-1 rounded transition-colors flex-shrink-0 ${btnGhost}`} title="Smaller text">A−</button>
          <span className={`text-[11px] tabular-nums w-5 text-center flex-shrink-0 select-none font-medium ${textMuted}`}>{settings.fontSize}</span>
          <button onClick={() => set('fontSize', Math.min(22, settings.fontSize + 1))} className={`text-[11px] font-bold px-1.5 py-1 rounded transition-colors flex-shrink-0 ${btnGhost}`} title="Larger text">A+</button>

          {/* Separator */}
          <div className={`w-px h-4 flex-shrink-0 mx-0.5 ${isDark ? 'bg-white/[0.08]' : 'bg-gray-200'}`} />

          {/* Tab size */}
          <button
            onClick={() => set('tabSize', settings.tabSize === 2 ? 4 : 2)}
            className={`text-[11px] font-mono font-bold px-1.5 py-1 rounded transition-colors flex-shrink-0 ${btnGhost}`}
            title={`Tab size: ${settings.tabSize} spaces`}
          >{settings.tabSize}sp</button>

          {/* Line wrap */}
          <button
            onClick={() => toggle('lineWrap')}
            className={`p-1.5 rounded transition-colors flex-shrink-0 ${settings.lineWrap ? btnActive : btnGhost}`}
            title={settings.lineWrap ? 'Disable line wrap' : 'Enable line wrap'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Ruler */}
          <button
            onClick={() => toggle('showRuler')}
            className={`p-1.5 rounded transition-colors flex-shrink-0 ${settings.showRuler ? btnActive : btnGhost}`}
            title={settings.showRuler ? 'Hide 80-col guide' : 'Show 80-col guide'}
          >
            <Ruler className="w-3.5 h-3.5" />
          </button>

          {/* Separator */}
          <div className={`w-px h-4 flex-shrink-0 mx-0.5 ${isDark ? 'bg-white/[0.08]' : 'bg-gray-200'}`} />

          {/* Theme selector */}
          <select
            value={settings.theme}
            onChange={e => set('theme', e.target.value)}
            className={`text-[11px] rounded-md px-2 py-1 border outline-none cursor-pointer flex-shrink-0 transition-colors ${
              isDark
                ? 'bg-white/[0.04] border-white/[0.08] text-gray-300'
                : 'bg-white border-gray-200 text-gray-700'
            }`}
          >
            {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        {/* ── Editor ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto min-h-0">
          {/* key forces remount when active tab changes, ensuring correct ytext binding */}
          <CodeMirror
            key={activeTabId}
            height="100%"
            theme={themeDef.cm}
            extensions={extensions}
            onUpdate={handleUpdate}
            basicSetup={{
              lineNumbers:         true,
              foldGutter:          true,
              highlightActiveLine: true,
              bracketMatching:     true,
              closeBrackets:       true,
              autocompletion:      true,
              indentOnInput:       true,
              highlightSelectionMatches: true,
            }}
            style={{ height: '100%', minHeight: '200px', fontSize: `${settings.fontSize}px` }}
          />
        </div>

        {/* ── Status bar ─────────────────────────────────────────────── */}
        <div className={`flex items-center justify-between gap-2 px-3 py-1.5 flex-shrink-0 border-t ${border} ${surface3}`}>
          {/* Left: cursor position + file info */}
          <div className={`flex items-center gap-3 text-[10px] font-mono select-none ${textDim}`}>
            <span className={`font-medium ${textMuted}`}>Ln {cursor.line}, Col {cursor.col}</span>
            <span className={isDark ? 'text-white/10' : 'text-gray-200'}>·</span>
            <span>{langDef?.label ?? 'Plain Text'}</span>
            <span className={isDark ? 'text-white/10' : 'text-gray-200'}>·</span>
            <span>{stats.lines} {stats.lines === 1 ? 'line' : 'lines'}</span>
            <span>{stats.words} {stats.words === 1 ? 'word' : 'words'}</span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors border ${
                isDark
                  ? 'border-white/[0.08] text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'
                  : 'border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleSend}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
            >
              <Send className="w-3 h-3" />
              Send
            </button>
          </div>
        </div>
      </div>
    </Wrapper>
  );
}
