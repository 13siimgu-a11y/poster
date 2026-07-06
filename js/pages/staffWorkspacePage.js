import { canShowAction } from "../accessPolicy.js";
import { createCategory, loadCategories } from "../categories.js";
import { formatMoney } from "../currency.js";
import { createHall, loadFloor, ensureDefaultHall } from "../floor.js";
import { addStock, loadIngredients, performInventory, writeOffStock } from "../inventory.js";
import { createKitchenOrder, loadKitchenOrders } from "../kitchenOrders.js";
import { idsEqual } from "../apiPersistence.js";
import { createOrder, loadOrders, updateOrder, closeOrder, cancelOrder, transferOrder } from "../orders.js";
import { createProduct, loadProducts } from "../products.js";
import {
    calculateReceipt,
    getAvailablePosProducts,
    loadCashRegisters,
    loadReceipts,
    printReceiptHtml,
    refundReceipt,
} from "../pos.js";
import { storage, STORAGE_KEYS } from "../storage.js";
import { changeTableStatus, createTable, loadTables, TABLE_STATUSES, updateTable } from "../tables.js";

const STAFF_SCREENS = {
    quick: "quick",
    floor: "floor",
    receipts: "receipts",
    reports: "reports",
    inventory: "inventory",
    menu: "menu",
};

const TABLE_STATE_META = {
    free: { label: "Свободен", icon: "●", tone: "free" },
    arrived: { label: "Заказ открыт", icon: "●", tone: "arrived" },
    ordering: { label: "Заказ открыт", icon: "●", tone: "ordering" },
    cooking: { label: "Готовится", icon: "●", tone: "cooking" },
    payment: { label: "Ждет оплату", icon: "●", tone: "payment" },
    attention: { label: "Уборка", icon: "●", tone: "attention" },
    reserved: { label: "Бронь", icon: "●", tone: "reserved" },
};

let currentCompany = null;
let currentUser = null;
let helpers = {};
let activeScreen = STAFF_SCREENS.quick;
let activeHallId = "all";
let activeOrderId = null;
let activeReceiptFilter = "all";
let activeProductFilter = "all";
let activeProductCategoryId = "";
let productSearch = "";
let receiptSearch = "";
let inventorySearch = "";
let reportPeriod = "custom";
let customReportRange = null;
let isBound = false;
let orderSheetState = "peek";
let workspaceMenuOpen = false;

export function initStaffWorkspacePage(context) {
    currentCompany = context.company;
    currentUser = context.user;
    helpers = context;
    ensureDefaultHall(currentCompany.id);
    activeOrderId = getInitialActiveOrderId();
    bindWorkspaceEvents();
    renderWorkspace();
}

function bindWorkspaceEvents() {
    if (isBound) {
        return;
    }

    document.querySelectorAll("[data-close-workspace-modal]").forEach((item) => {
        item.addEventListener("click", closeWorkspaceModal);
    });

    document.addEventListener("keydown", handleWorkspaceHotkeys);
    isBound = true;
}

function renderWorkspace() {
    const root = document.getElementById("staffWorkspace");
    if (!root || !currentCompany) {
        return;
    }
    root.innerHTML = `
        <div class="workspace-minimal-top">
            <button class="workspace-burger" type="button" data-work-action="toggle-menu" aria-label="Открыть меню">☰</button>
            <div>
                <strong>${escapeHtml(currentCompany.name)}</strong>
                <span>${escapeHtml(getRoleTitle())}</span>
            </div>
        </div>
        <button class="workspace-action-backdrop" type="button" data-work-action="toggle-menu" aria-label="Закрыть меню" hidden></button>
        <div class="workspace-action-drawer">
            <button type="button" data-work-action="reports">Отчет</button>
            <button type="button" data-work-action="receipts">Архив чеков</button>
            <button type="button" data-work-action="open-shift">Открыть смену</button>
            <button type="button" data-work-action="add-product">Добавить меню</button>
            <button type="button" data-work-action="add-category">Добавить категорию</button>
            <button type="button" data-work-action="print">Печатать чек</button>
            <button type="button" data-work-action="logout">Выйти</button>
        </div>
        <div class="workspace-layout" id="workspaceLayout"></div>
    `;

    bindRootActions(root);
    setWorkspaceMenuOpen(workspaceMenuOpen);
    renderActiveScreen();
}

function renderBottomButton(screen, icon, label) {
    return `
        <button class="${activeScreen === screen ? "is-active" : ""}" type="button" data-work-screen="${screen}">
            <span>${icon}</span>
            <strong>${label}</strong>
        </button>
    `;
}

function bindRootActions(root) {
    bindRipple(root);

    root.querySelector(".workspace-burger")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setWorkspaceMenuOpen(!workspaceMenuOpen);
    });

    root.querySelector(".workspace-action-backdrop")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setWorkspaceMenuOpen(false);
    });

    root.querySelectorAll("[data-work-screen]").forEach((button) => {
        button.addEventListener("click", () => {
            activeScreen = button.dataset.workScreen;
            renderWorkspace();
        });
    });

    root.querySelectorAll("[data-work-action]").forEach((button) => {
        button.addEventListener("click", () => handleWorkspaceAction(button.dataset.workAction));
    });
}

function setWorkspaceMenuOpen(isOpen) {
    workspaceMenuOpen = Boolean(isOpen);
    const root = document.getElementById("staffWorkspace");
    root?.classList.toggle("is-workspace-menu-open", workspaceMenuOpen);
    document.querySelector(".workspace-action-drawer")?.classList.toggle("is-open", workspaceMenuOpen);
    const backdrop = document.querySelector(".workspace-action-backdrop");
    if (backdrop) {
        backdrop.hidden = !workspaceMenuOpen;
    }
}

function bindRipple(root = document) {
    root.querySelectorAll("button").forEach((button) => {
        if (button.dataset.rippleBound) return;
        button.dataset.rippleBound = "true";
        button.addEventListener("pointerdown", (event) => {
            const rect = button.getBoundingClientRect();
            button.style.setProperty("--ripple-x", `${event.clientX - rect.left}px`);
            button.style.setProperty("--ripple-y", `${event.clientY - rect.top}px`);
            button.classList.remove("is-rippling");
            window.requestAnimationFrame(() => button.classList.add("is-rippling"));
        });
    });
}

function renderWorkspaceNotices() {
    const lowIngredients = loadIngredients(currentCompany.id).filter((ingredient) => (
        Number(ingredient.quantity) <= Number(ingredient.minQuantity)
    ));
    const openOrders = loadOrders(currentCompany.id, "opened");
    const readyKitchenOrders = loadKitchenOrders(currentCompany.id).filter((order) => order.status === "ready");
    const shift = getOpenShift();
    const notices = [
        shift ? "Смена открыта" : "Откройте смену",
        `Заказы: ${openOrders.length}`,
        readyKitchenOrders.length ? `Готово: ${readyKitchenOrders.length}` : "",
        lowIngredients.length ? `Низкие остатки: ${lowIngredients.length}` : "",
    ].filter(Boolean);

    document.getElementById("workspaceNotices").innerHTML = notices.map((notice) => `
        <span>${escapeHtml(notice)}</span>
    `).join("");
}

function renderActiveScreen() {
    const layout = document.getElementById("workspaceLayout");
    layout.className = "workspace-layout";

    if (activeScreen === STAFF_SCREENS.quick) {
        layout.classList.add("workspace-layout--quick");
        if (getActiveOrder()) {
            layout.classList.add("workspace-layout--order");
        }
        layout.innerHTML = renderUnifiedWorkspace();
        bindUnifiedWorkspace();
        return;
    }

    if (activeScreen === STAFF_SCREENS.receipts) {
        layout.innerHTML = renderReceiptArchive();
        bindReceiptArchive();
        return;
    }

    if (activeScreen === STAFF_SCREENS.reports) {
        layout.innerHTML = renderReports();
        bindReports();
        return;
    }

    if (activeScreen === STAFF_SCREENS.inventory) {
        layout.innerHTML = renderInventory();
        bindInventory();
        return;
    }

    if (activeScreen === STAFF_SCREENS.menu) {
        layout.innerHTML = renderStaffMenu();
        bindStaffMenu();
        return;
    }

    layout.innerHTML = renderFloorWorkspace();
    bindFloorWorkspace();
}

function renderUnifiedWorkspace() {
    const halls = loadFloor(currentCompany.id).filter((hall) => !hall.archived);
    const categories = loadCategories(currentCompany.id).filter((category) => category.active);
    const order = getActiveOrder();
    const canQuickSale = ["cashier", "bartender", "barmen"].includes(currentUser.role);

    if (!order) {
        return `
            <section class="workspace-table-first panel glass-panel">
                <div class="workspace-section-head">
                    <div>
                        <h3>Выберите стол</h3>
                        <p>Нажмите на стол, заказ откроется сразу.</p>
                    </div>
                </div>
                ${canQuickSale ? `
                    <button class="workspace-quick-sale-card" type="button" data-work-action="quick-sale">
                        <strong>Быстрый чек / Бар</strong>
                        <span>Открыть кассу без выбора стола</span>
                    </button>
                ` : ""}
                <div class="workspace-hall-tabs">
                    <button class="${activeHallId === "all" ? "is-active" : ""}" type="button" data-work-hall="all">Все</button>
                    ${halls.map((hall) => `
                        <button class="${idsEqual(activeHallId, hall.id) ? "is-active" : ""}" type="button" data-work-hall="${hall.id}">
                            ${escapeHtml(hall.name)}
                        </button>
                    `).join("")}
                </div>
                <div class="workspace-floor-grid workspace-floor-map">
                    ${renderTableMap(halls, true)}
                </div>
            </section>
        `;
    }

    const showProducts = activeProductCategoryId || productSearch.trim() || !categories.length;
    return `
        <section class="workspace-unified__products panel glass-panel">
            <button class="workspace-back-to-tables" type="button" data-work-action="new-order">
                ← Назад к выбору стола
            </button>
            ${showProducts ? `
                <div class="workspace-menu-sticky">
                    <div class="workspace-category-rail" aria-label="Категории">
                        ${categories.map((category) => `
                            <button class="${idsEqual(activeProductCategoryId, category.id) ? "is-active" : ""}" type="button" data-product-category="${category.id}">
                                ${escapeHtml(category.name)}
                            </button>
                        `).join("")}
                    </div>
                    <div class="workspace-search">
                        <label for="workspaceProductSearch">Поиск</label>
                        <input id="workspaceProductSearch" type="search" placeholder="Найти товар" value="${escapeHtml(productSearch)}">
                    </div>
                </div>
                ${renderQuickProducts(36)}
            ` : renderCategoryPrompt(categories)}
        </section>
        <aside class="workspace-order-card workspace-order-card--${orderSheetState} ${order.items.length ? "" : "workspace-order-card--empty"} panel glass-panel" id="workspaceOrderPanel">
            ${renderActiveOrder()}
        </aside>
    `;
}

