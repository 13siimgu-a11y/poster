import { createDefaultPlans } from "./plans.js";
import { loadEmployees } from "./employees.js";
import { canAccessAdmin } from "./roles.js";
import { storage, STORAGE_KEYS } from "./storage.js";
import { checkSubscription } from "./subscriptions.js";
import {
    createUser,
    getUserById,
    initSuperAdmin,
    loadUsers,
    saveUsers,
    setLastLogin,
} from "./users.js";

let notify = (message) => window.alert(message);

export function setNotificationHandler(handler) {
    if (typeof handler === "function") {
        notify = handler;
    }
}

export function initializeAuthSystem() {
    createDefaultPlans();
    initSuperAdmin();
}

export { loadUsers };

export function saveUser(user) {
    return createUser(user);
}

export function checkUser() {
    const rawUser = localStorage.getItem(STORAGE_KEYS.currentUser);

    if (!rawUser) {
        return null;
    }

    try {
        const storedUser = JSON.parse(rawUser);
        if (storedUser.accountType === "employee") {
            const employee = loadEmployees().find((item) => Number(item.id) === Number(storedUser.employeeId || storedUser.id));
            if (!employee || employee.status === "blocked" || employee.status === "fired") {
                localStorage.removeItem(STORAGE_KEYS.currentUser);
                return null;
            }

            const refreshedSession = buildEmployeeSession(employee);
            storage.set(STORAGE_KEYS.currentUser, refreshedSession);
            return refreshedSession;
        }

        const latestUser = getUserById(storedUser.id) || storedUser;
        const checkedUser = checkSubscription(latestUser);
        storage.set(STORAGE_KEYS.currentUser, checkedUser);
        return checkedUser;
    } catch {
        localStorage.removeItem(STORAGE_KEYS.currentUser);
        return null;
    }
}

export function register(formData) {
    initializeAuthSystem();
    const users = loadUsers();
    const username = formData.get("username").trim();
    const email = formData.get("email").trim().toLowerCase();
    const password = formData.get("password");
    const repeatPassword = formData.get("repeatPassword");

    if (!username || !email || !password || !repeatPassword) {
        notify("Заполните все поля", "error");
        return null;
    }

    if (password.length < 6) {
        notify("Пароль должен содержать минимум 6 символов", "error");
        return null;
    }

    if (password !== repeatPassword) {
        notify("Пароли не совпадают", "error");
        return null;
    }

    const isDuplicate = users.some((user) => (
        user.username.toLowerCase() === username.toLowerCase() || user.email === email
    ));

    if (isDuplicate) {
        notify("Пользователь с таким Username или Email уже существует", "error");
        return null;
    }

    const user = createUser({
        username,
        email,
        password,
    });

    notify("Регистрация успешно завершена", "success");
    return user;
}

export function login(formData) {
    initializeAuthSystem();
    const username = formData.get("username").trim();
    const password = formData.get("password");
    const users = loadUsers();
    const user = users.find((item) => (
        item.username.toLowerCase() === username.toLowerCase() && item.password === password
    ));

    if (!user) {
        const employeeSession = loginEmployee(username, password);
        if (employeeSession) {
            return employeeSession;
        }

        notify("Неверный Username или Password", "error");
        return null;
    }

    if (user.status === "blocked") {
        notify("Ваш аккаунт заблокирован. Обратитесь к администратору.", "error");
        return null;
    }

    const checkedUser = checkSubscription(user);

    if (!canAccessAdmin(checkedUser) && checkedUser.subscription?.status === "expired") {
        notify("Ваш пробный период закончился. Приобретите подписку.", "error");
        return null;
    }

    const updatedUser = setLastLogin(checkedUser.id);
    storage.set(STORAGE_KEYS.currentUser, updatedUser);
    notify(`Добро пожаловать, ${updatedUser.username}`, "success");
    return updatedUser;
}

function loginEmployee(username, password) {
    const employee = loadEmployees().find((item) => (
        item.username?.toLowerCase() === username.toLowerCase()
        && item.password === password
    ));

    if (!employee) {
        return null;
    }

    if (employee.status === "blocked" || employee.status === "fired") {
        notify("Доступ сотрудника заблокирован. Обратитесь к администратору.", "error");
        return null;
    }

    const session = buildEmployeeSession(employee);

    storage.set(STORAGE_KEYS.currentUser, session);
    notify(`Добро пожаловать, ${session.firstName || session.username}`, "success");
    return session;
}

function buildEmployeeSession(employee) {
    return {
        id: employee.id,
        employeeId: employee.id,
        companyId: employee.companyId,
        username: employee.username || employee.firstName || `employee-${employee.id}`,
        firstName: employee.firstName || "",
        email: "",
        role: employee.role || "waiter",
        status: employee.status || "working",
        permissions: employee.permissions || [],
        accountType: "employee",
        createdAt: employee.createdAt,
        lastLogin: new Date().toISOString(),
    };
}

export function logout() {
    storage.remove(STORAGE_KEYS.currentUser);
    notify("Вы вышли из аккаунта", "success");
}

export function persistCurrentUser(user) {
    storage.set(STORAGE_KEYS.currentUser, user);
}

export function replaceUsers(users) {
    return saveUsers(users);
}
