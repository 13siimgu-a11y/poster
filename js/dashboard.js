import { checkUser, logout } from "./auth.js";
import {
    canShowView,
    getDefaultView,
    getHomeMetricPreset,
    getRoleLabel,
    getVisibleViews,
    VIEW_GROUPS,
} from "./accessPolicy.js";
import { syncCoreData } from "./apiPersistence.js";
import { initAIChat } from "./aiChat.js";
import {
    createCategory,
    deleteCategory,
    ensureDefaultCategories,
    loadCategories,
    sortCategories,
    updateCategory,
} from "./categories.js";
import { BUSINESS_TYPES, createCompanyApi, loadCompany, loadCurrentCompanyFromApi, updateCompany } from "./company.js";
import { CURRENCIES, formatMoney } from "./currency.js";
import { exportProducts } from "./export.js";
import { filterProducts, sortProducts } from "./filters.js";
import { uploadImage } from "./gallery.js";
import { getAveragePrice } from "./pricing.js";
import { initPosPage } from "./pages/posPage.js";
import { initStaffWorkspacePage } from "./pages/staffWorkspacePage.js";
import { initFloorPage } from "./pages/floorPage.js";
import { initKitchenPage } from "./pages/kitchenPage.js";
import { initInventoryPage } from "./pages/inventoryPage.js";
import { initProcurementPage } from "./pages/procurementPage.js";
import { initStaffPage } from "./pages/staffPage.js";
import { calculateStockValue, checkLowStock, loadIngredients } from "./inventory.js";
import { loadProcurementDashboard } from "./procurementStatistics.js";
import { loadStaffDashboard } from "./staffDashboard.js";
import {
    archiveProduct,
    createProduct,
    deleteProduct,
    duplicateProduct,
    loadProducts,
    PRODUCT_TAGS,
    PRODUCT_UNITS,
    updateProduct,
} from "./products.js";
import { getUserCompany } from "./profile.js";
import { searchProducts } from "./search.js";
import { getSubscriptionInfo } from "./subscription.js";
import { updateSettings } from "./settings.js";
import { uploadBanner, uploadLogo } from "./upload.js";
import { shouldOpenWorkspace } from "./roles.js";

let currentUser = null;
let currentCompany = null;
let wizardStep = 0;
let toastTimer = null;
let activeCategoryId = "";
let currentView = "home";
let navGrouped = false;

const viewTitles = {
    home: "Главная",
    workspace: "Рабочее место",
    ai: "AI Assistant",
    company: "Мое заведение",
    pos: "Касса",
    kitchen: "Кухня",
    menu: "Меню",
    categories: "Категории",
    floor: "Залы и столы",
    staff: "Персонал",
    clients: "Клиенты",
    warehouse: "Склад",
    procurement: "Закупки",
    reports: "Отчеты",
    settings: "Настройки",
    subscription: "Подписка",
};

document.addEventListener("DOMContentLoaded", async () => {
    currentUser = checkUser();

    if (!currentUser) {
        window.location.href = "index.html";
        return;
    }

    if (shouldOpenWorkspace(currentUser)) {
        window.location.href = "workspace.html";
        return;
    }

    bindBaseActions();
    fillStaticSelects();

    currentCompany = await loadCurrentCompanyFromApi().catch(() => getUserCompany(currentUser));
    currentUser = checkUser();

    if (!currentUser.companyId || !currentCompany) {
        openWizard();
        return;
    }

    await syncCoreData(currentCompany.id);
    loadDashboard();
});

export function loadDashboard() {
    document.getElementById("companyWizard").hidden = true;
    document.getElementById("dashboardShell").hidden = false;
    currentCompany = currentCompany || loadCompany(currentUser.companyId);
    ensureDefaultCategories(currentCompany.id);

    renderCompanyShell();
    applyNavigationPolicy();
    renderHome();
    renderCompanyForm();
    initPosPage({
        company: currentCompany,
        user: currentUser,
        showToast,
        formatDate,
        escapeHtml,
    });
    initStaffWorkspacePage({
        company: currentCompany,
        user: currentUser,
        showToast,
        formatDate,
        escapeHtml,
    });
    initFloorPage({
        company: currentCompany,
        user: currentUser,
        showToast,
        formatDate,
        escapeHtml,
    });
    initKitchenPage({
        company: currentCompany,
        user: currentUser,
        showToast,
        formatDate,
        escapeHtml,
    });
    initInventoryPage({
        company: currentCompany,
        user: currentUser,
        showToast,
        formatDate,
        escapeHtml,
        formatMoney: (value) => formatMoney(value, currentCompany.settings.currency),
    });
    initProcurementPage({
        company: currentCompany,
        user: currentUser,
        showToast,
        formatDate,
        escapeHtml,
        formatMoney: (value) => formatMoney(value, currentCompany.settings.currency),
    });
    initStaffPage({
        company: currentCompany,
        user: currentUser,
        showToast,
        formatDate,
        escapeHtml,
        formatMoney: (value) => formatMoney(value, currentCompany.settings.currency),
    });
    initAIChat(() => ({
        companyId: currentCompany.id,
        user: currentUser,
        currentView,
    }), { showToast, escapeHtml });
    renderMenu();
    renderCategoriesManager();
    renderSubscription();
    renderSettingsForms();
    renderPlaceholders();
    switchView(getDefaultView(currentUser, currentCompany));
}

