# Technical Architecture Document: Highlighter Extension

## 1. System Overview

The **Highlighter** Chrome extension utilizes the **Manifest V3** framework. The architecture is broken down into three decoupled, distinct subsystems that communicate via Chrome's native message passing API:
1. **The Content Script & UI Injector (`content.js` & `styles.css`)**: Listens for text selections on the host web page and dynamically renders the context overlay.
2. **The Background Service Worker (`background.js`)**: An ephemeral script responsible solely for securely handing payload data directly to the Chrome local storage instance.
3. **The Popup Interface (`popup.html` & `popup.js`)**: A sandboxed UI layer triggered by the user clicking the extension icon, managing the view state and OpenAI API integrations.

---

## 2. Key Architectural Decisions & Challenges Resolved

### A. The Shadow DOM Isolation Strategy
**The Problem**: Early implementations of the floating "Save" menu injected standard HTML `<button>` elements directly onto the webpage DOM. However, heavily styled sites (like GitHub or Reddit) have intense global CSS resets (e.g., `button { appearance: none; padding: 0 }`). This would immediately corrupt the extension's tooltip UI.

**The Solution**: We utilized the `.attachShadow({ mode: "open" })` API.
- By binding our extension's HTML elements and literal CSS styles into an isolated Shadow Root container, it effectively acts as a strict firewall. 
- *Why this specific architecture?* Global page styles cannot "bleed" into a shadow root, guaranteeing our overlay buttons remain pixel-perfect on every website on the internet.

### B. The Selection Bounding-Box "Geometry Engine"
**The Problem**: Determining exactly where to spawn the tooltip. Tying the tooltip to the raw X/Y coordinates of the `mouseup` event causes visual desync if the user scrolls, or places the tooltip oddly far away from the text if they highlight across a large paragraph.

**The Solution**: We engineered a custom positioning engine using `window.getSelection().getRangeAt(0).getBoundingClientRect()`.
- We physically measure the mathematical height, width, and positional boundaries of the highlighted text box in the DOM.
- We then algorithmically center the tooltip exactly over the horizontal midpoint of the selection, offsetting it by a few pixels on the Y-axis so it sits directly above the phrase.
- **Edge Collision Resilience**: We added bound clamp checks. If the highlighted string hits the absolute top of the viewport (and a standard tooltip would spawn out-of-bounds offscreen), the engine intelligently flips the Y-axis calculation, spawning the tooltip *below* the text instead.

### C. Background Service Worker (MV3 Standard)
**The Problem**: Content scripts are powerful but can be arbitrarily killed or suspended when moving between pages. Relying on them to run critical storage saves can occasionally cause race conditions or memory faults.

**The Solution**: We built a dedicated `background.js` Service Worker.
- *Why this decision?* Rather than `content.js` blindly digging into `chrome.storage.local`, it simply fires a `chrome.runtime.sendMessage` event with a payload. The background worker serves as a robust 'Backend' for the extension, receiving the event, timestamping it, and saving it.

### D. Pivoting Away from DOM Injection Highlighting (The `surroundContents` bug)
**The Problem**: The initial spec required visually painting the selected text Yellow as feedback. The standard way to achieve this is via `Range.surroundContents(span)`. However, modern webpages use incredibly complex DOM nesting (tables, grids, dynamic spans). If a user highlighted text that crossed over multiple `<div>` boundary lines, `surroundContents()` would fatally crash and fail to save the highlight because an HTML element cannot logically wrap half of a parent tag.

**The Solution**: We completely abandoned DOM alteration. The tooltip is now strictly a data-extraction layer that acts silently. Giving up the visual styling traded away minor aesthetic feedback in exchange for 100% bomb-proof reliability across any webpage structure imaginable.

---

## 3. OpenAI Integration & Security Trade-Offs

Currently, the extension uses `gpt-3.5-turbo` via direct fetch requests triggered natively in the Popup menu.

* **Decision**: We prompt the user to bring their own API key (BYOK) rather than hardcoding a developer key.
* **Why**: Client-side web extensions can easily be reverse-engineered by inspecting the network tab or source tree. Hardcoding an API key would result in it being immediately stolen and abused. Forcing the user to store their key into local storage guarantees the project remains entirely serverless, cheap, and secure from external bot scraping.
