import {
    acceptOrder,
    cancelOrder,
    calculateCookingTime,
    filterKitchenOrders,
    finishDish,
    finishOrder,
    formatCookingTime,
    getTimerLevel,
    KITCHEN_STATUSES,
    loadKitchenOrders,
    serveOrder,
    sortKitchenOrders,
    startCooking,
    updateKitchenStatistics,
} from "../kitchen.js";

let currentCompany = null;
let currentUser = null;
let helpers = {};
let isBound = false;
let timerId = null;

export function initKitchenPage(context) {
    currentCompany = context.company;
    currentUser = context.user;
    helpers = context;
    bindKitchenEvents();
    renderKitchen();
    startKitchenTimer();
}

function bindKitchenEvents() {
    if (isBound) {
        return;
    }

    document.getElementById("kitchenSearch").addEventListener("input", renderKitchen);
    document.getElementById("kitchenFilter").addEventListener("change", renderKitchen);
    window.addEventListener("kitchen:update", renderKitchen);
    window.addEventListener("storage", (event) => {
        if (event.key?.includes("Kitchen")) {
            renderKitchen();
        }
    });
    isBound = true;
}

function startKitchenTimer() {
    clearInterval(timerId);
    timerId = setInterval(renderKitchenTimers, 1000);
}

function renderKitchen() {
    renderKitchenStats();
    renderKitchenBoard();
}

function renderKitchenStats() {
    const stats = updateKitchenStatistics(currentCompany.id);
    const cards = [
        ["Активные заказы", stats.activeOrders],
        ["Среднее время", `${stats.averageCookingTime} мин`],
        ["Готово сегодня", stats.readyToday],
        ["Просрочено", stats.overdue],
        ["Популярное блюдо", stats.mostPopularDish],
        ["Быстрый повар", stats.fastestCook],
    ];

    document.getElementById("kitchenStats").innerHTML = cards.map(([label, value]) => `
        <article class="metric-card">
            <span>${label}</span>
            <strong>${helpers.escapeHtml(value)}</strong>
        </article>
    `).join("");
}

function renderKitchenBoard() {
    const filter = document.getElementById("kitchenFilter").value;
    const query = document.getElementById("kitchenSearch").value;
    const orders = sortKitchenOrders(filterKitchenOrders(loadKitchenOrders(currentCompany.id), filter, query));

    document.getElementById("kitchenBoard").innerHTML = orders.length ? orders.map(renderKitchenCard).join("") : `
        <div class="empty-state">
            <h3>Заказов на кухню пока нет</h3>
            <p>После продажи в POS или заказа на стол карточки появятся здесь автоматически.</p>
        </div>
    `;

    document.querySelectorAll("[data-kitchen-action]").forEach((button) => {
        button.addEventListener("click", () => handleKitchenAction(button.dataset.kitchenAction, button.dataset.orderId, button.dataset.itemId));
    });
}

function renderKitchenCard(order) {
    const status = KITCHEN_STATUSES[order.status] || KITCHEN_STATUSES.new;
    const seconds = calculateCookingTime(order);
    const level = getTimerLevel(Math.floor(seconds / 60));

    return `
        <article class="kitchen-card kitchen-card--${level} ${order.status === "new" ? "is-new" : ""}">
            <div class="kitchen-card__head">
                <div>
                    <span>${status.icon} ${status.label}</span>
                    <h3>Заказ #${order.orderId}</h3>
                    <p>Стол: ${order.tableId || "касса"} • Гостей: ${order.guests}</p>
                </div>
                <strong class="kitchen-timer" data-created-at="${order.createdAt}">${formatCookingTime(seconds)}</strong>
            </div>
            <div class="kitchen-priority">Приоритет: ${helpers.escapeHtml(order.priority)}</div>
            <div class="kitchen-items">
                ${order.items.map((item) => `
                    <div class="kitchen-item">
                        <div>
                            <strong>${helpers.escapeHtml(item.name)} × ${item.quantity}</strong>
                            <small>${item.modifiers?.map((modifier) => helpers.escapeHtml(modifier.name)).join(", ") || "Без модификаторов"}</small>
                            <small>${helpers.escapeHtml(item.comment || "")}</small>
                        </div>
                        <span>${KITCHEN_STATUSES[item.status]?.icon || "🆕"} ${KITCHEN_STATUSES[item.status]?.label || "Новый"}</span>
                        <button type="button" data-kitchen-action="finish-dish" data-order-id="${order.id}" data-item-id="${item.id}">Блюдо готово</button>
                    </div>
                `).join("")}
            </div>
            <div class="kitchen-actions">
                <button type="button" data-kitchen-action="accept" data-order-id="${order.id}">Принять</button>
                <button type="button" data-kitchen-action="start" data-order-id="${order.id}">Начать готовить</button>
                <button type="button" data-kitchen-action="ready" data-order-id="${order.id}">Готово</button>
                <button type="button" data-kitchen-action="serve" data-order-id="${order.id}">Выдан</button>
                <button type="button" data-kitchen-action="cancel" data-order-id="${order.id}">Отменить</button>
            </div>
        </article>
    `;
}

function renderKitchenTimers() {
    document.querySelectorAll(".kitchen-timer").forEach((timer) => {
        const seconds = Math.max(0, Math.floor((Date.now() - new Date(timer.dataset.createdAt).getTime()) / 1000));
        timer.textContent = formatCookingTime(seconds);
    });
}

function handleKitchenAction(action, orderId, itemId) {
    if (action === "accept") {
        acceptOrder(orderId, currentUser.id);
    }

    if (action === "start") {
        startCooking(orderId);
    }

    if (action === "finish-dish") {
        finishDish(orderId, itemId);
    }

    if (action === "ready") {
        finishOrder(orderId);
    }

    if (action === "serve") {
        serveOrder(orderId);
    }

    if (action === "cancel") {
        cancelOrder(orderId);
    }

    helpers.showToast("Статус кухни обновлен");
    renderKitchen();
}