function bindBaseActions() {
    document.getElementById("logoutButton").addEventListener("click", async () => {
        await logout();
        window.location.href = "index.html";
    });

    bindSidebarToggle();

    document.getElementById("themeToggle").addEventListener("click", () => {
        const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
        document.body.dataset.theme = nextTheme;
        document.getElementById("themeToggle").textContent = nextTheme === "dark" ? "Светлая тема" : "Темная тема";
    });

    document.querySelectorAll(".dash-nav button").forEach((button) => {
        button.addEventListener("click", () => switchView(button.dataset.view));
    });

    document.getElementById("wizardPrev").addEventListener("click", () => setWizardStep(wizardStep - 1));
    document.getElementById("wizardNext").addEventListener("click", () => {
        if (validateWizardStep()) {
            setWizardStep(wizardStep + 1);
        }
    });
    document.getElementById("wizardForm").addEventListener("submit", submitWizard);
    document.getElementById("companyForm").addEventListener("submit", submitCompanyForm);
    document.getElementById("workingHoursForm").addEventListener("submit", submitWorkingHours);
    document.getElementById("notificationsForm").addEventListener("submit", submitNotifications);
    document.getElementById("removeLogo").addEventListener("click", () => updateMedia("logo", ""));
    document.getElementById("removeBanner").addEventListener("click", () => updateMedia("banner", ""));
    document.getElementById("addProductButton").addEventListener("click", () => openProductModal());
    document.getElementById("productForm").addEventListener("submit", submitProductForm);
    document.getElementById("categoryForm").addEventListener("submit", submitCategoryForm);
    document.getElementById("productSearch").addEventListener("input", renderMenu);
    document.getElementById("productCategoryFilter").addEventListener("change", renderMenu);
    document.getElementById("productStatusFilter").addEventListener("change", renderMenu);
    document.getElementById("productSort").addEventListener("change", renderMenu);
    document.getElementById("exportProductsButton").addEventListener("click", handleExportProducts);
    document.querySelectorAll("[data-close-product-modal]").forEach((item) => {
        item.addEventListener("click", closeProductModal);
    });

    const companyForm = document.getElementById("companyForm");
    companyForm.elements.logo.addEventListener("change", previewCompanyLogo);
    companyForm.elements.banner.addEventListener("change", previewCompanyBanner);
}

function bindSidebarToggle() {
    const shell = document.getElementById("dashboardShell");
    const toggle = document.getElementById("sidebarToggle");
    const backdrop = document.getElementById("sidebarBackdrop");

    if (!shell || !toggle || !backdrop) {
        return;
    }

    const setCollapsed = (collapsed) => {
        shell.classList.toggle("is-sidebar-collapsed", collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.querySelector(".sidebar-toggle__text").textContent = collapsed ? "Показать меню" : "Скрыть меню";
        backdrop.hidden = collapsed || !window.matchMedia("(max-width: 1024px)").matches;
    };

    toggle.addEventListener("click", () => {
        setCollapsed(!shell.classList.contains("is-sidebar-collapsed"));
    });

    backdrop.addEventListener("click", () => setCollapsed(true));

    document.querySelector(".dash-nav")?.addEventListener("click", (event) => {
        if (event.target.closest("button[data-view]") && window.matchMedia("(max-width: 1024px)").matches) {
            setCollapsed(true);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape"
            && !shell.classList.contains("is-sidebar-collapsed")
            && window.matchMedia("(max-width: 1024px)").matches
        ) {
            setCollapsed(true);
        }
    });

    window.addEventListener("resize", () => {
        const collapsed = shell.classList.contains("is-sidebar-collapsed");
        backdrop.hidden = collapsed || !window.matchMedia("(max-width: 1024px)").matches;
    });

    setCollapsed(window.matchMedia("(max-width: 1024px)").matches);
}

function fillStaticSelects() {
    const businessOptions = BUSINESS_TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    document.getElementById("businessTypeSelect").innerHTML = businessOptions;
    document.getElementById("wizardBusinessType").innerHTML = businessOptions;

    const currencyOptions = Object.values(CURRENCIES).map((currency) => (
        `<option value="${currency.code}">${currency.label}</option>`
    )).join("");
    document.getElementById("currencySelect").innerHTML = currencyOptions;

    document.getElementById("wizardCurrency").innerHTML = Object.values(CURRENCIES).map((currency, index) => `
        <label class="choice-card">
            <input type="radio" name="currency" value="${currency.code}" ${index === 0 ? "checked" : ""}>
            <strong>${currency.label}</strong>
        </label>
    `).join("");
}

function openWizard() {
    document.getElementById("dashboardShell").hidden = true;
    document.getElementById("companyWizard").hidden = false;
    renderWizardProgress();
}

function setWizardStep(nextStep) {
    const steps = document.querySelectorAll(".wizard-step");
    wizardStep = Math.max(0, Math.min(nextStep, steps.length - 1));

    steps.forEach((step, index) => step.classList.toggle("is-active", index === wizardStep));
    document.getElementById("wizardPrev").hidden = wizardStep === 0;
    document.getElementById("wizardNext").hidden = wizardStep === steps.length - 1;
    document.getElementById("wizardSubmit").hidden = wizardStep !== steps.length - 1;

    if (wizardStep === steps.length - 1) {
        renderWizardSummary();
    }

    renderWizardProgress();
}

function renderWizardProgress() {
    document.getElementById("wizardProgress").innerHTML = Array.from({ length: 6 }, (_, index) => (
        `<span class="${index <= wizardStep ? "is-active" : ""}"></span>`
    )).join("");
}

function renderWizardSummary() {
    const data = Object.fromEntries(new FormData(document.getElementById("wizardForm")).entries());
    const businessLabel = BUSINESS_TYPES.find(([value]) => value === data.businessType)?.[1] || "Ресторан";
    const currency = CURRENCIES[data.currency]?.label || "USD ($)";

    document.getElementById("wizardSummary").innerHTML = `
        <p><strong>Название:</strong> ${escapeHtml(data.name || "Не указано")}</p>
        <p><strong>Тип:</strong> ${businessLabel}</p>
        <p><strong>Город:</strong> ${escapeHtml(data.city || "Не указан")}</p>
        <p><strong>Валюта:</strong> ${currency}</p>
        <p><strong>Язык:</strong> ${data.language || "ru"}</p>
        <p><strong>НДС:</strong> ${data.tax || 18}%</p>
    `;
}

async function submitWizard(event) {
    event.preventDefault();

    if (!validateWizardStep() || !validateWizardRequiredData()) {
        return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const logo = await uploadLogo(formData.get("logo"));

    currentCompany = await createCompanyApi({
        ...Object.fromEntries(formData.entries()),
        logo,
        pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
    });
    currentUser = checkUser();

    showToast("Заведение создано");
    loadDashboard();
}

function validateWizardStep() {
    const activeStep = document.querySelector(".wizard-step.is-active");
    const requiredFields = activeStep.querySelectorAll("[required]");

    for (const field of requiredFields) {
        if (!field.value.trim()) {
            showToast("Заполните название заведения");
            field.focus();
            return false;
        }
    }

    return true;
}

function validateWizardRequiredData() {
    const form = document.getElementById("wizardForm");

    if (!form.elements.name.value.trim()) {
        setWizardStep(0);
        showToast("Заполните название заведения");
        form.elements.name.focus();
        return false;
    }

    return true;
}

function switchView(view) {
    if (!canShowView(currentUser, view, currentCompany)) {
        const fallbackView = getDefaultView(currentUser, currentCompany);
        showToast("Этот раздел скрыт для вашей роли. Открываю рабочий экран.");
        switchView(fallbackView);
        return;
    }

    currentView = view;
    document.querySelectorAll(".dash-nav button").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.view === view);
    });
    document.querySelectorAll(".dash-view").forEach((section) => section.classList.remove("is-active"));
    document.getElementById(`${view}View`).classList.add("is-active");
    document.getElementById("dashboardTitle").textContent = viewTitles[view];
    setCompanyHeroVisibility(view);
}

