import { loadCategories } from "../categories.js";
import { formatMoney } from "../currency.js";
import {
    addProductToReceipt,
    applyDiscount,
    applySurcharge,
    buildReceiptPrinterText,
    calculateReceipt,
    createReceipt,
    getAvailablePosProducts,
    holdReceipt,
    loadCashRegisters,
    loadReceipts,
    payReceipt,
    printReceiptHtml,
    refundReceipt,
    removeReceiptItem,
    reopenReceipt,
    updateReceiptItem,
} from "../pos.js";
import {
    copyReceiptText,
    getHoinPrinterStatus,
    isIosDevice,
    loadHoinPrinterSettings,
    openHoinPrinterAppStore,
    printTextToHoinBluetooth,
    saveHoinPrinterSettings,
    selectHoinPrinter,
    shareReceiptForIos,
} from "../bluetoothPrinter.js";
import { loadProducts } from "../products.js";

let currentCompany = null;
let currentUser = null;
let activePosCategoryId = "";
let activeReceipt = null;
let helpers = {};
let isBound = false;

export function initPosPage(context) {
    currentCompany = context.company;
    currentUser = context.user;
    helpers = {
        showToast: context.showToast,
        formatDate: context.formatDate,
        escapeHtml: context.escapeHtml,
    };

    bindPosEvents();
    initPos();
}

function bindPosEvents() {
    if (isBound) {
        return;
    }

    document.getElementById("newReceiptButton").addEventListener("click", createNewPosReceipt);
    document.getElementById("posRegisterSelect").addEventListener("change", createNewPosReceipt);
    document.getElementById("posSearch").addEventListener("input", renderPosProducts);
    document.getElementById("holdReceiptButton").addEventListener("click", holdActiveReceipt);
    document.getElementById("showHeldReceiptsButton").addEventListener("click", () => showReceiptList("held"));
    document.getElementById("showReceiptHistoryButton").addEventListener("click", () => showReceiptList("paid"));
    document.getElementById("printReceiptButton").addEventListener("click", printActiveReceipt);
    document.getElementById("receiptDiscount").addEventListener("change", updateReceiptAdjustments);
    document.getElementById("receiptSurcharge").addEventListener("change", updateReceiptAdjustments);
    document.querySelectorAll("[data-pay-type]").forEach((button) => {
        button.addEventListener("click", () => payActiveReceipt(button.dataset.payType));
    });
    document.querySelectorAll("[data-close-pos-modal]").forEach((item) => {
        item.addEventListener("click", closePosModal);
    });

    isBound = true;
}

function initPos() {
    const registers = loadCashRegisters(currentCompany.id);
    const registerSelect = document.getElementById("posRegisterSelect");
    const cashierSelect = document.getElementById("posCashierSelect");
    const openReceipts = loadReceipts(currentCompany.id, "open");

    registerSelect.innerHTML = registers.map((register) => (
        `<option value="${register.id}">${helpers.escapeHtml(register.name)}</option>`
    )).join("");
    cashierSelect.innerHTML = `<option value="${currentUser.id}">${helpers.escapeHtml(currentUser.username)}</option>`;
    activeReceipt = openReceipts[0] || createReceipt(currentCompany.id, registers[0].id, currentUser.id);
    renderPos();
}

function createNewPosReceipt() {
    activeReceipt = createReceipt(
        currentCompany.id,
        document.getElementById("posRegisterSelect").value,
        currentUser.id,
    );
    renderPos();
}

function renderPos() {
    renderReceiptTabs();
    renderPosCategories();
    renderPosProducts();
    renderActiveReceipt();
}

function renderReceiptTabs() {
    const receipts = loadReceipts(currentCompany.id).filter((receipt) => ["open", "held"].includes(receipt.status));
    document.getElementById("receiptTabs").innerHTML = receipts.map((receipt) => `
        <button class="${Number(activeReceipt?.id) === Number(receipt.id) ? "is-active" : ""}" type="button" data-receipt-id="${receipt.id}">
            ${receipt.number} ${receipt.status === "held" ? "• отложен" : ""}
        </button>
    `).join("");

    document.querySelectorAll("[data-receipt-id]").forEach((button) => {
        button.addEventListener("click", () => {
            activeReceipt = loadReceipts(currentCompany.id).find((receipt) => Number(receipt.id) === Number(button.dataset.receiptId));
            if (activeReceipt?.status === "held") {
                activeReceipt = reopenReceipt(activeReceipt);
            }
            renderPos();
        });
    });
}

