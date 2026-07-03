import { createEmployee, deleteEmployee, EMPLOYEE_STATUSES, loadEmployees, updateEmployee } from "../employees.js";
import { idsEqual } from "../apiPersistence.js";
import { PERMISSIONS, changePermissions } from "../permissions.js";
import { archivePosition, createPosition, ensureDefaultPositions, loadPositions } from "../positions.js";
import { updatePayroll } from "../payroll.js";
import { assignSchedule } from "../schedule.js";
import { closeShift, loadShifts, openShift } from "../shifts.js";
import { loadStaffDashboard } from "../staffDashboard.js";
import { getEmployeeTimeSummary } from "../timeTracking.js";

let currentCompany = null;
let currentUser = null;
let helpers = {};
let activeTab = "employees";
let isBound = false;

export function initStaffPage(context) {
    currentCompany = context.company;
    currentUser = context.user;
    helpers = context;
    ensureDefaultPositions(currentCompany.id);
    bindStaffEvents();
    renderStaff();
}

function bindStaffEvents() {
    if (isBound) return;
    document.getElementById("createEmployeeButton").addEventListener("click", () => openEmployeeModal());
    document.getElementById("openShiftByPinButton").addEventListener("click", openShiftByPin);
    document.getElementById("staffSearch").addEventListener("input", renderStaffContent);
    document.getElementById("staffStatusFilter").addEventListener("change", renderStaffContent);
    document.querySelectorAll("[data-staff-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            activeTab = button.dataset.staffTab;
            document.querySelectorAll("[data-staff-tab]").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            renderStaffContent();
        });
    });
    document.querySelectorAll("[data-close-staff-modal]").forEach((item) => item.addEventListener("click", closeStaffModal));
    isBound = true;
}

function renderStaff() {
    renderStaffStats();
    renderStaffContent();
}

function renderStaffStats() {
    const stats = loadStaffDashboard(currentCompany.id);
    const cards = [
        ["Всего сотрудников", stats.totalEmployees],
        ["Сегодня работают", stats.todayWorking],
        ["Сейчас на смене", stats.currentlyOnShift],
        ["Отсутствуют", stats.absent],
        ["Новые сотрудники", stats.newEmployees],
        ["Средняя смена", `${stats.averageShiftMinutes} мин`],
    ];
    document.getElementById("staffStats").innerHTML = cards.map(([label, value]) => `
        <article class="metric-card"><span>${label}</span><strong>${helpers.escapeHtml(value)}</strong></article>
    `).join("");
}

function getFilteredEmployees() {
    const query = document.getElementById("staffSearch").value.trim().toLowerCase();
    const status = document.getElementById("staffStatusFilter").value;
    return loadEmployees(currentCompany.id).filter((employee) => {
        const fullName = `${employee.firstName} ${employee.lastName} ${employee.phone} ${employee.role}`.toLowerCase();
        return (!query || fullName.includes(query)) && (!status || employee.status === status);
    });
}

function renderStaffContent() {
    if (activeTab === "employees") renderEmployees();
    if (activeTab === "positions") renderPositions();
    if (activeTab === "shifts") renderShifts();
    if (activeTab === "schedule") renderSchedule();
    if (activeTab === "time") renderTimeTracking();
    if (activeTab === "payroll") renderPayroll();
    if (activeTab === "permissions") renderPermissions();
}

function renderEmployees() {
    const positions = loadPositions(currentCompany.id);
    document.getElementById("staffContent").innerHTML = `
        <div class="staff-grid">
            ${getFilteredEmployees().map((employee) => {
                const position = positions.find((item) => idsEqual(item.id, employee.positionId));
                return `
                    <article class="employee-card">
                        <div class="employee-avatar">${employee.avatar ? `<img src="${employee.avatar}" alt="">` : helpers.escapeHtml(employee.firstName[0] || "С")}</div>
                        <h3>${helpers.escapeHtml(employee.firstName)} ${helpers.escapeHtml(employee.lastName)}</h3>
                        <p>${helpers.escapeHtml(position?.name || "Без должности")} • ${employee.role}</p>
                        <span>${renderStatus(employee.status)} • PIN ${employee.pinCode}</span>
                        <div class="employee-actions">
                            <button data-staff-action="edit" data-employee-id="${employee.id}">Изменить</button>
                            <button data-staff-action="permissions" data-employee-id="${employee.id}">Права</button>
                            <button data-staff-action="delete" data-employee-id="${employee.id}">Удалить</button>
                        </div>
                    </article>
                `;
            }).join("") || "<p>Сотрудников пока нет.</p>"}
        </div>
    `;
    bindEmployeeActions();
}

