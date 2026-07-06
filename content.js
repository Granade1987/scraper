// content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action !== "scrape") {
        return;
    }

    const data = [];

    // Zoek de eerste tabel op de pagina
    const table = document.querySelector("table");

    if (!table) {
        sendResponse({
            data: [],
            error: "Geen tabel gevonden."
        });
        return true;
    }

    const rows = table.querySelectorAll("tbody tr");

    rows.forEach(row => {

        // Selecteer kolommen via class-names voor betere robuustheid
        const idCell = row.querySelector("td.column-id");
        const statusCell = row.querySelector("td.column-status");
        const userCell = row.querySelector("td.column-user");
        const productCell = row.querySelector("td.column-product");
        const skuCell = row.querySelector("td.column-sku");
        const dateCell = row.querySelector("td.column-date_subscribed");
        const waitingCell = row.querySelector("td.column-waiting_since");

        // Controleer of alle kolommen bestaan
        if (!idCell || !statusCell || !userCell || !productCell || !skuCell || !dateCell || !waitingCell) {
            return;
        }

        data.push({

            id: idCell.innerText.trim(),
            status: statusCell.innerText.trim(),
            email: userCell.innerText.trim(),
            product: productCell.innerText.trim(),
            sku: skuCell.innerText.trim(),
            geregistreerd: dateCell.innerText.trim(),
            wachttijd: waitingCell.innerText.trim()

        });

    });

    sendResponse({
        data: data
    });

    return true;

});