function renderPosCategories() {
    const categories = loadCategories(currentCompany.id).filter((category) => category.active);
    document.getElementById("posCategories").innerHTML = `
        <button class="${activePosCategoryId === "" ? "is-active" : ""}" type="button" data-pos-category="">Все</button>
        ${categories.map((category) => `
            <button class="${Number(activePosCategoryId) === Number(category.id) ? "is-active" : ""}" type="button" data-pos-category="${category.id}">
                <span style="background:${category.color}">${helpers.escapeHtml(category.icon)}</span>${helpers.escapeHtml(category.name)}
            </button>
        `).join("")}
    `;

    document.querySelectorAll("[data-pos-category]").forEach((button) => {
        button.addEventListener("click", () => {
            activePosCategoryId = button.dataset.posCategory;
            renderPosCategories();
            renderPosProducts();
        });
    });
}

function renderPosProducts() {
    const query = document.getElementById("posSearch").value.trim().toLowerCase();
    const products = getAvailablePosProducts(currentCompany.id).filter((product) => {
        const matchesCategory = !activePosCategoryId || Number(product.categoryId) === Number(activePosCategoryId);
        const matchesQuery = !query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query);
        return matchesCategory && matchesQuery;
    });

    document.getElementById("posProducts").innerHTML = products.length ? products.map((product) => `
        <button class="pos-product-card" type="button" data-pos-product-id="${product.id}">
            <span>${product.images?.[0] ? `<img src="${product.images[0]}" alt="">` : "🍽"}</span>
            <strong>${helpers.escapeHtml(product.name)}</strong>
            <small>${helpers.escapeHtml(product.sku)}</small>
            <b>${formatMoney(product.price, currentCompany.settings.currency)}</b>
        </button>
    `).join("") : `
        <div class="empty-state">
            <h3>Нет товаров для кассы</h3>
            <p>Добавьте товары в разделе Меню и включите отображение в POS.</p>
        </div>
    `;

    document.querySelectorAll("[data-pos-product-id]").forEach((button) => {
        button.addEventListener("click", () => addProductToActiveReceipt(button.dataset.posProductId));
    });
}

function addProductToActiveReceipt(productId) {
    const product = loadProducts(currentCompany.id).find((item) => Number(item.id) === Number(productId));

    if (!product || !activeReceipt) {
        return;
    }

    activeReceipt = addProductToReceipt(activeReceipt, product);
    renderPos();
}

function renderActiveReceipt() {
    if (!activeReceipt) {
        return;
    }

    activeReceipt = calculateReceipt(activeReceipt);
    document.getElementById("activeReceiptNumber").textContent = activeReceipt.number;
    document.getElementById("receiptDiscount").value = getReceiptDiscountPercent(activeReceipt);
    document.getElementById("receiptSurcharge").value = activeReceipt.surcharge || 0;
    document.getElementById("receiptSubtotal").textContent = formatMoney(activeReceipt.subtotal, currentCompany.settings.currency);
    document.getElementById("receiptTotal").textContent = formatMoney(activeReceipt.total, currentCompany.settings.currency);
    document.getElementById("receiptItems").innerHTML = activeReceipt.items.length ? activeReceipt.items.map((item) => `
        <article class="receipt-item">
            <div>
                <strong>${helpers.escapeHtml(item.name)}</strong>
                <small>${helpers.escapeHtml(item.comment || "Без комментария")}</small>
                ${item.modifiers.length ? `<small>${item.modifiers.map((modifier) => helpers.escapeHtml(modifier.name)).join(", ")}</small>` : ""}
            </div>
            <div class="receipt-item__controls">
                <button type="button" data-receipt-action="minus" data-item-id="${item.id}">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-receipt-action="plus" data-item-id="${item.id}">+</button>
            </div>
            <strong>${formatMoney(item.total, currentCompany.settings.currency)}</strong>
            <button type="button" data-receipt-action="comment" data-item-id="${item.id}">Комментарий</button>
            <button type="button" data-receipt-action="modifier" data-item-id="${item.id}">Модификатор</button>
            <button type="button" data-receipt-action="remove" data-item-id="${item.id}">×</button>
        </article>
    `).join("") : "<p class=\"empty-check\">Добавьте товары в чек.</p>";

    document.querySelectorAll("[data-receipt-action]").forEach((button) => {
        button.addEventListener("click", () => handleReceiptItemAction(button.dataset.receiptAction, button.dataset.itemId));
    });
}

