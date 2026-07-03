import { loadEmployees } from "./employees.js";
import { loadShifts } from "./shifts.js";

export function loadStaffDashboard(companyId) {
    const employees = loadEmployees(companyId);
    const shifts = loadShifts(companyId);
    const today = new Date().toISOString().slice(0, 10);
    const todayShifts = shifts.filter((shift) => shift.date === today);
    const opened = shifts.filter((shift) => shift.status === "opened");
    const closed = shifts.filter((shift) => shift.status === "closed" && shift.workedMinutes > 0);

    return {
        totalEmployees: employees.length,
        todayWorking: todayShifts.length,
        currentlyOnShift: opened.length,
        absent: employees.filter((employee) => ["vacation", "sick"].includes(employee.status)).length,
        newEmployees: employees.filter((employee) => Date.now() - new Date(employee.createdAt).getTime() < 30 * 86400000).length,
        averageShiftMinutes: closed.length
            ? Math.round(closed.reduce((sum, shift) => sum + Number(shift.workedMinutes || 0), 0) / closed.length)
            : 0,
    };
}