function renderFloorWorkspace() {
    const halls = loadFloor(currentCompany.id).filter((hall) => !hall.archived);

    return `
        <section class="workspace-floor-card panel">
            <div class="workspace-toolbar">
                <div class="workspace-search">
                    <label for="workspaceProductSearch">Поиск</label>
                    <input id="workspaceProductSearch" type="search" placeholder="Блюдо, код или категория" value="${escapeHtml(productSearch)}">
                </div>
                <div class="workspace-product-tabs">
                    <button class="${activeProductFilter === "all" ? "is-active" : ""}" type="button" data-product-filter="all">Все</button>
                    <button class="${activeProductFilter === "popular" ? "is-active" : ""}" type="button" data-product-filter="popular">Частые</button>
                    <button class="${activeProductFilter === "favorites" ? "is-active" : ""}" type="button" data-product-filter="favorites">Любимые</button>
                </div>
            </div>
            <div class="workspace-hall-tabs">
                <button class="${activeHallId === "all" ? "is-active" : ""}" type="button" data-work-hall="all">Все</button>
                ${halls.map((hall) => `
                    <button class="${idsEqual(activeHallId, hall.id) ? "is-active" : ""}" type="button" data-work-hall="${hall.id}">
                        ${escapeHtml(hall.name)}
                    </button>
                `).join("")}
            </div>
            <div class="workspace-floor-grid workspace-floor-map">
                ${renderTableMap(halls, true)}
            </div>
        </section>
        <aside class="workspace-order-card panel" id="workspaceOrderPanel">
            ${renderActiveOrder()}
        </aside>
    `;
}

function renderTableMap(halls, asMap = false) {
    if (!halls.length) {
        return renderEmptyState("Нет зала", "Создайте зал и столы.", "");
    }

    const visibleHalls = activeHallId === "all"
        ? halls
        : halls.filter((hall) => idsEqual(hall.id, activeHallId));
    const tables = visibleHalls.flatMap((hall) => loadTables(currentCompany.id, hall.id).map((table) => ({
        ...table,
        hallName: hall.name,
    })));

    if (!tables.length) {
        return renderEmptyState("Нет столов", "Добавьте столы для заказов.", "");
    }

    const orders = loadOrders(currentCompany.id, "opened");
    const reservations = storage.get(STORAGE_KEYS.reservations, []).filter((reservation) => (
        idsEqual(reservation.companyId, currentCompany.id)
    ));

    return tables.map((table) => {
        const order = orders.find((item) => idsEqual(item.id, table.activeOrderId));
        const reservation = reservations.find((item) => idsEqual(item.tableId, table.id) && item.status !== "cancelled");
        const state = getTableState(table, order, reservation);
        const mapStyle = asMap
            ? `style="left:${Number(table.x || 0)}px; top:${Number(table.y || 0)}px; width:${Number(table.width || 120)}px; height:${Number(table.height || 120)}px; transform:rotate(${Number(table.rotation || 0)}deg);"`
            : "";
        return `
            <button class="workspace-table workspace-table--${state.tone} ${idsEqual(order?.id, activeOrderId) ? "is-active" : ""}" type="button" data-work-table="${table.id}" ${mapStyle}>
                <span class="workspace-table__status">${state.icon}</span>
                <strong>${escapeHtml(table.name)}</strong>
                ${asMap ? "" : `<small>${escapeHtml(table.hallName)}</small>`}
                <em>${order ? `${order.guests} гостей` : `${table.seats} мест`}</em>
                <small class="workspace-table__label">${escapeHtml(state.label)}</small>
                ${order ? `<b>${formatMoney(order.total, currentCompany.settings.currency)}</b>` : "<b>Свободно</b>"}
                ${!asMap && order ? `<small>${escapeHtml(getOrderAge(order.createdAt))}</small>` : ""}
                ${!asMap && order?.waiterId ? `<i>${escapeHtml(getWaiterName(order.waiterId))}</i>` : ""}
            </button>
        `;
    }).join("");
}

function renderCategoryPrompt(categories) {
    return `
        <div class="workspace-category-prompt">
            <h3>Выберите категорию</h3>
            <p>После выбора категории появятся товары.</p>
            <div class="workspace-category-grid">
                ${categories.map((category) => `
                    <button type="button" data-product-category="${category.id}">
                        <span>${escapeHtml(category.icon || "🍽")}</span>
                        <strong>${escapeHtml(category.name)}</strong>
                    </button>
                `).join("")}
            </div>
        </div>
    `;
}

function getTableState(table, order, reservation) {
    if (table.status === "cleaning" || table.status === "disabled") {
        return TABLE_STATE_META.attention;
    }

    if (reservation || table.status === "reserved") {
        return TABLE_STATE_META.reserved;
    }

    if (!order) {
        return TABLE_STATE_META.free;
    }

    const kitchenOrder = loadKitchenOrders(currentCompany.id).find((item) => idsEqual(item.orderId, order.id));
    if (table.status === "payment" || order.status === "payment") {
        return TABLE_STATE_META.payment;
    }

    if (kitchenOrder && ["new", "accepted", "cooking"].includes(kitchenOrder.status)) {
        return TABLE_STATE_META.cooking;
    }

    if (order.items.length) {
        return TABLE_STATE_META.ordering;
    }

    return TABLE_STATE_META.arrived;
}

function bindFloorWorkspace() {
    document.getElementById("workspaceProductSearch")?.addEventListener("input", (event) => {
        productSearch = event.target.value;
        renderActiveScreen();
        setTimeout(() => document.getElementById("workspaceProductSearch")?.focus(), 0);
    });

    document.querySelectorAll("[data-product-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            activeProductFilter = button.dataset.productFilter;
            renderActiveScreen();
        });
    });

    document.querySelectorAll("[data-work-hall]").forEach((button) => {
        button.addEventListener("click", () => {
            activeHallId = button.dataset.workHall;
            activeOrderId = null;
            renderActiveScreen();
        });
    });

    document.querySelectorAll("[data-work-table]").forEach((button) => {
        button.addEventListener("click", () => openTableOrder(button.dataset.workTable));
    });

    bindOrderPanelActions();
}

function bindUnifiedWorkspace() {
    document.getElementById("workspaceProductSearch")?.addEventListener("input", (event) => {
        productSearch = event.target.value;
        renderActiveScreen();
        setTimeout(() => document.getElementById("workspaceProductSearch")?.focus(), 0);
    });

    document.querySelectorAll("[data-product-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            activeProductFilter = button.dataset.productFilter;
            renderActiveScreen();
        });
    });

    document.querySelectorAll("[data-product-category]").forEach((button) => {
        button.addEventListener("click", () => {
            activeProductCategoryId = button.dataset.productCategory;
            renderActiveScreen();
        });
    });

    document.querySelectorAll("[data-work-hall]").forEach((button) => {
        button.addEventListener("click", () => {
            activeHallId = button.dataset.workHall;
            renderActiveScreen();
        });
    });

    document.querySelectorAll("[data-work-table]").forEach((button) => {
        button.addEventListener("click", () => openTableOrder(button.dataset.workTable));
    });

    bindOrderPanelActions();
}

function renderActiveOrder() {
    const order = getActiveOrder();
    if (!order) {
        return `
            <div class="workspace-order-empty">
                <h3>Выберите стол</h3>
                <p>После выбора столика здесь появится заказ.</p>
            </div>
        `;
    }

    const table = loadTables(currentCompany.id).find((item) => idsEqual(item.id, order.tableId));
    const finalTotal = Math.max(0, Number(order.total || 0));
    return `
        <div class="workspace-sheet-handle" aria-label="Размер заказа">
            <button type="button" data-order-sheet="peek">Свернуть</button>
            <button type="button" data-order-sheet="open">Заказ</button>
            <button type="button" data-order-sheet="full">Полностью</button>
        </div>
        <div class="workspace-order-head">
            <div>
                <span>${escapeHtml(table?.name || "Стол")}</span>
                <h3>${escapeHtml(order.number)}</h3>
                <p>${order.guests} гостей · открыт ${escapeHtml(getOrderAge(order.createdAt))}</p>
            </div>
            <strong>${formatMoney(order.total, currentCompany.settings.currency)}</strong>
        </div>
        <div class="workspace-order-items">
            ${order.items.length ? order.items.map((item) => `
                <article class="workspace-order-item">
                    <div>
                        <strong>${escapeHtml(item.name)}</strong>
                        ${item.comment ? `<small>${escapeHtml(item.comment)}</small>` : ""}
                        ${item.modifiers?.length ? `<small>${item.modifiers.map((modifier) => escapeHtml(modifier.name)).join(", ")}</small>` : ""}
                    </div>
                    <div class="workspace-qty">
                        <button type="button" data-order-item-action="minus" data-order-item="${item.id}">−</button>
                        <span>${item.quantity}</span>
                        <button type="button" data-order-item-action="plus" data-order-item="${item.id}">+</button>
                    </div>
                    <b>${formatMoney(item.total, currentCompany.settings.currency)}</b>
                    <button type="button" data-order-item-action="comment" data-order-item="${item.id}">Комментарий</button>
                    <button class="danger-btn" type="button" data-order-item-action="remove" data-order-item="${item.id}">Удалить</button>
                </article>
            `).join("") : "<p class=\"empty-check\">Добавьте блюдо.</p>"}
        </div>
        <div class="workspace-order-summary">
            <span>Подытог</span><strong>${formatMoney(order.subtotal, currentCompany.settings.currency)}</strong>
            <span>Скидка</span>
            <strong class="workspace-discount-value">
                ${formatMoney(order.discount, currentCompany.settings.currency)}
                <button type="button" data-order-action="discount">%</button>
            </strong>
            <span>Обслуживание</span><strong>${formatMoney(order.tax || 0, currentCompany.settings.currency)}</strong>
            <span class="workspace-order-summary__total">Финальная сумма</span><strong class="workspace-order-summary__total">${formatMoney(finalTotal, currentCompany.settings.currency)}</strong>
        </div>
        ${order.items.length ? `
            <div class="workspace-payment-cta">
                <button class="primary-btn" type="button" data-order-action="pay">
                    Перейти к оплате
                    <strong>${formatMoney(finalTotal, currentCompany.settings.currency)}</strong>
                </button>
                <span>Проверьте чек и выберите способ оплаты.</span>
            </div>
        ` : ""}
        <div class="workspace-order-actions workspace-order-actions--simple">
            <button class="secondary-btn" type="button" data-order-action="kitchen">На кухню</button>
            <button class="secondary-btn" type="button" data-order-action="print">Печать</button>
            <button class="secondary-btn" type="button" data-order-action="more">•••</button>
        </div>
    `;
}

