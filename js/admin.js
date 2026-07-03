import { checkUser, initializeAuthSystem, logout } from "./auth.js";
import { createLog, loadLogs } from "./logs.js";
import { createPlan, deletePlan, loadPlans, updatePlan } from "./plans.js";
import { canAccessAdmin, changeRole, ROLE_LABELS, ROLES } from "./roles.js";
import { getStatistics } from "./statistics.js";
import { storage, STORAGE_KEYS } from "./storage.js";
import {
    extendSubscription,
    grantSubscription,
    removeSubscription,
    checkSubscription,
} from "./subscriptions.js";
import {
    blockUser,
    deleteUser,
    loadUsers,
    unblockUser,
    updateUser,
} from "./users.js";

const sectionTitles = {
    dashboard: "Dashboard",
    users: "Пользователи",
    subscriptions: "Подписки",
    plans: "Тарифы",
    statistics: "Статистика",
    logs: "Логи",
    settings: "Настройки",
};

let currentSection = "dashboard";
let toastTimer = null;

document.addEventListener("DOMContentLoaded", () => {
    initializeAuthSystem();

    const currentUser = checkUser();
    if (!canAccessAdmin(currentUser)) {
        window.location.href = "index.html";
        return;
    }

    bindNavigation();
    bindActions();
    bindPlanForm();
    bindSettingsForm();
    bindSubscriptionModal();
    bindEditorModal();
    renderAll();
});

function bindNavigation() {
    document.querySelectorAll(".admin-nav button").forEach((button) => {
        button.addEventListener("click", () => {
            currentSection = button.dataset.section;
            document.querySelectorAll(".admin-nav button").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            document.querySelectorAll(".admin-section").forEach((section) => section.classList.remove("is-active"));
            document.getElementById(`${currentSection}Section`).classList.add("is-active");
            document.getElementById("sectionTitle").textContent = sectionTitles[currentSection];
            renderAll();
        });
    });

    document.getElementById("logoutButton").addEventListener("click", () => {
        logout();
        window.location.href = "index.html";
    });
}

function bindActions() {
    document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");

        if (!button) {
            return;
        }

        const userId = button.dataset.userId;
        const planId = button.dataset.planId;

        switch (button.dataset.action) {
            case "edit-user":
                editUser(userId);
                break;
            case "delete-user":
                if (window.confirm("Удалить пользователя?")) {
                    deleteUser(userId);
                    showToast("Пользователь удален");
                }
                break;
            case "block-user":
                blockUser(userId);
                showToast("Пользователь заблокирован");
                break;
            case "unblock-user":
                unblockUser(userId);
                showToast("Пользователь разблокирован");
                break;
            case "change-role":
                editRole(userId);
                break;
            case "extend-subscription":
                extendUserSubscription(userId);
                break;
            case "grant-subscription":
                openSubscriptionModal(userId);
                break;
            case "remove-subscription":
                removeSubscription(userId);
                showToast("Подписка удалена");
                break;
            case "edit-plan":
                editPlan(planId);
                break;
            case "delete-plan":
                if (window.confirm("Удалить тариф?")) {
                    deletePlan(planId);
                    showToast("Тариф удален");
                }
                break;
            default:
                break;
        }

        renderAll();
    });
}

function bindPlanForm() {
    document.getElementById("planForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        createPlan({
            name: formData.get("name"),
            price: formData.get("price"),
            days: formData.get("days"),
            description: formData.get("description"),
        });

        event.currentTarget.reset();
        showToast("Тариф создан");
        renderAll();
    });
}

function bindSettingsForm() {
    const form = document.getElementById("settingsForm");
    const savedSettings = storage.get(STORAGE_KEYS.settings, null);

    if (savedSettings) {
        Object.entries(savedSettings).forEach(([key, value]) => {
            if (form.elements[key]) {
                form.elements[key].value = value;
            }
        });
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        storage.set(STORAGE_KEYS.settings, data);
        createLog("Изменил настройки", data);
        showToast("Настройки сохранены");
    });
}

function bindSubscriptionModal() {
    document.querySelectorAll("[data-close-subscription-modal]").forEach((item) => {
        item.addEventListener("click", closeSubscriptionModal);
    });

    document.getElementById("subscriptionForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        grantSubscription(formData.get("userId"), formData.get("plan"));
        closeSubscriptionModal();
        showToast("Подписка назначена");
        renderAll();
    });
}

function bindEditorModal() {
    document.querySelectorAll("[data-close-editor-modal]").forEach((item) => {
        item.addEventListener("click", closeEditorModal);
    });
}

function renderAll() {
    renderDashboard();
    renderUsers();
    renderSubscriptions();
    renderPlans();
    renderStatistics();
    renderLogs();
}