function applyNavigationPolicy() {
    const visibleViews = getVisibleViews(currentUser, currentCompany);
    const nav = document.querySelector(".dash-nav");

    if (!navGrouped) {
        groupNavigation(nav);
        navGrouped = true;
    }

    document.querySelectorAll(".dash-nav button[data-view]").forEach((button) => {
        const isVisible = visibleViews.includes(button.dataset.view);
        button.hidden = !isVisible;
        button.setAttribute("aria-hidden", String(!isVisible));
    });

    document.querySelectorAll(".dash-nav-group").forEach((group) => {
        const hasVisibleItems = Boolean(group.querySelector("button[data-view]:not([hidden])"));
        group.hidden = !hasVisibleItems;
    });
}

function groupNavigation(nav) {
    const buttonsByView = new Map([...nav.querySelectorAll("button[data-view]")].map((button) => [button.dataset.view, button]));
    nav.innerHTML = "";

    VIEW_GROUPS.forEach((group) => {
        const groupElement = document.createElement("div");
        groupElement.className = "dash-nav-group";
        groupElement.innerHTML = `<span class="dash-nav-group__title">${group.title}</span>`;

        group.views.forEach((view) => {
            const button = buttonsByView.get(view);
            if (button) {
                groupElement.append(button);
            }
        });

        if (groupElement.querySelector("button")) {
            nav.append(groupElement);
        }
    });
}

function setCompanyHeroVisibility(view) {
    const compactViews = new Set(["workspace", "pos", "kitchen", "floor", "warehouse", "procurement", "staff", "menu", "categories", "clients", "reports"]);
    document.getElementById("companyHero").hidden = compactViews.has(view);
}

function renderCompanyShell() {
    const businessLabel = BUSINESS_TYPES.find(([value]) => value === currentCompany.businessType)?.[1] || "Заведение";
    const logoMark = document.getElementById("companyLogoMark");

    logoMark.innerHTML = currentCompany.logo ? `<img src="${currentCompany.logo}" alt="">` : escapeHtml(currentCompany.name[0] || "P");
    document.getElementById("sidebarCompanyName").textContent = currentCompany.name;
    document.getElementById("sidebarCompanyType").textContent = getRoleLabel(currentUser, currentCompany);
    document.getElementById("dashboardSubtitle").textContent = `${getRoleLabel(currentUser, currentCompany)} • ${currentCompany.settings.currency}`;

    const hero = document.getElementById("companyHero");
    hero.style.backgroundImage = currentCompany.banner
        ? `url("${currentCompany.banner}")`
        : "linear-gradient(135deg, #0F172A, #2563EB)";
    hero.innerHTML = `
        <div class="hero-company__content">
            <h2>${escapeHtml(currentCompany.name)}</h2>
            <p>${escapeHtml(currentCompany.description || "Все для работы заведения в одном месте.")}</p>
        </div>
    `;
}