function renderQuickProducts(limit = 12) {
    const products = filterWorkspaceProducts().slice(0, limit);
    const categories = loadCategories(currentCompany.id);
    const categoryById = new Map(categories.map((category) => [String(category.id), category]));
    return `
        <div class="workspace-products">
            ${products.length ? products.map((product) => `
                <button class="workspace-product-card" type="button" data-add-work-product="${product.id}">
                    <span class="workspace-product-card__media">${product.images?.[0] ? `<img src="${escapeHtml(product.images[0])}" alt="">` : getProductIcon(product, categoryById.get(String(product.categoryId)))}</span>
                    <strong>${escapeHtml(product.name)}</strong>
                    <span>${escapeHtml(categoryById.get(String(product.categoryId))?.name || "Без категории")}</span>
                    <small>${Number(product.quantity || 0) > 0 ? `В наличии: ${Number(product.quantity)}` : "Стоп-лист"}</small>
                    <b>${formatMoney(product.price, currentCompany.settings.currency)}</b>
                </button>
            `).join("") : renderEmptyState("Товаров не найдено", "Попробуйте другой поиск или проверьте меню.", "")}
        </div>
    `;
}

function getProductIcon(product, category) {
    const text = `${product.name} ${category?.name || ""}`.toLowerCase();
    if (text.includes("cocktail") || text.includes("коктейл")) return "🍸";
    if (text.includes("beer") || text.includes("пиво")) return "🍺";
    if (text.includes("coffee") || text.includes("коф")) return "☕";
    if (text.includes("wine") || text.includes("champagne")) return "🍷";
    if (text.includes("burger") || text.includes("pizza")) return "🍔";
    if (text.includes("salad") || text.includes("салат")) return "🥗";
    return category?.icon || "🍽";
}

function filterWorkspaceProducts() {
    const query = productSearch.trim().toLowerCase();
    const productFilter = activeScreen === STAFF_SCREENS.quick ? "all" : activeProductFilter;
    const categories = loadCategories(currentCompany.id);
    const categoryById = new Map(categories.map((category) => [String(category.id), category]));
    return getAvailablePosProducts(currentCompany.id).filter((product) => {
        const category = categoryById.get(String(product.categoryId));
        const favoriteNames = ["капучино", "эспрессо", "латте", "бургер", "картофель фри", "кола"];
        const isFavorite = product.popular || product.recommended || favoriteNames.includes(product.name.toLowerCase());
        const matchesFilter = productFilter === "all"
            || (productFilter === "popular" && product.popular)
            || (productFilter === "favorites" && isFavorite);
        const matchesCategory = !activeProductCategoryId || idsEqual(product.categoryId, activeProductCategoryId);
        const matchesQuery = !query
            || product.name.toLowerCase().includes(query)
            || product.sku.toLowerCase().includes(query)
            || category?.name.toLowerCase().includes(query);
        return matchesFilter && matchesCategory && matchesQuery;
    });
}

function bindOrderPanelActions() {
    document.querySelectorAll("[data-order-sheet]").forEach((button) => {
        button.addEventListener("click", () => {
            orderSheetState = button.dataset.orderSheet;
            renderActiveScreen();
        });
    });

    document.querySelectorAll("[data-add-work-product]").forEach((button) => {
        button.addEventListener("click", () => addProductToOrder(button.dataset.addWorkProduct));
    });

    document.querySelectorAll("[data-order-item-action]").forEach((button) => {
        button.addEventListener("click", () => handleOrderItemAction(button.dataset.orderItemAction, button.dataset.orderItem));
    });

    document.querySelectorAll("[data-order-action]").forEach((button) => {
        button.addEventListener("click", () => handleOrderAction(button.dataset.orderAction));
    });

    document.querySelectorAll("[data-work-action]").forEach((button) => {
        button.addEventListener("click", () => handleWorkspaceAction(button.dataset.workAction));
    });
}

function openTableOrder(tableId) {
    const table = loadTables(currentCompany.id).find((item) => idsEqual(item.id, tableId));
    let order = loadOrders(currentCompany.id, "opened").find((item) => idsEqual(item.id, table?.activeOrderId));

    if (!table) {
        return;
    }

    if (!order && table.status === "free" && activeScreen !== STAFF_SCREENS.quick) {
        showNewOrderModal(table);
        return;
    }

    if (!order) {
        order = createOrder(currentCompany.id, table.hallId, table.id, {
            waiterId: currentUser.id,
            cashierId: currentUser.role === "cashier" ? currentUser.id : null,
            guests: table.seats,
        });
    }

    activeOrderId = order.id;
    orderSheetState = "open";
    activeProductCategoryId = "";
    productSearch = "";
    renderActiveScreen();
}

function showNewOrderModal(table) {
    openWorkspaceModal("Новый заказ", `
        <form class="workspace-form" id="newOrderForm">
            <p>Стол: <strong>${escapeHtml(table.name)}</strong></p>
            <label>Количество гостей<input name="guests" type="number" min="1" value="${table.seats}" inputmode="numeric"></label>
            <label>Комментарий<textarea name="comments" rows="3" placeholder="Например: детский стул, аллергия"></textarea></label>
            <button class="primary-btn" type="submit">Создать заказ</button>
        </form>
    `);

    document.getElementById("newOrderForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        const order = createOrder(currentCompany.id, table.hallId, table.id, {
            waiterId: currentUser.id,
            cashierId: currentUser.role === "cashier" ? currentUser.id : null,
            guests: Number(data.guests || table.seats),
            comments: data.comments,
        });
        activeOrderId = order.id;
        orderSheetState = "open";
        closeWorkspaceModal();
        renderActiveScreen();
        toast("Заказ создан");
    });
}

function addProductToOrder(productId) {
    let order = getActiveOrder();
    const product = loadProducts(currentCompany.id).find((item) => idsEqual(item.id, productId));

    if (!product) {
        return;
    }

    if (!order) {
        order = createQuickSaleOrder();
    }

    const item = {
        id: Date.now() + Math.random(),
        productId: product.id,
        name: product.name,
        sku: product.sku,
        price: Number(product.price || 0),
        quantity: 1,
        comment: "",
        modifiers: [],
        total: Number(product.price || 0),
    };
    const updated = updateOrder(order.id, {
        items: [...order.items, item],
        historyAction: `Добавлен товар ${product.name}`,
    });
    changeTableStatus(order.tableId, "occupied");
    activeOrderId = updated.id;
    orderSheetState = "peek";
    renderActiveScreen();
}

function createQuickSaleOrder() {
    const table = getOrCreateQuickSaleTable();
    let order = loadOrders(currentCompany.id, "opened").find((item) => idsEqual(item.tableId, table.id));

    if (!order) {
        order = createOrder(currentCompany.id, table.hallId, table.id, {
            waiterId: currentUser.id,
            cashierId: currentUser.role === "cashier" ? currentUser.id : null,
            guests: 1,
            comments: "Быстрый чек",
        });
    }

    activeOrderId = order.id;
    changeTableStatus(table.id, "occupied");
    return order;
}

function getOrCreateQuickSaleTable() {
    let hall = loadFloor(currentCompany.id).find((item) => item.name === "Бар / Касса");
    if (!hall) {
        hall = createHall(currentCompany.id, {
            name: "Бар / Касса",
            description: "Служебный зал для быстрых чеков",
            active: true,
        });
    }

    let table = loadTables(currentCompany.id, hall.id).find((item) => item.name === "Быстрый чек");
    if (!table) {
        table = createTable(currentCompany.id, hall.id, {
            name: "Быстрый чек",
            seats: 1,
            status: "free",
            type: "square",
            x: 80,
            y: 80,
            width: 120,
            height: 90,
            comment: "Для продаж без стола",
        });
    }

    return table;
}