function renderDashboard() {
    const stats = getStatistics();
    const metrics = [
        ["Общее количество пользователей", stats.totalUsers],
        ["Активных пользователей", stats.activeUsers],
        ["Тестовых аккаунтов", stats.trialAccounts],
        ["Платных аккаунтов", stats.paidAccounts],
        ["Истекших подписок", stats.expiredSubscriptions],
        ["Доход", `$${stats.revenue}`],
        ["Новые регистрации", stats.newRegistrations],
    ];

    document.getElementById("metricGrid").innerHTML = metrics.map(([label, value]) => `
        <article class="metric-card">
            <span>${label}</span>
            <strong>${value}</strong>
        </article>
    `).join("");

    document.getElementById("recentLogs").innerHTML = renderLogItems(loadLogs().slice(0, 5));
}

function renderUsers() {
    const users = loadUsers().map(checkSubscription);
    document.getElementById("usersCount").textContent = `${users.length} пользователей`;
    document.getElementById("usersTable").innerHTML = users.map((user) => `
        <tr>
            <td>${user.id}</td>
            <td><strong>${escapeHtml(user.username)}</strong></td>
            <td>${escapeHtml(user.email)}</td>
            <td>${formatDate(user.createdAt)}</td>
            <td><span class="badge">${ROLE_LABELS[user.role] || user.role}</span></td>
            <td>${renderStatus(user.status)}</td>
            <td>${escapeHtml(user.subscription?.plan || "none")}</td>
            <td>${user.subscription?.lifetime ? "Lifetime" : formatDate(user.subscription?.endDate)}</td>
            <td>${formatDate(user.lastLogin)}</td>
            <td>
                <div class="actions">
                    <button class="action-btn" data-action="edit-user" data-user-id="${user.id}">Редактировать</button>
                    ${user.role !== ROLES.superAdmin ? `<button class="action-btn action-btn--danger" data-action="delete-user" data-user-id="${user.id}">Удалить</button>` : ""}
                    ${user.status === "blocked"
                        ? `<button class="action-btn action-btn--primary" data-action="unblock-user" data-user-id="${user.id}">Разблокировать</button>`
                        : `<button class="action-btn" data-action="block-user" data-user-id="${user.id}">Заблокировать</button>`}
                    <button class="action-btn" data-action="change-role" data-user-id="${user.id}">Сменить роль</button>
                    <button class="action-btn" data-action="extend-subscription" data-user-id="${user.id}">Продлить</button>
                    <button class="action-btn action-btn--primary" data-action="grant-subscription" data-user-id="${user.id}">Выдать подписку</button>
                </div>
            </td>
        </tr>
    `).join("");
}

function renderSubscriptions() {
    const users = loadUsers().map(checkSubscription);
    document.getElementById("subscriptionsGrid").innerHTML = users.map((user) => `
        <article class="subscription-card">
            <div>
                <h3>${escapeHtml(user.username)}</h3>
                <p>${escapeHtml(user.email)}</p>
            </div>
            <span class="badge ${user.subscription?.status === "expired" ? "badge--danger" : "badge--success"}">
                ${escapeHtml(user.subscription?.status || "expired")}
            </span>
            <p>Тариф: <strong>${escapeHtml(user.subscription?.plan || "none")}</strong></p>
            <p>Окончание: ${user.subscription?.lifetime ? "Lifetime" : formatDate(user.subscription?.endDate)}</p>
            <div class="actions">
                <button class="action-btn action-btn--primary" data-action="grant-subscription" data-user-id="${user.id}">Выдать</button>
                <button class="action-btn" data-action="extend-subscription" data-user-id="${user.id}">Продлить</button>
                <button class="action-btn action-btn--danger" data-action="remove-subscription" data-user-id="${user.id}">Отключить</button>
            </div>
        </article>
    `).join("");
}

function renderPlans() {
    document.getElementById("plansGrid").innerHTML = loadPlans().map((plan) => `
        <article class="plan-card">
            <h3>${escapeHtml(plan.name)}</h3>
            <strong>$${plan.price}</strong>
            <p>${plan.days} дней</p>
            <p>${escapeHtml(plan.description)}</p>
            <div class="actions">
                <button class="action-btn" data-action="edit-plan" data-plan-id="${plan.id}">Редактировать</button>
                <button class="action-btn action-btn--danger" data-action="delete-plan" data-plan-id="${plan.id}">Удалить</button>
            </div>
        </article>
    `).join("");
}

