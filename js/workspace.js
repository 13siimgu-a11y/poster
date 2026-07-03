import { checkUser, logout, setNotificationHandler } from "./auth.js";
import { canShowAction } from "./accessPolicy.js";
import { loadCompany, loadCurrentCompanyFromApi } from "./company.js";
import { syncCoreData } from "./apiPersistence.js";
import { initAIChat } from "./aiChat.js";
import { initStaffWorkspacePage } from "./pages/staffWorkspacePage.js";
import { canAccessAdmin, shouldOpenWorkspace } from "./roles.js";

let currentUser = null;
let currentCompany = null;
let toastTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
    setNotificationHandler(showToast);
    currentUser = checkUser();

    if (!currentUser) {
        window.location.href = "index.html";
        return;
    }

    currentCompany = loadCompany(currentUser.companyId);
    if (!currentCompany) {
        currentCompany = await loadCurrentCompanyFromApi().catch(() => null);
    }

    if (!currentCompany) {
        renderWorkspaceError("Заведение не найдено", "Попросите администратора проверить, что сотрудник привязан к заведению.");
        return;
    }

    await syncCoreData(currentCompany.id).catch(() => {
        showToast("Не удалось загрузить данные из базы. Проверьте интернет и обновите страницу.", "error");
    });

    try {
        renderShell();
        bindShellActions();
        initStaffWorkspacePage({
            company: currentCompany,
            user: currentUser,
            showToast,
            escapeHtml,
        });
        initAIChat(() => ({
            companyId: currentCompany.id,
            user: currentUser,
            currentView: "workspace",
        }), { showToast });
    } catch (error) {
        console.error(error);
        renderWorkspaceError("Не удалось открыть рабочее место", "Обновите страницу. Если ошибка повторится, войдите заново.");
    }
});

function renderWorkspaceError(title, text) {
    const root = document.getElementById("staffWorkspace");
    if (!root) {
        return;
    }

    root.innerHTML = `
        <div class="panel empty-state empty-state--action">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(text)}</p>
            <button class="primary-btn" type="button" id="workspaceRetryButton">Обновить</button>
            <button class="secondary-btn" type="button" id="workspaceLogoutButton">Выйти</button>
        </div>
    `;

    document.getElementById("workspaceRetryButton")?.addEventListener("click", () => window.location.reload());
    document.getElementById("workspaceLogoutButton")?.addEventListener("click", async () => {
        await logout();
        window.location.href = "index.html";
    });
}

function renderShell() {
    document.getElementById("workspaceCompanyName").textContent = currentCompany.name || "POS Poster";
    document.getElementById("workspaceUserRole").textContent = `${getRoleTitle()} · ${currentUser.username}`;

    const dashboardLink = document.getElementById("dashboardLink");
    const canOpenDashboard = canAccessAdmin(currentUser) || !shouldOpenWorkspace(currentUser);
    dashboardLink.hidden = !canOpenDashboard;

    const canUseAI = canShowAction(currentUser, "ai:use");
    document.getElementById("openAIButton").hidden = !canUseAI;
    document.getElementById("aiFloatingButton").hidden = !canUseAI;
}

function bindShellActions() {
    document.getElementById("logoutButton").addEventListener("click", async () => {
        await logout();
        window.location.href = "index.html";
    });

    document.getElementById("themeToggle").addEventListener("click", () => {
        const isDark = document.documentElement.dataset.theme === "dark";
        document.documentElement.dataset.theme = isDark ? "light" : "dark";
        document.getElementById("themeToggle").textContent = isDark ? "Темная тема" : "Светлая тема";
    });
}

function getRoleTitle() {
    const labels = {
        cashier: "Кассир",
        waiter: "Официант",
        bartender: "Бармен",
        barmen: "Бармен",
        admin: "Администратор",
        manager: "Управляющий",
        super_admin: "Super Admin",
    };
    return labels[currentUser.role] || "Сотрудник";
}

function showToast(message, type = "success") {
    const toast = document.getElementById("dashToast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("is-error", type === "error");
    toast.classList.add("is-visible");
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