function renderHome() {
    const subscription = getSubscriptionInfo(currentUser);
    const products = loadProducts(currentCompany.id);
    const categories = loadCategories(currentCompany.id);
    const ingredients = loadIngredients(currentCompany.id);
    const lowStockIngredients = checkLowStock(currentCompany.id);
    const procurement = loadProcurementDashboard(currentCompany.id);
    const staff = loadStaffDashboard(currentCompany.id);
    const lowStockProducts = products.filter((product) => product.quantity <= product.minQuantity);
    const lastProduct = [...products].sort((left, right) => (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ))[0];
    const metricMap = {
        revenue: ["Выручка сегодня", formatMoney(0, currentCompany.settings.currency), "Появится после первых продаж"],
        orders: ["Заказы сегодня", "0", "Откройте кассу или зал, чтобы принять заказ"],
        averageCheck: ["Средний чек", formatMoney(0, currentCompany.settings.currency), "Считается по оплаченным чекам"],
        activeProducts: ["Активные товары", products.filter((product) => product.active && product.status === "active").length, `${products.length} товаров всего`],
        lowStockProducts: ["Товары заканчиваются", lowStockProducts.length, "Проверьте остатки перед сменой"],
        categories: ["Категории", categories.length, "Помогают быстрее искать товары"],
        lastProduct: ["Последний товар", lastProduct?.name || "Пока нет", "Добавьте меню для запуска продаж"],
        ingredients: ["Ингредиенты", ingredients.length, "Складские позиции заведения"],
        lowStockIngredients: ["Низкие остатки", lowStockIngredients.length, "Создайте закупку, если нужно"],
        stockValue: ["Стоимость склада", formatMoney(calculateStockValue(ingredients), currentCompany.settings.currency), "Оценка текущих остатков"],
        openPurchases: ["Открытые закупки", procurement.openOrders, `${procurement.activeSuppliers} активных поставщиков`],
        purchaseAmount: ["Сумма закупок", formatMoney(procurement.purchaseAmount, currentCompany.settings.currency), "По локальным данным закупок"],
        staffTotal: ["Сотрудники", staff.totalEmployees, "Команда заведения"],
        staffOnShift: ["Сейчас на смене", staff.currentlyOnShift, `${staff.todayWorking} работают сегодня`],
        subscription: ["Тариф", subscription.plan, subscription.lifetime ? "Lifetime" : `До ${formatDate(subscription.endDate)}`],
    };
    const metricKeys = getHomeMetricPreset(currentUser, currentCompany);
    const metrics = metricKeys.map((key) => metricMap[key]).filter(Boolean);

    document.getElementById("homeView").innerHTML = `
        <div class="home-intro panel">
            <div>
                <span class="home-role-pill">${escapeHtml(getRoleLabel(currentUser, currentCompany))}</span>
                <h2>${escapeHtml(getHomeTitle())}</h2>
                <p>${escapeHtml(getHomeDescription())}</p>
            </div>
            <button class="secondary-btn" type="button" data-quick-view="ai">AI Assistant</button>
        </div>
        ${renderHomeQuickActions(products, ingredients, lowStockIngredients)}
        <div class="metrics-grid" id="dashboardMetrics">
            ${metrics.map(([label, value, hint]) => `
                <article class="metric-card">
                    <span>${label}</span>
                    <strong>${escapeHtml(value)}</strong>
                    <p>${escapeHtml(hint)}</p>
                </article>
            `).join("")}
        </div>
    `;

    bindQuickActions();
}

function getHomeTitle() {
    const role = currentUser?.role;
    const titles = {
        cashier: "Рабочее место кассира",
        waiter: "Зал и активные заказы",
        kitchen: "Экран кухни и готовка",
        storekeeper: "Склад и закупки",
        accountant: "Финансы и отчеты",
    };

    return titles[role] || "Сегодня в заведении";
}

function getHomeDescription() {
    const role = currentUser?.role;
    const descriptions = {
        cashier: "Откройте смену, пробивайте чеки и принимайте оплату.",
        waiter: "Выберите стол, добавьте блюда и отправьте заказ.",
        kitchen: "Готовьте заказы и меняйте статусы.",
        storekeeper: "Следите за остатками и списаниями.",
        accountant: "Смотрите отчеты и финансы.",
    };

    return descriptions[role] || "Основные действия для работы.";
}

function renderHomeQuickActions(products, ingredients, lowStockIngredients) {
    const allActions = [
        { label: "Касса", view: "pos", hint: "Продажа", primary: true },
        { label: "Зал", view: "floor", hint: "Столы" },
        { label: "Кухня", view: "kitchen", hint: "Заказы" },
        { label: "Товар", view: "menu", action: "add-product", hint: products.length ? "Меню" : "Создать", primary: !products.length },
        { label: "Склад", view: "warehouse", hint: ingredients.length ? "Остатки" : "Добавить" },
        { label: "Закупка", view: "procurement", hint: lowStockIngredients.length ? `${lowStockIngredients.length} низких` : "Поставщики" },
        { label: "Сотрудник", view: "staff", hint: "Команда" },
        { label: "Настройки", view: "settings", hint: "Параметры" },
    ];
    const visibleViews = getVisibleViews(currentUser, currentCompany);
    const actions = allActions.filter((action) => visibleViews.includes(action.view)).slice(0, 5);

    if (!actions.length) {
        return "";
    }

    return `
        <div class="quick-actions panel" aria-label="Быстрые действия">
            <div>
                <h3>Что можно сделать сейчас</h3>
                <p>Самые частые действия для вашей роли.</p>
            </div>
            <div class="quick-actions__grid">
                ${actions.map((action) => `
                    <button class="${action.primary ? "primary-btn" : "secondary-btn"}" type="button" data-quick-view="${action.view}" ${action.action ? `data-quick-action="${action.action}"` : ""}>
                        <strong>${escapeHtml(action.label)}</strong>
                        <span>${escapeHtml(action.hint)}</span>
                    </button>
                `).join("")}
            </div>
        </div>
    `;
}

