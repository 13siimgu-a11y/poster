import { createLog } from "./logs.js";
import { ROLE_PERMISSIONS } from "./permissions.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const EMPLOYEE_STATUSES = ["working", "vacation", "sick", "fired", "blocked"];

export function loadEmployees(companyId = null) {
    const employees = storage.get(STORAGE_KEYS.employees, []);
    return companyId ? employees.filter((employee) => Number(employee.companyId) === Number(companyId)) : employees;
}

export function generatePin() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

export function createEmployee(companyId, data) {
    const employees = storage.get(STORAGE_KEYS.employees, []);
    const role = data.role || "waiter";
    const employee = {
        id: employees.length ? Math.max(...employees.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        firstName: data.firstName?.trim() || "",
        lastName: data.lastName?.trim() || "",
        middleName: data.middleName || "",
        birthDate: data.birthDate || "",
        gender: data.gender || "",
        phone: data.phone || "",
        email: data.email || "",
        address: data.address || "",
        positionId: Number(data.positionId || 0),
        role,
        status: data.status || "working",
        employeeNumber: data.employeeNumber || `EMP-${String(employees.length + 1).padStart(4, "0")}`,
        pinCode: data.pinCode || generatePin(),
        username: data.username || "",
        password: data.password || "",
        hireDate: data.hireDate || new Date().toISOString().slice(0, 10),
        avatar: data.avatar || "",
        permissions: data.permissions || ROLE_PERMISSIONS[role] || [],
        payroll: data.payroll || { type: "hourly", rate: 0, fixed: 0, percent: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.employees, [...employees, employee]);
    addStaffHistory(companyId, employee.id, "Создан сотрудник");
    createLog("Создал сотрудника", { companyId, employee: `${employee.firstName} ${employee.lastName}` });
    return employee;
}

export function updateEmployee(employeeId, data) {
    const employees = storage.get(STORAGE_KEYS.employees, []);
    const index = employees.findIndex((employee) => Number(employee.id) === Number(employeeId));
    if (index === -1) return null;

    employees[index] = {
        ...employees[index],
        ...data,
        firstName: data.firstName?.trim() || employees[index].firstName,
        lastName: data.lastName?.trim() || employees[index].lastName,
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.employees, employees);
    addStaffHistory(employees[index].companyId, employees[index].id, "Изменен сотрудник");
    return employees[index];
}

export function deleteEmployee(employeeId) {
    const employees = storage.get(STORAGE_KEYS.employees, []);
    const employee = employees.find((item) => Number(item.id) === Number(employeeId));
    if (!employee) return false;
    storage.set(STORAGE_KEYS.employees, employees.filter((item) => Number(item.id) !== Number(employeeId)));
    addStaffHistory(employee.companyId, employee.id, "Удален сотрудник");
    return true;
}

export function addStaffHistory(companyId, employeeId, action, details = {}) {
    const history = storage.get(STORAGE_KEYS.staffHistory, []);
    const entry = {
        id: history.length ? Math.max(...history.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        employeeId: Number(employeeId),
        action,
        details,
        createdAt: new Date().toISOString(),
    };
    storage.set(STORAGE_KEYS.staffHistory, [entry, ...history]);
    return entry;
}

export function loadStaffHistory(companyId, employeeId = null) {
    return storage.get(STORAGE_KEYS.staffHistory, []).filter((entry) => (
        Number(entry.companyId) === Number(companyId)
        && (!employeeId || Number(entry.employeeId) === Number(employeeId))
    ));
}
