mod commands;
mod masque;
mod mdns;

use commands::PpTokenStore;
use masque::MasqueState;
use mdns::MdnsManager;
use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder,
};

const CHAT_URL: &str = "https://chat.kyere.me";
const INIT_SCRIPT: &str = include_str!("init_script.js");

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ));

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }));

    builder
        .manage(PpTokenStore::default())
        .manage(MdnsManager::default())
        .manage(MasqueState::default())
        .setup(|app| {
            setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_setting,
            commands::get_app_version,
            commands::show_notification,
            commands::check_for_updates,
            commands::get_system_idle_time,
            commands::set_badge,
            commands::open_url_external,
            commands::open_url_in_app,
            commands::window_reload,
            commands::window_toggle_fullscreen,
            commands::window_set_always_on_top,
            commands::window_minimize,
            commands::window_zoom,
            commands::proximity_get_network_info,
            commands::proximity_get_local_ip,
            commands::proximity_get_device_id,
            commands::proximity_get_device_name,
            commands::proximity_save_file,
            commands::proximity_show_in_folder,
            commands::proximity_open_file,
            commands::pp_store_tokens,
            commands::pp_get_token,
            commands::pp_get_count,
            commands::security_random_bytes,
            commands::now_playing_get_status,
            commands::now_playing_start_polling,
            commands::now_playing_stop_polling,
            commands::mdns_start,
            commands::mdns_stop,
            commands::mdns_get_peers,
            commands::mdns_get_my_info,
            commands::mdns_send_sdp,
            commands::mdns_is_running,
            commands::masque_init,
            commands::masque_is_available,
            commands::masque_send,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ephemeral Chat");
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_window_state::{StateFlags, WindowExt};

    let win = WebviewWindowBuilder::new(
        app,
        "main",
        WebviewUrl::External(CHAT_URL.parse()?),
    )
    .title("Ephemeral Chat")
    .inner_size(1200.0, 800.0)
    .min_inner_size(400.0, 600.0)
    .initialization_script(INIT_SCRIPT)
    .visible(true)
    .build()?;

    // Restore position/size/maximized only — never restore VISIBLE state
    // (app was hidden to tray on close; we don't want that to persist across restarts)
    let _ = win.restore_state(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN);
    let _ = win.set_content_protected(true);

    let h = app.handle().clone();

    // Respect start-minimized; otherwise always show normally
    if store_get_bool(&h, "startMinimized", false) {
        let _ = win.hide();
    } else {
        let _ = win.show();
        let _ = win.set_focus();
    }

    // Restore always-on-top
    if store_get_bool(&h, "alwaysOnTop", false) {
        let _ = win.set_always_on_top(true);
    }

    // Intercept close → hide to tray; minimize → hide to tray
    win.on_window_event({
        let handle = app.handle().clone();
        move |event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    use tauri_plugin_window_state::AppHandleExt;
                    let _ = handle.save_window_state(
                        tauri_plugin_window_state::StateFlags::SIZE
                            | tauri_plugin_window_state::StateFlags::POSITION
                            | tauri_plugin_window_state::StateFlags::MAXIMIZED
                            | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                    );
                    // Respect "Close to tray" setting. When disabled (e.g. user unchecks it),
                    // Alt+F4 / window-X actually quits the app instead of hiding to tray.
                    if store_get_bool(&handle, "closeToTray", true) {
                        api.prevent_close();
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                    // else: let the close propagate → app exits normally
                }
                tauri::WindowEvent::Focused(false) => {
                    let h = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(tokio::time::Duration::from_millis(80)).await;
                        if let Some(w) = h.get_webview_window("main") {
                            if w.is_minimized().unwrap_or(false) {
                                if store_get_bool(&h, "minimizeToTray", true) {
                                    let _ = w.hide();
                                }
                                if store_get_bool(&h, "biometricLockEnabled", false)
                                    && store_get_i64(&h, "lockDelay", 5) == 0
                                {
                                    let _ = h.emit("lock-app", ());
                                }
                            }
                        }
                    });
                }
                _ => {}
            }
        }
    });

    setup_tray(app)?;
    setup_shortcuts(app)?;

    Ok(())
}

// ─── Store helpers ────────────────────────────────────────────────────────────

