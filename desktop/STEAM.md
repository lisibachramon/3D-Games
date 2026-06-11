# Shipping FLOTSAM / PULSAR to Steam (later)

Electron games on Steam are common (Vampire Survivors shipped on Electron-like
stacks; plenty of HTML5/Electron titles do fine). The builds this repo produces
are already the right shape: a self-contained app dir per OS.

## One-time setup (not done yet — needs Ramon)

1. **Steamworks partner account** — <https://partner.steamgames.com>, sign the
   distribution agreement, company + tax/bank details.
2. **App Fee** — **$100 per app** (Steam Direct fee). FLOTSAM and PULSAR are two
   separate apps → two fees. Recoupable after $1,000 adjusted gross revenue each.
3. Each app gets an **appid**; under it you create **depots** (one per
   OS/content set), e.g. for FLOTSAM:
   - `<appid>+1` — Windows depot (contents of `dist/flotsam/win-unpacked/`)
   - `<appid>+2` — macOS depot (contents of `dist/flotsam/mac-arm64/FLOTSAM.app`)

## Uploading builds with steamcmd

Steam doesn't take installers — you upload the **unpacked** build dirs
(`npm run pack:<game>` output) and Steam handles install/updates/delta patches.

Example `app_build` script (per game):

```vdf
"AppBuild"
{
  "AppID" "<flotsam_appid>"
  "Desc" "flotsam v0.1.0"
  "ContentRoot" "..\\desktop\\dist\\flotsam\\"
  "BuildOutput" "..\\steam_build_output\\"
  "Depots"
  {
    "<win_depot_id>"
    {
      "FileMapping" { "LocalPath" "win-unpacked\\*" "DepotPath" "." "recursive" "1" }
    }
    "<mac_depot_id>"
    {
      "FileMapping" { "LocalPath" "mac-arm64\\FLOTSAM.app\\*" "DepotPath" "FLOTSAM.app\\" "recursive" "1" }
    }
  }
}
```

Run: `steamcmd +login <builder_account> +run_app_build path\to\app_build_flotsam.vdf +quit`
(use a dedicated builder account with the "Edit App Metadata"/"Publish" roles).
This is easy to wire into `release.yml` later as a post-build job using the
`game-ci/steam-deploy` action or raw steamcmd, with credentials in GitHub
Secrets — per the standing rule, secrets go in GitHub Secrets, never in files.

Launch options in the Steamworks "Installation" tab: Windows →
`FLOTSAM.exe`, macOS → `FLOTSAM.app`. Mark the mac depot arm64 (add an x64 or
universal build later if Intel macs matter).

## Code signing

- **Steam itself does not require OS code signing** — fine to ship unsigned
  there initially.
- Direct-download distribution (the GitHub Release artifacts) *will* annoy
  users: Windows SmartScreen warnings, macOS Gatekeeper blocks. Later:
  - Windows: OV/EV Authenticode cert (e.g. Azure Trusted Signing or an EV cert
    via SSL.com/Certum), wire into electron-builder `win.signtoolOptions` or
    `CSC_LINK`/`CSC_KEY_PASSWORD` env in CI.
  - macOS: Apple Developer Program ($99/yr), Developer ID Application cert +
    notarization (`mac.identity`, `mac.notarize` + `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`).
  Currently signing is explicitly disabled in `scripts/build.js`.

## Steamworks SDK integration (achievements, overlay, presence)

Plug in later via [`steamworks.js`](https://github.com/ceifa/steamworks.js)
(prebuilt N-API bindings, works in Electron with
`app.commandLine.appendSwitch('in-process-gpu')` + a couple of documented
switches for overlay support):

- `npm i steamworks.js` in `desktop/`, init in `main.js` with
  `require('steamworks.js').init(<appid>)` guarded so non-Steam builds still run.
- Ship a `steam_appid.txt` next to the exe only for local dev/testing.
- Achievements/stats are defined in the Steamworks dashboard and triggered from
  the main process (expose via IPC to the game client if needed).
- The Steam Overlay needs the GPU switches above; test early — it's the usual
  pain point with Electron.

## Checklist for later (Ramon)

- [ ] Steamworks account + 2× $100 app fee (FLOTSAM, PULSAR)
- [ ] Appids + depots created, store pages drafted
- [ ] Builder account + steamcmd upload wired into CI (secrets via GitHub Secrets)
- [ ] Decide on code signing for non-Steam distribution
- [ ] steamworks.js integration + steam_appid.txt for dev
- [ ] Playtest the overlay; add `in-process-gpu` switches if needed
