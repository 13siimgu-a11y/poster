import { createShift } from "./shifts.js";

export function assignSchedule(companyId, scheduleItems) {
    return scheduleItems.map((item) => createShift(companyId, {
        employeeId: item.employeeId,
        positionId: item.positionId,
        date: item.date,
        plannedStart: item.plannedStart,
        plannedEnd: item.plannedEnd,
        status: "planned",
        comment: item.comment || "",
    }));
}
