import { loadShifts } from "./shifts.js";

export function calculateWorkedTime(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    return Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000));
}

export function getEmployeeTimeSummary(companyId, employeeId) {
    const shifts = loadShifts(companyId).filter((shift) => Number(shift.employeeId) === Number(employeeId));
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);
    return {
        dayMinutes: shifts.filter((shift) => shift.date === today).reduce((sum, shift) => sum + Number(shift.workedMinutes || 0), 0),
        monthMinutes: shifts.filter((shift) => shift.date?.startsWith(month)).reduce((sum, shift) => sum + Number(shift.workedMinutes || 0), 0),
        shifts: shifts.length,
        late: 0,
        overtime: 0,
    };
}
