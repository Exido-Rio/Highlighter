// Shadow DOM isolation for Overlay
let hostElement = null;
let shadowRoot = null;

// State flags
let currentText = "";
let currentRange = null;

function createShadowOverlay() {
    if (hostElement) return;

    hostElement = document.createElement("div");
    hostElement.id = "my-ext-root";
    // Fixed positioning covering the entire screen so absolute children are relative to top-left of viewport
    hostElement.style.all = "initial";
    hostElement.style.position = "fixed";
    hostElement.style.zIndex = "2147483647";
    hostElement.style.top = "0";
    hostElement.style.left = "0";
    hostElement.style.width = "100vw";
    hostElement.style.height = "100vh";
    hostElement.style.pointerEvents = "none"; // Pass through clicks to page under transparent overlay

    shadowRoot = hostElement.attachShadow({ mode: "open" });

    // Inject dedicated styling mapped into the Shadow Root
    const style = document.createElement("style");
    style.textContent = `
        .tooltip-container {
            position: absolute;
            background-color: #2b2b2b;
            color: #ffffff;
            border: none;
            padding: 8px 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 8px;
            pointer-events: auto; /* Re-enable so buttons are clickable */
            
            /* Slide-up / Fade-in Animation */
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .tooltip-container.visible {
            opacity: 1;
            transform: translateY(0);
        }

        .tooltip-label {
            color: #fff;
            margin-right: 4px;
            font-size: 13px;
        }

        .tooltip-btn {
            all: initial;
            font-family: inherit;
            font-size: 13px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 600;
            transition: background-color 0.2s;
        }

        .save-btn {
            background-color: #28a745;
            color: white;
        }
        .save-btn:hover { background-color: #218838; }

        .cancel-btn {
            background-color: #dc3545;
            color: white;
        }
        .cancel-btn:hover { background-color: #c82333; }
    `;

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip-container";
    tooltip.id = "tooltip";
    
    const label = document.createElement("span");
    label.className = "tooltip-label";
    label.textContent = "Save highlight?";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.className = "tooltip-btn save-btn";
    
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "tooltip-btn cancel-btn";

    tooltip.appendChild(label);
    tooltip.appendChild(saveBtn);
    tooltip.appendChild(cancelBtn);

    // Prevent mousedown on the tooltip from triggering selection clear
    tooltip.addEventListener("mousedown", (e) => e.preventDefault());

    saveBtn.addEventListener("click", () => handleSave());
    cancelBtn.addEventListener("click", () => handleCancel());

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(tooltip);
    document.body.appendChild(hostElement);
}

document.addEventListener("mouseup", (e) => {
    // Ignore if click happened inside our shadow DOM
    if (hostElement && e.composedPath().includes(hostElement)) return;
    
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && selection.rangeCount > 0) {
        currentText = text;
        currentRange = selection.getRangeAt(0);
        showOverlay(currentRange);
    } else {
        hideOverlay();
    }
});

document.addEventListener("mousedown", (e) => {
    if (hostElement && e.composedPath().includes(hostElement)) return;
    hideOverlay();
});

document.addEventListener("scroll", () => {
    hideOverlay(); // Scrolling invalidates viewport positions.
});

// Advanced UI Screen Positioner
function showOverlay(range) {
    if (!hostElement) createShadowOverlay();

    const tooltip = shadowRoot.getElementById("tooltip");
    
    // Read Dimensions from geometry engine on selection
    const rect = range.getBoundingClientRect();
    
    // We explicitly set display first so we can securely retrieve its pixel size before painting visible
    tooltip.style.display = "flex";
    
    // Read compiled dimensions
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Calculate exact center relative to the rectangle bounds
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    
    // Start with overlay sitting just *above* the selection
    const MARGIN = 8;
    let top = rect.top - tooltipRect.height - MARGIN;

    // Collision Detection: TOP (Too high on screen)
    if (top < 0) {
        // Flip to appear *below* the selection instead
        top = rect.bottom + MARGIN;
    }

    // Collision Detection: BOTTOM (if forced below, but selection touches very bottom edge)
    if (top + tooltipRect.height > window.innerHeight) {
        top = window.innerHeight - tooltipRect.height - MARGIN;
    }

    // Collision Detection: LEFT/RIGHT (Center shifts pushed off edge of monitor)
    if (left < 10) {
        left = 10;
    } else if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    // Trigger Slide-Up transition by running in next animation frame
    requestAnimationFrame(() => {
        tooltip.classList.add("visible");
    });
}

function hideOverlay() {
    if (!hostElement) return;
    const tooltip = shadowRoot.getElementById("tooltip");
    if (tooltip && tooltip.classList.contains("visible")) {
        tooltip.classList.remove("visible");
        
        // Wait for CSS fade-out animation then shove it out of frame
        setTimeout(() => {
             if(!tooltip.classList.contains("visible")) {
                 tooltip.style.left = "-9999px"; 
             }
        }, 200);
    }
}

function handleSave() {
    if (!currentText || !currentRange) return;

    // Isolate storage task to Chrome Service Worker Background
    chrome.runtime.sendMessage({
        type: "SAVE_HIGHLIGHT",
        payload: {
            text: currentText,
            url: window.location.href
        }
    }, (response) => {
        // Visual debug indicator hook if further changes made
        console.log("Overlay logic notified Service Worker storage complete:", response);
    });

    // Directly alter DOM visually to represent saved state
    const span = document.createElement("span");
    span.style.backgroundColor = "yellow";
    span.style.color = "black";
    
    try {
        currentRange.surroundContents(span);
    } catch (e) {
        console.warn("Could not wrap completely, complex selection.", e);
    }

    // Tear down
    hideOverlay();
    window.getSelection().removeAllRanges();
}

function handleCancel() {
    hideOverlay();
    window.getSelection().removeAllRanges();
}