function bindQuickActions() {
    document.querySelectorAll("[data-quick-view]").forEach((button) => {
        button.addEventListener("click", () => {
            switchView(button.dataset.quickView);

            if (button.dataset.quickAction === "add-product") {
                openProductModal();
            }

            if (button.dataset.quickView === "ai") {
                document.getElementById("openAIButton")?.click();
            }
        });
    });
}

function renderCompanyForm() {
    const form = document.getElementById("companyForm");
    form.elements.name.value = currentCompany.name;
    form.elements.legalName.value = currentCompany.legalName;
    form.elements.businessType.value = currentCompany.businessType;
    form.elements.phone.value = currentCompany.contacts.phone;
    form.elements.email.value = currentCompany.contacts.email;
    form.elements.street.value = currentCompany.address.street;
    form.elements.website.value = currentCompany.contacts.website;
    form.elements.instagram.value = currentCompany.contacts.instagram;
    form.elements.facebook.value = currentCompany.contacts.facebook;
    form.elements.telegram.value = currentCompany.contacts.telegram;
    form.elements.timezone.value = currentCompany.settings.timezone;
    form.elements.currency.value = currentCompany.settings.currency;
    form.elements.language.value = currentCompany.settings.language;
    form.elements.tax.value = String(currentCompany.settings.tax);
    form.elements.description.value = currentCompany.description;
    form.elements.pricesIncludeTax.checked = Boolean(currentCompany.settings.pricesIncludeTax);
    setPreview("logoPreview", currentCompany.logo);
    setPreview("bannerPreview", currentCompany.banner);
}

async function submitCompanyForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const logoFile = formData.get("logo");
    const bannerFile = formData.get("banner");
    const logo = logoFile?.size ? await uploadLogo(logoFile) : currentCompany.logo;
    const banner = bannerFile?.size ? await uploadBanner(bannerFile) : currentCompany.banner;

    currentCompany = updateCompany(currentCompany.id, {
        name: formData.get("name"),
        legalName: formData.get("legalName"),
        businessType: formData.get("businessType"),
        description: formData.get("description"),
        logo,
        banner,
        address: {
            street: formData.get("street"),
        },
        contacts: {
            phone: formData.get("phone"),
            email: formData.get("email"),
            website: formData.get("website"),
            instagram: formData.get("instagram"),
            facebook: formData.get("facebook"),
            telegram: formData.get("telegram"),
        },
        settings: {
            timezone: formData.get("timezone"),
            currency: formData.get("currency"),
            language: formData.get("language"),
            tax: formData.get("tax") === "custom" ? currentCompany.settings.tax : Number(formData.get("tax")),
            pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
        },
    });

    showToast("Данные заведения сохранены");
    loadDashboard();
}

function renderSettingsForms() {
    const workingForm = document.getElementById("workingHoursForm");
    const notificationsForm = document.getElementById("notificationsForm");
    const hours = currentCompany.settings.workingHours;
    const notifications = currentCompany.settings.notifications;

    workingForm.elements.opensAt.value = hours.opensAt;
    workingForm.elements.closesAt.value = hours.closesAt;
    workingForm.elements.days.value = hours.days.join(", ");
    notificationsForm.elements.email.checked = notifications.email;
    notificationsForm.elements.telegram.checked = notifications.telegram;
    notificationsForm.elements.push.checked = notifications.push;
    document.getElementById("qrImage").src = currentCompany.qrCode;
}

function submitWorkingHours(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    currentCompany = updateSettings(currentCompany.id, {
        workingHours: {
            opensAt: formData.get("opensAt"),
            closesAt: formData.get("closesAt"),
            days: formData.get("days").split(",").map((day) => day.trim()).filter(Boolean),
        },
    });
    showToast("Рабочие смены обновлены");
}

function submitNotifications(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    currentCompany = updateSettings(currentCompany.id, {
        notifications: {
            email: formData.get("email") === "on",
            telegram: formData.get("telegram") === "on",
            push: formData.get("push") === "on",
        },
    });
    showToast("Уведомления обновлены");
}

function renderSubscription() {
    const subscription = getSubscriptionInfo(currentUser);
    const endDate = subscription.lifetime ? "Lifetime" : formatDate(subscription.endDate);

    document.getElementById("subscriptionPanel").innerHTML = `
        <h2>Подписка</h2>
        <div class="metrics-grid">
            <article class="metric-card"><span>Название тарифа</span><strong>${escapeHtml(subscription.plan)}</strong></article>
            <article class="metric-card"><span>Дата покупки</span><strong>${formatDate(subscription.startDate)}</strong></article>
            <article class="metric-card"><span>Дата окончания</span><strong>${endDate}</strong></article>
            <article class="metric-card"><span>Осталось дней</span><strong>${subscription.daysLeft}</strong></article>
            <article class="metric-card"><span>Статус</span><strong>${escapeHtml(subscription.status)}</strong></article>
        </div>
        ${subscription.warning ? '<div class="subscription-alert">До окончания подписки осталось менее 7 дней.</div>' : ""}
    `;
}

