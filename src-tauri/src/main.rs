// Sibyl desktop shell. Two jobs, both thin:
//   1. Open a native window on the built web UI (Tauri serves web/dist).
//   2. Spawn the Node sidecar — the SAME Express server the CLI and web app use,
//      bundled to one .mjs — and tear it down when the window closes.
//
// Everything else (NL→SQL, pg, Ollama, onboarding) is TypeScript. The sidecar owns
// /api only; the UI reaches it at 127.0.0.1:<SIDECAR_PORT>.
//
// The sidecar runs on a Node runtime BUNDLED into the app (resources/bin/node), so the
// shipped app is self-contained — apps launched from Finder don't inherit the shell
// PATH and can't rely on a system `node`. In dev (resources aren't bundled) we fall
// back to `node` on PATH.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

// Fixed loopback port. Hardening step: pick a free port and hand it to the frontend
// at runtime (window global / Tauri command) instead of baking it — see README.
const SIDECAR_PORT: &str = "47821";

// Holds the sidecar child so we can kill it on exit (a leaked Node process would keep
// a warm DB pool open after the window is gone).
struct Sidecar(Mutex<Option<Child>>);

fn spawn_sidecar(app: &tauri::App) -> Result<Child, Box<dyn std::error::Error>> {
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
