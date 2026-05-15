import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Sun, Moon, SunMoon, Bell, BellOff, Volume2, VolumeX, Monitor, Shield,
  RefreshCw, Maximize2, ExternalLink, Settings2, Keyboard, Info, Lock,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

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
  const options = [
    { value: 'light',  label: 'Light',  Icon: Sun },
    { value: 'dark',   label: 'Dark',   Icon: Moon },
    { value: 'system', label: 'System', Icon: SunMoon },
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

function GeneralSettings({ settings, updateSetting, version, onCheckForUpdates, updateStatus }) {
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
      <Section title="Appearance">
        <div className="py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Theme</p>
          <ThemeSelector />
        </div>
      </Section>

      <Section title="Notifications">
        <SettingRow
          icon={settings?.notificationsEnabled !== false ? Bell : BellOff}
          label="Desktop Notifications"
          description="Show system notifications for messages"
        >
          <Toggle
            value={settings?.notificationsEnabled !== false}
            onChange={val => updateSetting('notificationsEnabled', val)}
          />
        </SettingRow>
        <SettingRow
          icon={settings?.soundEnabled !== false ? Volume2 : VolumeX}
          label="Notification Sound"
          description="Play sound for new messages"
        >
          <Toggle
            value={settings?.soundEnabled !== false}
            onChange={val => updateSetting('soundEnabled', val)}
          />
        </SettingRow>
      </Section>

      {isDesktop() && (
        <Section title="Window">
          <SettingRow
            icon={Monitor}
            label="Start on Boot"
            description="Launch Ephemeral Chat when Windows starts"
          >
            <Toggle value={autostartEnabled} onChange={handleAutostart} />
          </SettingRow>
          <SettingRow
            icon={Monitor}
            label="Start Minimized"
            description="Launch hidden in system tray"
          >
            <Toggle
              value={!!settings?.startMinimized}
              onChange={val => updateSetting('startMinimized', val)}
            />
          </SettingRow>
          <SettingRow
            icon={Monitor}
            label="Minimize to Tray"
            description="Keep running when the window is minimized"
          >
            <Toggle
              value={settings?.minimizeToTray !== false}
              onChange={val => updateSetting('minimizeToTray', val)}
            />
          </SettingRow>
          <SettingRow
            icon={Monitor}
            label="Always on Top"
            description="Keep window above all other apps"
          >
            <Toggle
              value={!!settings?.alwaysOnTop}
              onChange={handleAlwaysOnTop}
            />
          </SettingRow>
        </Section>
      )}

      {isDesktop() && (
        <Section title="Security">
          <SettingRow
            icon={Shield}
            label="Security Mode"
            description="High: screen capture blocked"
          >
            <select
              value={settings?.securityMode ?? 'high'}
              onChange={e => updateSetting('securityMode', e.target.value)}
              className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </SettingRow>
          <SettingRow
            icon={Lock}
            label="Biometric Lock"
            description="Lock app when idle or manually from tray"
          >
            <Toggle
              value={!!settings?.biometricLockEnabled}
              onChange={val => updateSetting('biometricLockEnabled', val)}
            />
          </SettingRow>
          {settings?.biometricLockEnabled && (
            <SettingRow
              icon={Lock}
              label="Auto-Lock After Idle"
              description="Minutes of inactivity before locking"
            >
              <select
                value={settings?.lockDelay ?? 5}
                onChange={e => updateSetting('lockDelay', Number(e.target.value))}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value={0}>Immediate</option>
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </SettingRow>
          )}
        </Section>
      )}

      {isDesktop() && (
        <Section title="Window Actions">
          <SettingRow
            icon={RefreshCw}
            label="Reload App"
            description="Ctrl+R"
            onClick={() => API?.reload?.() || window.location.reload()}
          >
            <span className="text-xs text-gray-400 font-mono">Ctrl+R</span>
          </SettingRow>
          <SettingRow
            icon={Maximize2}
            label="Toggle Fullscreen"
            description="F11"
            onClick={() => API?.toggleFullscreen?.()}
          >
            <span className="text-xs text-gray-400 font-mono">F11</span>
          </SettingRow>
        </Section>
      )}

      <Section title="About">
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
              label="Visit Website"
              description="ephchat.kyere.me"
              onClick={() => API?.openUrlExternal?.('https://ephchat.kyere.me')}
            />
            <SettingRow
              icon={Info}
              label="Third Party Licenses"
              onClick={() => API?.openUrlExternal?.('https://ephchat.kyere.me')}
            />
            <SettingRow
              icon={RefreshCw}
              label="Check for Updates"
              onClick={onCheckForUpdates}
            >
              {updateStatus === 'checking' && (
                <span className="text-xs text-gray-400 animate-pulse">Checking…</span>
              )}
              {updateStatus === 'up-to-date' && (
                <span className="text-xs text-teal-500 font-medium">Up to date ✓</span>
              )}
              {updateStatus === 'available' && (
                <span className="text-xs text-amber-500 font-medium">Update available</span>
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
  const [typingPreview, setTypingPreview] = useState(
    () => localStorage.getItem('typingPreview_enabled') !== 'false'
  );

  const handleTypingPreview = (val) => {
    setTypingPreview(val);
    localStorage.setItem('typingPreview_enabled', String(val));
  };

  const shortcuts = [
    { label: 'Panic Burn (delete room content)', key: 'Ctrl+Z' },
    { label: 'Toggle Anonymous Mode',            key: 'Ctrl+Y' },
    { label: 'Toggle Stealth Mode',              key: 'Ctrl+Shift+H' },
    { label: 'Self-Destruct Override (10s)',      key: 'Ctrl+Shift+D' },
    { label: 'Show / Hide window (global)',       key: 'Alt+Shift+E' },
    { label: 'New Room (global)',                 key: 'Alt+Shift+N' },
    { label: 'Picture-in-Picture mode',           key: 'Alt+Shift+P' },
    { label: 'Toggle Fullscreen',                 key: 'F11' },
    { label: 'Reload',                            key: 'Ctrl+R' },
  ];

  return (
    <>
      <Section title="Chat Preferences">
        <SettingRow
          label="Live Typing Preview"
          description="See what others type as they type it"
        >
          <Toggle value={typingPreview} onChange={handleTypingPreview} />
        </SettingRow>
      </Section>

      <Section title="Keyboard Shortcuts">
        <div className="py-2 space-y-2">
          {shortcuts.map(({ label, key }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-600 dark:text-gray-400 leading-snug">{label}</span>
              <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded flex-shrink-0">{key}</span>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex items-start gap-2 px-3 py-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
        <Keyboard className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          Sound effects, sidebar position, and more room-specific options are in the <strong>Tools</strong> panel while inside a chat room.
        </p>
      </div>
    </>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

export default function SettingsModal({ isOpen, onClose, initialTab = 'general' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [settings, setSettings] = useState(null);
  const [version, setVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState(null); // null | 'checking' | 'up-to-date' | 'available'

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
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Settings</h2>
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
            { id: 'general', label: 'General' },
            { id: 'chat',    label: 'Chat' },
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
            />
          ) : (
            <ChatSettings />
          )}
        </div>
      </div>
    </div>
  );
}