fn store_get_bool(app: &tauri::AppHandle, key: &str, default: bool) -> bool {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get(key))
        .and_then(|v| v.as_bool())
        .unwrap_or(default)
}

fn store_set_bool(app: &tauri::AppHandle, key: &str, value: bool) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        store.set(key, serde_json::json!(value));
        let _ = store.save();
    }
}

fn store_get_str(app: &tauri::AppHandle, key: &str, default: &str) -> String {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get(key))
        .and_then(|v| v.as_str().map(|s| s.to_owned()))
        .unwrap_or_else(|| default.to_owned())
}

fn store_set_str(app: &tauri::AppHandle, key: &str, value: &str) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        store.set(key, serde_json::json!(value));
        let _ = store.save();
    }
}

fn store_get_i64(app: &tauri::AppHandle, key: &str, default: i64) -> i64 {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get(key))
        .and_then(|v| v.as_i64())
        .unwrap_or(default)
}

fn store_set_i64(app: &tauri::AppHandle, key: &str, value: i64) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("settings.json") {
        store.set(key, serde_json::json!(value));
        let _ = store.save();
    }
}

// ─── Window helpers ───────────────────────────────────────────────────────────

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn navigate_main(app: &tauri::AppHandle, suffix: &str) {
    let url = format!("{}{}", CHAT_URL, suffix);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval(&format!("window.location.href = {:?}", url));
    }
}