function renderMenu() {
    if (!currentCompany) {
        return;
    }

    const categories = loadCategories(currentCompany.id).sort((left, right) => left.sortOrder - right.sortOrder);
    const allProducts = loadProducts(currentCompany.id);
    const query = document.getElementById("productSearch").value || "";
    const filters = {
        categoryId: document.getElementById("productCategoryFilter").value || activeCategoryId,
        status: document.getElementById("productStatusFilter").value,
    };
    const sortBy = document.getElementById("productSort").value;
    const products = sortProducts(filterProducts(searchProducts(allProducts, query), filters), sortBy);

    renderProductFilters(categories);
    renderMenuCategories(categories);
    renderProducts(products, categories);
}

function renderProductFilters(categories) {
    const categoryFilter = document.getElementById("productCategoryFilter");
    const selectedValue = categoryFilter.value;

    categoryFilter.innerHTML = `
        <option value="">Все категории</option>
        ${categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}
    `;
    categoryFilter.value = selectedValue;

    const productCategorySelect = document.getElementById("productForm").elements.categoryId;
    productCategorySelect.innerHTML = categories.map((category) => (
        `<option value="${category.id}">${escapeHtml(category.name)}</option>`
    )).join("");
    document.getElementById("productForm").elements.unit.innerHTML = PRODUCT_UNITS.map((unit) => (
        `<option value="${unit}">${unit}</option>`
    )).join("");
}

function renderMenuCategories(categories) {
    document.getElementById("menuCategoriesList").innerHTML = `
        <button class="category-chip ${activeCategoryId === "" ? "is-active" : ""}" type="button" data-category-filter="">Все товары</button>
        ${categories.map((category) => `
            <button class="category-chip ${Number(activeCategoryId) === Number(category.id) ? "is-active" : ""}" type="button" data-category-filter="${category.id}">
                <span style="background:${category.color}">${escapeHtml(category.icon)}</span>
                ${escapeHtml(category.name)}
            </button>
        `).join("")}
    `;

    document.querySelectorAll("[data-category-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            activeCategoryId = button.dataset.categoryFilter;
            document.getElementById("productCategoryFilter").value = activeCategoryId;
            renderMenu();
        });
    });
}

