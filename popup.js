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
    exportButton.addEventListener("click", exportJSON);

    async function checkPage() {

        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (!tab) return;

        if (tab.url.includes("/wp-admin")) {

            loginStatus.innerHTML = "🟢 Ingelogd";
            loginStatus.className = "success";

            pageStatus.innerHTML = "🟢 WordPress Admin gevonden";
            pageStatus.className = "success";

            scrapeButton.disabled = false;

        } else {

            loginStatus.innerHTML = "🔴 Niet ingelogd of verkeerde pagina";
            loginStatus.className = "error";

            pageStatus.innerHTML = "🔴 Open eerst de WooCommerce admin";
            pageStatus.className = "error";

            scrapeButton.disabled = true;

        }

    }

    async function scrapePage() {

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

    function exportJSON() {

        if (scrapedData.length === 0) return;

        const blob = new Blob(
            [JSON.stringify(scrapedData, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);

        chrome.downloads.download({
            url: url,
            filename: "voorraadmeldingen.json"
        });

    }

});