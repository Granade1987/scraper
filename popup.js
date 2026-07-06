document.addEventListener("DOMContentLoaded", () => {

    const loginStatus = document.getElementById("loginStatus");
    const pageStatus = document.getElementById("pageStatus");
    const resultStatus = document.getElementById("resultStatus");

    const scrapeButton = document.getElementById("scrapeButton");
    const exportButton = document.getElementById("exportButton");

    const lastId = document.getElementById("lastId");
    const newCount = document.getElementById("newCount");

    let scrapedData = [];

    scrapeButton.addEventListener("click", scrapePage);
    exportButton.addEventListener("click", exportCSV);

    const targetPagePattern = "*://mikesjustformen.nl/wp-admin/admin.php?page=bis_notifications*";
    const targetPageUrl = "https://mikesjustformen.nl/wp-admin/admin.php?page=bis_notifications";

    async function ensureTargetPage() {
        loginStatus.innerHTML = "🔍 Zoeken naar de admin meldingenpagina...";
        loginStatus.className = "warning";
        pageStatus.innerHTML = "📄 Controleer of de pagina open is";
        pageStatus.className = "warning";

        const tabs = await chrome.tabs.query({ url: targetPagePattern });
        let tab = tabs && tabs.length ? tabs[0] : null;

        if (tab && tab.url && tab.url.includes("bis_notifications")) {
            if (tab.status !== "complete") {
                tab = await waitForTabLoad(tab.id);
            }
            loginStatus.innerHTML = "🟢 Admin pagina gevonden";
            loginStatus.className = "success";
            pageStatus.innerHTML = "🟢 Pagina is klaar om te scrapen";
            pageStatus.className = "success";
            return tab;
        }

        loginStatus.innerHTML = "🔄 Openen van de admin meldingenpagina...";
        loginStatus.className = "warning";
        pageStatus.innerHTML = "📄 Pagina wordt geopend in een tab";
        pageStatus.className = "warning";

        return new Promise((resolve) => {
            chrome.tabs.create({ url: targetPageUrl, active: false }, async (createdTab) => {
                if (chrome.runtime.lastError || !createdTab || !createdTab.id) {
                    loginStatus.innerHTML = "❌ Pagina kon niet worden geopend.";
                    loginStatus.className = "error";
                    resolve(null);
                    return;
                }

                const loadedTab = await waitForTabLoad(createdTab.id);
                if (!loadedTab) {
                    loginStatus.innerHTML = "❌ Pagina laden mislukt.";
                    loginStatus.className = "error";
                    resolve(null);
                    return;
                }

                loginStatus.innerHTML = "🟢 Pagina geladen";
                loginStatus.className = "success";
                pageStatus.innerHTML = "🟢 Start scrapen...";
                pageStatus.className = "success";
                resolve(loadedTab);
            });
        });
    }

    function waitForTabLoad(tabId) {
        return new Promise((resolve) => {
            const listener = (updatedTabId, changeInfo, changedTab) => {
                if (updatedTabId !== tabId) return;
                if (changeInfo.status === "complete" && changedTab.url && changedTab.url.includes("bis_notifications")) {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve(changedTab);
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
    }

    async function scrapePage() {
        const tab = await ensureTargetPage();
        if (!tab) return;

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