function renderProducts(products, categories) {
    const categoryById = new Map(categories.map((category) => [Number(category.id), category]));

    if (!products.length) {
        document.getElementById("productsGrid").innerHTML = `
            <div class="empty-state empty-state--action">
                <span class="empty-state__icon">🍽</span>
                <h3>У вас пока нет товаров</h3>
                <p>Создайте первый товар, чтобы кассир смог сразу добавить его в чек.</p>
                <button class="primary-btn" type="button" data-empty-action="add-product">Создать первый товар</button>
            </div>
        `;
        document.querySelector("[data-empty-action='add-product']")?.addEventListener("click", () => openProductModal());
        return;
    }

    document.getElementById("productsGrid").innerHTML = products.map((product) => {
        const category = categoryById.get(Number(product.categoryId));
        const lowStock = product.quantity <= product.minQuantity;

        return `
            <article class="product-card">
                <div class="product-card__image">
                    ${product.images?.[0] ? `<img src="${product.images[0]}" alt="">` : "<span>🍽</span>"}
                </div>
                <div class="product-card__body">
                    <div>
                        <span class="product-sku">${escapeHtml(product.sku)}</span>
                        <h3>${escapeHtml(product.name)}</h3>
                        <p>${escapeHtml(product.description || "Без описания")}</p>
                    </div>
                    <div class="product-meta">
                        <span>${escapeHtml(category?.name || "Без категории")}</span>
                        <strong>${formatMoney(product.price, currentCompany.settings.currency)}</strong>
                    </div>
                    <div class="product-badges">
                        <span>${escapeHtml(product.status)}</span>
                        ${product.popular ? "<span>Популярный</span>" : ""}
                        ${product.novelty ? "<span>Новинка</span>" : ""}
                        ${lowStock ? '<span class="warning">Низкий остаток</span>' : ""}
                    </div>
                    <div class="product-actions">
                        <button type="button" data-product-action="edit" data-product-id="${product.id}">Редактировать</button>
                        <button type="button" data-product-action="duplicate" data-product-id="${product.id}">Дублировать</button>
                        <button type="button" data-product-action="archive" data-product-id="${product.id}">Архив</button>
                        <button type="button" data-product-action="delete" data-product-id="${product.id}">Удалить</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    document.querySelectorAll("[data-product-action]").forEach((button) => {
        button.addEventListener("click", () => handleProductAction(button.dataset.productAction, button.dataset.productId));
    });
}

function renderCategoriesManager() {
    const categories = loadCategories(currentCompany.id).sort((left, right) => left.sortOrder - right.sortOrder);

    if (!categories.length) {
        document.getElementById("categoryManager").innerHTML = `
            <div class="empty-state empty-state--action">
                <span class="empty-state__icon">🏷</span>
                <h3>Категории еще не настроены</h3>
                <p>Создайте простые категории: Завтраки, Напитки, Десерты. Так кассиру будет легче искать товары.</p>
                <button class="primary-btn" type="button" data-focus-category-form>Создать категорию</button>
            </div>
        `;
        document.querySelector("[data-focus-category-form]")?.addEventListener("click", () => {
            document.getElementById("categoryForm").elements.name.focus();
        });
        return;
    }

    document.getElementById("categoryManager").innerHTML = categories.map((category) => `
        <article class="category-row" draggable="true" data-category-id="${category.id}">
            <span class="drag-handle">↕</span>
            <span class="category-icon" style="background:${category.color}">${escapeHtml(category.icon)}</span>
            <div>
                <h3>${escapeHtml(category.name)}</h3>
                <p>${escapeHtml(category.description || "Без описания")}</p>
            </div>
            <span>${category.active ? "Активна" : "Неактивна"}</span>
            <button type="button" data-category-action="edit" data-category-id="${category.id}">Редактировать</button>
            <button type="button" data-category-action="delete" data-category-id="${category.id}">Удалить</button>
        </article>
    `).join("");

    bindCategoryActions();
    bindCategoryDragAndDrop();
}

function bindCategoryActions() {
    document.querySelectorAll("[data-category-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const categoryId = button.dataset.categoryId;

            if (button.dataset.categoryAction === "delete") {
                deleteCategory(categoryId);
                showToast("Категория удалена");
            } else {
                editCategory(categoryId);
            }

            renderCategoriesManager();
            renderMenu();
            renderHome();
        });
    });
}

function bindCategoryDragAndDrop() {
    let draggedId = null;

    document.querySelectorAll(".category-row").forEach((row) => {
        row.addEventListener("dragstart", () => {
            draggedId = row.dataset.categoryId;
            row.classList.add("is-dragging");
        });

        row.addEventListener("dragend", () => {
            row.classList.remove("is-dragging");
        });

        row.addEventListener("dragover", (event) => {
            event.preventDefault();
        });

        row.addEventListener("drop", () => {
            const targetId = row.dataset.categoryId;
            const orderedIds = loadCategories(currentCompany.id)
                .sort((left, right) => left.sortOrder - right.sortOrder)
                .map((category) => String(category.id));
            const fromIndex = orderedIds.indexOf(String(draggedId));
            const toIndex = orderedIds.indexOf(String(targetId));

            if (fromIndex === -1 || toIndex === -1) {
                return;
            }

            orderedIds.splice(toIndex, 0, orderedIds.splice(fromIndex, 1)[0]);
            sortCategories(currentCompany.id, orderedIds);
            renderCategoriesManager();
            renderMenu();
        });
    });
}

function submitCategoryForm(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    createCategory(currentCompany.id, {
        name: formData.get("name"),
        description: formData.get("description"),
        icon: formData.get("icon"),
        color: formData.get("color"),
        active: formData.get("active") === "on",
    });

    event.currentTarget.reset();
    event.currentTarget.elements.icon.value = "🍽";
    event.currentTarget.elements.color.value = "#3B82F6";
    event.currentTarget.elements.active.checked = true;
    showToast("Категория создана");
    renderCategoriesManager();
    renderMenu();
    renderHome();
}

function editCategory(categoryId) {
    const category = loadCategories(currentCompany.id).find((item) => Number(item.id) === Number(categoryId));

    if (!category) {
        return;
    }

    const name = window.prompt("Название категории", category.name);
    const description = window.prompt("Описание категории", category.description);

    if (!name) {
        return;
    }

    updateCategory(categoryId, { name, description });
    showToast("Категория обновлена");
}

function openProductModal(product = null) {
    const modal = document.getElementById("productModal");
    const form = document.getElementById("productForm");
    const categories = loadCategories(currentCompany.id);

    renderProductFilters(categories);
    renderProductTags(product?.tags || []);
    form.reset();
    form.elements.productId.value = product?.id || "";
    form.elements.name.value = product?.name || "";
    form.elements.categoryId.value = product?.categoryId || categories[0]?.id || "";
    form.elements.price.value = product?.price || 0;
    form.elements.costPrice.value = product?.costPrice || 0;
    form.elements.quantity.value = product?.quantity || 0;
    form.elements.minQuantity.value = product?.minQuantity || 0;
    form.elements.unit.value = product?.unit || "шт";
    form.elements.status.value = product?.status || "active";
    form.elements.weight.value = product?.weight || 0;
    form.elements.volume.value = product?.volume || 0;
    form.elements.portions.value = product?.portions || 1;
    form.elements.description.value = product?.description || "";
    form.elements.fullDescription.value = product?.fullDescription || "";
    form.elements.ingredients.value = (product?.ingredients || []).join(", ");
    form.elements.calories.value = product?.nutrition?.calories || 0;
    form.elements.protein.value = product?.nutrition?.protein || 0;
    form.elements.fat.value = product?.nutrition?.fat || 0;
    form.elements.carbs.value = product?.nutrition?.carbs || 0;
    form.elements.active.checked = product?.active ?? true;
    form.elements.popular.checked = Boolean(product?.popular);
    form.elements.novelty.checked = Boolean(product?.novelty);
    form.elements.recommended.checked = Boolean(product?.recommended);
    form.elements.qrVisible.checked = product?.qrVisible ?? true;
    form.elements.posVisible.checked = product?.posVisible ?? true;
    form.elements.modifiers.value = stringifyNamePriceList(product?.modifiers || []);
    form.elements.variants.value = stringifyNamePriceList(product?.variants || []);
    document.getElementById("productModalTitle").textContent = product ? "Редактировать товар" : "Добавить товар";
    modal.hidden = false;
}

function closeProductModal() {
    document.getElementById("productModal").hidden = true;
}

function renderProductTags(selectedTags = []) {
    document.getElementById("productTags").innerHTML = PRODUCT_TAGS.map((tag) => `
        <label><input type="checkbox" value="${tag}" ${selectedTags.includes(tag) ? "checked" : ""}> ${tag}</label>
    `).join("");
}

async function submitProductForm(event) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form.elements.name.value.trim()) {
        showToast("Введите название товара");
        form.elements.name.focus();
        return;
    }

    const formData = new FormData(form);
    const image = await uploadImage(formData.get("image"));
    const productId = formData.get("productId");
    const payload = {
        name: formData.get("name"),
        categoryId: formData.get("categoryId"),
        description: formData.get("description"),
        fullDescription: formData.get("fullDescription"),
        images: image ? [image] : (productId ? loadProducts(currentCompany.id).find((item) => Number(item.id) === Number(productId))?.images || [] : []),
        price: formData.get("price"),
        costPrice: formData.get("costPrice"),
        currency: currentCompany.settings.currency,
        quantity: formData.get("quantity"),
        minQuantity: formData.get("minQuantity"),
        unit: formData.get("unit"),
        status: formData.get("status"),
        weight: formData.get("weight"),
        volume: formData.get("volume"),
        portions: formData.get("portions"),
        active: formData.get("active") === "on",
        popular: formData.get("popular") === "on",
        novelty: formData.get("novelty") === "on",
        recommended: formData.get("recommended") === "on",
        qrVisible: formData.get("qrVisible") === "on",
        posVisible: formData.get("posVisible") === "on",
        tags: Array.from(document.querySelectorAll("#productTags input:checked")).map((input) => input.value),
        modifiers: parseNamePriceList(formData.get("modifiers")),
        variants: parseNamePriceList(formData.get("variants")),
        ingredients: formData.get("ingredients").split(",").map((item) => item.trim()).filter(Boolean),
        calories: formData.get("calories"),
        protein: formData.get("protein"),
        fat: formData.get("fat"),
        carbs: formData.get("carbs"),
    };

    if (productId) {
        updateProduct(productId, payload);
        showToast("Товар обновлен");
    } else {
        createProduct(currentCompany.id, payload);
        showToast("Товар создан");
    }

    closeProductModal();
    renderMenu();
    renderHome();
}

function handleProductAction(action, productId) {
    const product = loadProducts(currentCompany.id).find((item) => Number(item.id) === Number(productId));

    if (!product) {
        return;
    }

    if (action === "edit") {
        openProductModal(product);
    }

    if (action === "duplicate") {
        duplicateProduct(productId);
        showToast("Товар продублирован");
    }

    if (action === "archive") {
        archiveProduct(productId);
        showToast("Товар отправлен в архив");
    }

    if (action === "delete") {
        deleteProduct(productId);
        showToast("Товар удален");
    }

    renderMenu();
    renderHome();
}

function handleExportProducts() {
    const result = exportProducts(loadProducts(currentCompany.id), "csv");
    const blob = new Blob([result.content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `products-company-${currentCompany.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(result.message);
}

function parseNamePriceList(value) {
    return value
        .split("\n")
        .flatMap((line) => line.split(","))
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
            const [name, price = 0] = item.split(":").map((part) => part.trim());
            return {
                id: Date.now() + Math.random(),
                name,
                price: Number(price) || 0,
            };
        });
}

function stringifyNamePriceList(items) {
    return items.map((item) => `${item.name}: ${item.price || 0}`).join(", ");
}

function renderPlaceholders() {
    const placeholders = {
        clients: {
            icon: "👥",
            title: "CRM готовится к запуску",
            text: "Здесь будут клиенты, бонусы, визиты и история заказов. Пока можно использовать AI, чтобы подготовить структуру CRM.",
            primary: "Спросить AI про CRM",
            view: "ai",
        },
        reports: {
            icon: "📊",
            title: "Отчеты появятся здесь",
            text: "Финансовая аналитика будет собираться из продаж, закупок и склада. Для ежедневной работы пока используйте главную и кассу.",
            primary: "Открыть главную",
            view: "home",
        },
    };

    Object.entries(placeholders).forEach(([view, item]) => {
        document.getElementById(`${view}View`).innerHTML = `
            <div class="placeholder empty-state empty-state--action">
                <span class="empty-state__icon">${item.icon}</span>
                <h2>${escapeHtml(item.title)}</h2>
                <p>${escapeHtml(item.text)}</p>
                <button class="primary-btn" type="button" data-placeholder-view="${item.view}">${escapeHtml(item.primary)}</button>
            </div>
        `;
    });

    document.querySelectorAll("[data-placeholder-view]").forEach((button) => {
        button.addEventListener("click", () => switchView(button.dataset.placeholderView));
    });
}

function updateMedia(field, value) {
    currentCompany = updateCompany(currentCompany.id, { [field]: value });
    showToast(field === "logo" ? "Логотип удален" : "Обложка удалена");
    loadDashboard();
}

async function previewCompanyLogo(event) {
    const file = event.target.files[0];
    if (file) {
        setPreview("logoPreview", await uploadLogo(file));
    }
}

async function previewCompanyBanner(event) {
    const file = event.target.files[0];
    if (file) {
        setPreview("bannerPreview", await uploadBanner(file));
    }
}

function setPreview(id, src) {
    const image = document.getElementById(id);

    if (src) {
        image.src = src;
    } else {
        image.removeAttribute("src");
    }
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
    const toast = document.getElementById("dashToast");
    clearTimeout(toastTimer);
    toast.textContent = message;
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