function handleReceiptItemAction(action, itemId) {
    const item = activeReceipt.items.find((receiptItem) => Number(receiptItem.id) === Number(itemId));

    if (!item) {
        return;
    }

    if (action === "plus") {
        activeReceipt = updateReceiptItem(activeReceipt, itemId, { quantity: item.quantity + 1 });
    }

    if (action === "minus") {
        activeReceipt = updateReceiptItem(activeReceipt, itemId, { quantity: Math.max(1, item.quantity - 1) });
    }

    if (action === "remove") {
        activeReceipt = removeReceiptItem(activeReceipt, itemId);
    }

    if (action === "comment") {
        const comment = window.prompt("Комментарий к позиции", item.comment || "");
        activeReceipt = updateReceiptItem(activeReceipt, itemId, { comment: comment || "" });
    }

    if (action === "modifier") {
        const name = window.prompt("Модификатор", "Добавка");
        const price = window.prompt("Цена модификатора", "0");
        if (name) {
            activeReceipt = updateReceiptItem(activeReceipt, itemId, {
                modifiers: [...item.modifiers, { id: Date.now(), name, price: Number(price || 0) }],
            });
        }
    }

    renderPos();
}

function updateReceiptAdjustments() {
    if (!activeReceipt) {
        return;
    }

    const discountPercent = Math.min(100, Math.max(0, Number(document.getElementById("receiptDiscount").value || 0)));
    const discountAmount = Math.round((Number(activeReceipt.subtotal || 0) * discountPercent / 100) * 100) / 100;
    activeReceipt = applyDiscount(activeReceipt, discountAmount);
    activeReceipt = applySurcharge(activeReceipt, document.getElementById("receiptSurcharge").value);
    renderActiveReceipt();
}

function getReceiptDiscountPercent(receipt) {
    const subtotal = Number(receipt.subtotal || 0);

    if (!subtotal) {
        return 0;
    }

    return Math.round((Number(receipt.discount || 0) / subtotal) * 10000) / 100;
}

function holdActiveReceipt() {
    if (!activeReceipt || !activeReceipt.items.length) {
        helpers.showToast("Нельзя отложить пустой чек");
        return;
    }

    activeReceipt = holdReceipt(activeReceipt);
    activeReceipt = createReceipt(currentCompany.id, document.getElementById("posRegisterSelect").value, currentUser.id);
    helpers.showToast("Чек отложен");
    renderPos();
}

async function payActiveReceipt(type) {
    if (!activeReceipt || !activeReceipt.items.length) {
        helpers.showToast("Чек пустой");
        return;
    }

    const calculatedReceipt = calculateReceipt(activeReceipt);
    let paidReceipt = null;

    if (type === "mixed") {
        const mixedPayment = await requestMixedPayment(calculatedReceipt.total);
        if (!mixedPayment) {
            return;
        }
        const { cash, card } = mixedPayment;
        paidReceipt = payReceipt(calculatedReceipt, "mixed", { cash, card });
    } else {
        paidReceipt = payReceipt(calculatedReceipt, type);
    }

    if (!paidReceipt) {
        helpers.showToast("Сумма оплаты меньше итога");
        return;
    }

    activeReceipt = createReceipt(currentCompany.id, document.getElementById("posRegisterSelect").value, currentUser.id);
    helpers.showToast("Продажа оформлена");
    showPrintPreview(paidReceipt);
    renderPos();
}

