import { createLog } from "./logs.js";
import { idsEqual, mirrorCreate, mirrorUpdate } from "./apiPersistence.js";
import { updateTable } from "./tables.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export function loadReservations(companyId = null) {
    const reservations = storage.get(STORAGE_KEYS.reservations, []);
    return companyId ? reservations.filter((item) => idsEqual(item.companyId, companyId)) : reservations;
}

export function createReservation(companyId, tableId, data) {
    const reservations = storage.get(STORAGE_KEYS.reservations, []);
    const reservation = {
        id: reservations.length ? Math.max(...reservations.map((item) => Number(item.id))) + 1 : 1,
        companyId,
        tableId,
        clientName: data.clientName,
        phone: data.phone,
        date: data.date,
        time: data.time,
        guests: Number(data.guests || 1),
        comment: data.comment || "",
        prepayment: Number(data.prepayment || 0),
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.reservations, [...reservations, reservation]);
    mirrorCreate("reservations", companyId, reservation);
    updateTable(tableId, { status: "reserved", reservationId: reservation.id });
    createLog("Создал бронь", { companyId, tableId, client: reservation.clientName });
    return reservation;
}

export function updateReservation(reservationId, data) {
    const reservations = storage.get(STORAGE_KEYS.reservations, []);
    const index = reservations.findIndex((item) => Number(item.id) === Number(reservationId));

    if (index === -1) {
        return null;
    }

    reservations[index] = {
        ...reservations[index],
        ...data,
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.reservations, reservations);
    mirrorUpdate("reservations", reservations[index].companyId, reservations[index]);
    return reservations[index];
}

export function cancelReservation(reservationId) {
    const reservation = updateReservation(reservationId, { status: "cancelled" });

    if (reservation) {
        updateTable(reservation.tableId, { status: "free", reservationId: null });
    }

    return reservation;
}
