mod commands;
mod masque;
mod mdns;

use commands::PpTokenStore;
use masque::MasqueState;
use mdns::MdnsManager;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
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

    // Restore previous window size/position
    let _ = win.restore_state(StateFlags::all());

    // Screen capture protection — prevents window appearing in screenshots/recordings
    let _ = win.set_content_protected(true);

    // Intercept close → hide to tray
    win.on_window_event({
        let handle = app.handle().clone();
        move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                use tauri_plugin_window_state::AppHandleExt;
                let _ = handle.save_window_state(tauri_plugin_window_state::StateFlags::all());
                api.prevent_close();
                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
        }
    });

    setup_tray(app)?;
    setup_app_menu(app)?;
    setup_shortcuts(app)?;

    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    let show = MenuItemBuilder::with_id("show", "Open Ephemeral Chat").build(app)?;
    let new_room = MenuItemBuilder::with_id("new_room", "Create New Room").build(app)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let content_protect = MenuItemBuilder::with_id("toggle_protection", "Toggle Screen Protection").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&new_room)
        .item(&sep)
        .item(&content_protect)
        .item(&sep2)
        .item(&quit)
        .build()?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Ephemeral Chat")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "new_room" => {
                show_main(app);
                navigate_main(app, "?action=create");
            }
            "toggle_protection" => {
                if let Some(win) = app.get_webview_window("main") {
                    let protected = win.is_focused().unwrap_or(false);
                    let _ = win.set_content_protected(!protected);
                }
            }
            "quit" => app.exit(0),
            _ => {}
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

    Ok(())
}

// ─── Application Menu ─────────────────────────────────────────────────────────

fn setup_app_menu(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let file = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("file_new_room", "New Room").build(app)?)
        .item(&MenuItemBuilder::with_id("file_home", "Home").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("file_quit", "Quit").build(app)?)
        .build()?;

    let security_menu = SubmenuBuilder::new(app, "Security")
        .item(&MenuItemBuilder::with_id("sec_panic", "Panic Burn").build(app)?)
        .item(&MenuItemBuilder::with_id("sec_anon", "Toggle Anonymous").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("sec_stealth", "Toggle Stealth").build(app)?)
        .item(&MenuItemBuilder::with_id("sec_override_ttl", "Toggle 10s Self-Destruct Override").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("sec_protection", "Toggle Screen Protection").build(app)?)
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&file)
        .item(&security_menu)
        .item(&view)
        .build()?;

    app.set_menu(menu)?;

    app.on_menu_event(|app, event| match event.id().as_ref() {
        "file_new_room" => navigate_main(app, "?action=create"),
        "file_home" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval(&format!("window.location.href = {:?}", CHAT_URL));
            }
        }
        "file_quit" => app.exit(0),
        "sec_panic" => {
            let _ = app.emit("panic-burn", ());
        }
        "sec_anon" => {
            let _ = app.emit("toggle-anonymous", ());
        }
        "sec_stealth" => {
            let _ = app.emit("toggle-stealth", ());
        }
        "sec_override_ttl" => {
            let _ = app.emit("toggle-override-ttl", ());
        }
        "sec_protection" => {
            if let Some(win) = app.get_webview_window("main") {
                // Read current state from a toggle; default to enabling (true)
                static PROTECTED: std::sync::atomic::AtomicBool =
                    std::sync::atomic::AtomicBool::new(true);
                let current = PROTECTED.load(std::sync::atomic::Ordering::Relaxed);
                let new_state = !current;
                PROTECTED.store(new_state, std::sync::atomic::Ordering::Relaxed);
                let _ = win.set_content_protected(new_state);
            }
        }
        _ => {}
    });

    Ok(())
}

// ─── Global Shortcuts ─────────────────────────────────────────────────────────

fn setup_shortcuts(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    // Alt+Shift+E — toggle show/hide
    app.global_shortcut().on_shortcut(
        Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyE),
        |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(win) = app.get_webview_window("main") {
                    let visible = win.is_visible().unwrap_or(false);
                    let focused = win.is_focused().unwrap_or(false);
                    if visible && focused {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        },
    )?;

    // Alt+Shift+N — new room
    app.global_shortcut().on_shortcut(
        Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyN),
        |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                show_main(app);
                navigate_main(app, "?action=create");
            }
        },
    )?;

    // Alt+Shift+P — picture-in-picture mini mode
    app.global_shortcut().on_shortcut(
        Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyP),
        |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(size) = win.inner_size() {
                        let is_pip = size.width <= 380 && size.height <= 500;
                        if is_pip {
                            let _ = win
                                .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(1200, 800)));
                            let _ = win.set_always_on_top(false);
                        } else {
                            let _ = win
                                .set_size(tauri::Size::Physical(tauri::PhysicalSize::new(380, 500)));
                            let _ = win.set_always_on_top(true);
                        }
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
        },
    )?;

    Ok(())
}
