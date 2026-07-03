import { updateEmployee } from "./employees.js";

export const PAYROLL_TYPES = ["hourly", "shift", "fixed", "percent", "combined"];

export function updatePayroll(employeeId, payroll) {
    return updateEmployee(employeeId, {
        payroll: {
            type: payroll.type || "hourly",
            rate: Number(payroll.rate || 0),
            fixed: Number(payroll.fixed || 0),
            percent: Number(payroll.percent || 0),
        },
    });
}
