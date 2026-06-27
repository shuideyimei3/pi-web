---
"@jmfederico/pi-web": patch
---

Initialize TUI theme for extension contexts so TUI plugins (e.g. pi-lsp-extension) that call `ctx.ui.theme.fg()` no longer crash with "Theme not initialized" in the web GUI. Also hide language labels on rendered assistant code blocks to prevent them from overlapping message text.
