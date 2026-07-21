// Sibyl desktop shell. Two jobs, both thin:
//   1. Open a native window on the built web UI (Tauri serves web/dist).
//   2. Spawn the Node sidecar — the SAME Express server the CLI and web app use,
//      bundled to one .mjs — and tear it down when the window closes.
//
// Everything else (NL→SQL, pg, Ollama, onboarding) is TypeScript. The sidecar owns
// /api only; it binds a free loopback port picked at launch, which we inject into the
// webview as `window.__SIBYL_API__` so two instances can run side by side.
//
// The sidecar runs on a Node runtime BUNDLED into the app (resources/bin/node), so the
// shipped app is self-contained — apps launched from Finder don't inherit the shell
// PATH and can't rely on a system `node`. In dev (resources aren't bundled) we fall
// back to `node` on PATH.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpListener;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent, WebviewWindowBuilder};

// Holds the sidecar child so we can kill it on exit (a leaked Node process would keep
// a warm DB pool open after the window is gone).
struct Sidecar(Mutex<Option<Child>>);

// Ask the OS for a free loopback port, then immediately release it for the sidecar to
// claim. The gap between releasing and Node binding is a small TOCTOU window; losing
// that race just means the sidecar fails to start and the UI shows its "can't reach
// Sibyl" banner, which is the same path as any other spawn failure.
fn free_port() -> Result<u16, std::io::Error> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn spawn_sidecar(app: &tauri::App, port: u16) -> Result<Child, Box<dyn std::error::Error>> {
    // Both shipped as Tauri resources (see tauri.conf.json).
    let resource_dir = app.path().resource_dir()?;
    let script = resource_dir.join("sidecar/sibyl-server.mjs");
    let bundled_node = resource_dir.join("bin/node");

    // Prefer the bundled runtime; fall back to a PATH `node` in dev.
    let mut command = if bundled_node.exists() {
        Command::new(&bundled_node)
    } else {
        Command::new("node")
    };

    let child = command
        .arg(&script)
        .env("SIBYL_PORT", port.to_string())
        // The desktop shell serves the UI itself — the sidecar exposes ONLY /api.
        .env("SIBYL_SERVE_STATIC", "false")
        .spawn()?;

    Ok(child)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let port = free_port()?;

            match spawn_sidecar(app, port) {
                Ok(child) => {
                    app.manage(Sidecar(Mutex::new(Some(child))));
                }
                // Don't hard-fail the window if the sidecar can't start — the UI's
                // fault banner surfaces "can't reach Sibyl" and the user can retry.
                Err(e) => eprintln!("failed to spawn Sibyl sidecar: {e}"),
            }

            // The window is built here rather than at startup (`"create": false` in
            // tauri.conf.json) because the port isn't known until now. The init script
            // runs before any page script, so the client reads the API base
            // synchronously at import time and never has to await an IPC round-trip.
            let config = app.config().app.windows[0].clone();
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .initialization_script(format!(
                    "window.__SIBYL_API__ = 'http://127.0.0.1:{port}/api'"
                ))
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Sibyl desktop app")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<Sidecar>() {
                    if let Some(mut child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