function requestMixedPayment(total) {
    return new Promise((resolve) => {
        document.getElementById("posModalTitle").textContent = "Смешанная оплата";
        document.getElementById("posModalBody").innerHTML = `
            <form class="pos-payment-form" id="mixedPaymentForm">
                <div class="payment-total-card">
                    <span>Итого к оплате</span>
                    <strong>${formatMoney(total, currentCompany.settings.currency)}</strong>
                    <small id="mixedPaymentHint">Введите сумму наличными. Карта заполнится автоматически.</small>
                </div>
                <label>Наличными
                    <input name="cash" type="number" min="0" step="0.01" value="0" inputmode="decimal">
                </label>
                <label>Картой
                    <input name="card" type="number" min="0" step="0.01" value="${total.toFixed(2)}" inputmode="decimal">
                </label>
                <div class="pos-modal-actions">
                    <button class="secondary-btn" type="button" data-cancel-payment>Отменить</button>
                    <button class="primary-btn" type="submit">Принять оплату</button>
                </div>
            </form>
        `;
        document.getElementById("posModal").hidden = false;

        const form = document.getElementById("mixedPaymentForm");
        const cashInput = form.elements.cash;
        const cardInput = form.elements.card;
        const hint = document.getElementById("mixedPaymentHint");

        cashInput.addEventListener("input", () => {
            const cash = Number(cashInput.value || 0);
            const card = Math.max(0, total - cash);
            cardInput.value = card.toFixed(2);
            hint.textContent = cash + card >= total
                ? "Сумма закрывает чек."
                : `Не хватает ${formatMoney(total - cash - card, currentCompany.settings.currency)}.`;
        });

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const cash = Number(cashInput.value || 0);
            const card = Number(cardInput.value || 0);
            closePosModal();
            resolve({ cash, card });
        });

        form.querySelector("[data-cancel-payment]").addEventListener("click", () => {
            closePosModal();
            resolve(null);
        });
    });
}

function printActiveReceipt() {
    if (!activeReceipt || !activeReceipt.items.length) {
        helpers.showToast("Чек пустой");
        return;
    }

    showPrintPreview(activeReceipt);
}

function showPrintPreview(receipt) {
    const settings = loadHoinPrinterSettings();
    const printerStatus = getHoinPrinterStatus();
    const isIos = isIosDevice();
    document.getElementById("posModalTitle").textContent = "Печать чека";
    document.getElementById("posModalBody").innerHTML = `
        ${printReceiptHtml(receipt, currentCompany)}
        <div class="receipt-print-actions">
            <label class="receipt-printer-setting">
                Лента HOIN
                <select data-hoin-paper-width>
                    <option value="58" ${Number(settings.paperWidth) === 58 ? "selected" : ""}>58 мм</option>
                    <option value="80" ${Number(settings.paperWidth) === 80 ? "selected" : ""}>80 мм</option>
                </select>
            </label>
            <button class="primary-btn" type="button" data-print-browser>Обычная печать</button>
            <button class="secondary-btn" type="button" data-print-hoin>${isIos ? "Share to HOIN iOS" : "Bluetooth HOIN"}</button>
            <button class="secondary-btn" type="button" data-configure-hoin>Настроить HOIN</button>
            ${isIos ? `
                <button class="secondary-btn" type="button" data-copy-ios-receipt>Copy receipt</button>
                <button class="secondary-btn" type="button" data-open-hoin-app>Open Hoin Printer app</button>
            ` : ""}
            <p class="printer-hint">${helpers.escapeHtml(printerStatus.message)}</p>
            ${settings.lastDeviceName ? `<small class="printer-hint">Последний принтер: ${helpers.escapeHtml(settings.lastDeviceName)}</small>` : ""}
        </div>
    `;
    document.getElementById("posModal").hidden = false;
    applyReceiptPaperWidth(document.getElementById("posModalBody"), settings.paperWidth);
    bindReceiptPrintActions(receipt);
}

function bindReceiptPrintActions(receipt) {
    document.querySelector("[data-print-browser]")?.addEventListener("click", (event) => printCurrentReceiptPreview(event.currentTarget));
    document.querySelector("[data-print-hoin]")?.addEventListener("click", (event) => printReceiptWithHoin(receipt, event.currentTarget));
    document.querySelector("[data-configure-hoin]")?.addEventListener("click", (event) => configureHoinPrinter(event.currentTarget));
    document.querySelector("[data-copy-ios-receipt]")?.addEventListener("click", (event) => copyIosReceipt(receipt, event.currentTarget));
    document.querySelector("[data-open-hoin-app]")?.addEventListener("click", openHoinPrinterAppStore);
    document.querySelector("[data-hoin-paper-width]")?.addEventListener("change", (event) => {
        const paperWidth = Number(event.currentTarget.value || 58);
        saveHoinPrinterSettings({ paperWidth });
        applyReceiptPaperWidth(document.getElementById("posModalBody"), paperWidth);
    });
}

function printCurrentReceiptPreview(button) {
    document.querySelectorAll(".print-receipt").forEach((receipt) => receipt.classList.remove("is-print-target"));
    const modalBody = button.closest("#posModalBody");
    applyReceiptPaperWidth(modalBody, Number(modalBody?.querySelector("[data-hoin-paper-width]")?.value || 58));
    modalBody?.querySelector(".print-receipt")?.classList.add("is-print-target");
    window.print();
}

