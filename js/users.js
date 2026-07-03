import { createLog } from "./logs.js";
import { ROLES } from "./roles.js";
import { storage, STORAGE_KEYS } from "./storage.js";

const SUPER_ADMIN_USERNAME = "zzzret";
const SUPER_ADMIN_PASSWORD = "1r4d945i";

export function createTrialSubscription() {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    return {
        plan: "trial",
        price: 0,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        lifetime: false,
        status: "active",
    };
}

function createLifetimeSubscription() {
    return {
        plan: "lifetime",
        price: 0,
        startDate: new Date().toISOString(),
        endDate: "",
        lifetime: true,
        status: "active",
    };
}

export function normalizeUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email || `${user.username}@posposter.local`,
        password: user.password,
        role: user.role || ROLES.manager,
        status: user.status || "active",
        companyId: user.companyId || null,
        subscription: user.subscription || createTrialSubscription(),
        createdAt: user.createdAt || new Date().toISOString(),
        lastLogin: user.lastLogin || "",
    };
}

export function loadUsers() {
    return storage.get(STORAGE_KEYS.users, []).map(normalizeUser);
}

export function saveUsers(users) {
    return storage.set(STORAGE_KEYS.users, users.map(normalizeUser));
}

export function getNextUserId(users = loadUsers()) {
    return users.length ? Math.max(...users.map((user) => Number(user.id))) + 1 : 1;
}

export function getUserById(userId) {
    return loadUsers().find((user) => Number(user.id) === Number(userId)) || null;
}

export function getUserByUsername(username) {
    return loadUsers().find((user) => user.username.toLowerCase() === username.toLowerCase()) || null;
}

export function createUser(userData) {
    const users = loadUsers();
    const user = normalizeUser({
        id: getNextUserId(users),
        username: userData.username,
        email: userData.email,
        password: userData.password,
        role: userData.role || ROLES.manager,
        status: userData.status || "active",
        subscription: userData.subscription || createTrialSubscription(),
        createdAt: new Date().toISOString(),
        lastLogin: "",
    });

    users.push(user);
    saveUsers(users);
    createLog("Создал пользователя", { userId: user.id, username: user.username });
    return user;
}

export function updateUser(userId, patch) {
    const users = loadUsers();
    const userIndex = users.findIndex((user) => Number(user.id) === Number(userId));

    if (userIndex === -1) {
        return null;
    }

    users[userIndex] = normalizeUser({
        ...users[userIndex],
        ...patch,
    });

    saveUsers(users);
    return users[userIndex];
}

export function setLastLogin(userId) {
    return updateUser(userId, {
        lastLogin: new Date().toISOString(),
    });
}

export function blockUser(userId) {
    const currentUser = getUserById(userId);

    if (!currentUser) {
        return null;
    }

    const user = updateUser(userId, {
        status: "blocked",
        subscription: {
            ...currentUser.subscription,
            status: "blocked",
        },
    });

    if (user) {
        createLog("Заблокировал пользователя", { userId: user.id, username: user.username });
    }

    return user;
}

export function unblockUser(userId) {
    const currentUser = getUserById(userId);

    if (!currentUser) {
        return null;
    }

    const user = updateUser(userId, {
        status: "active",
        subscription: {
            ...currentUser.subscription,
            status: "active",
        },
    });

    if (user) {
        createLog("Разблокировал пользователя", { userId: user.id, username: user.username });
    }

    return user;
}

export function deleteUser(userId) {
    const users = loadUsers();
    const user = users.find((item) => Number(item.id) === Number(userId));

    if (!user || user.role === ROLES.superAdmin) {
        return false;
    }

    saveUsers(users.filter((item) => Number(item.id) !== Number(userId)));
    createLog("Удалил пользователя", { userId: user.id, username: user.username });
    return true;
}

export function initSuperAdmin() {
    const users = loadUsers();
    const superAdminExists = users.some((user) => user.username.toLowerCase() === SUPER_ADMIN_USERNAME);

    if (superAdminExists) {
        saveUsers(users);
        return getUserByUsername(SUPER_ADMIN_USERNAME);
    }

    const superAdmin = normalizeUser({
        id: getNextUserId(users),
        username: SUPER_ADMIN_USERNAME,
        email: "creator@posposter.local",
        password: SUPER_ADMIN_PASSWORD,
        role: ROLES.superAdmin,
        status: "active",
        subscription: createLifetimeSubscription(),
        createdAt: new Date().toISOString(),
        lastLogin: "",
    });

    users.push(superAdmin);
    saveUsers(users);
    createLog("Создал Super Admin", { username: SUPER_ADMIN_USERNAME });
    return superAdmin;
}
