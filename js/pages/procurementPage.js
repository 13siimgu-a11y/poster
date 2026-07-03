import { loadIngredients } from "../ingredients.js";
import { loadProcurementDashboard } from "../procurementStatistics.js";
import { receiveGoods } from "../goodsReceiving.js";
import {
    confirmPurchaseOrder,
    createPurchaseOrder,
    generateSupplierRecommendation,
    loadPurchaseOrders,
} from "../purchaseOrders.js";
import { RETURN_REASONS, loadSupplierReturns, returnGoods } from "../supplierReturns.js";
import { createSupplier, loadSuppliers } from "../suppliers.js";

let currentCompany = null;
let currentUser = null;
let helpers = {};
let activeTab = "suppliers";
let isBound = false;

export function initProcurementPage(context) {
    currentCompany = context.company;
    currentUser = context.user;
    helpers = context;
    bindProcurementEvents();
    renderProcurement();
}

function bindProcurementEvents() {
    if (isBound) return;

    document.getElementById("createSupplierButton").addEventListener("click", openSupplierModal);
    document.getElementById("createPurchaseButton").addEventListener("click", openPurchaseModal);
    document.querySelectorAll("[data-procurement-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            activeTab = button.dataset.procurementTab;
            document.querySelectorAll("[data-procurement-tab]").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            renderProcurementContent();
        });
    });
    document.querySelectorAll("[data-close-procurement-modal]").forEach((item) => {
        item.addEventListener("click", closeProcurementModal);
    });
    isBound = true;
}

function renderProcurement() {
    renderProcurementStats();
    renderRecommendations();
    renderProcurementContent();
}

function renderProcurementStats() {
    const stats = loadProcurementDashboard(currentCompany.id);
    const cards = [
        ["Активных поставщиков", stats.activeSuppliers],
        ["Открытых заказов", stats.openOrders],
        ["Закупок за месяц", stats.monthlyPurchases],
        ["Сумма закупок", helpers.formatMoney(stats.purchaseAmount)],
        ["Последняя поставка", formatDateLabel(stats.lastDelivery)],
        ["Ниже минимума", stats.lowStockIngredients],
    ];
    document.getElementById("procurementStats").innerHTML = cards.map(([label, value]) => `
        <article class="metric-card"><span>${label}</span><strong>${helpers.escapeHtml(value)}</strong></article>
    `).join("");
}

function renderRecommendations() {
    const recommendations = generateSupplierRecommendation(currentCompany.id);
    document.getElementById("procurementRecommendations").innerHTML = recommendations.length ? `
        <div class="procurement-warning">
            <strong>Пора создать закупку</strong>
            <span>${recommendations.length} ингредиентов ниже минимума. Создайте заказ поставщику, чтобы не остановить продажи.</span>
            <button class="primary-btn" type="button" id="quickPurchaseFromWarning">Создать заказ</button>
        </div>
    ` : "";
    document.getElementById("quickPurchaseFromWarning")?.addEventListener("click", openPurchaseModal);
}

function renderProcurementContent() {
    if (activeTab === "suppliers") renderSuppliers();
    if (activeTab === "orders" || activeTab === "history") renderOrders();
    if (activeTab === "receiving") renderReceiving();
    if (activeTab === "returns") renderReturns();
}

function renderSuppliers() {
    const suppliers = loadSuppliers(currentCompany.id);
    document.getElementById("procurementContent").innerHTML = `
        <div class="procurement-grid">
            ${suppliers.map((supplier) => `
                <article class="supplier-card">
                    <h3>${helpers.escapeHtml(supplier.name)}</h3>
                    <p>${helpers.escapeHtml(supplier.contactPerson || "Контакт не указан")}</p>
                    <p>${helpers.escapeHtml(supplier.phone)} ${helpers.escapeHtml(supplier.email)}</p>
                    <span>${supplier.currency} • ${supplier.active ? "Активен" : "Неактивен"}</span>
                </article>
            `).join("") || `
                <div class="empty-state empty-state--action">
                    <span class="empty-state__icon">🚚</span>
                    <h3>Поставщиков пока нет</h3>
                    <p>Добавьте первого поставщика, чтобы создавать закупки и принимать товар на склад.</p>
                    <button class="primary-btn" type="button" id="createFirstSupplierButton">Добавить поставщика</button>
                </div>
            `}
        </div>
    `;
    document.getElementById("createFirstSupplierButton")?.addEventListener("click", openSupplierModal);
}

