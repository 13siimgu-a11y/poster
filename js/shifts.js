import { addStaffHistory } from "./employees.js";
import { idsEqual, mirrorCreate, mirrorUpdate } from "./apiPersistence.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export function loadShifts(companyId = null) {
    const shifts = storage.get(STORAGE_KEYS.staffShifts, []);
    return companyId ? shifts.filter((shift) => idsEqual(shift.companyId, companyId)) : shifts;
}

export function createShift(companyId, data) {
    const shifts = storage.get(STORAGE_KEYS.staffShifts, []);
    const shift = {
        id: shifts.length ? Math.max(...shifts.map((item) => Number(item.id))) + 1 : 1,
        companyId,
        employeeId: data.employeeId,
        positionId: data.positionId || 0,
        date: data.date || new Date().toISOString().slice(0, 10),
        plannedStart: data.plannedStart || "",
        plannedEnd: data.plannedEnd || "",
        startTime: data.startTime || "",
        endTime: data.endTime || "",
        workedMinutes: 0,
        status: data.status || "planned",
        ordersServed: Number(data.ordersServed || 0),
        salesAmount: Number(data.salesAmount || 0),
        comment: data.comment || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    storage.set(STORAGE_KEYS.staffShifts, [shift, ...shifts]);
    mirrorCreate("shifts", companyId, shift);
    return shift;
}

export function openShift(companyId, pinCode, employees) {
    const employee = employees.find((item) => item.pinCode === pinCode && item.status === "working");
    if (!employee) return null;
    const shift = createShift(companyId, {
        employeeId: employee.id,
        positionId: employee.positionId,
        startTime: new Date().toISOString(),
        status: "opened",
    });
    addStaffHistory(companyId, employee.id, "Открыта смена", { shiftId: shift.id });
    return shift;
}

export function closeShift(shiftId, data = {}) {
    const shifts = storage.get(STORAGE_KEYS.staffShifts, []);
    const index = shifts.findIndex((shift) => Number(shift.id) === Number(shiftId));
    if (index === -1) return null;
    const endTime = data.endTime || new Date().toISOString();
    const workedMinutes = calculateWorkedTime(shifts[index].startTime, endTime);
    shifts[index] = {
        ...shifts[index],
        ...data,
        endTime,
        workedMinutes,
        status: "closed",
        updatedAt: new Date().toISOString(),
    };
    storage.set(STORAGE_KEYS.staffShifts, shifts);
    mirrorUpdate("shifts", shifts[index].companyId, shifts[index]);
    addStaffHistory(shifts[index].companyId, shifts[index].employeeId, "Закрыта смена", { shiftId });
    return shifts[index];
}

export function calculateWorkedTime(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    return Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000));
}
