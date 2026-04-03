# Continuation Notes

This file is a handoff for resuming the Gecko rebuild work exactly where it stopped on 2026-03-30.

## Repos And Paths

- Main repo: `/home/olegy/Documents/Projects/Node-Based Browser`
- Gecko fork checkout: `/home/olegy/Documents/Projects/Nodely-Gecko/firefox-esr`
- Built Gecko binary: `/home/olegy/Documents/Projects/Nodely-Gecko/firefox-esr/obj-nodely/dist/bin/firefox`
- User-local Gecko toolchain:
  - `/home/olegy/.local/firefox-toolchain`
- User-local Linux packaging tools:
  - `/home/olegy/.local/linux-packaging-min`

## Important Safety Note

No system packages were installed globally.

Everything added for builds/packaging lives in user space:

- `~/.local/firefox-toolchain`
- `~/.local/linux-packaging-min`
- repo files
- temporary files under `/tmp`

No `sudo`, no `dnf install`, no writes to `/usr` or system package databases.

## What Was Fixed In The Gecko Overlay

These changes are in the main repo overlay and were synced into the Gecko checkout:

### 1. Page host offset / page rendering drift

Likely root cause: the shell CSS was applying top/left margins to multiple nested browser containers at once, which compounded and could push the page down/right.

Fixed in:

- `gecko/overlay/browser/base/content/nodely/nodely-shell.css`

What changed:

- top offset now applies to `#browser`
- split left offset now applies to `#tabbrowser-tabbox`
- `#appcontent` margins are reset instead of being offset again
- the narrow-screen media query was adjusted to match the new layout rules

### 2. Tree/runtime corruption from stray non-Nodely tabs

Likely root cause: `NodeRuntimeManager.handleTabOpen()` was treating every non-owned tab open as a Nodely child node.

Fixed in:

- `gecko/overlay/browser/base/content/nodely/node-runtime-manager.mjs`
- `gecko/overlay/browser/base/content/nodely/chrome-state-controller.mjs`
- `tests/gecko/nodeRuntimeManager.test.ts`

What changed:

- only tabs with an opener/owner that maps back to a managed Nodely node are adopted into the graph
- unrelated non-Nodely tabs are ignored
- the parent node for adopted child tabs now comes from the opener/owner node id rather than “whatever is currently selected”

### 3. Browser-chrome test harness no longer hijacked by Nodely

The Nodely shell was being injected into the mochitest runner window, which is not what we want.

Fixed in:

- `gecko/overlay/browser/base/content/nodely/nodely-bootstrap.mjs`
- `gecko/overlay/browser/base/content/test/nodely/browser.toml`
- `gecko/overlay/browser/base/content/test/nodely/browser_nodely_shell.js`

What changed:

- added `nodely.shell.enabled` pref support
- browser-chrome test manifest now sets `nodely.shell.enabled=false` for the harness window
- Nodely tests explicitly push:
  - `nodely.shell.enabled=true`
  - `nodely.testing.enabled=true`
- result: the stock mochitest runner window stays stock; Nodely is only supposed to turn on in the test-opened browser window

## Gecko Runtime Verification Status

### What is now true

- the Nodely browser-chrome suite is discovered by `mach test`
- the earlier “unknown test / manifest not found” problem is fixed
- the Nodely shell no longer boots in the harness runner window during the latest test run
- the earlier 16K-page Linux arm64 assert was identified precisely

### The earlier 16K-page crash

Initial browser-chrome runs crashed very early with:

- `MOZ_RELEASE_ASSERT(PR_GetPageSize() == alignof(ReadOnlyPage))`

The relevant upstream Gecko source patch was applied directly in the sibling checkout:

- `/home/olegy/Documents/Projects/Nodely-Gecko/firefox-esr/js/xpconnect/src/xpcpublic.h`

Patch applied:

- Linux `aarch64` was added to the `kAutomationPageSize = 16384` branch

Important caveat:

- this source-level fix is in the Gecko checkout, but because this setup is still artifact-build based, the local browser-chrome test path was ultimately exercised using:
  - `MOZ_DISABLE_NONLOCAL_CONNECTIONS=0`
