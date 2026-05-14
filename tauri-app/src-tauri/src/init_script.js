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
      masqueInit: function (proxyUrl) {
        return invoke('masque_init', { proxy_url: proxyUrl || '' });
      },
      masqueIsAvailable: function () {
        return invoke('masque_is_available');
      },
      masqueSend: function (target, payload) {
        return invoke('masque_send', { target: target, payload: payload });
      },

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