function handleOrderItemAction(action, itemId) {
    const order = getActiveOrder();
    const item = order?.items.find((orderItem) => idsEqual(orderItem.id, itemId));

    if (!order || !item) {
        return;
    }

    if (action === "comment") {
        openItemCommentModal(order, item);
        return;
    }

    if (action === "modifier") {
        openModifierModal(order, item);
        return;
    }

    const nextItems = order.items
        .map((orderItem) => {
            if (!idsEqual(orderItem.id, itemId)) {
                return orderItem;
            }

            const quantity = action === "plus"
                ? orderItem.quantity + 1
                : action === "minus"
                    ? Math.max(1, orderItem.quantity - 1)
                    : orderItem.quantity;
            const modifierTotal = (orderItem.modifiers || []).reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
            return {
                ...orderItem,
                quantity,
                total: (Number(orderItem.price || 0) + modifierTotal) * quantity,
            };
        })
        .filter((orderItem) => action !== "remove" || !idsEqual(orderItem.id, itemId));

    updateOrder(order.id, { items: nextItems, historyAction: "Изменены позиции заказа" });
    renderActiveScreen();
}

function openItemCommentModal(order, item) {
    openWorkspaceModal("Комментарий к позиции", `
        <form class="workspace-form" id="itemCommentForm">
            <p>${escapeHtml(item.name)}</p>
            <label>Комментарий<textarea name="comment" rows="4">${escapeHtml(item.comment || "")}</textarea></label>
            <button class="primary-btn" type="submit">Сохранить комментарий</button>
        </form>
    `);

    document.getElementById("itemCommentForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const comment = new FormData(event.currentTarget).get("comment");
        updateOrder(order.id, {
            items: order.items.map((orderItem) => idsEqual(orderItem.id, item.id) ? { ...orderItem, comment } : orderItem),
            historyAction: "Добавлен комментарий",
        });
        closeWorkspaceModal();
        renderActiveScreen();
    });
}

function openModifierModal(order, item) {
    openWorkspaceModal("Модификатор", `
        <form class="workspace-form" id="itemModifierForm">
            <p>${escapeHtml(item.name)}</p>
            <label>Название<input name="name" type="text" value="Добавка" required></label>
            <label>Цена<input name="price" type="number" step="0.01" value="0"></label>
            <button class="primary-btn" type="submit">Добавить модификатор</button>
        </form>
    `);

    document.getElementById("itemModifierForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        const modifier = { id: Date.now(), name: data.name, price: Number(data.price || 0) };
        updateOrder(order.id, {
            items: order.items.map((orderItem) => {
                if (!idsEqual(orderItem.id, item.id)) {
                    return orderItem;
                }

                const modifiers = [...(orderItem.modifiers || []), modifier];
                const modifierTotal = modifiers.reduce((sum, current) => sum + Number(current.price || 0), 0);
                return {
                    ...orderItem,
                    modifiers,
                    total: (Number(orderItem.price || 0) + modifierTotal) * Number(orderItem.quantity || 1),
                };
            }),
            historyAction: "Добавлен модификатор",
        });
        closeWorkspaceModal();
        renderActiveScreen();
    });
}

function handleOrderAction(action) {
    const order = getActiveOrder();

    if (!order && action !== "new-order") {
        toast("Сначала выберите заказ");
        return;
    }

    if (action === "pay") {
        openPaymentModal(order);
    } else if (action === "kitchen") {
        sendOrderToKitchen(order);
    } else if (action === "print") {
        printOrder(order);
    } else if (action === "discount") {
        openDiscountModal(order);
    } else if (action === "transfer") {
        openTransferModal(order);
    } else if (action === "merge") {
        openMergeModal(order);
    } else if (action === "split") {
        openSplitModal(order);
    } else if (action === "client") {
        openClientModal(order);
    } else if (action === "close") {
        confirmCloseOrder(order);
    } else if (action === "cancel") {
        confirmCancelOrder(order);
    } else if (action === "history") {
        openOrderHistory(order);
    } else if (action === "more") {
        openMoreOrderActions(order);
    }
}

function openMoreOrderActions(order) {
    openWorkspaceModal("Дополнительно", `
        <div class="workspace-more-actions">
            <button class="secondary-btn" type="button" data-more-order-action="client">Клиент</button>
            <button class="secondary-btn" type="button" data-more-order-action="transfer">Перенести стол</button>
            <button class="secondary-btn" type="button" data-more-order-action="split">Разделить чек</button>
            <button class="secondary-btn" type="button" data-more-order-action="merge">Объединить</button>
            <button class="secondary-btn" type="button" data-more-order-action="close">Закрыть без оплаты</button>
            <button class="secondary-btn" type="button" data-more-order-action="history">История заказа</button>
            <button class="secondary-btn danger-btn" type="button" data-more-order-action="cancel">Отменить заказ</button>
        </div>
    `);

    document.querySelectorAll("[data-more-order-action]").forEach((button) => {
        button.addEventListener("click", () => {
            closeWorkspaceModal();
            handleOrderAction(button.dataset.moreOrderAction);
        });
    });
}

function openOrderHistory(order) {
    const rows = (order.history || []).slice().reverse().map((item) => `
        <div class="workspace-detail-row">
            <span>${escapeHtml(item.action || "Событие")}</span>
            <small>${formatDateTime(item.createdAt)}</small>
        </div>
    `).join("");

    openWorkspaceModal("История заказа", `
        <div class="workspace-list">
            ${rows || "<p class=\"empty-check\">Истории пока нет.</p>"}
        </div>
    `);
}

function openPaymentModal(order) {
    updateOrder(order.id, { historyAction: "Ожидает оплату" });
    changeTableStatus(order.tableId, "payment");
    openWorkspaceModal("Оплата заказа", `
        <form class="workspace-form" id="orderPaymentForm">
            <div class="payment-total-card">
                <span>Итого</span>
                <strong>${formatMoney(order.total, currentCompany.settings.currency)}</strong>
            </div>
            <div class="workspace-pay-options">
                <button class="is-active" type="button" data-pay-choice="cash"><span>💵</span>Наличка</button>
                <button type="button" data-pay-choice="card"><span>💳</span>Безнал</button>
            </div>
            <input name="type" type="hidden" value="cash">
            <div class="workspace-payment-fields" data-payment-fields>
                <label data-cash-received>Сколько дали<input name="cashReceived" type="number" min="0" step="0.01" value="${order.total}" inputmode="decimal"></label>
                <div class="workspace-change-card" data-change-card>
                    <span>Сдача</span>
                    <strong data-change-amount>${formatMoney(0, currentCompany.settings.currency)}</strong>
                </div>
            </div>
            <button class="primary-btn workspace-pay-submit" type="submit">Оплатить и закрыть</button>
        </form>
    `);
    bindRipple(document.getElementById("workspaceModal"));
    updateCashChange(order.total);

    document.querySelectorAll("[data-pay-choice]").forEach((button) => {
        button.addEventListener("click", () => {
            const type = button.dataset.payChoice;
            document.querySelectorAll("[data-pay-choice]").forEach((item) => item.classList.toggle("is-active", item === button));
            document.querySelector("#orderPaymentForm [name='type']").value = type;
            const cashField = document.querySelector("[data-cash-received]");
            const changeCard = document.querySelector("[data-change-card]");
            cashField.hidden = type === "card";
            changeCard.hidden = type === "card";
            updateCashChange(order.total);
        });
    });

    document.querySelector("#orderPaymentForm [name='cashReceived']").addEventListener("input", () => updateCashChange(order.total));

    document.getElementById("orderPaymentForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        const received = Number(data.cashReceived || 0);
        const change = Math.max(0, received - order.total);
        const payments = [{
            type: data.type,
            amount: order.total,
            meta: data.type === "cash" ? { received, change } : {},
        }];
        const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

        if (data.type === "cash" && received < order.total) {
            toast("Наличных меньше суммы заказа");
            return;
        }

        if (paidAmount < order.total) {
            toast("Сумма оплаты меньше итога");
            return;
        }

        closeOrder(order.id, payments);
        activeOrderId = null;
        closeWorkspaceModal();
        activeScreen = STAFF_SCREENS.quick;
        renderWorkspace();
        toast("Заказ закрыт");
    });
}

function updateCashChange(total) {
    const input = document.querySelector("#orderPaymentForm [name='cashReceived']");
    const output = document.querySelector("[data-change-amount]");
    if (!input || !output) {
        return;
    }

    const change = Math.max(0, Number(input.value || 0) - Number(total || 0));
    output.textContent = formatMoney(change, currentCompany.settings.currency);
}

function confirmCloseOrder(order) {
    openWorkspaceModal("Закрыть заказ", `
        <div class="workspace-confirm">
            <p>Заказ ${escapeHtml(order.number)} будет закрыт без добавления оплаты.</p>
            <p>Используйте это действие только если расчет уже выполнен вне системы.</p>
            <button class="primary-btn" type="button" data-confirm-close-order>Подтвердить закрытие</button>
        </div>
    `);

    document.querySelector("[data-confirm-close-order]").addEventListener("click", () => {
        closeOrder(order.id, order.payments || []);
        activeOrderId = null;
        closeWorkspaceModal();
        activeScreen = STAFF_SCREENS.quick;
        renderWorkspace();
        toast("Заказ закрыт");
    });
}

function confirmCancelOrder(order) {
    openWorkspaceModal("Отменить заказ", `
        <div class="workspace-confirm">
            <p>Заказ ${escapeHtml(order.number)} будет отменен, стол освободится.</p>
            <p>Действие попадет в архив отмененных чеков.</p>
            <button class="primary-btn danger-btn" type="button" data-confirm-cancel-order>Подтвердить отмену</button>
        </div>
    `);

    document.querySelector("[data-confirm-cancel-order]").addEventListener("click", () => {
        cancelOrder(order.id);
        activeOrderId = null;
        closeWorkspaceModal();
        activeScreen = STAFF_SCREENS.quick;
        renderWorkspace();
        toast("Заказ отменен");
    });
}

function sendOrderToKitchen(order) {
    if (!order.items.length) {
        toast("В заказе нет позиций");
        return;
    }

    createKitchenOrder(order);
    changeTableStatus(order.tableId, "occupied");
    toast("Заказ отправлен на кухню");
    renderWorkspace();
}