- That avoids the upstream ESR automation-path assert on this 16K-page Asahi machine without claiming the prebuilt artifact binary is fully rebuilt from that source patch.

### Current remaining browser-chrome failure

The latest `mach test` run no longer shows Nodely booting in the harness window, but the browser still crashes before the test body runs.

Current failure shape:

- browser starts
- Marionette session starts
- mochitest installs `special-powers` and `mochikit`
- harness executes the `mochitest-load` start script in the runner window
- browser dies with:
  - `Exiting due to channel error.`
  - `ERROR Automation Error: Received unexpected exception while running application`

Important detail:

- in the latest run there were no Nodely controller/runtime logs before the crash
- that strongly suggests the remaining failure is in the local stock browser-chrome harness path on this setup, not in the Nodely shell booting in the wrong window

## Current Best Known Commands

### Repo verification

From `/home/olegy/Documents/Projects/Node-Based Browser`:

```bash
PATH="$PWD/.tools/node/bin:$PATH" npm run lint
PATH="$PWD/.tools/node/bin:$PATH" npm test
```

Latest status:

- `npm run lint` passed
- `npm test` passed with 56 tests

### Sync overlay into Gecko checkout

From `/home/olegy/Documents/Projects/Node-Based Browser`:

```bash
PATH="$PWD/.tools/node/bin:$PATH" "$PWD/.tools/node/bin/node" gecko/scripts/sync-overlay.mjs --checkout-dir '/home/olegy/Documents/Projects/Nodely-Gecko/firefox-esr'
```

### Gecko build

From `/home/olegy/Documents/Projects/Nodely-Gecko/firefox-esr`:

```bash
PATH="/home/olegy/Documents/Projects/Node-Based Browser/.tools/node/bin:/home/olegy/.local/firefox-toolchain/bin:/home/olegy/.local/firefox-toolchain/root/usr/bin:$PATH" \
NODEJS="/home/olegy/Documents/Projects/Node-Based Browser/.tools/node/bin/node" \
MOZCONFIG=mozconfig.nodely \
/home/olegy/.local/firefox-toolchain/python/python/bin/python3.12 ./mach build faster
```

This passed.

### Targeted xpconnect compile

When touching xpconnect C++:

```bash
PATH="/home/olegy/Documents/Projects/Node-Based Browser/.tools/node/bin:/home/olegy/.local/firefox-toolchain/bin:/home/olegy/.local/firefox-toolchain/root/usr/bin:$PATH" \
NODEJS="/home/olegy/Documents/Projects/Node-Based Browser/.tools/node/bin/node" \
MOZCONFIG=mozconfig.nodely \
/home/olegy/.local/firefox-toolchain/python/python/bin/python3.12 ./mach build js/xpconnect/src
```

This also passed.

### Browser-chrome suite command currently being used

```bash
PATH="/home/olegy/Documents/Projects/Node-Based Browser/.tools/node/bin:/home/olegy/.local/firefox-toolchain/bin:/home/olegy/.local/firefox-toolchain/root/usr/bin:$PATH" \
NODEJS="/home/olegy/Documents/Projects/Node-Based Browser/.tools/node/bin/node" \
MOZCONFIG=mozconfig.nodely \
MOZ_HEADLESS=1 \
MOZ_DISABLE_NONLOCAL_CONNECTIONS=0 \
MINIDUMP_SAVE_PATH=/tmp \
/home/olegy/.local/firefox-toolchain/python/python/bin/python3.12 ./mach test browser/base/content/test/nodely/browser_nodely_shell.js
```

Before re-running it, clear stale test helpers:

```bash
pkill -f 'ssltunnel|pywebsocket_wrapper.py|obj-nodely/_tests/testing/mochitest|xpcshell.*server.js' || true
```

## What Still Needs To Be Done

### A. Finish the Gecko runtime-verification gap

The next smart move is:

1. Keep the current browser-chrome test harness work, but stop assuming the remaining failure is Nodely-specific.
2. Capture the post-`mochitest-load` crash more cleanly:
   - preserve the latest minidump/extra
   - or add a dedicated Gecko smoke-verification runner that does not depend on browser-chrome harness bootstrapping
