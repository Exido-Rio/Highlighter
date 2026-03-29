document.addEventListener("DOMContentLoaded", () => {
    const listContainer = document.getElementById("highlights-list");
    const apiKeyInput = document.getElementById("api-key");
    const saveKeyBtn = document.getElementById("save-key-btn");
    const keyStatus = document.getElementById("key-status");

    const initialKeySection = document.getElementById("initial-key-section");
    const savedKeySection = document.getElementById("saved-key-section");
    const changeKeyBtn = document.getElementById("change-key-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");

    // Custom Modals & Toasts
    const toastContainer = document.getElementById("toast-container");
    const toastMessage = document.getElementById("toast-message");
    const modalOverlay = document.getElementById("custom-modal-overlay");
    const modalCancelBtn = document.getElementById("modal-cancel-btn");
    const modalConfirmBtn = document.getElementById("modal-confirm-btn");

    let toastTimeout;
    function showToast(message) {
        toastMessage.textContent = message;
        toastContainer.classList.remove("hidden");
        // small timeout to allow display:block to apply before animating class
        setTimeout(() => toastContainer.classList.add("show"), 10);
        
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastContainer.classList.remove("show");
            setTimeout(() => toastContainer.classList.add("hidden"), 300);
        }, 3000);
    }

    function updateKeyUI(hasKey) {
        if (hasKey) {
            initialKeySection.style.display = "none";
            savedKeySection.style.display = "flex";
        } else {
            initialKeySection.style.display = "flex";
            savedKeySection.style.display = "none";
        }
    }

    // Load API key from local storage when popup opens
    chrome.storage.local.get(["openaiApiKey"], (result) => {
        if (result.openaiApiKey) {
            apiKeyInput.value = result.openaiApiKey;
            updateKeyUI(true);
        } else {
            updateKeyUI(false);
        }
    });

    // Save API key
    saveKeyBtn.addEventListener("click", () => {
        const key = apiKeyInput.value.trim();
        if(!key) return; // ignore empty saves
        chrome.storage.local.set({ openaiApiKey: key }, () => {
            keyStatus.style.display = "inline";
            setTimeout(() => { 
                keyStatus.style.display = "none"; 
                updateKeyUI(true);
            }, 800);
        });
    });

    // Change API Key
    changeKeyBtn.addEventListener("click", () => {
        updateKeyUI(false);
        apiKeyInput.focus();
    });

    // Clear All Highlights via Custom Modal
    clearAllBtn.addEventListener("click", () => {
        modalOverlay.classList.remove("hidden");
    });

    modalCancelBtn.addEventListener("click", () => {
        modalOverlay.classList.add("hidden");
    });

    modalConfirmBtn.addEventListener("click", () => {
        chrome.storage.local.set({ highlights: [] }, () => {
            renderHighlights();
            modalOverlay.classList.add("hidden");
        });
    });

    // Helper function to escape HTML to prevent XSS attacks when displaying saved text
    function escapeHtml(unsafe) {
        if (!unsafe) return "";
        return unsafe.toString()
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // Load and render all saved highlights
    function renderHighlights() {
        chrome.storage.local.get({ highlights: [] }, (result) => {
            const highlights = result.highlights;
            // Sort new items first
            highlights.sort((a, b) => new Date(b.date) - new Date(a.date));
            listContainer.innerHTML = "";
            
            if (highlights.length === 0) {
                listContainer.innerHTML = "<p style='text-align:center; color:#6a737d;'>No highlights saved yet. Select text on a page to get started!</p>";
                return;
            }

            highlights.forEach((item) => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "highlight-item";
                
                // Format the saved date
                let dateStr = item.date;
                try {
                    dateStr = new Date(item.date).toLocaleString();
                } catch(e) {}

                itemDiv.innerHTML = `
                    <span class="highlight-text">"${escapeHtml(item.text)}"</span>
                    <div class="highlight-meta">
                        <strong>Source:</strong> <a href="${item.url}" target="_blank">${new URL(item.url).hostname}</a><br>
                        <strong>Saved:</strong> ${dateStr}
                    </div>
                    <div class="highlight-actions">
                        ${item.summary ? 
                            `<button class="action-btn summarize-btn" style="background: #e1e4e8; color: #6a737d; border-color: transparent; cursor: default;" disabled>Summarized</button>` : 
                            `<button class="action-btn summarize-btn" data-id="${item.id}">Summarize</button>`
                        }
                        <button class="action-btn delete-btn" data-id="${item.id}">Delete</button>
                    </div>
                    <div class="summary-box" style="display: ${item.summary ? 'block' : 'none'};">
                        <strong>Summary:</strong> <span class="summary-text">${escapeHtml(item.summary || '')}</span>
                    </div>
                `;
                
                listContainer.appendChild(itemDiv);
            });

            // Attach event listeners for delete buttons
            document.querySelectorAll(".delete-btn").forEach(btn => {
                btn.addEventListener("click", handleDelete);
            });
            // Attach event listeners for summarize buttons
            document.querySelectorAll(".summarize-btn").forEach(btn => {
                btn.addEventListener("click", handleSummarize);
            });
        });
    }

    // Initial render call on load
    renderHighlights();

    // Delete a highlight
    function handleDelete(e) {
        const id = e.target.getAttribute("data-id");
        chrome.storage.local.get({ highlights: [] }, (result) => {
            const updated = result.highlights.filter(h => h.id !== id);
            chrome.storage.local.set({ highlights: updated }, () => {
                renderHighlights();
            });
        });
    }

    // Summarize a highlight using OpenAI
    async function handleSummarize(e) {
        const id = e.target.getAttribute("data-id");
        const btn = e.target;
        
        chrome.storage.local.get(["highlights", "openaiApiKey"], async (result) => {
            const { highlights, openaiApiKey } = result;
            if (!openaiApiKey) {
                showToast("Please save your OpenAI API Key first.");
                return;
            }

            const itemIndex = highlights.findIndex(h => h.id === id);
            if (itemIndex === -1) return;

            const textToSummarize = highlights[itemIndex].text;
            
            // Adjust button UI
            btn.textContent = "Summarizing...";
            btn.disabled = true;

            try {
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${openaiApiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [
                            {"role": "system", "content": "You are a helpful assistant that summarizes text concisely."},
                            {"role": "user", "content": `Please summarize the following text:\n\n${textToSummarize}`}
                        ]
                    })
                });

                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error.message);
                }

                if (!data.choices || data.choices.length === 0) {
                    throw new Error("No response choices returned from API.");
                }

                const summary = data.choices[0].message.content.trim();

                // Save summary into our storage record
                highlights[itemIndex].summary = summary;
                chrome.storage.local.set({ highlights }, () => {
                    renderHighlights();
                });

            } catch (error) {
                console.error("Summarize error", error);
                showToast("API Error: " + error.message);
                btn.textContent = "Summarize";
                btn.disabled = false;
            }
        });
    }
});
