# Gecko Parity Checklist

This checklist tracks the highest-risk Gecko-side behaviors while `Nodely Browser` is brought to full product parity.

## Startup And Empty Workspace

- [x] Empty workspace shows the custom Nodely shell, not stock browser chrome.
- [x] `New Root` opens the inline composer.
- [x] `Start With A Root` opens the same inline composer path.
- [x] Clean-profile startup with a pre-seeded workspace reopens the selected node page instead of stock startup content.

## Saved Workspace Restore

- [x] The selected node is restored as the active Nodely selection on launch.
- [x] The runtime manager reuses the startup seed tab for the first foreground node.
- [x] Extra startup/session tabs are pruned when Nodely takes over the window.
- [x] Live validation confirms the selected saved URL commits on launch without workspace state being overwritten by `about:home` / `about:blank`.

## Page Hosting

- [x] Split mode reserves the left rail for the graph surface and the page on the right.
- [x] Focus mode hides the graph and keeps the page in the content area.
- [ ] Live validation confirms the page host never bleeds canvas behind the page after startup.
- [ ] Live validation confirms `Favorites` and `Trees` drawers remain above page content.

## Runtime And Navigation

- [x] Normal link clicks stay in the current node.
- [x] `Ctrl/Cmd+T` creates a child node.
- [x] Foreign / popup tab opens can be adopted into a child node runtime.
- [x] Background child creation does not steal focus from the current node.
- [x] Transient startup URLs are filtered so they do not overwrite saved node URLs during restore.

## Regression Coverage

- [x] Unit tests cover seed-tab reuse.
- [x] Unit tests cover foreign-tab suppression.
- [x] Unit tests cover selected-node runtime restoration.
- [ ] Browser-level automation covers clean-profile first-root creation and saved-workspace reopen.