function renderOrders() {
    const suppliers = loadSuppliers(currentCompany.id);
    const orders = loadPurchaseOrders(currentCompany.id);
    document.getElementById("procurementContent").innerHTML = `
        <div class="inventory-table-wrap">
            <table class="inventory-table">
                <thead><tr><th>Дата</th><th>Номер</th><th>Поставщик</th><th>Статус</th><th>Сумма</th><th>Позиций</th><th>Действия</th></tr></thead>
                <tbody>
                    ${orders.map((order) => {
                        const supplier = suppliers.find((item) => Number(item.id) === Number(order.supplierId));
                        return `<tr><td>${formatDateLabel(order.createdAt)}</td><td>${order.orderNumber}</td><td>${helpers.escapeHtml(supplier?.name || "—")}</td><td>${order.status}</td><td>${helpers.formatMoney(order.total)}</td><td>${order.items.length}</td><td><button data-procurement-action="confirm" data-order-id="${order.id}">Подтвердить</button></td></tr>`;
                    }).join("") || "<tr><td colspan=\"7\"><strong>Заказов пока нет.</strong> Нажмите «Создать заказ», когда нужно пополнить склад.</td></tr>"}
                </tbody>
            </table>
        </div>
    `;
    bindOrderActions();
}

function renderReceiving() {
    const orders = loadPurchaseOrders(currentCompany.id).filter((order) => !["received", "cancelled"].includes(order.status));
    document.getElementById("procurementContent").innerHTML = `
        <div class="procurement-grid">
            ${orders.map((order) => `<article class="supplier-card"><h3>${order.orderNumber}</h3><p>${order.status}</p><p>${helpers.formatMoney(order.total)}</p><button class="primary-btn" data-procurement-action="receive" data-order-id="${order.id}">Принять поставку</button></article>`).join("") || `
                <div class="empty-state empty-state--action">
                    <span class="empty-state__icon">📥</span>
                    <h3>Нет заказов для приемки</h3>
                    <p>Когда поставщик привезет товар, открытые заказы появятся здесь.</p>
                    <button class="primary-btn" type="button" id="createPurchaseFromReceiving">Создать закупку</button>
                </div>
            `}
        </div>
    `;
    document.getElementById("createPurchaseFromReceiving")?.addEventListener("click", openPurchaseModal);
    bindOrderActions();
}

function renderReturns() {
    const returns = loadSupplierReturns(currentCompany.id);
    document.getElementById("procurementContent").innerHTML = `
        <button class="primary-btn" id="createReturnButton" type="button">Создать возврат</button>
        <div class="procurement-grid">
            ${returns.map((entry) => `<article class="supplier-card"><h3>${entry.reason}</h3><p>${formatDateLabel(entry.createdAt)}</p><p>${entry.items.length} позиций</p></article>`).join("") || `
                <div class="empty-state">
                    <span class="empty-state__icon">↩</span>
                    <h3>Возвратов пока нет</h3>
                    <p>Возвраты поставщикам появятся здесь после оформления.</p>
                </div>
            `}
        </div>
    `;
    document.getElementById("createReturnButton").addEventListener("click", openReturnModal);
}

function openSupplierModal() {
    document.getElementById("procurementModalTitle").textContent = "Добавить поставщика";
    document.getElementById("procurementModalBody").innerHTML = `
        <form class="procurement-form" id="supplierForm">
            <input name="name" placeholder="Название компании" required>
            <input name="contactPerson" placeholder="Контактное лицо">
            <input name="phone" placeholder="Телефон">
            <input name="email" type="email" placeholder="Email">
            <input name="address" placeholder="Адрес">
            <input name="website" placeholder="Сайт">
            <input name="taxNumber" placeholder="ИНН / налоговый номер">
            <select name="currency"><option>USD</option><option>EUR</option><option>GEL</option></select>
            <textarea name="notes" placeholder="Комментарий"></textarea>
            <button class="primary-btn" type="submit">Сохранить</button>
        </form>
    `;
    openProcurementModal();
    document.getElementById("supplierForm").addEventListener("submit", (event) => {
        event.preventDefault();
        createSupplier(currentCompany.id, Object.fromEntries(new FormData(event.currentTarget).entries()));
        closeProcurementModal();
        renderProcurement();
    });
}

