(function () {
  'use strict';

  // invoke: calls Tauri IPC if available, otherwise returns a rejected promise.
  // NOTE: we look up __TAURI_INTERNALS__ lazily (at call time) rather than at
  // init time, because Tauri may inject it after the initialization script runs.
  function invoke(cmd, args) {
    var internals = window.__TAURI_INTERNALS__;
    if (!internals) {
      return Promise.reject(new Error('[EphChat] Tauri IPC not available for: ' + cmd));
    }
    return internals.invoke(cmd, args || {});
  }

  // Event handler registry: maps event name → callback
  var _handlers = {};

  // Wire Tauri backend events into the handler registry.
  // This runs asynchronously; if internals aren't ready yet, we retry once.
  function listenEvent(event, fn) {
    var internals = window.__TAURI_INTERNALS__;
    if (!internals) {
      // Retry after a short delay in case Tauri is still initialising
      setTimeout(function () {
        var i2 = window.__TAURI_INTERNALS__;
        if (!i2) return;
        try {
          var id = i2.transformCallback(fn);
          i2.invoke('plugin:event|listen', { event: event, target: { kind: 'Any' }, handler: id });
        } catch (e) {}
      }, 500);
      return;
    }
    try {
      var id = internals.transformCallback(fn);
      internals.invoke('plugin:event|listen', {
        event: event,
        target: { kind: 'Any' },
        handler: id,
      });
    } catch (e) {
      // Non-fatal: event won't be delivered but app still works
    }
  }

  // Register all backend→frontend events
  function setupEvents() {
    listenEvent('toggle-stealth', function () {
      if (_handlers['toggle-stealth']) _handlers['toggle-stealth']();
    });
    listenEvent('toggle-override-ttl', function () {
      if (_handlers['toggle-override-ttl']) _handlers['toggle-override-ttl']();
    });
    listenEvent('panic-burn', function () {
      if (_handlers['panic-burn']) _handlers['panic-burn']();
    });
    listenEvent('toggle-anonymous', function () {
      if (_handlers['toggle-anonymous']) _handlers['toggle-anonymous']();
    });
    listenEvent('open-settings', function () {
      if (_handlers['open-settings']) _handlers['open-settings']();
    });
    listenEvent('check-for-updates-menu', function () {
      if (_handlers['check-for-updates-menu']) _handlers['check-for-updates-menu']();
    });
    listenEvent('lock-app', function () {
      if (_handlers['lock-app']) _handlers['lock-app']();
    });
    listenEvent('settings-changed', function (e) {
      var p = e.payload;
      if (p) {
        // Bridge sound/notification settings to localStorage so useSoundFX and
        // other hooks that read localStorage directly stay in sync
        if (p.key === 'soundEnabled') {
          localStorage.setItem('soundFX_enabled', p.value ? 'true' : 'false');
          window.dispatchEvent(new CustomEvent('ephchat:soundEnabled', { detail: p.value }));
        }
        if (p.key === 'notificationsEnabled') {
          window.dispatchEvent(new CustomEvent('ephchat:notificationsEnabled', { detail: p.value }));
        }
      }
      if (_handlers['settings-changed']) _handlers['settings-changed'](p);
    });
    listenEvent('update-available', function (e) {
      if (_handlers['update-available']) _handlers['update-available'](e.payload);
    });
    listenEvent('update-downloaded', function (e) {
      if (_handlers['update-downloaded']) _handlers['update-downloaded'](e.payload);
    });
    listenEvent('now-playing-update', function (e) {
      if (_handlers['now-playing-update']) _handlers['now-playing-update'](e.payload);
    });
    listenEvent('mdns-event', function (e) {
      if (_handlers['mdns-event']) _handlers['mdns-event'](e.payload);
    });
    listenEvent('proximity-native-event', function (e) {
      if (_handlers['proximity-native-event']) _handlers['proximity-native-event'](e.payload);
    });
  }

  // Set up events now; if internals aren't ready, listenEvent retries internally
  setupEvents();

  // Detect OS from userAgent (fallback — Tauri also exposes this)
  var _platform = 'linux';
  var ua = navigator.userAgent.toLowerCase();
  if (ua.indexOf('win') !== -1) _platform = 'win32';
  else if (ua.indexOf('mac') !== -1) _platform = 'darwin';

  // IMPORTANT: always set isElectron=true unconditionally so that the web app
  // does not redirect to the landing page even when __TAURI_INTERNALS__ is
  // delayed or temporarily unavailable.
  window.electronAPI = {
    isElectron: true,
    isTauri: true,
    platform: _platform,

    // ── Settings ──────────────────────────────────────────────────────────
    getSettings: function () { return invoke('get_settings'); },
    setSetting: function (key, value) { return invoke('set_setting', { key: key, value: value }); },

    // ── App info ──────────────────────────────────────────────────────────
    getVersion: function () { return invoke('get_app_version'); },

    // ── Notifications ─────────────────────────────────────────────────────
    showNotification: function (title, body) {
      return invoke('show_notification', { title: title, body: body });
    },

    // ── Updates ───────────────────────────────────────────────────────────
    checkForUpdates: function () { return invoke('check_for_updates'); },

    // ── System ────────────────────────────────────────────────────────────
    getSystemIdleTime: function () { return invoke('get_system_idle_time'); },
    setBadge: function (count) { return invoke('set_badge', { count: count }); },

    // ── Link handling ─────────────────────────────────────────────────────
    openUrlExternal: function (url) { return invoke('open_url_external', { url: url }); },
    openUrlInApp: function (url) { return invoke('open_url_in_app', { url: url }); },

    // ── Backend event listeners ───────────────────────────────────────────
    onUpdateAvailable: function (cb) { _handlers['update-available'] = cb; },
    onUpdateDownloaded: function (cb) { _handlers['update-downloaded'] = cb; },
    onToggleStealth: function (cb) { _handlers['toggle-stealth'] = cb; },
    onToggleOverrideTtl: function (cb) { _handlers['toggle-override-ttl'] = cb; },
    onPanicBurn: function (cb) { _handlers['panic-burn'] = cb; },
    onToggleAnonymous: function (cb) { _handlers['toggle-anonymous'] = cb; },
    onOpenSettings: function (cb) { _handlers['open-settings'] = cb; },
    onCheckForUpdatesMenu: function (cb) { _handlers['check-for-updates-menu'] = cb; },
    onLockApp: function (cb) { _handlers['lock-app'] = cb; },
    onSettingsChanged: function (cb) { _handlers['settings-changed'] = cb; },

    // ── Window management ─────────────────────────────────────────────────
    reload: function () { return invoke('window_reload'); },
    toggleFullscreen: function () { return invoke('window_toggle_fullscreen'); },
    setAlwaysOnTop: function (value) { return invoke('window_set_always_on_top', { value: value }); },
    minimize: function () { return invoke('window_minimize'); },
    zoomIn: function () { return invoke('window_zoom', { direction: 'in' }); },
    zoomOut: function () { return invoke('window_zoom', { direction: 'out' }); },
    resetZoom: function () { return invoke('window_zoom', { direction: 'reset' }); },

    // ── Proximity (nearby transfer) ───────────────────────────────────────
    proximity: {
      getNetworkInfo: function () { return invoke('proximity_get_network_info'); },
      getLocalIp: function () { return invoke('proximity_get_local_ip'); },
      getDeviceId: function () { return invoke('proximity_get_device_id'); },
      getDeviceName: function () { return invoke('proximity_get_device_name'); },
      saveFile: function (fileData) { return invoke('proximity_save_file', { file_data: fileData }); },
      showInFolder: function (filePath) { return invoke('proximity_show_in_folder', { file_path: filePath }); },
      openFile: function (filePath) { return invoke('proximity_open_file', { file_path: filePath }); },
    },

    // ── mDNS peer discovery (LAN offline P2P) ────────────────────────────
    mdns: {
      start: function (options) {
        var nickname = options && options.nickname ? options.nickname : null;
        return invoke('mdns_start', { nickname: nickname });
      },
      stop: function () { return invoke('mdns_stop'); },
      getPeers: function () { return invoke('mdns_get_peers'); },
      getMyInfo: function () { return invoke('mdns_get_my_info'); },
      sendSdp: function (peerIp, peerPort, sdp) {
        return invoke('mdns_send_sdp', { peer_ip: peerIp, peer_port: peerPort, sdp: sdp });
      },
      isRunning: function () { return invoke('mdns_is_running'); },
      onEvent: function (cb) { _handlers['mdns-event'] = cb; },
      offEvent: function () { delete _handlers['mdns-event']; },
    },

    // ── Native QUIC proximity (stubbed — proximity-core not yet linked) ───
    proximityNative: {
      init: function () { return Promise.resolve({ success: false, error: 'not_implemented' }); },
      start: function () { return Promise.resolve({ address: null, native: false }); },
      stop: function () { return Promise.resolve({ success: true }); },
      isAvailable: function () { return Promise.resolve({ available: false }); },
      getPeers: function () { return Promise.resolve({ peers: [] }); },
      connect: function () { return Promise.resolve({ peerId: null }); },
      getPairingCode: function () { return Promise.resolve({ code: null }); },
      sendFile: function () { return Promise.resolve({ transferId: null }); },
      acceptTransfer: function () { return Promise.resolve({ success: false }); },
      rejectTransfer: function () { return Promise.resolve({ success: false }); },
      cancelTransfer: function () { return Promise.resolve({ success: false }); },
      createSwarm: function () { return Promise.resolve({ swarmId: null }); },
      joinSwarm: function () { return Promise.resolve({ success: false }); },
      leaveSwarm: function () { return Promise.resolve({ success: false }); },
      getSwarmInfo: function () { return Promise.resolve({}); },
      calculateRoute: function () { return Promise.resolve({ paths: [] }); },
      onEvent: function (cb) { _handlers['proximity-native-event'] = cb; },
      offEvent: function () { delete _handlers['proximity-native-event']; },
    },

    // ── Security stack ────────────────────────────────────────────────────
    security: {
      // OHTTP: fetch config directly (browser fetch, no Electron net needed)
      ohttpFetchConfig: function (configUrl) {
        return fetch(configUrl)
          .then(function (r) { return r.json(); })
          .then(function (config) { return { success: true, config: config }; })
          .catch(function (e) { return { success: false, error: e.message }; });
      },

      // Privacy Pass tokens
      ppStoreTokens: function (tokens) { return invoke('pp_store_tokens', { tokens: tokens }); },
      ppGetToken: function () { return invoke('pp_get_token'); },
      ppGetCount: function () { return invoke('pp_get_count'); },

      // Crypto RNG (backed by Rust rand::thread_rng)
      randomBytes: function (size) { return invoke('security_random_bytes', { size: size }); },
    },

    // ── Autostart ─────────────────────────────────────────────────────────
    autostart: {
      enable: function () { return invoke('plugin:autostart|enable'); },
      disable: function () { return invoke('plugin:autostart|disable'); },
      isEnabled: function () { return invoke('plugin:autostart|is_enabled'); },
    },

    // ── Now Playing (system media detection) ─────────────────────────────
    nowPlaying: {
      getStatus: function () { return invoke('now_playing_get_status'); },
      startPolling: function (intervalMs) {
        return invoke('now_playing_start_polling', { interval_ms: intervalMs || 3000 });
      },
      stopPolling: function () { return invoke('now_playing_stop_polling'); },
      onUpdate: function (cb) { _handlers['now-playing-update'] = cb; },
      offUpdate: function () { delete _handlers['now-playing-update']; },
    },
  };

  // Sync Tauri settings → localStorage on startup so React hooks that read
  // localStorage (useSoundFX, etc.) start with the correct values
  invoke('get_settings').then(function (s) {
    if (!s) return;
    if (typeof s.soundEnabled === 'boolean') {
      localStorage.setItem('soundFX_enabled', s.soundEnabled ? 'true' : 'false');
    }
  }).catch(function () {});

  // ── Offline overlay (Tauri / Electron) ───────────────────────────────────
  // Shows a styled overlay when the device has no internet connection.
  // Hides automatically when connectivity is restored.
  (function () {
    var OVERLAY_ID = '__ephchat_offline__';

    function isDark() {
      try {
        var t = localStorage.getItem('theme');
        return t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
      } catch (_) { return false; }
    }

    function buildOverlay() {
      var el = document.createElement('div');
      el.id = OVERLAY_ID;
      var dark = isDark();

      var bg      = dark ? '#030712'  : '#e8edf2';
      var surface = dark ? '#0f172a'  : '#ffffff';
      var text    = dark ? '#f8fafc'  : '#0f172a';
      var subtext = dark ? '#94a3b8'  : '#64748b';
      var border  = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.08)';
      var accent  = dark ? '#6366f1'  : '#4f46e5';
      var accentD = dark ? 'rgba(99,102,241,0.15)'  : 'rgba(79,70,229,0.12)';
      var accentG = dark ? 'rgba(99,102,241,0.30)'  : 'rgba(79,70,229,0.25)';

      el.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'display:flex', 'align-items:center', 'justify-content:center',
        'background:' + bg,
        'font-family:Inter,system-ui,-apple-system,sans-serif',
        '-webkit-font-smoothing:antialiased',
        'color:' + text,
        'padding:24px',
      ].join(';');

      el.innerHTML = '<div style="' + [
        'background:' + surface,
        'border:1px solid ' + border,
        'border-radius:24px',
        'padding:44px 40px 40px',
        'max-width:440px',
        'width:100%',
        'text-align:center',
        'box-shadow:0 20px 60px rgba(0,0,0,' + (dark ? '0.5' : '0.08') + ')',
      ].join(';') + '">' +

        // brand
        '<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:36px">' +
        '<svg width="28" height="28" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">' +
          '<rect width="512" height="512" rx="100" fill="#4F46E5"/>' +
          '<path d="M128 102 L384 102 C394 102 402 110 402 120 L402 310 C402 320 394 328 384 328 L280 328 L230 400 L200 328 L128 328 C118 328 110 320 110 310 L110 120 C110 110 118 102 128 102 Z" fill="white"/>' +
        '</svg>' +
        '<span style="font-size:0.875rem;font-weight:600;color:' + subtext + ';letter-spacing:-0.01em">Ephemeral Chat</span>' +
        '</div>' +

        // animated wifi SVG
        '<div style="position:relative;width:120px;height:96px;margin:0 auto 28px">' +
        '<svg viewBox="0 0 120 96" style="width:100%;height:100%;overflow:visible">' +
          '<style>' +
            '.oa{fill:none;stroke-linecap:round;stroke:' + accent + ';stroke-width:7}' +
            '@keyframes af{0%,25%{opacity:1}60%,85%{opacity:.12}100%{opacity:1}}' +
            '.a1{animation:af 2.4s ease-in-out infinite}' +
            '.a2{animation:af 2.4s ease-in-out .3s infinite}' +
            '.a3{animation:af 2.4s ease-in-out .6s infinite}' +
            '.a4{fill:' + accent + ';animation:af 2.4s ease-in-out .9s infinite}' +
          '</style>' +
          '<path class="oa a1" d="M8 52 Q30 10 60 10 Q90 10 112 52"/>' +
          '<path class="oa a2" d="M22 64 Q38 38 60 38 Q82 38 98 64"/>' +
          '<path class="oa a3" d="M37 76 Q46 62 60 62 Q74 62 83 76"/>' +
          '<circle class="a4" cx="60" cy="88" r="6"/>' +
        '</svg>' +
        '<svg style="position:absolute;top:-6px;right:-4px" width="32" height="32" viewBox="0 0 32 32" fill="none">' +
          '<circle cx="16" cy="16" r="14" fill="#fef2f2" stroke="#fca5a5" stroke-width="1.5"/>' +
          '<path d="M11 11L21 21M21 11L11 21" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>' +
        '</svg>' +
        '</div>' +

        // status pill
        '<div style="display:inline-flex;align-items:center;gap:7px;background:' + accentD + ';border:1px solid rgba(99,102,241,.25);border-radius:100px;padding:5px 14px;font-size:.75rem;font-weight:600;color:' + accent + ';margin-bottom:20px">' +
        '<style>@keyframes dp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.65)}}</style>' +
        '<span style="width:6px;height:6px;border-radius:50%;background:' + accent + ';animation:dp 1.6s ease-in-out infinite"></span>' +
        'Looking for connection…' +
        '</div>' +

        '<h2 style="font-size:1.75rem;font-weight:800;letter-spacing:-.04em;color:' + text + ';margin-bottom:10px;line-height:1.15">You\'re Offline</h2>' +
        '<p style="font-size:.9375rem;color:' + subtext + ';line-height:1.65;margin-bottom:32px">' +
          'No internet connection. Reconnect to start<br>chatting on Ephemeral Chat.' +
        '</p>' +

        '<style>' +
          '.ecbtn{display:inline-flex;align-items:center;gap:8px;background:' + accent + ';color:#fff;border:none;border-radius:12px;padding:13px 28px;font-size:.9375rem;font-weight:600;cursor:pointer;box-shadow:0 4px 18px ' + accentG + ';outline:none;-webkit-tap-highlight-color:transparent;transition:background .2s,transform .15s}' +
          '.ecbtn:hover{background:#4338ca;transform:translateY(-1px)}' +
          '.ecbtn:active{transform:translateY(0)}' +
        '</style>' +
        '<button class="ecbtn" onclick="window.location.reload()" aria-label="Retry">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 2v4h-4" stroke="white" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6C13.2 3.7 11 2 8 2 4.7 2 2 4.7 2 8s2.7 6 6 6c2.6 0 4.9-1.7 5.7-4" stroke="white" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>' +
          'Try Again' +
        '</button>' +

      '</div>';

      return el;
    }

    function showOffline() {
      if (document.getElementById(OVERLAY_ID)) return;
      document.body.appendChild(buildOverlay());
    }

    function hideOffline() {
      var el = document.getElementById(OVERLAY_ID);
      if (el) el.parentNode.removeChild(el);
    }

    function syncOfflineState() {
      if (!navigator.onLine) showOffline();
      else hideOffline();
    }

    // Attach listeners immediately (before DOMContentLoaded so we never miss it)
    window.addEventListener('offline', showOffline);
    window.addEventListener('online', hideOffline);

    // Initial check after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', syncOfflineState);
    } else {
      syncOfflineState();
    }
  }());

  // Compatibility: add electron-app CSS class and fire electron-ready event
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('electron-app');
    document.body.classList.add('tauri-app');
    window.dispatchEvent(new CustomEvent('electron-ready', {
      detail: { platform: _platform, version: 'tauri' },
    }));

    // Fallback: dismiss the splash screen after 8 seconds even if app-ready
    // never fires (e.g. slow network, JS error, or missing Tauri IPC).
    setTimeout(function () {
      document.body.classList.add('app-loaded');
    }, 8000);
  });

  // Security: block right-click save on images
  document.addEventListener('contextmenu', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.preventDefault();
  });

  // Security: block DevTools keyboard shortcuts
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))) {
      e.preventDefault();
      return false;
    }
    // Block print
    if (e.ctrlKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      return false;
    }
  });

  // Block accidental file drops
  document.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
})();