// ─── System Tray ──────────────────────────────────────────────────────────────

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let h = app.handle().clone();

    // Initial setting values
    let aot_val         = store_get_bool(&h, "alwaysOnTop", false);
    let start_min_val   = store_get_bool(&h, "startMinimized", false);
    let start_boot_val  = store_get_bool(&h, "startOnBoot", false);
    let close_tray_val  = store_get_bool(&h, "closeToTray", true);
    let notifs_val      = store_get_bool(&h, "notificationsEnabled", true);
    let sound_val       = store_get_bool(&h, "soundEnabled", true);
    let biometric_val   = store_get_bool(&h, "biometricLockEnabled", false);
    let sec_mode        = store_get_str(&h, "securityMode", "high");
    let lock_delay      = store_get_i64(&h, "lockDelay", 5);

    // ── Basic items ──
    let show     = MenuItemBuilder::with_id("tray_show",     "Open Ephemeral Chat").build(app)?;
    let lock_now = MenuItemBuilder::with_id("tray_lock_now", "Lock App Now").build(app)?;
    let new_room = MenuItemBuilder::with_id("tray_new_room", "Create New Room").build(app)?;

    // ── Checkbox items ──
    let aot        = CheckMenuItemBuilder::with_id("tray_aot",        "Always on Top").checked(aot_val).build(app)?;
    let start_min  = CheckMenuItemBuilder::with_id("tray_start_min",  "Start Minimized").checked(start_min_val).build(app)?;
    let start_boot = CheckMenuItemBuilder::with_id("tray_start_boot", "Start with Windows").checked(start_boot_val).build(app)?;
    let close_tray = CheckMenuItemBuilder::with_id("tray_close_tray", "Close to Tray (disable for Alt+F4 quit)").checked(close_tray_val).build(app)?;
    let notifs     = CheckMenuItemBuilder::with_id("tray_notifs",     "Notifications").checked(notifs_val).build(app)?;
    let sound      = CheckMenuItemBuilder::with_id("tray_sound",      "Sound").checked(sound_val).build(app)?;
    let biometric  = CheckMenuItemBuilder::with_id("tray_biometric",  "Biometric Lock").checked(biometric_val).build(app)?;

    // ── Security Mode submenu (simulated radio) ──
    let sec_high   = CheckMenuItemBuilder::with_id("tray_sec_high",   "High (Recommended)").checked(sec_mode == "high").build(app)?;
    let sec_medium = CheckMenuItemBuilder::with_id("tray_sec_medium", "Medium").checked(sec_mode == "medium").build(app)?;
    let sec_low    = CheckMenuItemBuilder::with_id("tray_sec_low",    "Low").checked(sec_mode == "low").build(app)?;
    let sec_sub    = SubmenuBuilder::new(app, "Security Mode")
        .item(&sec_high).item(&sec_medium).item(&sec_low).build()?;

    // ── Lock Delay submenu (simulated radio) ──
    let delay_imm = CheckMenuItemBuilder::with_id("tray_delay_0",  "Immediate").checked(lock_delay == 0).build(app)?;
    let delay_1m  = CheckMenuItemBuilder::with_id("tray_delay_1",  "1 Minute").checked(lock_delay == 1).build(app)?;
    let delay_5m  = CheckMenuItemBuilder::with_id("tray_delay_5",  "5 Minutes").checked(lock_delay == 5).build(app)?;
    let delay_10m = CheckMenuItemBuilder::with_id("tray_delay_10", "10 Minutes").checked(lock_delay == 10).build(app)?;
    let delay_30m = CheckMenuItemBuilder::with_id("tray_delay_30", "30 Minutes").checked(lock_delay == 30).build(app)?;
    let delay_sub = SubmenuBuilder::new(app, "Lock Delay")
        .item(&delay_imm).item(&delay_1m).item(&delay_5m).item(&delay_10m).item(&delay_30m).build()?;

    let settings_btn = MenuItemBuilder::with_id("tray_settings",      "Settings...").build(app)?;
    let check_upd    = MenuItemBuilder::with_id("tray_check_updates", "Check for Updates").build(app)?;
    let quit         = MenuItemBuilder::with_id("tray_quit",          "Quit").build(app)?;

    // ── Clones for on_menu_event closure ──
    let (aot_c, start_min_c, start_boot_c, close_tray_c, notifs_c, sound_c, biometric_c) = (
        aot.clone(), start_min.clone(), start_boot.clone(), close_tray.clone(), notifs.clone(), sound.clone(), biometric.clone(),
    );
    let (sec_high_c, sec_medium_c, sec_low_c) = (sec_high.clone(), sec_medium.clone(), sec_low.clone());
    let (delay_imm_c, delay_1m_c, delay_5m_c, delay_10m_c, delay_30m_c) = (
        delay_imm.clone(), delay_1m.clone(), delay_5m.clone(), delay_10m.clone(), delay_30m.clone(),
    );

    // ── Clones for settings-changed → tray sync listener ──
    let (aot_l, start_min_l, start_boot_l, close_tray_l, notifs_l, sound_l, biometric_l) = (
        aot.clone(), start_min.clone(), start_boot.clone(), close_tray.clone(), notifs.clone(), sound.clone(), biometric.clone(),
    );
    let app_handle_l = app.handle().clone();
    let (sec_high_l, sec_medium_l, sec_low_l) = (sec_high.clone(), sec_medium.clone(), sec_low.clone());
    let (delay_imm_l, delay_1m_l, delay_5m_l, delay_10m_l, delay_30m_l) = (
        delay_imm.clone(), delay_1m.clone(), delay_5m.clone(), delay_10m.clone(), delay_30m.clone(),
    );

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&lock_now)
        .item(&new_room)
        .separator()
        .item(&aot)
        .item(&start_min)
        .item(&start_boot)
        .item(&close_tray)
        .separator()
        .item(&notifs)
        .item(&sound)
        .separator()
        .item(&sec_sub)
        .separator()
        .item(&biometric)
        .item(&delay_sub)
        .separator()
        .item(&settings_btn)
        .item(&check_upd)
        .separator()
        .item(&quit)
        .build()?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Ephemeral Chat")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                // ── Navigation ──
                "tray_show" => show_main(app),
                "tray_lock_now" => {
                    show_main(app);
                    let _ = app.emit("lock-app", ());
                }
                "tray_new_room" => {
                    show_main(app);
                    navigate_main(app, "?action=create");
                }

                // ── Window toggles ──
                "tray_aot" => {
                    let v = !store_get_bool(app, "alwaysOnTop", false);
                    let _ = aot_c.set_checked(v);
                    store_set_bool(app, "alwaysOnTop", v);
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.set_always_on_top(v);
                    }
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"alwaysOnTop","value":v}));
                }
                "tray_start_min" => {
                    let v = !store_get_bool(app, "startMinimized", false);
                    let _ = start_min_c.set_checked(v);
                    store_set_bool(app, "startMinimized", v);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"startMinimized","value":v}));
                }
                "tray_start_boot" => {
                    let v = !store_get_bool(app, "startOnBoot", false);
                    let _ = start_boot_c.set_checked(v);
                    store_set_bool(app, "startOnBoot", v);
                    use tauri_plugin_autostart::ManagerExt;
                    if v { let _ = app.autolaunch().enable(); }
                    else { let _ = app.autolaunch().disable(); }
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"startOnBoot","value":v}));
                }
                "tray_close_tray" => {
                    let v = !store_get_bool(app, "closeToTray", true);
                    let _ = close_tray_c.set_checked(v);
                    store_set_bool(app, "closeToTray", v);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"closeToTray","value":v}));
                }
                "tray_notifs" => {
                    let v = !store_get_bool(app, "notificationsEnabled", true);
                    let _ = notifs_c.set_checked(v);
                    store_set_bool(app, "notificationsEnabled", v);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"notificationsEnabled","value":v}));
                }
                "tray_sound" => {
                    let v = !store_get_bool(app, "soundEnabled", true);
                    let _ = sound_c.set_checked(v);
                    store_set_bool(app, "soundEnabled", v);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"soundEnabled","value":v}));
                }

                // ── Security Mode (radio simulation) ──
                "tray_sec_high" => {
                    let _ = sec_high_c.set_checked(true);
                    let _ = sec_medium_c.set_checked(false);
                    let _ = sec_low_c.set_checked(false);
                    store_set_str(app, "securityMode", "high");
                    if let Some(win) = app.get_webview_window("main") { let _ = win.set_content_protected(true); }
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"securityMode","value":"high"}));
                }
                "tray_sec_medium" => {
                    let _ = sec_high_c.set_checked(false);
                    let _ = sec_medium_c.set_checked(true);
                    let _ = sec_low_c.set_checked(false);
                    store_set_str(app, "securityMode", "medium");
                    if let Some(win) = app.get_webview_window("main") { let _ = win.set_content_protected(true); }
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"securityMode","value":"medium"}));
                }
                "tray_sec_low" => {
                    let _ = sec_high_c.set_checked(false);
                    let _ = sec_medium_c.set_checked(false);
                    let _ = sec_low_c.set_checked(true);
                    store_set_str(app, "securityMode", "low");
                    if let Some(win) = app.get_webview_window("main") { let _ = win.set_content_protected(false); }
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"securityMode","value":"low"}));
                }

                // ── Biometric Lock ──
                "tray_biometric" => {
                    let v = !store_get_bool(app, "biometricLockEnabled", false);
                    let _ = biometric_c.set_checked(v);
                    store_set_bool(app, "biometricLockEnabled", v);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"biometricLockEnabled","value":v}));
                }

                // ── Lock Delay (radio simulation) ──
                "tray_delay_0" => {
                    let _ = delay_imm_c.set_checked(true);
                    let _ = delay_1m_c.set_checked(false);
                    let _ = delay_5m_c.set_checked(false);
                    let _ = delay_10m_c.set_checked(false);
                    let _ = delay_30m_c.set_checked(false);
                    store_set_i64(app, "lockDelay", 0);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"lockDelay","value":0}));
                }
                "tray_delay_1" => {
                    let _ = delay_imm_c.set_checked(false);
                    let _ = delay_1m_c.set_checked(true);
                    let _ = delay_5m_c.set_checked(false);
                    let _ = delay_10m_c.set_checked(false);
                    let _ = delay_30m_c.set_checked(false);
                    store_set_i64(app, "lockDelay", 1);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"lockDelay","value":1}));
                }
                "tray_delay_5" => {
                    let _ = delay_imm_c.set_checked(false);
                    let _ = delay_1m_c.set_checked(false);
                    let _ = delay_5m_c.set_checked(true);
                    let _ = delay_10m_c.set_checked(false);
                    let _ = delay_30m_c.set_checked(false);
                    store_set_i64(app, "lockDelay", 5);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"lockDelay","value":5}));
                }
                "tray_delay_10" => {
                    let _ = delay_imm_c.set_checked(false);
                    let _ = delay_1m_c.set_checked(false);
                    let _ = delay_5m_c.set_checked(false);
                    let _ = delay_10m_c.set_checked(true);
                    let _ = delay_30m_c.set_checked(false);
                    store_set_i64(app, "lockDelay", 10);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"lockDelay","value":10}));
                }
                "tray_delay_30" => {
                    let _ = delay_imm_c.set_checked(false);
                    let _ = delay_1m_c.set_checked(false);
                    let _ = delay_5m_c.set_checked(false);
                    let _ = delay_10m_c.set_checked(false);
                    let _ = delay_30m_c.set_checked(true);
                    store_set_i64(app, "lockDelay", 30);
                    let _ = app.emit("settings-changed", serde_json::json!({"key":"lockDelay","value":30}));
                }

                // ── Misc ──
                "tray_settings" => {
                    show_main(app);
                    let _ = app.emit("open-settings", ());
                }
                "tray_check_updates" => {
                    show_main(app);
                    let _ = app.emit("check-for-updates-menu", ());
                }
                "tray_quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    // Sync tray checkmarks AND apply native side-effects when settings change via the UI modal
    app.listen("settings-changed", move |e: tauri::Event| {
        let Ok(p) = serde_json::from_str::<serde_json::Value>(e.payload()) else { return };
        let key = p["key"].as_str().unwrap_or("");
        match key {
            "alwaysOnTop" => {
                let v = p["value"].as_bool().unwrap_or(false);
                let _ = aot_l.set_checked(v);
                // Native effect is already applied by set_setting in commands.rs
            }
            "startMinimized"       => { let _ = start_min_l.set_checked(p["value"].as_bool().unwrap_or(false)); }
            "startOnBoot" => {
                let v = p["value"].as_bool().unwrap_or(false);
                let _ = start_boot_l.set_checked(v);
                // Apply autolaunch — set_setting now handles this, but guard here too
                use tauri_plugin_autostart::ManagerExt;
                if v { let _ = app_handle_l.autolaunch().enable(); }
                else { let _ = app_handle_l.autolaunch().disable(); }
            }
            "closeToTray"          => { let _ = close_tray_l.set_checked(p["value"].as_bool().unwrap_or(true)); }
            "notificationsEnabled" => { let _ = notifs_l.set_checked(p["value"].as_bool().unwrap_or(true)); }
            "soundEnabled"         => { let _ = sound_l.set_checked(p["value"].as_bool().unwrap_or(true)); }
            "biometricLockEnabled" => { let _ = biometric_l.set_checked(p["value"].as_bool().unwrap_or(false)); }
            "securityMode" => {
                let v = p["value"].as_str().unwrap_or("high");
                let _ = sec_high_l.set_checked(v == "high");
                let _ = sec_medium_l.set_checked(v == "medium");
                let _ = sec_low_l.set_checked(v == "low");
                // Native effect (content_protected) already applied by set_setting
            }
            "lockDelay" => {
                let v = p["value"].as_i64().unwrap_or(5);
                let _ = delay_imm_l.set_checked(v == 0);
                let _ = delay_1m_l.set_checked(v == 1);
                let _ = delay_5m_l.set_checked(v == 5);
                let _ = delay_10m_l.set_checked(v == 10);
                let _ = delay_30m_l.set_checked(v == 30);
            }
            _ => {}
        }
    });

    Ok(())
}

