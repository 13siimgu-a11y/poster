import { storage, STORAGE_KEYS } from "./storage.js";
import { createLog } from "./logs.js";

export const ROLES = {
    superAdmin: "super_admin",
    admin: "admin",
    manager: "manager",
    cashier: "cashier",
    kitchen: "kitchen",
    waiter: "waiter",
    bartender: "bartender",
};

export const ROLE_LABELS = {
    [ROLES.superAdmin]: "Super Admin",
    [ROLES.admin]: "Admin",
    [ROLES.manager]: "Manager",
    [ROLES.cashier]: "Cashier",
    [ROLES.kitchen]: "Kitchen",
    [ROLES.waiter]: "Waiter",
    [ROLES.bartender]: "Bartender",
};

export const WORKSPACE_ROLES = [ROLES.cashier, ROLES.waiter, ROLES.bartender];

export function normalizeRole(role) {
    const value = String(role || "").trim().toLowerCase();
    if (["barmen", "bar", "бармен", "бар"].includes(value)) {
        return ROLES.bartender;
    }
    return value;
}

export function isValidRole(role) {
    return Object.values(ROLES).includes(normalizeRole(role));
}

export function canAccessAdmin(user) {
    return normalizeRole(user?.role) === ROLES.superAdmin;
}

export function shouldOpenWorkspace(user) {
    return WORKSPACE_ROLES.includes(normalizeRole(user?.role));
}

export function changeRole(userId, role) {
    const normalizedRole = normalizeRole(role);
    if (!isValidRole(normalizedRole)) {
        return null;
    }

    const users = storage.get(STORAGE_KEYS.users, []);
    const userIndex = users.findIndex((user) => Number(user.id) === Number(userId));

    if (userIndex === -1) {
        return null;
    }

    users[userIndex] = {
        ...users[userIndex],
        role: normalizedRole,
    };

    storage.set(STORAGE_KEYS.users, users);
    createLog("Изменил роль", {
        userId: users[userIndex].id,
        username: users[userIndex].username,
        role: normalizedRole,
    });

    return users[userIndex];
}