function printOrder(order) {
    const pseudoReceipt = calculateReceipt({
        ...order,
        number: order.number,
        surcharge: order.tax || 0,
        payments: order.payments || [],
        qrCode: "",
    });
    openWorkspaceModal("Печать чека", `
        ${printReceiptHtml(pseudoReceipt, currentCompany)}
        <button class="primary-btn" type="button" data-work-print>Печать</button>
    `);
    document.querySelector("[data-work-print]").addEventListener("click", () => window.print());
}

function openDiscountModal(order) {
    const currentPercent = order.subtotal
        ? Math.round((Number(order.discount || 0) / Number(order.subtotal || 1)) * 10000) / 100
        : 0;
    openWorkspaceModal("Скидка", `
        <form class="workspace-form" id="discountForm">
            <label>Процент скидки<input name="discountPercent" type="number" min="0" max="100" step="0.01" value="${currentPercent}"></label>
            <p>Скидка считается от подытога заказа.</p>
            <button class="primary-btn" type="submit">Применить скидку</button>
        </form>
    `);

    document.getElementById("discountForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const percent = Math.min(100, Math.max(0, Number(new FormData(event.currentTarget).get("discountPercent") || 0)));
        const discount = Math.round((Number(order.subtotal || 0) * percent / 100) * 100) / 100;
        updateOrder(order.id, { discount, historyAction: `Применена скидка ${percent}%` });
        closeWorkspaceModal();
        renderActiveScreen();
    });
}

function openTransferModal(order) {
    const tables = loadTables(currentCompany.id).filter((table) => !idsEqual(table.id, order.tableId));
    openWorkspaceModal("Перенести заказ", `
        <form class="workspace-form" id="transferForm">
            <label>Новый стол
                <select name="tableId">
                    ${tables.map((table) => `<option value="${table.id}">${escapeHtml(table.name)}</option>`).join("")}
                </select>
            </label>
            <button class="primary-btn" type="submit">Перенести заказ</button>
        </form>
    `);

    document.getElementById("transferForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const tableId = new FormData(event.currentTarget).get("tableId");
        const updated = transferOrder(order.id, tableId);
        activeOrderId = updated?.id || null;
        closeWorkspaceModal();
        renderActiveScreen();
    });
}

function openMergeModal(order) {
    const orders = loadOrders(currentCompany.id, "opened").filter((item) => !idsEqual(item.id, order.id));
    openWorkspaceModal("Объединить заказы", `
        <form class="workspace-form" id="mergeForm">
            <label>Заказ для объединения
                <select name="orderId">
                    ${orders.map((item) => `<option value="${item.id}">${escapeHtml(item.number)} · стол ${item.tableId}</option>`).join("")}
                </select>
            </label>
            <button class="primary-btn" type="submit">Объединить</button>
        </form>
    `);

    document.getElementById("mergeForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const targetId = new FormData(event.currentTarget).get("orderId");
        const target = orders.find((item) => idsEqual(item.id, targetId));
        if (!target) return;
        updateOrder(order.id, {
            items: [...order.items, ...target.items],
            guests: order.guests + target.guests,
            historyAction: `Объединен с ${target.number}`,
        });
        cancelOrder(target.id);
        closeWorkspaceModal();
        renderActiveScreen();
    });
}

function openSplitModal(order) {
    openWorkspaceModal("Разделить чек", `
        <form class="workspace-form" id="splitForm">
            <p>Выберите позиции, которые нужно вынести в новый заказ.</p>
            ${order.items.map((item) => `
                <label class="workspace-check-row">
                    <input name="items" type="checkbox" value="${item.id}">
                    ${escapeHtml(item.name)} · ${formatMoney(item.total, currentCompany.settings.currency)}
                </label>
            `).join("")}
            <button class="primary-btn" type="submit">Создать отдельный заказ</button>
        </form>
    `);

    document.getElementById("splitForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const selectedIds = new FormData(event.currentTarget).getAll("items");
        const selectedItems = order.items.filter((item) => selectedIds.some((id) => idsEqual(id, item.id)));
        if (!selectedItems.length) {
            toast("Выберите позиции");
            return;
        }

        const newOrder = createOrder(currentCompany.id, order.hallId, order.tableId, {
            waiterId: order.waiterId,
            cashierId: order.cashierId,
            guests: 1,
            items: selectedItems,
            comments: `Разделен из ${order.number}`,
        });
        updateOrder(order.id, {
            items: order.items.filter((item) => !selectedIds.some((id) => idsEqual(id, item.id))),
            historyAction: `Разделен чек ${newOrder.number}`,
        });
        activeOrderId = newOrder.id;
        closeWorkspaceModal();
        renderActiveScreen();
    });
}

function openClientModal(order) {
    openWorkspaceModal("Клиент заказа", `
        <form class="workspace-form" id="clientForm">
            <label>Имя клиента<input name="customerName" type="text" value="${escapeHtml(order.customerName || "")}" placeholder="Например: Алексей"></label>
            <label>Телефон<input name="customerPhone" type="tel" value="${escapeHtml(order.customerPhone || "")}"></label>
            <button class="primary-btn" type="submit">Добавить клиента</button>
        </form>
    `);

    document.getElementById("clientForm").addEventListener("submit", (event) => {
        event.preventDefault();
        updateOrder(order.id, {
            ...Object.fromEntries(new FormData(event.currentTarget).entries()),
            historyAction: "Добавлен клиент",
        });
        closeWorkspaceModal();
        renderActiveScreen();
    });
}

function renderReceiptArchive() {
    const receipts = getArchiveItems();
    const tabs = [
        ["all", "Все чеки"],
        ["cash", "Наличные"],
        ["card", "Безналичные"],
        ["mixed", "Смешанная"],
        ["refund", "Возвраты"],
        ["void", "Отмененные"],
    ];

    return `
        <section class="workspace-full panel">
            <div class="workspace-section-head">
                <div>
                    <h3>Архив чеков</h3>
                    <p>Поиск, просмотр, повторная печать и детали заказа.</p>
                </div>
                <div class="workspace-archive-head-actions">
                    <button class="secondary-btn" type="button" data-archive-back-tables>Вернуться к столикам</button>
                    <input id="receiptArchiveSearch" type="search" placeholder="Поиск по номеру, сумме, клиенту" value="${escapeHtml(receiptSearch)}">
                </div>
            </div>
            <div class="workspace-tabs">
                ${tabs.map(([value, label]) => `<button class="${activeReceiptFilter === value ? "is-active" : ""}" type="button" data-receipt-filter="${value}">${label}</button>`).join("")}
            </div>
            <div class="workspace-list">
                ${receipts.length ? receipts.map((item) => `
                    <article class="workspace-receipt-row">
                        <div>
                            <strong>${escapeHtml(item.number)}</strong>
                            <span>${escapeHtml(item.kind)} · ${formatDateTime(item.createdAt || item.paidAt)}</span>
                        </div>
                        <b>${formatMoney(item.total, currentCompany.settings.currency)}</b>
                        <small>${escapeHtml(getPaymentLabel(item.payments))}</small>
                        <button type="button" data-view-archive="${item.archiveId}">Детали</button>
                        <button type="button" data-print-archive="${item.archiveId}">Печать</button>
                        ${item.status === "paid" && canShowAction(currentUser, "sales:refund") ? `<button type="button" data-refund-receipt="${item.archiveId}">Возврат</button>` : ""}
                    </article>
                `).join("") : renderEmptyState("Чеков пока нет", "После оплат они появятся в архиве.", "")}
            </div>
        </section>
    `;
}

function bindReceiptArchive() {
    document.querySelector("[data-archive-back-tables]")?.addEventListener("click", () => {
        activeScreen = STAFF_SCREENS.quick;
        activeOrderId = null;
        orderSheetState = "peek";
        renderWorkspace();
    });

    document.getElementById("receiptArchiveSearch")?.addEventListener("input", (event) => {
        receiptSearch = event.target.value;
        renderActiveScreen();
        setTimeout(() => document.getElementById("receiptArchiveSearch")?.focus(), 0);
    });

    document.querySelectorAll("[data-receipt-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            activeReceiptFilter = button.dataset.receiptFilter;
            renderActiveScreen();
        });
    });

    document.querySelectorAll("[data-view-archive]").forEach((button) => {
        button.addEventListener("click", () => {
            const item = getArchiveItems(true).find((archiveItem) => archiveItem.archiveId === button.dataset.viewArchive);
            if (item) viewArchiveDetails(item);
        });
    });

    document.querySelectorAll("[data-print-archive]").forEach((button) => {
        button.addEventListener("click", () => {
            const item = getArchiveItems(true).find((archiveItem) => archiveItem.archiveId === button.dataset.printArchive);
            if (item) printOrderLikeReceipt(item);
        });
    });

    document.querySelectorAll("[data-refund-receipt]").forEach((button) => {
        button.addEventListener("click", () => {
            const receiptId = button.dataset.refundReceipt.replace("receipt-", "");
            const receipt = loadReceipts(currentCompany.id).find((item) => Number(item.id) === Number(receiptId));
            if (receipt) {
                confirmRefundReceipt(receipt);
            }
        });
    });
}

function getArchiveItems(ignoreSearch = false) {
    const query = ignoreSearch ? "" : receiptSearch.trim().toLowerCase();
    const receipts = loadReceipts(currentCompany.id).filter((receipt) => ["paid", "refund", "void"].includes(receipt.status)).map((receipt) => ({
        ...receipt,
        archiveId: `receipt-${receipt.id}`,
        kind: "Чек",
    }));
    const orders = loadOrders(currentCompany.id).filter((order) => ["closed", "cancelled"].includes(order.status)).map((order) => ({
        ...order,
        archiveId: `order-${order.id}`,
        kind: "Заказ",
        status: order.status === "cancelled" ? "void" : "paid",
    }));

    return [...receipts, ...orders]
        .filter((item) => activeReceiptFilter === "all"
            || item.status === activeReceiptFilter
            || getPaymentTypes(item.payments).includes(activeReceiptFilter))
        .filter((item) => !query
            || item.number.toLowerCase().includes(query)
            || String(item.total).includes(query)
            || item.customerName?.toLowerCase().includes(query)
            || item.customerPhone?.toLowerCase().includes(query))
        .sort((left, right) => new Date(right.paidAt || right.updatedAt || right.createdAt).getTime() - new Date(left.paidAt || left.updatedAt || left.createdAt).getTime());
}