function renderPositions() {
    document.getElementById("staffContent").innerHTML = `
        <button class="primary-btn" id="createPositionButton" type="button">Создать должность</button>
        <div class="staff-grid">
            ${loadPositions(currentCompany.id).filter((position) => !position.archived).map((position) => `
                <article class="position-card">
                    <h3>${helpers.escapeHtml(position.name)}</h3>
                    <p>${helpers.escapeHtml(position.description || "Без описания")}</p>
                    <button data-position-id="${position.id}">Архивировать</button>
                </article>
            `).join("")}
        </div>
    `;
    document.getElementById("createPositionButton").addEventListener("click", () => {
        const name = window.prompt("Название должности");
        if (name) {
            createPosition(currentCompany.id, { name });
            renderPositions();
        }
    });
    document.querySelectorAll("[data-position-id]").forEach((button) => {
        button.addEventListener("click", () => {
            archivePosition(button.dataset.positionId);
            renderPositions();
        });
    });
}

function renderShifts() {
    const employees = loadEmployees(currentCompany.id);
    document.getElementById("staffContent").innerHTML = `
        <div class="inventory-table-wrap">
            <table class="inventory-table">
                <thead><tr><th>Дата</th><th>Сотрудник</th><th>Начало</th><th>Конец</th><th>Минут</th><th>Статус</th><th>Действия</th></tr></thead>
                <tbody>
                    ${loadShifts(currentCompany.id).map((shift) => {
                        const employee = employees.find((item) => idsEqual(item.id, shift.employeeId));
                        return `<tr><td>${shift.date}</td><td>${helpers.escapeHtml(employee?.firstName || "—")}</td><td>${formatTime(shift.startTime)}</td><td>${formatTime(shift.endTime)}</td><td>${shift.workedMinutes}</td><td>${shift.status}</td><td>${shift.status === "opened" ? `<button data-close-shift="${shift.id}">Закрыть</button>` : ""}</td></tr>`;
                    }).join("") || "<tr><td colspan=\"7\">Смен пока нет.</td></tr>"}
                </tbody>
            </table>
        </div>
    `;
    document.querySelectorAll("[data-close-shift]").forEach((button) => {
        button.addEventListener("click", () => {
            closeShift(button.dataset.closeShift);
            renderStaff();
        });
    });
}

function renderSchedule() {
    document.getElementById("staffContent").innerHTML = `
        <button class="primary-btn" id="assignScheduleButton" type="button">Назначить смену</button>
        <p>Поддерживаются дневные, вечерние, ночные и индивидуальные смены.</p>
    `;
    document.getElementById("assignScheduleButton").addEventListener("click", openScheduleModal);
}

function renderTimeTracking() {
    const employees = loadEmployees(currentCompany.id);
    document.getElementById("staffContent").innerHTML = `
        <div class="staff-grid">
            ${employees.map((employee) => {
                const summary = getEmployeeTimeSummary(currentCompany.id, employee.id);
                return `<article class="position-card"><h3>${helpers.escapeHtml(employee.firstName)} ${helpers.escapeHtml(employee.lastName)}</h3><p>Сегодня: ${summary.dayMinutes} мин</p><p>Месяц: ${summary.monthMinutes} мин</p><p>Смен: ${summary.shifts}</p></article>`;
            }).join("") || "<p>Нет данных.</p>"}
        </div>
    `;
}

function renderPayroll() {
    document.getElementById("staffContent").innerHTML = `
        <div class="staff-grid">
            ${loadEmployees(currentCompany.id).map((employee) => `<article class="position-card"><h3>${helpers.escapeHtml(employee.firstName)} ${helpers.escapeHtml(employee.lastName)}</h3><p>Тип оплаты: ${employee.payroll?.type || "hourly"}</p><p>Ставка: ${employee.payroll?.rate || 0}</p><button data-payroll="${employee.id}">Настроить</button></article>`).join("") || "<p>Сотрудников пока нет.</p>"}
        </div>
    `;
    document.querySelectorAll("[data-payroll]").forEach((button) => {
        button.addEventListener("click", () => {
            const rate = Number(window.prompt("Ставка", "0") || 0);
            updatePayroll(button.dataset.payroll, { type: "hourly", rate });
            renderPayroll();
        });
    });
}

function renderPermissions() {
    const employees = loadEmployees(currentCompany.id);
    document.getElementById("staffContent").innerHTML = `
        <div class="staff-grid">
            ${employees.map((employee) => `<article class="position-card"><h3>${helpers.escapeHtml(employee.firstName)} ${helpers.escapeHtml(employee.lastName)}</h3><p>${employee.permissions.length} прав</p><button data-permissions="${employee.id}">Изменить права</button></article>`).join("") || "<p>Сотрудников пока нет.</p>"}
        </div>
    `;
    document.querySelectorAll("[data-permissions]").forEach((button) => {
        button.addEventListener("click", () => openPermissionsModal(button.dataset.permissions));
    });
}

