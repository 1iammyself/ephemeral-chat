import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Sun, Moon, SunMoon, Bell, BellOff, Volume2, VolumeX, Monitor, Shield,
  RefreshCw, Maximize2, ExternalLink, Settings2, Keyboard, Info, Lock, Languages,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import i18n, { LANGUAGES, applyDocumentDir } from '../i18n/index.js';

const API = typeof window !== 'undefined' ? window.electronAPI : null;
const isDesktop = () => !!API?.isElectron;

// ── Primitives ──────────────────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-teal-500' : 'bg-gray-200 dark:bg-gray-600'}`}
      aria-checked={value}
      role="switch"
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function SettingRow({ icon: Icon, label, description, children, onClick }) {
  const inner = (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">{label}</p>
          {description && <p className="text-xs text-gray-400 dark:text-gray-500 leading-snug mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="ml-3 flex-shrink-0">{children}</div>
    </div>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg -mx-2 px-2 transition-colors">
        {inner}
      </button>
    );
  }
  return <div>{inner}</div>;
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5 px-1">{title}</p>
      <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl px-3 divide-y divide-gray-100/80 dark:divide-gray-700/40">
        {children}
      </div>
    </div>
  );
}

// ── General Tab ─────────────────────────────────────────────────────────────

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const options = [
    { value: 'light',  label: t('settings.appearance.light'),  Icon: Sun },
    { value: 'dark',   label: t('settings.appearance.dark'),   Icon: Moon },
    { value: 'system', label: t('settings.appearance.system'), Icon: SunMoon },
  ];
  return (
    <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-700/60 p-1">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-bold transition-all ${
            theme === value
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function LanguageSelector() {
  const { t } = useTranslation();
  const [currentLang, setCurrentLang] = useState(i18n.language?.split('-')[0] || 'en');

  const handleChange = (code) => {
    setCurrentLang(code);
    i18n.changeLanguage(code);
    localStorage.setItem('app_language', code);
    applyDocumentDir(code);
  };

  return (
    <select
      value={currentLang}
      onChange={e => handleChange(e.target.value)}
      className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 max-w-[160px]"
      aria-label={t('settings.language.label')}
    >
      {LANGUAGES.map(({ code, nativeName }) => (
        <option key={code} value={code}>{nativeName}</option>
      ))}
    </select>
  );
}

function GeneralSettings({ settings, updateSetting, version, onCheckForUpdates, updateStatus, onShowLicenses }) {
  const { t } = useTranslation();
  const [autostartEnabled, setAutostartEnabled] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    API.autostart?.isEnabled()
      .then(v => setAutostartEnabled(!!v))
      .catch(() => {});
  }, []);

  const handleAutostart = async (val) => {
    setAutostartEnabled(val);
    updateSetting('startOnBoot', val);
    try {
      if (val) await API.autostart?.enable();
      else await API.autostart?.disable();
    } catch {}
  };

  const handleAlwaysOnTop = (val) => {
    updateSetting('alwaysOnTop', val);
    API?.setAlwaysOnTop?.(val).catch?.(() => {});
  };

  return (
    <>
      <Section title={t('settings.appearance.title')}>
        <div className="py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('settings.appearance.theme')}</p>
          <ThemeSelector />
        </div>
      </Section>

      <Section title={t('settings.language.title')}>
        <SettingRow
          icon={Languages}
          label={t('settings.language.label')}
          description={t('settings.language.desc')}
        >
          <LanguageSelector />
        </SettingRow>
      </Section>

      <Section title={t('settings.notifications.title')}>
        <SettingRow
          icon={settings?.notificationsEnabled !== false ? Bell : BellOff}
          label={t('settings.notifications.desktop')}
          description={t('settings.notifications.desktopDesc')}
        >
          <Toggle
            value={settings?.notificationsEnabled !== false}
            onChange={val => updateSetting('notificationsEnabled', val)}
          />
        </SettingRow>
        <SettingRow
          icon={settings?.soundEnabled !== false ? Volume2 : VolumeX}
          label={t('settings.notifications.sound')}
          description={t('settings.notifications.soundDesc')}
        >
          <Toggle
            value={settings?.soundEnabled !== false}
            onChange={val => updateSetting('soundEnabled', val)}
          />
        </SettingRow>
      </Section>

      {isDesktop() && (
        <Section title={t('settings.window.title')}>
          <SettingRow
            icon={Monitor}
            label={t('settings.window.startOnBoot')}
            description={t('settings.window.startOnBootDesc')}
          >
            <Toggle value={autostartEnabled} onChange={handleAutostart} />
          </SettingRow>
          <SettingRow
            icon={Monitor}
            label={t('settings.window.startMinimized')}
            description={t('settings.window.startMinimizedDesc')}
          >
            <Toggle
              value={!!settings?.startMinimized}
              onChange={val => updateSetting('startMinimized', val)}
            />
          </SettingRow>
          <SettingRow
            icon={Monitor}
            label={t('settings.window.minimizeToTray')}
            description={t('settings.window.minimizeToTrayDesc')}
          >
            <Toggle
              value={settings?.minimizeToTray !== false}
              onChange={val => updateSetting('minimizeToTray', val)}
            />
          </SettingRow>
          <SettingRow
            icon={Monitor}
            label={t('settings.window.alwaysOnTop')}
            description={t('settings.window.alwaysOnTopDesc')}
          >
            <Toggle
              value={!!settings?.alwaysOnTop}
              onChange={handleAlwaysOnTop}
            />
          </SettingRow>
        </Section>
      )}

      {isDesktop() && (
        <Section title={t('settings.security.title')}>
          <SettingRow
            icon={Shield}
            label={t('settings.security.mode')}
            description={t('settings.security.modeDesc')}
          >
            <select
              value={settings?.securityMode ?? 'high'}
              onChange={e => updateSetting('securityMode', e.target.value)}
              className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="high">{t('settings.security.high')}</option>
              <option value="medium">{t('settings.security.medium')}</option>
              <option value="low">{t('settings.security.low')}</option>
            </select>
          </SettingRow>
          <SettingRow
            icon={Lock}
            label={t('settings.security.biometric')}
            description={t('settings.security.biometricDesc')}
          >
            <Toggle
              value={!!settings?.biometricLockEnabled}
              onChange={val => updateSetting('biometricLockEnabled', val)}
            />
          </SettingRow>
          {settings?.biometricLockEnabled && (
            <SettingRow
              icon={Lock}
              label={t('settings.security.autoLock')}
              description={t('settings.security.autoLockDesc')}
            >
              <select
                value={settings?.lockDelay ?? 5}
                onChange={e => updateSetting('lockDelay', Number(e.target.value))}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value={0}>{t('settings.security.immediate')}</option>
                <option value={1}>{t('settings.security.minute_one', { count: 1 })}</option>
                <option value={5}>{t('settings.security.minute_other', { count: 5 })}</option>
                <option value={10}>{t('settings.security.minute_other', { count: 10 })}</option>
                <option value={30}>{t('settings.security.minute_other', { count: 30 })}</option>
              </select>
            </SettingRow>
          )}
        </Section>
      )}

      {isDesktop() && (
        <Section title={t('settings.windowActions.title')}>
          <SettingRow
            icon={RefreshCw}
            label={t('settings.windowActions.reload')}
            description="Ctrl+R"
            onClick={() => API?.reload?.() || window.location.reload()}
          >
            <span className="text-xs text-gray-400 font-mono">Ctrl+R</span>
          </SettingRow>
          <SettingRow
            icon={Maximize2}
            label={t('settings.windowActions.fullscreen')}
            description="F11"
            onClick={() => API?.toggleFullscreen?.()}
          >
            <span className="text-xs text-gray-400 font-mono">F11</span>
          </SettingRow>
        </Section>
      )}

      <Section title={t('settings.about.title')}>
        <div className="py-2.5 flex items-center gap-2">
          <Info className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Ephemeral Chat
            {version && <span className="font-mono text-gray-800 dark:text-gray-200 ml-1.5">v{version}</span>}
          </span>
        </div>
        {isDesktop() && (
          <>
            <SettingRow
              icon={ExternalLink}
              label={t('settings.about.website')}
              description={t('settings.about.websiteDesc')}
              onClick={() => API?.openUrlExternal?.('https://ephchat.kyere.me')}
            />
            <SettingRow
              icon={Info}
              label={t('settings.about.licenses')}
              onClick={onShowLicenses}
            />
            <SettingRow
              icon={RefreshCw}
              label={t('settings.about.checkUpdates')}
              onClick={onCheckForUpdates}
            >
              {updateStatus === 'checking' && (
                <span className="text-xs text-gray-400 animate-pulse">{t('settings.about.checking')}</span>
              )}
              {updateStatus === 'up-to-date' && (
                <span className="text-xs text-teal-500 font-medium">{t('settings.about.upToDate')}</span>
              )}
              {updateStatus === 'available' && (
                <span className="text-xs text-amber-500 font-medium">{t('settings.about.updateAvailable')}</span>
              )}
            </SettingRow>
          </>
        )}
      </Section>
    </>
  );
}