3. If the stock harness remains unstable on this local artifact/Asahi setup, add a Nodely-owned smoke test as the reliable runtime verification path.

Suggested follow-up implementation:

- add a Node script such as `gecko/scripts/run-nodely-smoke.mjs`
- let the browser write a small JSON diagnostics file when `nodely.testing.smoke_file` is set
- seed a workspace/profile, launch the Nodely browser headless, wait for the diagnostics file, assert Nodely shell/runtime state, then exit

That would give real runtime verification even if local browser-chrome harness stays flaky on this machine.

### B. Finish Step 5 release hardening

This was not finished yet.

Recommended next work:

1. Add a Gecko patch queue inside the main repo.
   - Example:
     - `gecko/patches/0001-linux-aarch64-automation-page-size.patch`
     - `gecko/scripts/apply-patches.mjs`
2. Teach bootstrap/sync/release flows to apply those patches into the Gecko checkout automatically.
3. Add Gecko release docs.
   - Example:
     - `gecko/RELEASE.md`
4. Add Gecko-specific CI/workflow automation.
   - sync overlay
   - apply patch queue
   - build
   - run runtime verification
   - stage release artifacts
5. Add Gecko packaging/release staging scripts.
   - even if current machine only produces Linux artifacts
   - keep user-facing single-file release outputs per platform where applicable

Because these are packaging/release-facing changes, remember the repo root `AGENTS.md` rule:

- keep `gecko/release-artifacts/manifest.json` current for artifacts that were actually staged

### C. Visually verify the live Gecko parity fixes

The following were fixed in code but not fully visually signed off in this session:

- page surface no longer being pushed down/right by compounded margins
- tree/runtime behavior no longer being polluted by stray non-Nodely tab opens

A good next step is to run the Gecko build live and manually check:

1. page host in split mode
2. page host in focus mode
3. tree selection
4. ctrl/cmd-click background child behavior
5. tree drawer actions

## Packaging Status

The Gecko staging flow is the active user-facing packaging path now.

- staged artifacts belong in `gecko/release-artifacts/`
- auxiliary Gecko build outputs stay outside the staging directory
- do not claim platform or channel artifacts that were not actually produced

## Recommended Next Command Sequence

If resuming immediately, this is the recommended order:

1. Start from the main repo:

```bash
cd '/home/olegy/Documents/Projects/Node-Based Browser'
PATH="$PWD/.tools/node/bin:$PATH" npm run lint
PATH="$PWD/.tools/node/bin:$PATH" npm test
PATH="$PWD/.tools/node/bin:$PATH" "$PWD/.tools/node/bin/node" gecko/scripts/sync-overlay.mjs --checkout-dir '/home/olegy/Documents/Projects/Nodely-Gecko/firefox-esr'
```

2. Build the Gecko checkout:

```bash
cd '/home/olegy/Documents/Projects/Nodely-Gecko/firefox-esr'
PATH="/home/olegy/Documents/Projects/Node-Based Browser/.tools/node/bin:/home/olegy/.local/firefox-toolchain/bin:/home/olegy/.local/firefox-toolchain/root/usr/bin:$PATH" \
NODEJS="/home/olegy/Documents/Projects/Node-Based Browser/.tools/node/bin/node" \
MOZCONFIG=mozconfig.nodely \
/home/olegy/.local/firefox-toolchain/python/python/bin/python3.12 ./mach build faster
```

3. Either:

- continue investigating the stock browser-chrome harness crash with the current command above

or

- implement the dedicated `gecko/scripts/run-nodely-smoke.mjs` fallback verification path

4. After that, do the Step 5 release-hardening work:

- patch queue
- release docs
- CI workflow
- Gecko artifact staging

5. If packaging/release files change, return to the main repo and restage the affected Gecko artifact:

```bash
cd '/home/olegy/Documents/Projects/Node-Based Browser'
PATH="$PWD/.tools/node/bin:$PATH" npm run gecko:stage-release -- --checkout-dir '/home/olegy/Documents/Projects/Nodely-Gecko/firefox-esr' --platform linux --arch arm64 --channel local
```