function viewArchiveDetails(item) {
    const rows = (item.items || []).map((receiptItem) => `
        <article class="workspace-detail-row">
            <div>
                <strong>${escapeHtml(receiptItem.name)}</strong>
                <span>${escapeHtml(receiptItem.comment || "Без комментария")}</span>
            </div>
            <small>${Number(receiptItem.quantity || 1)} x ${formatMoney(receiptItem.price || 0, currentCompany.settings.currency)}</small>
            <b>${formatMoney(receiptItem.total || 0, currentCompany.settings.currency)}</b>
        </article>
    `).join("");

    openWorkspaceModal("Детали чека", `
        <div class="workspace-receipt-details">
            <div class="payment-total-card">
                <span>${escapeHtml(item.kind)} ${escapeHtml(item.number)}</span>
                <strong>${formatMoney(item.total, currentCompany.settings.currency)}</strong>
            </div>
            <p>Дата: ${formatDateTime(item.paidAt || item.updatedAt || item.createdAt)}</p>
            <p>Оплата: ${escapeHtml(getPaymentLabel(item.payments))}</p>
            <p>Клиент: ${escapeHtml(item.customerName || "Не указан")}</p>
            <div class="workspace-list">${rows || "<p class=\"empty-check\">Позиции отсутствуют.</p>"}</div>
            <button class="primary-btn" type="button" data-print-archive-modal>Печать</button>
        </div>
    `);
    document.querySelector("[data-print-archive-modal]").addEventListener("click", () => printOrderLikeReceipt(item));
}

function confirmRefundReceipt(receipt) {
    openWorkspaceModal("Возврат", `
        <div class="workspace-confirm">
            <p>Создать возврат по чеку ${escapeHtml(receipt.number)} на сумму ${formatMoney(receipt.total, currentCompany.settings.currency)}?</p>
            <button class="primary-btn danger-btn" type="button" data-confirm-refund>Подтвердить возврат</button>
        </div>
    `);

    document.querySelector("[data-confirm-refund]").addEventListener("click", () => {
        refundReceipt(receipt);
        closeWorkspaceModal();
        toast("Возврат создан");
        renderActiveScreen();
    });
}

function printOrderLikeReceipt(item) {
    const receipt = calculateReceipt({
        ...item,
        surcharge: item.surcharge || item.tax || 0,
        qrCode: item.qrCode || "",
    });
    openWorkspaceModal("Детали чека", `
        ${printReceiptHtml(receipt, currentCompany)}
        <button class="primary-btn" type="button" data-work-print>Печать</button>
    `);
    document.querySelector("[data-work-print]").addEventListener("click", () => window.print());
}

function renderReports() {
    const reportRange = ensureDefaultReportRange();
    const report = buildReport();
    return `
        <section class="workspace-full panel">
            <div class="workspace-section-head">
                <div>
                    <h3>Отчеты</h3>
                    <p>Выберите дату и время. По умолчанию отчет считается с 00:00 до 00:00.</p>
                </div>
                <div class="workspace-report-actions">
                    <button type="button" data-report-back-tables>Вернуться к столикам</button>
                    <button type="button" data-export-report="csv">CSV</button>
                    <button type="button" data-export-report="excel">Excel</button>
                    <button type="button" data-export-report="pdf">PDF</button>
                    <button type="button" data-export-report="print">Печать</button>
                </div>
            </div>
            <div class="workspace-report-filters">
                <label>Дата<input id="reportDate" type="date" value="${reportRange.date}"></label>
                <label>С<input id="reportStartTime" type="time" value="${reportRange.startTime}"></label>
                <label>До<input id="reportEndTime" type="time" value="${reportRange.endTime}"></label>
                <button class="primary-btn" type="button" data-build-report>Сформировать отчет</button>
            </div>
            <div class="workspace-report-grid">
                ${report.cards.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("")}
            </div>
            <div class="workspace-report-tables">
                ${renderReportList("Самые продаваемые блюда", report.topFood)}
                ${renderReportList("Самые продаваемые напитки", report.topDrinks)}
                ${renderReportList("Продажи по категориям", report.byCategory)}
                ${renderReportList("Продажи по официантам", report.byWaiter)}
                ${renderReportList("Продажи по кассирам", report.byCashier)}
                ${renderReportList("Продажи по часам", report.byHour)}
            </div>
        </section>
    `;
}

function bindReports() {
    document.querySelector("[data-report-back-tables]")?.addEventListener("click", () => {
        activeScreen = STAFF_SCREENS.quick;
        activeOrderId = null;
        orderSheetState = "peek";
        renderWorkspace();
    });

    document.querySelector("[data-build-report]").addEventListener("click", () => {
        reportPeriod = "custom";
        customReportRange = buildReportRangeFromInputs();
        renderActiveScreen();
    });

    document.querySelectorAll("[data-export-report]").forEach((button) => {
        button.addEventListener("click", () => exportReport(button.dataset.exportReport));
    });
}

function buildReport(rangeOverride = null) {
    const { start, end } = rangeOverride || getReportRange();
    const paidReceipts = loadReceipts(currentCompany.id).filter((receipt) => (
        ["paid", "refund"].includes(receipt.status)
        && withinRange(receipt.paidAt || receipt.createdAt, start, end)
    ));
    const closedOrders = loadOrders(currentCompany.id).filter((order) => (
        ["closed", "cancelled"].includes(order.status)
        && withinRange(order.updatedAt || order.createdAt, start, end)
    ));
    const documents = [...paidReceipts, ...closedOrders];
    const paidDocuments = documents.filter((item) => item.status !== "refund" && item.status !== "cancelled");
    const revenue = paidDocuments.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const refunds = documents.filter((item) => item.status === "refund" || item.status === "cancelled").reduce((sum, item) => sum + Math.abs(Number(item.total || 0)), 0);
    const discounts = documents.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const surcharges = documents.reduce((sum, item) => sum + Number(item.surcharge || item.tax || 0), 0);
    const paymentTotals = getPaymentTotals(documents);
    const guests = closedOrders.reduce((sum, order) => sum + Number(order.guests || 0), 0);
    const averageCheck = paidDocuments.length ? revenue / paidDocuments.length : 0;

    return {
        cards: [
            ["Количество заказов", String(paidDocuments.length)],
            ["Количество гостей", String(guests)],
            ["Выручка", formatMoney(revenue, currentCompany.settings.currency)],
            ["Наличные", formatMoney(paymentTotals.cash, currentCompany.settings.currency)],
            ["Безналичные", formatMoney(paymentTotals.card, currentCompany.settings.currency)],
            ["Смешанная оплата", formatMoney(paymentTotals.mixed, currentCompany.settings.currency)],
            ["Средний чек", formatMoney(averageCheck, currentCompany.settings.currency)],
            ["Возвраты", formatMoney(refunds, currentCompany.settings.currency)],
            ["Скидки", formatMoney(discounts, currentCompany.settings.currency)],
            ["Надбавки", formatMoney(surcharges, currentCompany.settings.currency)],
        ],
        topFood: aggregateItems(documents, "food").slice(0, 5),
        topDrinks: aggregateItems(documents, "drink").slice(0, 5),
        byCategory: aggregateCategories(documents),
        byWaiter: aggregateByUser(closedOrders, "waiterId"),
        byCashier: aggregateByUser(documents, "cashierId"),
        byHour: aggregateByHour(documents),
    };
}

function renderReportList(title, rows) {
    return `
        <article class="workspace-report-list">
            <h4>${escapeHtml(title)}</h4>
            ${rows.length ? rows.map((row) => `
                <p><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></p>
            `).join("") : "<p><span>Нет данных</span><strong>—</strong></p>"}
        </article>
    `;
}

function renderInventory() {
    const query = inventorySearch.trim().toLowerCase();
    const ingredients = loadIngredients(currentCompany.id).filter((ingredient) => (
        !query
        || ingredient.name.toLowerCase().includes(query)
        || ingredient.sku.toLowerCase().includes(query)
        || ingredient.category?.toLowerCase().includes(query)
    ));
    return `
        <section class="workspace-full panel">
            <div class="workspace-section-head">
                <div>
                    <h3>Инвентаризация</h3>
                    <p>Остатки, приход, списание и подтверждение факта.</p>
                </div>
                <input id="inventoryWorkSearch" type="search" placeholder="Поиск ингредиентов" value="${escapeHtml(inventorySearch)}">
            </div>
            <div class="workspace-inventory-actions">
                <button class="primary-btn" type="button" data-inventory-action="audit">Начать инвентаризацию</button>
                <button class="secondary-btn" type="button" data-inventory-action="income">Создать приход</button>
                <button class="secondary-btn" type="button" data-inventory-action="writeoff">Создать списание</button>
            </div>
            <div class="workspace-list">
                ${ingredients.length ? ingredients.map((ingredient) => `
                    <article class="workspace-inventory-row">
                        <div>
                            <strong>${escapeHtml(ingredient.name)}</strong>
                            <span>${escapeHtml(ingredient.sku)} · ${escapeHtml(ingredient.category)}</span>
                        </div>
                        <b>${ingredient.quantity} ${escapeHtml(ingredient.unit)}</b>
                        <small>Мин: ${ingredient.minQuantity}</small>
                        <button type="button" data-inventory-ingredient="${ingredient.id}" data-inventory-action="income">Приход</button>
                        <button type="button" data-inventory-ingredient="${ingredient.id}" data-inventory-action="writeoff">Списание</button>
                    </article>
                `).join("") : renderEmptyState("Склад пуст", "Добавьте ингредиенты в разделе Склад.", "")}
            </div>
        </section>
    `;
}

