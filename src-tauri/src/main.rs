// Sibyl desktop shell. Two jobs, both thin:
//   1. Open a native window on the built web UI (Tauri serves web/dist).
//   2. Spawn the Node sidecar — the SAME Express server the CLI and web app use,
//      bundled to one .mjs — and tear it down when the window closes.
//
// Everything else (NL→SQL, pg, Ollama, onboarding) is TypeScript. The sidecar owns
// /api only; the UI reaches it at 127.0.0.1:<SIDECAR_PORT>.
//
// SPIKE SCOPE: the sidecar is run via the system `node` for now. Shipping without a
// system Node (Node SEA → a bundled binary, or an embedded runtime) is the next step
// — see SPIKE.md. Everything below is production-shaped regardless.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

// Fixed loopback port for the spike. Hardening step: pick a free port and hand it to
// the frontend at runtime (window global / Tauri command) — see SPIKE.md.
const SIDECAR_PORT: &str = "47821";

// Holds the sidecar child so we can kill it on exit (a leaked Node process would keep
// a warm DB pool open after the window is gone).
struct Sidecar(Mutex<Option<Child>>);

fn spawn_sidecar(app: &tauri::App) -> Result<Child, Box<dyn std::error::Error>> {
    // The bundled server script, shipped as a Tauri resource (see tauri.conf.json).
    let script = app
        .path()
        .resource_dir()?
        .join("sidecar/sibyl-server.mjs");

    let child = Command::new("node")
        .arg(&script)
        .env("SIBYL_PORT", SIDECAR_PORT)
        // The desktop shell serves the UI itself — the sidecar exposes ONLY /api.
        .env("SIBYL_SERVE_STATIC", "false")
        .spawn()?;

    Ok(child)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            match spawn_sidecar(app) {
                Ok(child) => {
                    app.manage(Sidecar(Mutex::new(Some(child))));
                }
                // Don't hard-fail the window if the sidecar can't start — the UI's
                // fault banner surfaces "can't reach Sibyl" and the user can retry.
                Err(e) => eprintln!("failed to spawn Sibyl sidecar: {e}"),
            }
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
