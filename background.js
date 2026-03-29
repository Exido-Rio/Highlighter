chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SAVE_HIGHLIGHT") {
        const item = {
            id: Date.now().toString(),
            text: request.payload.text,
            url: sender.tab ? sender.tab.url : request.payload.url,
            date: new Date().toISOString(),
            summary: null
        };

        chrome.storage.local.get({ highlights: [] }, (result) => {
            const highlights = result.highlights;
            highlights.push(item);
            chrome.storage.local.set({ highlights }, () => {
                sendResponse({ success: true, item: item });
            });
        });
        
        // Return true to indicate we wish to send a response asynchronously
        return true;
    }
});