function bindInventory() {
    document.getElementById("inventoryWorkSearch")?.addEventListener("input", (event) => {
        inventorySearch = event.target.value;
        renderActiveScreen();
        setTimeout(() => document.getElementById("inventoryWorkSearch")?.focus(), 0);
    });

    document.querySelectorAll("[data-inventory-action]").forEach((button) => {
        button.addEventListener("click", () => openInventoryAction(button.dataset.inventoryAction, button.dataset.inventoryIngredient));
    });
}

function openInventoryAction(action, ingredientId = "") {
    const ingredients = loadIngredients(currentCompany.id);
    if (!ingredients.length) {
        toast("Сначала добавьте ингредиенты на складе");
        return;
    }

    const ingredientOptions = ingredients.map((ingredient) => `
        <option value="${ingredient.id}" ${Number(ingredient.id) === Number(ingredientId) ? "selected" : ""}>${escapeHtml(ingredient.name)}</option>
    `).join("");
    const title = action === "writeoff" ? "Списание" : action === "income" ? "Приход" : "Инвентаризация";
    const quantityLabel = action === "audit" ? "Фактический остаток" : "Количество";
    openWorkspaceModal(title, `
        <form class="workspace-form" id="inventoryActionForm">
            <label>Ингредиент<select name="ingredientId">${ingredientOptions}</select></label>
            <label>${quantityLabel}<input name="quantity" type="number" min="0" step="0.01" value="1"></label>
            <label>Комментарий<input name="reason" type="text" value="${title}"></label>
            <button class="primary-btn" type="submit">Подтвердить</button>
        </form>
    `);

    document.getElementById("inventoryActionForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        if (action === "writeoff") {
            writeOffStock(data.ingredientId, data.quantity, data.reason, currentUser.id);
        } else if (action === "audit") {
            performInventory(currentCompany.id, data.ingredientId, data.quantity, currentUser.id);
        } else {
            addStock(data.ingredientId, data.quantity, data.reason, currentUser.id);
        }
        closeWorkspaceModal();
        renderActiveScreen();
        toast(action === "audit" ? "Остатки подтверждены" : "Остатки обновлены");
    });
}

function renderStaffMenu() {
    const shift = getOpenShift();
    return `
        <section class="workspace-full panel">
            <div class="workspace-menu-grid">
                ${canShowAction(currentUser, "shifts:open") ? renderMenuAction("open-shift", "Открыть смену", shift ? "Уже открыта" : "Начать работу") : ""}
                ${canShowAction(currentUser, "shifts:close") ? renderMenuAction("close-shift", "Закрыть смену", "Итоги за смену") : ""}
                ${canShowAction(currentUser, "inventory:manage") ? renderMenuAction("inventory", "Склад", "Остатки") : ""}
                ${renderMenuAction("reports", "Отчеты", "Продажи")}
                ${renderMenuAction("settings", "Настройки", "Параметры")}
                ${renderMenuAction("switch-user", "Сменить пользователя", "Другой PIN/логин")}
                ${renderMenuAction("logout", "Выйти", "Закончить работу")}
                ${renderMenuAction("about", "О программе", "POS Poster")}
            </div>
        </section>
    `;
}

function renderMenuAction(action, title, hint) {
    return `
        <button class="workspace-menu-action" type="button" data-menu-action="${action}">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(hint)}</span>
        </button>
    `;
}

function bindStaffMenu() {
    document.querySelectorAll("[data-menu-action]").forEach((button) => {
        button.addEventListener("click", () => handleMenuAction(button.dataset.menuAction));
    });
}

function handleMenuAction(action) {
    if (action === "open-shift") openShiftModal();
    if (action === "close-shift") closeShiftModal();
    if (action === "inventory") {
        activeScreen = STAFF_SCREENS.inventory;
        renderWorkspace();
    }
    if (action === "reports") {
        activeScreen = STAFF_SCREENS.reports;
        renderWorkspace();
    }
    if (action === "settings") toast("Настройки доступны администратору");
    if (action === "switch-user" || action === "logout") {
        const logoutButton = document.getElementById("logoutButton");
        if (logoutButton) {
            logoutButton.click();
        } else {
            window.location.href = "index.html";
        }
    }
    if (action === "about") openWorkspaceModal("О программе", "<p>Простое рабочее место для сотрудников ресторана.</p>");
}

function openShiftModal() {
    if (!canShowAction(currentUser, "shifts:open")) {
        toast("Нет права открывать смену");
        return;
    }

    const shift = getOpenShift();
    if (shift) {
        toast("Смена уже открыта");
        return;
    }

    openWorkspaceModal("Открыть смену", `
        <form class="workspace-form" id="openShiftForm">
            <p>${formatDateTime(new Date().toISOString())} · ${escapeHtml(currentUser.username)}</p>
            <label>Сумма в кассе<input name="openingCash" type="number" min="0" step="0.01" value="0"></label>
            <label>Комментарий<textarea name="comment" rows="3"></textarea></label>
            <button class="primary-btn" type="submit">Открыть смену</button>
        </form>
    `);

    document.getElementById("openShiftForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        const shifts = storage.get(STORAGE_KEYS.staffShifts, []);
        storage.set(STORAGE_KEYS.staffShifts, [{
            id: shifts.length ? Math.max(...shifts.map((item) => Number(item.id))) + 1 : 1,
            companyId: Number(currentCompany.id),
            employeeId: Number(currentUser.id),
            userId: Number(currentUser.id),
            status: "opened",
            openingCash: Number(data.openingCash || 0),
            comment: data.comment || "",
            startTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
        }, ...shifts]);
        closeWorkspaceModal();
        toast("Смена открыта");
        renderWorkspace();
    });
}

function closeShiftModal() {
    if (!canShowAction(currentUser, "shifts:close")) {
        toast("Нет права закрывать смену");
        return;
    }

    const shift = getOpenShift();
    if (!shift) {
        toast("Открытой смены нет");
        return;
    }

    const report = buildReport({ start: new Date(shift.startTime), end: new Date() });
    const shiftCards = report.cards.map((card, index) => (index === 0 ? ["Количество чеков", card[1]] : card));
    openWorkspaceModal("Закрытие смены", `
        <div class="workspace-report-grid">
            ${shiftCards.slice(0, 10).map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("")}
            <article class="metric-card"><span>Время работы</span><strong>${escapeHtml(getShiftDuration(shift.startTime))}</strong></article>
        </div>
        <button class="primary-btn" type="button" data-confirm-close-shift>Подтвердить закрытие смены</button>
    `);

    document.querySelector("[data-confirm-close-shift]").addEventListener("click", () => {
        const shifts = storage.get(STORAGE_KEYS.staffShifts, []);
        storage.set(STORAGE_KEYS.staffShifts, shifts.map((item) => (
            Number(item.id) === Number(shift.id)
                ? { ...item, status: "closed", endTime: new Date().toISOString(), report }
                : item
        )));
        closeWorkspaceModal();
        toast("Смена закрыта");
        renderWorkspace();
    });
}

function handleWorkspaceAction(action) {
    if (action === "toggle-menu") {
        setWorkspaceMenuOpen(!workspaceMenuOpen);
        return;
    }

    if (action === "reports") {
        setWorkspaceMenuOpen(false);
        activeScreen = STAFF_SCREENS.reports;
        renderWorkspace();
        return;
    }

    if (action === "receipts") {
        setWorkspaceMenuOpen(false);
        activeScreen = STAFF_SCREENS.receipts;
        renderWorkspace();
        return;
    }

    if (action === "open-shift") {
        setWorkspaceMenuOpen(false);
        openShiftModal();
        renderWorkspace();
        return;
    }

    if (action === "add-category") {
        setWorkspaceMenuOpen(false);
        createCategoryFromWorkspace();
        return;
    }

    if (action === "add-product") {
        setWorkspaceMenuOpen(false);
        createProductFromWorkspace();
        return;
    }

    if (action === "print") {
        setWorkspaceMenuOpen(false);
        const order = getActiveOrder();
        if (order) {
            printOrder(order);
        } else {
            toast("Сначала выберите стол или заказ");
        }
        renderWorkspace();
        return;
    }

    if (action === "logout") {
        document.getElementById("logoutButton")?.click();
        return;
    }

    if (action === "quick-sale") {
        setWorkspaceMenuOpen(false);
        activeScreen = STAFF_SCREENS.quick;
        const order = createQuickSaleOrder();
        activeOrderId = order.id;
        renderWorkspace();
        toast("Быстрый чек открыт");
        return;
    }

    if (action === "new-order") {
        setWorkspaceMenuOpen(false);
        activeScreen = STAFF_SCREENS.quick;
        activeOrderId = null;
        orderSheetState = "peek";
        renderWorkspace();
        toast("Выберите свободный стол");
    }

    if (action === "pay") {
        const order = getActiveOrder();
        if (order) {
            openPaymentModal(order);
        } else {
            toast("Выберите заказ для оплаты");
        }
    }

    if (action === "ai") {
        document.getElementById("aiFloatingButton")?.click();
    }
}

function createCategoryFromWorkspace() {
    const name = window.prompt("Название категории");
    if (!name) {
        renderWorkspace();
        return;
    }

    const category = createCategory(currentCompany.id, {
        name,
        description: "",
        icon: "🍽",
        color: "#3B82F6",
        active: true,
    });
    activeProductCategoryId = category.id;
    renderWorkspace();
    toast("Категория добавлена");
}

