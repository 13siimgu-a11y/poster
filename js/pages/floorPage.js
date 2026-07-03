import { makeDraggable } from "../dragdrop.js";
import { idsEqual } from "../apiPersistence.js";
import { createHall, ensureDefaultHall, loadFloor } from "../floor.js";
import { moveHallObject, rotateHallObject } from "../hallEditor.js";
import { cancelOrder, closeOrder, createOrder, loadOrders, transferOrder } from "../orders.js";
import { createReservation, loadReservations } from "../reservations.js";
import { changeTableStatus, createTable, deleteTable, loadTables, TABLE_STATUSES, updateTable } from "../tables.js";

let currentCompany = null;
let currentUser = null;
let activeHall = null;
let helpers = {};
let isBound = false;

export function initFloorPage(context) {
    currentCompany = context.company;
    currentUser = context.user;
    helpers = context;
    activeHall = activeHall || ensureDefaultHall(currentCompany.id);
    bindFloorEvents();
    renderFloor();
}

function bindFloorEvents() {
    if (isBound) {
        return;
    }

    document.getElementById("createHallButton").addEventListener("click", createHallFromPrompt);
    document.getElementById("createTableButton").addEventListener("click", () => createTableForHall("round"));
    document.querySelectorAll("[data-table-type]").forEach((button) => {
        button.addEventListener("click", () => createTableForHall(button.dataset.tableType));
    });
    document.querySelectorAll("[data-close-floor-modal]").forEach((item) => {
        item.addEventListener("click", closeFloorModal);
    });
    isBound = true;
}

function renderFloor() {
    renderFloorStats();
    renderHalls();
    renderReservations();
    renderCanvas();
}

function renderFloorStats() {
    const tables = loadTables(currentCompany.id);
    const orders = loadOrders(currentCompany.id, "opened");
    const today = new Date().toISOString().slice(0, 10);
    const reservations = loadReservations(currentCompany.id).filter((reservation) => reservation.date === today);
    const stats = [
        ["Свободных столов", tables.filter((table) => table.status === "free").length],
        ["Занятых столов", tables.filter((table) => table.status === "occupied").length],
        ["Активных заказов", orders.length],
        ["Бронирований сегодня", reservations.length],
        ["Среднее время обслуживания", "0 мин"],
    ];

    document.getElementById("floorStats").innerHTML = stats.map(([label, value]) => `
        <article class="metric-card">
            <span>${label}</span>
            <strong>${value}</strong>
        </article>
    `).join("");
}

function renderHalls() {
    const halls = loadFloor(currentCompany.id).filter((hall) => !hall.archived);
    document.getElementById("hallsList").innerHTML = halls.map((hall) => `
        <button class="hall-card ${Number(activeHall?.id) === Number(hall.id) ? "is-active" : ""}" type="button" data-hall-id="${hall.id}">
            <strong>${helpers.escapeHtml(hall.name)}</strong>
            <span>${hall.active ? "Активен" : "Неактивен"}</span>
        </button>
    `).join("");

    document.querySelectorAll("[data-hall-id]").forEach((button) => {
        button.addEventListener("click", () => {
            activeHall = halls.find((hall) => idsEqual(hall.id, button.dataset.hallId));
            renderFloor();
        });
    });
}

function renderReservations() {
    const reservations = loadReservations(currentCompany.id).slice(0, 5);
    document.getElementById("reservationsList").innerHTML = reservations.length ? reservations.map((reservation) => `
        <article class="reservation-card">
            <strong>${helpers.escapeHtml(reservation.clientName)}</strong>
            <span>${reservation.date} ${reservation.time}</span>
            <small>${reservation.guests} гостей</small>
        </article>
    `).join("") : "<p class=\"muted-text\">Броней пока нет.</p>";
}

function renderCanvas() {
    const canvas = document.getElementById("floorCanvas");
    const tables = loadTables(currentCompany.id, activeHall.id);
    const orders = loadOrders(currentCompany.id, "opened");

    canvas.innerHTML = tables.map((table) => {
        const status = TABLE_STATUSES[table.status] || TABLE_STATUSES.free;
        const order = orders.find((item) => Number(item.id) === Number(table.activeOrderId));

        return `
            <button class="floor-table floor-table--${table.type}" type="button"
                data-table-id="${table.id}" data-x="${table.x}" data-y="${table.y}"
                style="left:${table.x}px; top:${table.y}px; width:${table.width}px; height:${table.height}px; transform:rotate(${table.rotation}deg); border-color:${status.color};">
                <strong>${helpers.escapeHtml(table.name)}</strong>
                <span>${status.icon} ${status.label}</span>
                ${order ? `<small>${order.guests} гостей • ${order.total}</small>` : `<small>${table.seats} мест</small>`}
            </button>
        `;
    }).join("");

    document.querySelectorAll(".floor-table").forEach((element) => {
        const tableId = element.dataset.tableId;
        element.addEventListener("click", () => openTableModal(tableId));
        makeDraggable(element, (x, y) => {
            moveHallObject(tableId, x, y);
        });
    });
}

function createHallFromPrompt() {
    const name = window.prompt("Название зала", "Основной зал");

    if (!name) {
        return;
    }

    activeHall = createHall(currentCompany.id, { name, active: true });
    helpers.showToast("Зал создан");
    renderFloor();
}