// ─── Global Shortcuts ─────────────────────────────────────────────────────────

fn setup_shortcuts(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    // Alt+Shift+E — toggle show/hide
    app.global_shortcut().on_shortcut(
        Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyE),
        |app, _s, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) && win.is_focused().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        },
    )?;

    // Alt+Shift+N — new room (global)
    app.global_shortcut().on_shortcut(
        Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyN),
        |app, _s, event| {
            if event.state() == ShortcutState::Pressed {
                show_main(app);
                navigate_main(app, "?action=create");
            }
        },
    )?;

    // Alt+Shift+P — picture-in-picture mini mode
    app.global_shortcut().on_shortcut(
        Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyP),
        |app, _s, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(size) = win.inner_size() {
                        let is_pip = size.width <= 380 && size.height <= 500;
                        if is_pip {
                            let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(1200, 800)));
                            let _ = win.set_always_on_top(false);
                        } else {
                            let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(380, 500)));
                            let _ = win.set_always_on_top(true);
                        }
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        },
    )?;

    // F11 — toggle fullscreen (focus-gated: only fires for our window)
    app.global_shortcut().on_shortcut(
        Shortcut::new(None, Code::F11),
        |app, _s, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_focused().unwrap_or(false) {
                        let is_fs = win.is_fullscreen().unwrap_or(false);
                        let _ = win.set_fullscreen(!is_fs);
                    }
                }
            }
        },
    )?;

    Ok(())
}