function createProductFromWorkspace() {
    const categories = loadCategories(currentCompany.id).filter((category) => category.active);
    const category = categories.find((item) => idsEqual(item.id, activeProductCategoryId)) || categories[0];
    if (!category) {
        toast("Сначала добавьте категорию");
        renderWorkspace();
        return;
    }

    const name = window.prompt("Название товара");
    if (!name) {
        renderWorkspace();
        return;
    }

    const price = Number(window.prompt("Цена", "0") || 0);
    createProduct(currentCompany.id, {
        name,
        price,
        categoryId: category.id,
        sku: `MENU-${Date.now()}`,
        quantity: 999,
        status: "active",
        posVisible: true,
    });
    activeProductCategoryId = category.id;
    renderWorkspace();
    toast("Товар добавлен в меню");
}

function handleWorkspaceHotkeys(event) {
    const workspaceView = document.getElementById("workspaceView");
    if (workspaceView && workspaceView.classList.contains("is-active") !== true) {
        return;
    }

    const hasOpenModal = document.getElementById("workspaceModal")?.hidden === false;
    if (hasOpenModal && event.key !== "Escape") {
        return;
    }

    const editableElement = event.target?.closest?.("input, textarea, select, [contenteditable='true']");
    if (editableElement && event.key !== "Escape") {
        return;
    }

    const keyMap = {
        F2: () => handleWorkspaceAction("quick-sale"),
        F3: () => document.getElementById("workspaceProductSearch")?.focus(),
        F4: () => handleWorkspaceAction("pay"),
        F5: () => getActiveOrder() && sendOrderToKitchen(getActiveOrder()),
        F6: () => getActiveOrder() && printOrder(getActiveOrder()),
        F7: () => { activeScreen = STAFF_SCREENS.receipts; renderWorkspace(); },
        F8: () => { activeScreen = STAFF_SCREENS.reports; renderWorkspace(); },
        Escape: closeWorkspaceModal,
    };

    if (keyMap[event.key]) {
        event.preventDefault();
        keyMap[event.key]();
    }
}

function getActiveOrder() {
    if (!activeOrderId) {
        return null;
    }

    return loadOrders(currentCompany.id, "opened").find((order) => idsEqual(order.id, activeOrderId)) || null;
}

function getInitialActiveOrderId() {
    const ownOrder = loadOrders(currentCompany?.id, "opened").find((order) => idsEqual(order.waiterId, currentUser?.id));
    return ownOrder?.id || null;
}

function getOpenShift() {
    return storage.get(STORAGE_KEYS.staffShifts, []).find((shift) => (
        idsEqual(shift.companyId, currentCompany.id)
        && Number(shift.userId || shift.employeeId) === Number(currentUser.id)
        && shift.status === "opened"
    ));
}

function getRoleTitle() {
    const labels = {
        waiter: "Официант",
        cashier: "Кассир",
        bartender: "Бармен",
    };
    return labels[currentUser.role] || "Сотрудник";
}

function getWaiterName(waiterId) {
    return idsEqual(waiterId, currentUser.id) ? currentUser.username : `Сотрудник #${waiterId}`;
}

function getOrderAge(createdAt) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    if (minutes < 60) {
        return `${minutes} мин`;
    }
    return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

function getShiftDuration(startTime) {
    return getOrderAge(startTime);
}

function getPaymentTypes(payments = []) {
    const types = payments.map((payment) => payment.type);
    if (types.includes("cash") && types.includes("card")) {
        return ["mixed"];
    }
    return types;
}

function getPaymentLabel(payments = []) {
    const types = getPaymentTypes(payments);
    if (types.includes("mixed")) return "Смешанная";
    if (types.includes("cash")) return "Наличные";
    if (types.includes("card")) return "Безналичные";
    return "—";
}

function getPaymentTotals(documents) {
    return documents.reduce((totals, item) => {
        const types = getPaymentTypes(item.payments || []);
        if (types.includes("mixed")) {
            totals.mixed += Number(item.total || 0);
        } else if (types.includes("cash")) {
            totals.cash += Number(item.total || 0);
        } else if (types.includes("card")) {
            totals.card += Number(item.total || 0);
        }
        return totals;
    }, { cash: 0, card: 0, mixed: 0 });
}

function getReportRange() {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (reportPeriod === "today") {
        start.setHours(0, 0, 0, 0);
    } else if (reportPeriod === "yesterday") {
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
    } else if (reportPeriod === "7d") {
        start.setDate(start.getDate() - 7);
    } else if (reportPeriod === "30d") {
        start.setDate(start.getDate() - 30);
    } else if (reportPeriod === "custom" && customReportRange?.start && customReportRange?.end) {
        const customStart = new Date(customReportRange.start);
        const customEnd = new Date(customReportRange.end);
        if (customEnd <= customStart) {
            customEnd.setDate(customEnd.getDate() + 1);
        }
        return { start: customStart, end: customEnd };
    } else {
        start.setHours(start.getHours() - 24);
    }

    return { start, end };
}

function ensureDefaultReportRange() {
    if (customReportRange?.date) {
        return customReportRange;
    }

    const today = toDateInputValue(new Date());
    customReportRange = {
        date: today,
        startTime: "00:00",
        endTime: "00:00",
        start: `${today}T00:00`,
        end: `${today}T00:00`,
    };
    reportPeriod = "custom";
    return customReportRange;
}

function buildReportRangeFromInputs() {
    const date = document.getElementById("reportDate").value || toDateInputValue(new Date());
    const startTime = document.getElementById("reportStartTime").value || "00:00";
    const endTime = document.getElementById("reportEndTime").value || "00:00";
    return {
        date,
        startTime,
        endTime,
        start: `${date}T${startTime}`,
        end: `${date}T${endTime}`,
    };
}

function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function withinRange(value, start, end) {
    const date = new Date(value);
    return date >= start && date <= end;
}

function aggregateItems(documents, type) {
    const categories = loadCategories(currentCompany.id);
    const categoryById = new Map(categories.map((category) => [Number(category.id), category.name.toLowerCase()]));
    const products = new Map(loadProducts(currentCompany.id).map((product) => [Number(product.id), product]));
    const drinkWords = ["напит", "кофе", "чай", "бар", "алкоголь", "cola", "кола", "латте", "эспрессо", "капучино"];
    const map = new Map();

    documents.flatMap((item) => item.items || []).forEach((item) => {
        const product = products.get(Number(item.productId));
        const categoryName = categoryById.get(Number(product?.categoryId)) || "";
        const isDrink = drinkWords.some((word) => categoryName.includes(word) || item.name.toLowerCase().includes(word));
        if ((type === "drink") !== isDrink) {
            return;
        }

        const current = map.get(item.name) || 0;
        map.set(item.name, current + Number(item.quantity || 1));
    });

    return [...map.entries()].sort((left, right) => right[1] - left[1]).map(([label, value]) => ({ label, value: String(value) }));
}

function aggregateCategories(documents) {
    const categories = loadCategories(currentCompany.id);
    const categoryById = new Map(categories.map((category) => [Number(category.id), category.name]));
    const products = new Map(loadProducts(currentCompany.id).map((product) => [Number(product.id), product]));
    const map = new Map();
    documents.flatMap((item) => item.items || []).forEach((item) => {
        const product = products.get(Number(item.productId));
        const category = categoryById.get(Number(product?.categoryId)) || "Без категории";
        map.set(category, (map.get(category) || 0) + Number(item.total || 0));
    });
    return [...map.entries()].sort((left, right) => right[1] - left[1]).map(([label, value]) => ({ label, value: formatMoney(value, currentCompany.settings.currency) }));
}

function aggregateByUser(documents, field) {
    const map = new Map();
    documents.forEach((item) => {
        const label = item[field] ? `#${item[field]}` : "Не указан";
        map.set(label, (map.get(label) || 0) + Number(item.total || 0));
    });
    return [...map.entries()].sort((left, right) => right[1] - left[1]).map(([label, value]) => ({ label, value: formatMoney(value, currentCompany.settings.currency) }));
}

function aggregateByHour(documents) {
    const map = new Map();
    documents.forEach((item) => {
        const hour = new Date(item.paidAt || item.updatedAt || item.createdAt).getHours();
        const label = `${String(hour).padStart(2, "0")}:00`;
        map.set(label, (map.get(label) || 0) + Number(item.total || 0));
    });
    return [...map.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([label, value]) => ({ label, value: formatMoney(value, currentCompany.settings.currency) }));
}

function exportReport(type) {
    if (type === "print" || type === "pdf") {
        window.print();
        return;
    }

    const report = buildReport();
    const sections = [
        ["Показатель", report.cards.map(([label, value]) => ({ label, value }))],
        ["Самые продаваемые блюда", report.topFood],
        ["Самые продаваемые напитки", report.topDrinks],
        ["Продажи по категориям", report.byCategory],
        ["Продажи по официантам", report.byWaiter],
        ["Продажи по кассирам", report.byCashier],
        ["Продажи по часам", report.byHour],
    ];
    const rows = sections.flatMap(([section, rows]) => [
        section,
        "Название;Значение",
        ...rows.map((row) => `${escapeCsv(row.label)};${escapeCsv(row.value)}`),
        "",
    ]).join("\n");
    const blob = new Blob([rows], { type: type === "excel" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `staff-report.${type === "excel" ? "xls" : "csv"}`;
    link.click();
    URL.revokeObjectURL(url);
}

function escapeCsv(value) {
    const text = String(value ?? "");
    return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function openWorkspaceModal(title, body) {
    document.getElementById("workspaceModalTitle").textContent = title;
    document.getElementById("workspaceModalBody").innerHTML = body;
    document.getElementById("workspaceModal").hidden = false;
}

function closeWorkspaceModal() {
    const modal = document.getElementById("workspaceModal");
    if (modal) {
        modal.hidden = true;
    }
}

function renderEmptyState(title, text, action) {
    return `
        <div class="empty-state empty-state--action">
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(text)}</p>
            ${action}
        </div>
    `;
}

function formatDateTime(value) {
    if (!value) {
        return "—";
    }

    return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function toast(message) {
    helpers.showToast?.(message);
}

function escapeHtml(value) {
    return helpers.escapeHtml
        ? helpers.escapeHtml(value)
        : String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
}