// ── Chat Tab ────────────────────────────────────────────────────────────────

function ChatSettings() {
  const { t } = useTranslation();
  const [typingPreview, setTypingPreview] = useState(
    () => localStorage.getItem('typingPreview_enabled') !== 'false'
  );

  const handleTypingPreview = (val) => {
    setTypingPreview(val);
    localStorage.setItem('typingPreview_enabled', String(val));
  };

  const shortcuts = [
    { labelKey: 'settings.chat.shortcuts.panicBurn',    key: 'Ctrl+Z' },
    { labelKey: 'settings.chat.shortcuts.toggleAnon',   key: 'Ctrl+Y' },
    { labelKey: 'settings.chat.shortcuts.toggleStealth',key: 'Ctrl+Shift+H' },
    { labelKey: 'settings.chat.shortcuts.selfDestruct',  key: 'Ctrl+Shift+D' },
    { labelKey: 'settings.chat.shortcuts.showHide',      key: 'Alt+Shift+E' },
    { labelKey: 'settings.chat.shortcuts.newRoom',       key: 'Alt+Shift+N' },
    { labelKey: 'settings.chat.shortcuts.pip',           key: 'Alt+Shift+P' },
    { labelKey: 'settings.chat.shortcuts.fullscreen',    key: 'F11' },
    { labelKey: 'settings.chat.shortcuts.reload',        key: 'Ctrl+R' },
  ];

  return (
    <>
      <Section title={t('settings.chat.title')}>
        <SettingRow
          label={t('settings.chat.typingPreview')}
          description={t('settings.chat.typingPreviewDesc')}
        >
          <Toggle value={typingPreview} onChange={handleTypingPreview} />
        </SettingRow>
      </Section>

      <Section title={t('settings.chat.shortcutsTitle')}>
        <div className="py-2 space-y-2">
          {shortcuts.map(({ labelKey, key }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-600 dark:text-gray-400 leading-snug">{t(labelKey)}</span>
              <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded flex-shrink-0">{key}</span>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex items-start gap-2 px-3 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
        <Keyboard className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p
          className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: t('settings.chat.hint') }}
        />
      </div>
    </>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

const LICENSES = [
  { name: 'React',          license: 'MIT',            author: 'Meta Platforms, Inc.' },
  { name: 'Tauri',          license: 'MIT / Apache-2.0', author: 'Tauri Programme' },
  { name: 'Vite',           license: 'MIT',            author: 'Evan You' },
  { name: 'Tailwind CSS',   license: 'MIT',            author: 'Tailwind Labs, Inc.' },
  { name: 'Lucide React',   license: 'ISC',            author: 'Lucide Contributors' },
  { name: 'Socket.IO',      license: 'MIT',            author: 'Automattic, Inc.' },
  { name: 'Yjs',            license: 'MIT',            author: 'Kevin Jahns' },
  { name: 'react-router-dom', license: 'MIT',          author: 'Remix Software, Inc.' },
  { name: 'tokio',          license: 'MIT',            author: 'Tokio Contributors' },
  { name: 'serde',          license: 'MIT / Apache-2.0', author: 'David Tolnay' },
  { name: 'serde_json',     license: 'MIT / Apache-2.0', author: 'David Tolnay' },
  { name: 'tauri-plugin-store', license: 'MIT / Apache-2.0', author: 'Tauri Programme' },
  { name: 'rand',           license: 'MIT / Apache-2.0', author: 'Rust Random Contributors' },
];

function LicensesModal({ onClose }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900 dark:text-white">{t('licenses.title')}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-0 divide-y divide-gray-100 dark:divide-gray-800">
          {LICENSES.map(({ name, license, author }) => (
            <div key={name} className="py-2.5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{author}</p>
              </div>
              <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded flex-shrink-0 mt-0.5">{license}</span>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">{t('licenses.footer')}</p>
        </div>
      </div>
    </div>
  );
}

export default function SettingsModal({ isOpen, onClose, initialTab = 'general' }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [settings, setSettings] = useState(null);
  const [version, setVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState(null); // null | 'checking' | 'up-to-date' | 'available'
  const [showLicenses, setShowLicenses] = useState(false);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || !isDesktop()) return;
    API.getSettings?.()
      .then(s => setSettings(s))
      .catch(() => {});
    API.getVersion?.()
      .then(v => setVersion(v))
      .catch(() => {});
    setUpdateStatus(null);
  }, [isOpen]);

  // Open settings when triggered from tray
  useEffect(() => {
    if (!isDesktop() || !API.onOpenSettings) return;
    API.onOpenSettings(() => {
      setActiveTab('general');
      onClose && onClose();
    });
  }, [onClose]);

  // Sync settings state when tray (or another source) changes a setting
  useEffect(() => {
    if (!isDesktop() || !API.onSettingsChanged) return;
    API.onSettingsChanged((payload) => {
      if (!payload) return;
      const { key, value } = payload;
      setSettings(prev => prev ? { ...prev, [key]: value } : prev);
    });
  }, []);

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...(prev ?? {}), [key]: value }));
    if (isDesktop()) {
      API.setSetting?.(key, value).catch?.(() => {});
    }
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateStatus('checking');
    try {
      await API?.checkForUpdates?.();
      // Backend emits update-available or update-not-available; default to up-to-date
      setTimeout(() => setUpdateStatus(s => s === 'checking' ? 'up-to-date' : s), 3000);
    } catch {
      setUpdateStatus('up-to-date');
    }
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
    {showLicenses && <LicensesModal onClose={() => setShowLicenses(false)} />}
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings2 className="w-4 h-4 text-teal-500" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{t('settings.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 px-5 pt-0 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          {[
            { id: 'general', label: t('settings.tabs.general') },
            { id: 'chat',    label: t('settings.tabs.chat') },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === id
                  ? 'text-teal-600 dark:text-teal-400 border-teal-500'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {activeTab === 'general' ? (
            <GeneralSettings
              settings={settings}
              updateSetting={updateSetting}
              version={version}
              onCheckForUpdates={handleCheckForUpdates}
              updateStatus={updateStatus}
              onShowLicenses={() => setShowLicenses(true)}
            />
          ) : (
            <ChatSettings />
          )}
        </div>
      </div>
    </div>
    </>
  );
}
