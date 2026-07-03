import { ROLE_PERMISSIONS } from "./permissions.js";
import { ROLES, normalizeRole } from "./roles.js";

export const VIEW_GROUPS = [
    {
        title: "Работа сегодня",
        views: ["home", "workspace", "pos", "floor", "kitchen"],
    },
    {
        title: "Каталог",
        views: ["menu", "categories"],
    },
    {
        title: "Клиенты",
        views: ["clients", "ai"],
    },
    {
        title: "Склад",
        views: ["warehouse", "procurement"],
    },
    {
        title: "Команда",
        views: ["staff"],
    },
    {
        title: "Аналитика",
        views: ["reports"],
    },
    {
        title: "Система",
        views: ["company", "settings", "subscription"],
    },
];

const ROLE_VIEW_MATRIX = {
    [ROLES.superAdmin]: ["home", "workspace", "ai", "company", "pos", "kitchen", "menu", "categories", "floor", "staff", "clients", "warehouse", "procurement", "reports", "settings", "subscription"],
    [ROLES.admin]: ["home", "workspace", "ai", "company", "pos", "kitchen", "menu", "categories", "floor", "staff", "clients", "warehouse", "procurement", "reports", "settings", "subscription"],
    [ROLES.manager]: ["home", "workspace", "ai", "company", "pos", "kitchen", "menu", "categories", "floor", "staff", "clients", "warehouse", "procurement", "reports", "settings", "subscription"],
    [ROLES.cashier]: ["workspace", "ai"],
    [ROLES.waiter]: ["workspace", "ai"],
    [ROLES.kitchen]: ["kitchen", "menu", "ai"],
    storekeeper: ["warehouse", "procurement", "menu", "ai"],
    accountant: ["home", "reports", "procurement", "subscription", "ai"],
    bartender: ["workspace", "ai"],
};

const ROLE_DEFAULT_VIEW = {
    [ROLES.superAdmin]: "home",
    [ROLES.admin]: "home",
    [ROLES.manager]: "home",
    [ROLES.cashier]: "workspace",
    [ROLES.waiter]: "workspace",
    [ROLES.kitchen]: "kitchen",
    storekeeper: "warehouse",
    accountant: "reports",
    bartender: "workspace",
};

const ROLE_HOME_PRESETS = {
    [ROLES.cashier]: ["orders", "averageCheck", "activeProducts", "subscription"],
    [ROLES.waiter]: ["orders", "staffOnShift", "lastProduct", "subscription"],
    [ROLES.kitchen]: ["orders", "activeProducts", "lowStockProducts", "subscription"],
    storekeeper: ["ingredients", "lowStockIngredients", "stockValue", "openPurchases"],
    accountant: ["revenue", "averageCheck", "purchaseAmount", "subscription"],
};

const MANAGER_HOME_PRESET = ["revenue", "orders", "activeProducts", "lowStockIngredients", "staffOnShift", "subscription"];

export const ROLE_LABELS_UX = {
    [ROLES.superAdmin]: "Super Admin",
    [ROLES.admin]: "Владелец",
    [ROLES.manager]: "Управляющий",
    [ROLES.cashier]: "Кассир",
    [ROLES.waiter]: "Официант",
    [ROLES.kitchen]: "Кухня",
    storekeeper: "Кладовщик",
    accountant: "Бухгалтер",
    bartender: "Бармен",
};

export function getEffectivePermissions(user) {
    if (!user) {
        return [];
    }

    const role = normalizeRole(user.role);
    if (role === ROLES.superAdmin) {
        return ["*"];
    }

    return ROLE_PERMISSIONS[role] || [];
}

export function getVisibleViews(user, company = null) {
    if (!user) {
        return [];
    }

    const role = normalizeRole(user.role);
    const roleViews = ROLE_VIEW_MATRIX[role] || ROLE_VIEW_MATRIX[ROLES.manager];
    const isOwner = company && Number(company.ownerId) === Number(user.id);
    const permissions = getEffectivePermissions(user);
    const canUseAI = permissions.includes("*") || permissions.includes("ai:use");
    const filterByPermissions = (views) => views.filter((view) => view !== "ai" || canUseAI);

    if (isOwner || role === ROLES.admin || role === ROLES.manager || role === ROLES.superAdmin) {
        return filterByPermissions([...ROLE_VIEW_MATRIX[ROLES.manager]]);
    }

    return filterByPermissions([...roleViews]);
}

export function canShowView(user, view, company = null) {
    return getVisibleViews(user, company).includes(view);
}

export function getDefaultView(user, company = null) {
    const visibleViews = getVisibleViews(user, company);
    const preferredView = ROLE_DEFAULT_VIEW[normalizeRole(user?.role)] || "home";

    if (visibleViews.includes(preferredView)) {
        return preferredView;
    }

    return visibleViews[0] || "home";
}

export function getHomeMetricPreset(user, company = null) {
    const isOwner = company && Number(company.ownerId) === Number(user?.id);

    const role = normalizeRole(user?.role);
    if (isOwner || role === ROLES.admin || role === ROLES.manager || role === ROLES.superAdmin) {
        return MANAGER_HOME_PRESET;
    }

    return ROLE_HOME_PRESETS[role] || MANAGER_HOME_PRESET;
}

export function canShowAction(user, permission) {
    const permissions = getEffectivePermissions(user);
    return permissions.includes("*") || permissions.includes(permission);
}

export function getRoleLabel(user, company = null) {
    if (company && Number(company.ownerId) === Number(user?.id)) {
        return "Владелец";
    }

    return ROLE_LABELS_UX[normalizeRole(user?.role)] || "Сотрудник";
}