function openPurchaseModal() {
    const suppliers = loadSuppliers(currentCompany.id).filter((supplier) => supplier.active && !supplier.archived);
    const ingredients = loadIngredients(currentCompany.id);
    document.getElementById("procurementModalTitle").textContent = "Создать заказ поставщику";
    document.getElementById("procurementModalBody").innerHTML = `
        <form class="procurement-form" id="purchaseForm">
            <select name="supplierId">${suppliers.map((supplier) => `<option value="${supplier.id}">${helpers.escapeHtml(supplier.name)}</option>`).join("")}</select>
            <input name="expectedDate" type="date">
            <input name="comment" placeholder="Комментарий">
            <select name="ingredientId">${ingredients.map((ingredient) => `<option value="${ingredient.id}">${helpers.escapeHtml(ingredient.name)}</option>`).join("")}</select>
            <input name="quantity" type="number" min="0" value="0" placeholder="Количество">
            <input name="unitPrice" type="number" min="0" step="0.01" value="0" placeholder="Цена за единицу">
            <button class="primary-btn" type="submit">Создать заказ</button>
        </form>
    `;
    openProcurementModal();
    document.getElementById("purchaseForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        createPurchaseOrder(currentCompany.id, {
            supplierId: data.supplierId,
            expectedDate: data.expectedDate,
            comment: data.comment,
            createdBy: currentUser.id,
            items: [{ ingredientId: Number(data.ingredientId), quantity: Number(data.quantity), unitPrice: Number(data.unitPrice) }],
        });
        closeProcurementModal();
        renderProcurement();
    });
}

function openReturnModal() {
    const suppliers = loadSuppliers(currentCompany.id);
    const ingredients = loadIngredients(currentCompany.id);
    document.getElementById("procurementModalTitle").textContent = "Возврат поставщику";
    document.getElementById("procurementModalBody").innerHTML = `
        <form class="procurement-form" id="returnForm">
            <select name="supplierId">${suppliers.map((supplier) => `<option value="${supplier.id}">${helpers.escapeHtml(supplier.name)}</option>`).join("")}</select>
            <select name="ingredientId">${ingredients.map((ingredient) => `<option value="${ingredient.id}">${helpers.escapeHtml(ingredient.name)}</option>`).join("")}</select>
            <input name="quantity" type="number" min="0" value="0" placeholder="Количество">
            <select name="reason">${RETURN_REASONS.map((reason) => `<option>${reason}</option>`).join("")}</select>
            <button class="primary-btn" type="submit">Оформить возврат</button>
        </form>
    `;
    openProcurementModal();
    document.getElementById("returnForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        returnGoods(currentCompany.id, data.supplierId, [{ ingredientId: Number(data.ingredientId), quantity: Number(data.quantity) }], data.reason, currentUser.id);
        closeProcurementModal();
        renderProcurement();
    });
}

function bindOrderActions() {
    document.querySelectorAll("[data-procurement-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const order = loadPurchaseOrders(currentCompany.id).find((item) => Number(item.id) === Number(button.dataset.orderId));
            if (!order) return;
            if (button.dataset.procurementAction === "confirm") confirmPurchaseOrder(order.id);
            if (button.dataset.procurementAction === "receive") receiveGoods(order, order.items.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity })), currentUser.id);
            renderProcurement();
        });
    });
}

function openProcurementModal() {
    document.getElementById("procurementModal").hidden = false;
}

function closeProcurementModal() {
    document.getElementById("procurementModal").hidden = true;
}

function formatDateLabel(value) {
    if (!value || value === "—") return "—";
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
