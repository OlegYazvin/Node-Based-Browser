# Next Steps

## Current Focus
- The Gecko shell takeover is in place, but launch-time selected-node restore is still not correct.
- On startup, stock startup/home behavior can still win over the selected node's target URL.

## Immediate Next Steps
1. Fix launch-time selected-page takeover.
   - Ensure the selected workspace node takes over the startup seed tab before stock home/session UI wins.
   - Prevent early metadata events from overwriting the workspace with `about:home` or `about:blank` before the intended node URL commits.
   - Confirm that a pre-seeded workspace with one root at `https://example.com/` reopens that page, not stock startup content.

2. Harden startup/profile behavior for Nodely-owned sessions.
   - Stop stock session restore and default startup surfaces from leaking into Nodely profiles.
   - Make Nodely the sole owner of startup tabs for its profile namespace.
   - Add the right Gecko-side pref/profile defaults so this is not dependent on manual profile cleanup.

3. Finish validating the first-root flow in the live Gecko build.
   - Verify `New Root` in the top bar opens the inline composer correctly.
   - Verify the centered `Start With A Root` action also opens the same composer path.
   - Verify submitting a URL or search term opens the result in the selected view mode.

4. Validate page hosting behavior after startup is stable.
   - In split mode, the graph should stay on the left and the selected page should render on the right.
   - In focus mode, the page should own the content area and the graph should not bleed through.
   - Favorites and trees drawers must remain above page content.

5. Add regression coverage for the Gecko startup/runtime path.
   - Add a parity checklist for empty workspace, first-root creation, saved-workspace restore, and selected-node page reopen.
   - Add focused tests around seed-tab reuse, foreign-tab suppression, and selected-node runtime restoration.
   - Keep using active-window screenshot validation until the Gecko automation path is stronger.

## Nice To Do Right After
- Convert any remaining fragile shell rendering paths to Gecko-safe DOM creation if they still depend on brittle HTML parsing.
- Add explicit startup diagnostics around node selection, seed-tab takeover, and first successful page commit.
- Reduce the number of moving pieces during launch so the runtime model is easier to reason about and test.