function openEmployeeModal(employee = null) {
    employee = employee?.id ? employee : null;
    const positions = loadPositions(currentCompany.id);
    document.getElementById("staffModalTitle").textContent = employee ? "Изменить сотрудника" : "Добавить сотрудника";
    document.getElementById("staffModalBody").innerHTML = `
        <form class="staff-form" id="employeeForm">
            <input name="firstName" placeholder="Имя" value="${employee?.firstName || ""}" required>
            <input name="username" placeholder="Username" value="${employee?.username || ""}">
            <input name="password" placeholder="Password" value="${employee?.password || ""}">
            <select name="positionId">${positions.map((position) => `<option value="${position.id}" ${idsEqual(employee?.positionId, position.id) ? "selected" : ""}>${helpers.escapeHtml(position.name)}</option>`).join("")}</select>
            <select name="role"><option value="manager">manager</option><option value="cashier">cashier</option><option value="waiter">waiter</option><option value="kitchen">kitchen</option><option value="admin">admin</option></select>
            <select name="status">${EMPLOYEE_STATUSES.map((status) => `<option value="${status}" ${employee?.status === status ? "selected" : ""}>${renderStatus(status)}</option>`).join("")}</select>
            <input name="pinCode" placeholder="PIN" value="${employee?.pinCode || ""}">
            <input name="hireDate" type="date" value="${employee?.hireDate || new Date().toISOString().slice(0, 10)}">
            <button class="primary-btn" type="submit">Сохранить</button>
        </form>
    `;
    openStaffModal();
    document.getElementById("employeeForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = {
            ...Object.fromEntries(new FormData(event.currentTarget).entries()),
            lastName: "",
            middleName: "",
            email: "",
        };
        if (employee) updateEmployee(employee.id, data);
        else createEmployee(currentCompany.id, data);
        closeStaffModal();
        renderStaff();
    });
}

function openPermissionsModal(employeeId) {
    const employee = loadEmployees(currentCompany.id).find((item) => idsEqual(item.id, employeeId));
    document.getElementById("staffModalTitle").textContent = "Права доступа";
    document.getElementById("staffModalBody").innerHTML = `
        <form class="staff-form" id="permissionsForm">
            ${PERMISSIONS.map(([key, label]) => `<label class="checkbox-row"><input type="checkbox" value="${key}" ${employee.permissions.includes(key) ? "checked" : ""}> ${label}</label>`).join("")}
            <button class="primary-btn" type="submit">Сохранить права</button>
        </form>
    `;
    openStaffModal();
    document.getElementById("permissionsForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const permissions = Array.from(document.querySelectorAll("#permissionsForm input:checked")).map((input) => input.value);
        updateEmployee(employee.id, changePermissions(employee, permissions));
        closeStaffModal();
        renderStaff();
    });
}

function openScheduleModal() {
    const employees = loadEmployees(currentCompany.id);
    const positions = loadPositions(currentCompany.id);
    document.getElementById("staffModalTitle").textContent = "Назначить смену";
    document.getElementById("staffModalBody").innerHTML = `
        <form class="staff-form" id="scheduleForm">
            <select name="employeeId">${employees.map((employee) => `<option value="${employee.id}">${helpers.escapeHtml(employee.firstName)} ${helpers.escapeHtml(employee.lastName)}</option>`).join("")}</select>
            <select name="positionId">${positions.map((position) => `<option value="${position.id}">${helpers.escapeHtml(position.name)}</option>`).join("")}</select>
            <input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}">
            <input name="plannedStart" type="time" value="09:00">
            <input name="plannedEnd" type="time" value="18:00">
            <input name="comment" placeholder="Комментарий">
            <button class="primary-btn" type="submit">Назначить</button>
        </form>
    `;
    openStaffModal();
    document.getElementById("scheduleForm").addEventListener("submit", (event) => {
        event.preventDefault();
        assignSchedule(currentCompany.id, [Object.fromEntries(new FormData(event.currentTarget).entries())]);
        closeStaffModal();
        renderStaff();
    });
}

function openShiftByPin() {
    const pin = window.prompt("Введите PIN-код сотрудника");
    if (!pin) return;
    const shift = openShift(currentCompany.id, pin, loadEmployees(currentCompany.id));
    helpers.showToast(shift ? "Смена открыта" : "PIN не найден");
    renderStaff();
}

function bindEmployeeActions() {
    document.querySelectorAll("[data-staff-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const employee = loadEmployees(currentCompany.id).find((item) => idsEqual(item.id, button.dataset.employeeId));
            if (!employee) return;
            if (button.dataset.staffAction === "edit") openEmployeeModal(employee);
            if (button.dataset.staffAction === "permissions") openPermissionsModal(employee.id);
            if (button.dataset.staffAction === "delete") {
                deleteEmployee(employee.id);
                renderStaff();
            }
        });
    });
}

function openStaffModal() {
    document.getElementById("staffModal").hidden = false;
}

function closeStaffModal() {
    document.getElementById("staffModal").hidden = true;
}

function renderStatus(status) {
    const labels = {
        working: "Работает",
        vacation: "В отпуске",
        sick: "На больничном",
        fired: "Уволен",
        blocked: "Заблокирован",
    };
    return labels[status] || status;
}

function formatTime(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