function createTableForHall(type) {
    createTable(currentCompany.id, activeHall.id, {
        type,
        x: 80 + Math.random() * 260,
        y: 80 + Math.random() * 180,
        width: type === "rect" || type === "bar" ? 170 : 120,
        height: type === "bar" ? 70 : 120,
    });
    helpers.showToast("Стол добавлен");
    renderFloor();
}

function openTableModal(tableId) {
    const table = loadTables(currentCompany.id).find((item) => idsEqual(item.id, tableId));
    const order = loadOrders(currentCompany.id, "opened").find((item) => Number(item.id) === Number(table.activeOrderId));
    document.getElementById("floorModalTitle").textContent = table.name;
    document.getElementById("floorModalBody").innerHTML = `
        <div class="table-modal-grid">
            <p><strong>Статус:</strong> ${TABLE_STATUSES[table.status].label}</p>
            <p><strong>Мест:</strong> ${table.seats}</p>
            <p><strong>Комментарий:</strong> ${helpers.escapeHtml(table.comment || "—")}</p>
            ${order ? `<p><strong>Активный заказ:</strong> ${order.number} • ${order.total}</p>` : ""}
        </div>
        <div class="table-actions table-actions--primary">
            ${table.status === "free" ? `<button class="primary-btn" type="button" data-table-action="create-order">Создать заказ</button>` : ""}
            ${order ? `<button class="primary-btn" type="button" data-table-action="close-order">Закрыть заказ</button>` : ""}
            <button class="secondary-btn" type="button" data-table-action="reserve">Забронировать</button>
        </div>
        <details class="table-more-actions">
            <summary>Другие действия</summary>
            <div class="table-actions">
            <button class="secondary-btn" type="button" data-table-action="edit">Изменить</button>
            <button class="secondary-btn" type="button" data-table-action="rotate">Повернуть</button>
            ${order ? `<button class="secondary-btn" type="button" data-table-action="transfer">Перенести</button>` : ""}
            ${order ? `<button class="secondary-btn" type="button" data-table-action="cancel-order">Отменить</button>` : ""}
            <button class="secondary-btn" type="button" data-table-action="cleaning">Уборка</button>
            <button class="secondary-btn" type="button" data-table-action="free">Свободен</button>
            <button class="secondary-btn" type="button" data-table-action="delete">Удалить</button>
            </div>
        </details>
    `;
    document.getElementById("floorModal").hidden = false;
    document.querySelectorAll("[data-table-action]").forEach((button) => {
        button.addEventListener("click", () => handleTableAction(button.dataset.tableAction, table, order));
    });
}

async function handleTableAction(action, table, order) {
    if (action === "create-order") {
        const guests = Number(window.prompt("Количество гостей", String(table.seats)) || table.seats);
        createOrder(currentCompany.id, activeHall.id, table.id, { waiterId: currentUser.id, guests });
    }

    if (action === "reserve") {
        const reservation = await requestReservation(table);
        if (!reservation) {
            closeFloorModal();
            return;
        }
        createReservation(currentCompany.id, table.id, reservation);
    }

    if (action === "edit") {
        updateTable(table.id, {
            name: window.prompt("Название", table.name) || table.name,
            seats: Number(window.prompt("Количество мест", String(table.seats)) || table.seats),
            comment: window.prompt("Комментарий", table.comment || "") || "",
        });
    }

    if (action === "rotate") {
        rotateHallObject(table.id, Number(table.rotation || 0) + 15);
    }

    if (action === "close-order" && order) {
        closeOrder(order.id);
    }

    if (action === "transfer" && order) {
        const targetId = window.prompt("ID нового стола");
        if (targetId) {
            transferOrder(order.id, targetId);
        }
    }

    if (action === "cancel-order" && order) {
        cancelOrder(order.id);
    }

    if (action === "cleaning") {
        changeTableStatus(table.id, "cleaning");
    }

    if (action === "free") {
        changeTableStatus(table.id, "free");
        updateTable(table.id, { activeOrderId: null, reservationId: null });
    }

    if (action === "delete") {
        deleteTable(table.id);
    }

    closeFloorModal();
    renderFloor();
}

function requestReservation(table) {
    return new Promise((resolve) => {
        document.getElementById("floorModalTitle").textContent = `Бронь: ${table.name}`;
        document.getElementById("floorModalBody").innerHTML = `
            <form class="floor-reservation-form" id="reservationForm">
                <div class="form-grid">
                    <label>Имя гостя<input name="clientName" type="text" value="Гость" required></label>
                    <label>Телефон<input name="phone" type="tel" placeholder="+7 000 000-00-00"></label>
                    <label>Дата<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
                    <label>Время<input name="time" type="time" value="19:00" required></label>
                    <label>Гостей<input name="guests" type="number" min="1" value="${table.seats}"></label>
                </div>
                <label>Комментарий<textarea name="comment" rows="3" placeholder="Например: стол возле окна"></textarea></label>
                <div class="pos-modal-actions">
                    <button class="secondary-btn" type="button" data-cancel-reservation>Отменить</button>
                    <button class="primary-btn" type="submit">Создать бронь</button>
                </div>
            </form>
        `;

        const form = document.getElementById("reservationForm");
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(form).entries());
            resolve({
                ...data,
                guests: Number(data.guests || table.seats),
                prepayment: 0,
            });
        });
        form.querySelector("[data-cancel-reservation]").addEventListener("click", () => resolve(null));
    });
}

function closeFloorModal() {
    document.getElementById("floorModal").hidden = true;
}