function renderStatistics() {
    const stats = getStatistics();
    const chartMax = Math.max(1, ...stats.charts.flatMap((item) => [item.users, item.paid]));

    document.getElementById("statisticsMetrics").innerHTML = [
        ["Количество пользователей", stats.totalUsers],
        ["Новые регистрации", stats.newRegistrations],
        ["Продажи тарифов", stats.paidAccounts],
        ["Активные подписки", stats.activeSubscriptions],
        ["Истекшие подписки", stats.expiredSubscriptions],
    ].map(([label, value]) => `
        <article class="metric-card">
            <span>${label}</span>
            <strong>${value}</strong>
        </article>
    `).join("");

    document.getElementById("chartsGrid").innerHTML = `
        ${renderChart("Новые регистрации", stats.charts, "users", chartMax)}
        ${renderChart("Продажи тарифов", stats.charts, "paid", chartMax)}
    `;
}

function renderLogs() {
    const logs = loadLogs();
    document.getElementById("logsCount").textContent = `${logs.length} записей`;
    document.getElementById("logsList").innerHTML = renderLogItems(logs);
}

function renderChart(title, data, key, max) {
    return `
        <article class="chart-card">
            <h3>${title}</h3>
            ${data.map((item) => `
                <div class="bar-row">
                    <span>${item.label}</span>
                    <div class="bar"><span style="width: ${(item[key] / max) * 100}%"></span></div>
                    <strong>${item[key]}</strong>
                </div>
            `).join("")}
        </article>
    `;
}

function renderLogItems(logs) {
    if (!logs.length) {
        return "<p>Пока логов нет.</p>";
    }

    return logs.map((log) => `
        <article class="log-item">
            <strong>${escapeHtml(log.action)}</strong>
            <p>${formatDate(log.createdAt)} ${log.details?.username ? `• ${escapeHtml(log.details.username)}` : ""}</p>
        </article>
    `).join("");
}

function editUser(userId) {
    const user = loadUsers().find((item) => Number(item.id) === Number(userId));

    if (!user) {
        return;
    }

    document.getElementById("editorModalTitle").textContent = "Редактировать пользователя";
    document.getElementById("editorModalBody").innerHTML = `
        <form class="settings-form" id="editUserForm">
            <label>Username<input name="username" type="text" value="${escapeHtml(user.username)}" required></label>
            <label>Email<input name="email" type="email" value="${escapeHtml(user.email)}" required></label>
            <button type="submit">Сохранить пользователя</button>
        </form>
    `;
    openEditorModal();
    document.getElementById("editUserForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const username = String(formData.get("username")).trim();
        const email = String(formData.get("email")).trim();

        if (!username || !email) {
            showToast("Заполните Username и Email");
            return;
        }

        updateUser(userId, { username, email });
        createLog("Изменил пользователя", { userId: user.id, username });
        closeEditorModal();
        showToast("Пользователь обновлен");
        renderAll();
    });
}

function editRole(userId) {
    const roles = Object.values(ROLES).join(", ");
    const role = window.prompt(`Новая роль (${roles})`);

    if (!role) {
        return;
    }

    const updatedUser = changeRole(userId, role.trim());
    showToast(updatedUser ? "Роль изменена" : "Некорректная роль");
}

function extendUserSubscription(userId) {
    const days = window.prompt("На сколько дней продлить?", "30");

    if (!days || Number.isNaN(Number(days))) {
        return;
    }

    extendSubscription(userId, Number(days));
    showToast("Подписка продлена");
}

function editPlan(planId) {
    const plan = loadPlans().find((item) => Number(item.id) === Number(planId));

    if (!plan) {
        return;
    }

    const name = window.prompt("Название тарифа", plan.name);
    const price = window.prompt("Цена", plan.price);
    const days = window.prompt("Количество дней", plan.days);
    const description = window.prompt("Описание", plan.description);

    if (!name || !price || !days || !description) {
        return;
    }

    updatePlan(planId, { name, price, days, description });
    showToast("Тариф обновлен");
}

function openSubscriptionModal(userId) {
    const user = loadUsers().find((item) => Number(item.id) === Number(userId));
    const modal = document.getElementById("subscriptionModal");

    if (!user) {
        return;
    }

    document.getElementById("subscriptionUserName").textContent = `${user.username} • ${user.email}`;
    document.getElementById("subscriptionForm").elements.userId.value = user.id;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
}

function closeSubscriptionModal() {
    const modal = document.getElementById("subscriptionModal");
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
}

function openEditorModal() {
    const modal = document.getElementById("editorModal");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
}

function closeEditorModal() {
    const modal = document.getElementById("editorModal");
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
}

function renderStatus(status) {
    const className = status === "blocked" ? "badge badge--danger" : "badge badge--success";
    return `<span class="${className}">${escapeHtml(status)}</span>`;
}

function formatDate(value) {
    if (!value) {
        return "—";
    }

    return new Intl.DateTimeFormat("ru-RU", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(value));
}

function showToast(message) {
    const toast = document.getElementById("adminToast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");

    toastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2600);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
