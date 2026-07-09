// content.js

console.log('Mikes Scraper: content.js geladen');

function _mikesScraper_collectTable() {
    const data = [];
    const table = document.querySelector("table");
    if (!table) return data;
    const rows = table.querySelectorAll("tbody tr");

    rows.forEach(row => {
        const idCell = row.querySelector("td.column-id");
        const statusCell = row.querySelector("td.column-status");
        const userCell = row.querySelector("td.column-user");
        const productCell = row.querySelector("td.column-product");
        const skuCell = row.querySelector("td.column-sku");
        const dateCell = row.querySelector("td.column-date_subscribed");
        const waitingCell = row.querySelector("td.column-waiting_since");

        if (!idCell) return; // at least require id

        data.push({
            id: idCell ? idCell.innerText.trim() : null,
            status: statusCell ? statusCell.innerText.trim() : '',
            email: userCell ? userCell.innerText.trim() : '',
            product: productCell ? productCell.innerText.trim() : '',
            sku: skuCell ? skuCell.innerText.trim() : '',
            geregistreerd: dateCell ? dateCell.innerText.trim() : '',
            wachttijd: waitingCell ? waitingCell.innerText.trim() : ''
        });
    });

    return data;
}

// Expose a function on window so popup can call it directly when content script is injected
try {
    window.__mikes_scraper_scrape = _mikesScraper_collectTable;
} catch (e) {}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.action !== "scrape") return;
        const result = _mikesScraper_collectTable();
        try { sendResponse({ data: result }); } catch (e) {}
        console.log('Mikes Scraper: scrape klaar, items=', result.length);
        return true;
    } catch (err) {
        console.error('Mikes Scraper: fout in onMessage', err);
        try { sendResponse({ data: [], error: String(err) }); } catch (e) {}
        return true;
    }
});