function applyReceiptPaperWidth(root, paperWidth) {
    const receipt = root?.querySelector(".print-receipt");
    if (!receipt) {
        return;
    }

    receipt.classList.toggle("print-receipt--58mm", Number(paperWidth) !== 80);
    receipt.classList.toggle("print-receipt--80mm", Number(paperWidth) === 80);
}

async function printReceiptWithHoin(receipt, button) {
    const settings = saveHoinPrinterSettings({
        paperWidth: Number(document.querySelector("[data-hoin-paper-width]")?.value || 58),
    });
    const text = buildReceiptPrinterText(receipt, currentCompany, settings);

    await runPrinterAction(button, "Отправляю...", async () => {
        if (isIosDevice()) {
            const result = await shareReceiptForIos(text, `Receipt ${receipt.number || ""}`.trim());
            helpers.showToast(result === "shared" ? "Выберите Hoin Printer в меню Share" : "Чек скопирован");
            return;
        }

        await printTextToHoinBluetooth(text, settings);
        helpers.showToast("Чек отправлен на HOIN");
    });
}

async function configureHoinPrinter(button) {
    if (isIosDevice()) {
        openHoinPrinterAppStore();
        helpers.showToast("На iPhone настройте HOIN в приложении Hoin Printer");
        return;
    }

    saveHoinPrinterSettings({
        paperWidth: Number(document.querySelector("[data-hoin-paper-width]")?.value || 58),
    });

    await runPrinterAction(button, "Подключение...", async () => {
        const settings = await selectHoinPrinter();
        helpers.showToast(`HOIN подключен: ${settings.lastDeviceName}`);
    });
}

async function copyIosReceipt(receipt, button) {
    const settings = saveHoinPrinterSettings({
        paperWidth: Number(document.querySelector("[data-hoin-paper-width]")?.value || 58),
    });
    const text = buildReceiptPrinterText(receipt, currentCompany, settings);

    await runPrinterAction(button, "Copying...", async () => {
        await copyReceiptText(text);
        helpers.showToast("Receipt copied");
    });
}

async function runPrinterAction(button, pendingText, action) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = pendingText;

    try {
        await action();
    } catch (error) {
        helpers.showToast(error.message || "Не удалось подключиться к принтеру");
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function showReceiptList(status) {
    const receipts = loadReceipts(currentCompany.id, status);
    document.getElementById("posModalTitle").textContent = status === "held" ? "Отложенные чеки" : "История чеков";
    document.getElementById("posModalBody").innerHTML = receipts.length ? receipts.map((receipt) => `
        <article class="history-receipt">
            <div>
                <strong>${receipt.number}</strong>
                <p>${helpers.formatDate(receipt.createdAt)} • ${formatMoney(receipt.total, currentCompany.settings.currency)}</p>
            </div>
            ${status === "held" ? `<button class="primary-btn" type="button" data-open-held="${receipt.id}">Открыть</button>` : ""}
            ${status === "paid" ? `<button class="secondary-btn" type="button" data-refund="${receipt.id}">Возврат</button>` : ""}
        </article>
    `).join("") : `
        <div class="empty-state empty-state--action">
            <span class="empty-state__icon">${status === "held" ? "⏸" : "🧾"}</span>
            <h3>${status === "held" ? "Отложенных чеков нет" : "История чеков пока пустая"}</h3>
            <p>${status === "held" ? "Отложите чек, если гость еще выбирает." : "После первой оплаты чеки появятся здесь."}</p>
            <button class="primary-btn" type="button" data-close-pos-modal>Вернуться к кассе</button>
        </div>
    `;
    document.getElementById("posModal").hidden = false;

    document.querySelectorAll("[data-open-held]").forEach((button) => {
        button.addEventListener("click", () => {
            activeReceipt = reopenReceipt(loadReceipts(currentCompany.id).find((receipt) => Number(receipt.id) === Number(button.dataset.openHeld)));
            closePosModal();
            renderPos();
        });
    });

    document.querySelectorAll("[data-refund]").forEach((button) => {
        button.addEventListener("click", () => {
            const receipt = loadReceipts(currentCompany.id).find((item) => Number(item.id) === Number(button.dataset.refund));
            const refund = refundReceipt(receipt);
            showPrintPreview(refund);
            renderPos();
        });
    });
}

function closePosModal() {
    document.getElementById("posModal").hidden = true;
}
