document.addEventListener("DOMContentLoaded", () => {

    const loginStatus = document.getElementById("loginStatus");
    const pageStatus = document.getElementById("pageStatus");
    const resultStatus = document.getElementById("resultStatus");

    const scrapeButton = document.getElementById("scrapeButton");
    const exportButton = document.getElementById("exportButton");

    const lastId = document.getElementById("lastId");
    const newCount = document.getElementById("newCount");
    const startIdInput = document.getElementById("startIdInput");
    const setStartIdButton = document.getElementById("setStartIdButton");
    const resetStartIdButton = document.getElementById("resetStartIdButton");

    let scrapedData = [];
    let storedLastId = null;

    const storedIdStatus = document.getElementById("storedIdStatus");

    scrapeButton.addEventListener("click", scrapePage);
    exportButton.addEventListener("click", exportCSV);
    setStartIdButton.addEventListener("click", () => {
        const raw = (startIdInput.value || "").toString().trim();
        if (raw === "") {
            saveStoredLastId(null);
            resultStatus.innerText = "ℹ️ Start-ID gewist, alle meldingen vanaf nu worden als nieuw beschouwd";
            resultStatus.className = "warning";
            return;
        }

        const n = parseInt(raw, 10);
        if (Number.isNaN(n) || n < 0) {
            resultStatus.innerText = "⚠️ Ongeldig nummer ingevoerd";
            resultStatus.className = "error";
            return;
        }

        saveStoredLastId(n);
        resultStatus.innerText = `✅ Start-ID ingesteld op #${n}`;
        resultStatus.className = "success";
    });

    if (resetStartIdButton) {
        resetStartIdButton.addEventListener("click", () => {
            const ok = confirm("Weet je zeker dat je de opgeslagen Start‑ID wilt wissen?");
            if (!ok) return;
            saveStoredLastId(null);
            if (startIdInput) startIdInput.value = "";
            resultStatus.innerText = "✅ Start‑ID gewist";
            resultStatus.className = "success";
            exportButton.disabled = true;
        });
    }

    loadStoredLastId();

    function loadStoredLastId() {
        chrome.storage.local.get({ lastSeenId: null }, (result) => {
            storedLastId = result.lastSeenId;
            updateStoredIdStatus();
        });
    }

    function saveStoredLastId(id) {
        storedLastId = id;
        chrome.storage.local.set({ lastSeenId: id });
        updateStoredIdStatus();
    }

    function updateStoredIdStatus() {
        storedIdStatus.innerText = storedLastId
            ? `📌 Laatste opgeslagen melding: #${storedLastId}`
            : `📌 Laatste opgeslagen melding: -`;
    }

    function parseNotificationId(id) {
        const match = String(id).match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    const targetPagePattern = "*://mikesjustformen.nl/wp-admin/admin.php?page=bis_notifications*";
    const targetPageUrl = "https://mikesjustformen.nl/wp-admin/admin.php?page=bis_notifications";

    async function ensureTargetPage() {
        loginStatus.innerHTML = "🔍 Zoeken naar de admin meldingenpagina...";
        loginStatus.className = "warning";
        pageStatus.innerHTML = "📄 Controleer of de pagina open is";
        pageStatus.className = "warning";

        const allTabs = await chrome.tabs.query({});
        let tab = allTabs.find(t => t && t.url && t.url.includes("bis_notifications")) || null;

        if (tab && tab.url && tab.url.includes("bis_notifications")) {
            if (tab.status !== "complete") {
                tab = await waitForTabLoad(tab.id);
            }

            loginStatus.innerHTML = "🔄 Vernieuwen van de meldingenpagina...";
            loginStatus.className = "warning";
            pageStatus.innerHTML = "📄 Pagina wordt ververst in de achtergrond";
            pageStatus.className = "warning";

            const refreshedTab = await refreshTargetTab(tab.id);
            if (!refreshedTab) {
                loginStatus.innerHTML = "❌ Pagina vernieuwen mislukt.";
                loginStatus.className = "error";
                return null;
            }

            loginStatus.innerHTML = "🟢 Admin pagina gevonden";
            loginStatus.className = "success";
            pageStatus.innerHTML = "🟢 Pagina is ververst en klaar om te scrapen";
            pageStatus.className = "success";
            return { tab: refreshedTab, temporary: false };
        }

        loginStatus.innerHTML = "🔄 Openen van de admin meldingenpagina in de achtergrond...";
        loginStatus.className = "warning";
        pageStatus.innerHTML = "📄 Tijdelijke achtergrondtab wordt gebruikt";
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

                loginStatus.innerHTML = "🔄 Vernieuwen van de achtergrondtab...";
                loginStatus.className = "warning";
                pageStatus.innerHTML = "📄 Achtergrondtab wordt ververst";
                pageStatus.className = "warning";

                const refreshedTab = await refreshTargetTab(loadedTab.id);
                if (!refreshedTab) {
                    loginStatus.innerHTML = "❌ Pagina vernieuwen mislukt.";
                    loginStatus.className = "error";
                    resolve(null);
                    return;
                }

                loginStatus.innerHTML = "🟢 Achtergrondtab geladen";
                loginStatus.className = "success";
                pageStatus.innerHTML = "🟢 Start scrapen...";
                pageStatus.className = "success";
                resolve({ tab: refreshedTab, temporary: true });
            });
        });
    }

    function refreshTargetTab(tabId) {
        return new Promise((resolve) => {
            chrome.tabs.reload(tabId, { bypassCache: true }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Tab reload failed", chrome.runtime.lastError);
                    resolve(null);
                    return;
                }

                waitForTabLoad(tabId).then(resolve).catch(() => resolve(null));
            });
        });
    }

    function waitForTabLoad(tabId) {
        return new Promise((resolve) => {
            // First check current tab status
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError) {
                    // can't get tab, wait for update events as fallback
                    const listener = (updatedTabId, changeInfo, changedTab) => {
                        if (updatedTabId !== tabId) return;
                        if (changeInfo.status === "complete" && changedTab.url && changedTab.url.includes("bis_notifications")) {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve(changedTab);
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                    return;
                }

                if (tab && tab.status === "complete" && tab.url && tab.url.includes("bis_notifications")) {
                    resolve(tab);
                    return;
                }

                const listener = (updatedTabId, changeInfo, changedTab) => {
                    if (updatedTabId !== tabId) return;
                    if (changeInfo.status === "complete" && changedTab.url && changedTab.url.includes("bis_notifications")) {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve(changedTab);
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
        });
    }

    async function scrapePage() {
        const target = await ensureTargetPage();
        if (!target || !target.tab) return;

        const { tab, temporary: temporaryTab } = target;

        const closeTemporaryTab = () => {
            if (!temporaryTab || !tab || !tab.id) return;
            chrome.tabs.remove(tab.id, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Temporary tab cleanup failed", chrome.runtime.lastError);
                }
            });
        };

        // Primary scraping method: execute a function in the page context to avoid messaging errors
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                try {
                    // If content script exposed a function, call it
                    if (window.__mikes_scraper_scrape && typeof window.__mikes_scraper_scrape === 'function') {
                        try { return window.__mikes_scraper_scrape(); } catch (e) {}
                    }

                    const table = document.querySelector('table');
                    if (!table) return [];
                    const rows = Array.from(table.querySelectorAll('tbody tr'));
                    const data = rows.map(row => {
                        const q = (sel) => {
                            const el = row.querySelector(sel);
                            return el ? el.innerText.trim() : null;
                        };
                        let id = q('td.column-id') || (row.querySelector('th') ? row.querySelector('th').innerText.trim() : null) || q('td:first-child');
                        // Clean action labels like "Bewerk" and "Verwijder" from the id cell.
                        if (id) {
                            try {
                                const s = String(id);
                                const m = s.match(/(\d+)/);
                                if (m && m[1]) {
                                    // keep only the numeric id (e.g. "1125")
                                    id = m[1];
                                } else {
                                    // fallback: remove known labels and pipes
                                    id = s.replace(/\b(Bewerk|Verwijder)\b/gi, '').replace(/\|/g, ' ').trim();
                                }
                            } catch (e) {}
                        }
                        const status = q('td.column-status') || q('td.status') || '';
                        const email = q('td.column-email') || q('td.email') || '';
                        const product = q('td.column-product') || q('td.product') || '';
                        const sku = q('td.column-sku') || q('td.sku') || '';
                        const geregistreerd = q('td.column-geregistreerd') || q('td.column-registered') || q('td.registered') || '';
                        const wachttijd = q('td.column-wachttijd') || q('td.column-wait') || '';
                        return { id, status, email, product, sku, geregistreerd, wachttijd };
                    });
                    return data;
                } catch (e) {
                    return { error: String(e) };
                }
            }
        }, (injectionResults) => {
            if (temporaryTab) {
                closeTemporaryTab();
            }

            if (chrome.runtime.lastError) {
                console.error('executeScript failed', chrome.runtime.lastError);
                resultStatus.innerHTML = `❌ Scrapen mislukt: ${chrome.runtime.lastError && chrome.runtime.lastError.message ? chrome.runtime.lastError.message : 'unknown'}`;
                resultStatus.className = 'error';
                return;
            }

            const pageResult = injectionResults && injectionResults[0] && injectionResults[0].result ? injectionResults[0].result : null;
            if (!pageResult) {
                resultStatus.innerHTML = 'ℹ️ Geen data gevonden op pagina.';
                resultStatus.className = 'warning';
                scrapedData = [];
                exportButton.disabled = true;
                return;
            }
            if (pageResult.error) {
                resultStatus.innerHTML = `❌ Fout tijdens scrapen: ${pageResult.error}`;
                resultStatus.className = 'error';
                return;
            }

            handleScrapeResponse({ data: pageResult });
        });

        function handleScrapeResponse(response) {
            if (!response || !response.data) {
                resultStatus.innerHTML = "ℹ️ Geen data ontvangen van content script.";
                resultStatus.className = "warning";
                scrapedData = [];
                exportButton.disabled = true;
                return;
            }

            const allData = response.data || [];
            const sortedData = allData.slice().sort((a, b) => {
                const aId = parseNotificationId(a.id) ?? 0;
                const bId = parseNotificationId(b.id) ?? 0;
                return bId - aId;
            });

            const newItems = sortedData.filter(item => {
                const itemId = parseNotificationId(item.id);
                // Only include items strictly after the stored last ID (exclusive)
                return itemId !== null && (storedLastId === null || itemId > storedLastId);
            });

            scrapedData = newItems;

            const displayedCount = newItems.length;
            resultStatus.innerHTML = displayedCount > 0
                ? `✅ ${displayedCount} nieuwe meldingen gevonden na #${storedLastId ?? '-'}`
                : `ℹ️ Geen nieuwe meldingen na #${storedLastId ?? '-'}`;

            resultStatus.className = displayedCount > 0 ? "success" : "warning";

            newCount.innerText = displayedCount;
            // Toon alleen het numerieke ID zonder extra HTML/tekst
            let latestDisplay = "-";
            let highestId = null;
            if (newItems.length > 0) {
                const parsed = parseNotificationId(newItems[0].id);
                latestDisplay = parsed !== null ? `#${parsed}` : String(newItems[0].id);
                highestId = parsed;
            } else if (storedLastId) {
                latestDisplay = `#${storedLastId}`;
            }
            lastId.innerText = latestDisplay;

            // Bewaar automatisch het hoogste gevonden ID als opgeslagen ID
            if (highestId !== null) {
                saveStoredLastId(highestId);
            }

            exportButton.disabled = displayedCount === 0;
        }

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

                // Converteer CSV naar tekst
                const csvText = csvRows.join("\r\n");

                // Helper om HTML-veilig te maken
                const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, '&quot;');

                // Bouw rijen voor de HTML-tabel
                const tableRows = scrapedData.map(item => {
                    return '<tr>' + columns.map(col => {
                        const val = (item[col] === null || item[col] === undefined) ? '' : String(item[col]);
                        // show id as #<number> when available
                        const display = col === 'id' && val !== '' ? '#' + val : val;
                        return `<td>${escapeHtml(display)}</td>`;
                    }).join('') + '</tr>';
                }).join('');

                // Volledige HTML-pagina die in een nieuw tabblad wordt geopend
                const html = `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Voorraadmeldingen</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
        body{font-family: system-ui,Segoe UI,Roboto,Arial;margin:12px}
        .controls{margin-bottom:8px}
        button{margin-right:8px;padding:6px 10px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ddd;padding:6px;text-align:left}
        th{background:#f7f7f7;position:sticky;top:0}
        tbody tr:nth-child(odd){background:#fbfbfb}
    </style>
</head>
<body>
    <div class="controls">
        <button id="downloadBtn">Download CSV</button>
        <button id="copyBtn">Kopieer CSV</button>
    </div>
    <div style="overflow:auto;max-height:80vh;">
        <table>
            <thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
    </div>
    <script>
        const csvText = ${JSON.stringify(csvText)};
        document.getElementById('downloadBtn').addEventListener('click', () => {
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'voorraadmeldingen.csv'; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        });
        document.getElementById('copyBtn').addEventListener('click', () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(csvText).then(() => alert('CSV gekopieerd naar klembord'))
                    .catch(() => alert('Kopiëren mislukt'));
            } else {
                alert('Klembord-API niet beschikbaar in deze context');
            }
        });
    </script>
</body>
</html>`;

                const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
                chrome.tabs.create({ url: dataUrl });
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