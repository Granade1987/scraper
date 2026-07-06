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

        // Zoek in alle tabs naar een tab met de target path (robuster dan query with pattern)
        const allTabs = await chrome.tabs.query({});
        let tab = allTabs.find(t => t && t.url && t.url.includes("bis_notifications")) || null;

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
        const tab = await ensureTargetPage();
        if (!tab) return;
        chrome.tabs.sendMessage(tab.id, { action: "scrape" }, (response) => {
            if (chrome.runtime.lastError) {
                // log gedetailleerde fout en tab info, probeer content script te injecteren en opnieuw te sturen
                const err = chrome.runtime.lastError;
                console.warn('No response from content script, attempting to inject...', err && err.message ? err.message : err);
                console.debug('Tab info:', tab);
                resultStatus.innerHTML = `🔧 Content script niet actief — probeer injectie... (${err && err.message ? err.message : 'unknown error'})`;
                resultStatus.className = "warning";

                // Probeer eerst content script te injecteren, maar als dat niet werkt gebruik executeScript met een inline functie
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content.js"]
                }, () => {
                    if (chrome.runtime.lastError) {
                        const execErr = chrome.runtime.lastError;
                        console.warn('Injectie content script mislukt, ga direct scrapen met executeScript()', execErr && execErr.message ? execErr.message : execErr);
                        // fallback: run scrape function directly in page
                        scrapeViaFunction(tab.id);
                        return;
                    }

                    // stuur opnieuw (indien injectie wel lukte)
                    chrome.tabs.sendMessage(tab.id, { action: "scrape" }, (resp2) => {
                        if (chrome.runtime.lastError) {
                            const secondErr = chrome.runtime.lastError;
                            console.warn('Geen antwoord na injectie, gebruik executeScript fallback', secondErr && secondErr.message ? secondErr.message : secondErr);
                            scrapeViaFunction(tab.id);
                            return;
                        }
                        handleScrapeResponse(resp2);
                    });
                });
                return;
            }

            handleScrapeResponse(response);

        });

        // fallback: function that scrapes the page directly (used when messaging fails)
        function scrapeViaFunction(tabId) {
            resultStatus.innerHTML = "🔧 Scrapen via fallback (directe pagina-evaluatie)...";
            resultStatus.className = "warning";

            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    try {
                        const table = document.querySelector('table');
                        if (!table) return [];
                        const rows = Array.from(table.querySelectorAll('tbody tr'));
                        const data = rows.map(row => {
                            const q = (sel) => {
                                const el = row.querySelector(sel);
                                return el ? el.innerText.trim() : null;
                            };
                            const id = q('td.column-id') || (row.querySelector('th') ? row.querySelector('th').innerText.trim() : null) || q('td:first-child');
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
                if (chrome.runtime.lastError) {
                    console.error('executeScript fallback failed', chrome.runtime.lastError);
                    resultStatus.innerHTML = `❌ Fallback scrapen mislukt: ${chrome.runtime.lastError && chrome.runtime.lastError.message ? chrome.runtime.lastError.message : 'unknown'}`;
                    resultStatus.className = 'error';
                    return;
                }

                const pageResult = injectionResults && injectionResults[0] && injectionResults[0].result ? injectionResults[0].result : null;
                if (!pageResult) {
                    resultStatus.innerHTML = 'ℹ️ Geen data gevonden met fallback.';
                    resultStatus.className = 'warning';
                    return;
                }
                if (pageResult.error) {
                    resultStatus.innerHTML = `❌ Fallback error: ${pageResult.error}`;
                    resultStatus.className = 'error';
                    return;
                }
                handleScrapeResponse({ data: pageResult });
            });
        }

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

            if (newItems.length > 0) {
                const latestId = parseNotificationId(newItems[0].id);
                if (latestId !== null) {
                    saveStoredLastId(latestId);
                }
            }

            const displayedCount = newItems.length;
            resultStatus.innerHTML = displayedCount > 0
                ? `✅ ${displayedCount} nieuwe meldingen gevonden na #${storedLastId ?? '-'}`
                : `ℹ️ Geen nieuwe meldingen na #${storedLastId ?? '-'}`;

            resultStatus.className = displayedCount > 0 ? "success" : "warning";

            newCount.innerText = displayedCount;
            // Toon alleen het numerieke ID zonder extra HTML/tekst
            let latestDisplay = "-";
            if (newItems.length > 0) {
                const parsed = parseNotificationId(newItems[0].id);
                latestDisplay = parsed !== null ? `#${parsed}` : String(newItems[0].id);
            } else if (storedLastId) {
                latestDisplay = `#${storedLastId}`;
            }
            lastId.innerText = latestDisplay;

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