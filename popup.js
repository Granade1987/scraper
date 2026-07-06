document.addEventListener("DOMContentLoaded", () => {

    const loginStatus = document.getElementById("loginStatus");
    const pageStatus = document.getElementById("pageStatus");
    const resultStatus = document.getElementById("resultStatus");

    const checkButton = document.getElementById("checkButton");
    const scrapeButton = document.getElementById("scrapeButton");
    const exportButton = document.getElementById("exportButton");

    const lastId = document.getElementById("lastId");
    const newCount = document.getElementById("newCount");

    let scrapedData = [];

    checkButton.addEventListener("click", checkPage);
    scrapeButton.addEventListener("click", scrapePage);
    exportButton.addEventListener("click", exportCSV);

    async function checkPage() {

        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (!tab) return false;

        if (tab.url.includes("/wp-admin")) {

            loginStatus.innerHTML = "🟢 Ingelogd";
            loginStatus.className = "success";

            pageStatus.innerHTML = "🟢 WordPress Admin gevonden";
            pageStatus.className = "success";

            scrapeButton.disabled = false;
            return true;

        } else {

            loginStatus.innerHTML = "🔴 Niet ingelogd of verkeerde pagina";
            loginStatus.className = "error";

            pageStatus.innerHTML = "🔴 Open eerst de WooCommerce admin";
            pageStatus.className = "error";

            scrapeButton.disabled = true;
            return false;

        }

    }

    async function scrapePage() {

        const pageValid = await checkPage();
        if (!pageValid) return;

        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        chrome.tabs.sendMessage(tab.id, {
            action: "scrape"
        }, (response) => {

            if (chrome.runtime.lastError) {

                resultStatus.innerHTML = "❌ Content script niet gevonden.";
                resultStatus.className = "error";
                return;

            }

            scrapedData = response.data;

            resultStatus.innerHTML =
                `✅ ${scrapedData.length} meldingen gevonden`;

            resultStatus.className = "success";

            newCount.innerText = scrapedData.length;

            if (scrapedData.length > 0) {

                lastId.innerText = scrapedData[0].id;

                exportButton.disabled = false;

            }

        });

    }

    function exportCSV() {

        if (scrapedData.length === 0) return;

        const columns = [
            "id",
            "status",
            "email",
            "product",
            "sku",
            "geregistreerd",
            "wachttijd"
        ];

        const escapeValue = (value) => {
            const str = String(value ?? "");
            const escaped = str.replace(/"/g, '""');
            return `"${escaped}"`;
        };

        const csvRows = [columns.join(",")];

        scrapedData.forEach(item => {
            const row = columns.map(col => escapeValue(item[col]));
            csvRows.push(row.join(","));
        });

        const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        if (chrome.downloads && chrome.downloads.download) {
            chrome.downloads.download({
                url: url,
                filename: "voorraadmeldingen.csv"
            }, () => {
                if (chrome.runtime.lastError) {
                    downloadFallback(url, "voorraadmeldingen.csv");
                }
            });
        } else {
            downloadFallback(url, "voorraadmeldingen.csv");
        }
    }

    function downloadFallback(url, filename) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

});