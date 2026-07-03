import { createLog } from "./logs.js";
import { idsEqual, mirrorCreate, mirrorDelete, mirrorUpdate } from "./apiPersistence.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export function loadFloor(companyId = null) {
    const halls = storage.get(STORAGE_KEYS.halls, []);
    return companyId ? halls.filter((hall) => idsEqual(hall.companyId, companyId)) : halls;
}

export function saveFloor(halls) {
    return storage.set(STORAGE_KEYS.halls, halls);
}

export function ensureDefaultHall(companyId) {
    const halls = loadFloor(companyId);

    if (halls.length) {
        return halls[0];
    }

    return createHall(companyId, {
        name: "Основной зал",
        description: "Главный зал заведения",
        active: true,
    });
}

export function createHall(companyId, data) {
    const halls = storage.get(STORAGE_KEYS.halls, []);
    const now = new Date().toISOString();
    const hall = {
        id: halls.length ? Math.max(...halls.map((item) => Number(item.id))) + 1 : 1,
        companyId,
        name: data.name.trim(),
        description: data.description?.trim() || "",
        image: data.image || "",
        active: data.active !== false,
        sortOrder: loadFloor(companyId).length + 1,
        objects: data.objects || [],
        archived: false,
        createdAt: now,
        updatedAt: now,
    };

    saveFloor([...halls, hall]);
    mirrorCreate("halls", companyId, hall);
    createLog("Создал зал", { companyId, hall: hall.name });
    return hall;
}

export function updateHall(hallId, data) {
    const halls = storage.get(STORAGE_KEYS.halls, []);
    const hallIndex = halls.findIndex((hall) => Number(hall.id) === Number(hallId));

    if (hallIndex === -1) {
        return null;
    }

    halls[hallIndex] = {
        ...halls[hallIndex],
        ...data,
        name: data.name?.trim() || halls[hallIndex].name,
        description: data.description?.trim() ?? halls[hallIndex].description,
        updatedAt: new Date().toISOString(),
    };

    saveFloor(halls);
    mirrorUpdate("halls", halls[hallIndex].companyId, halls[hallIndex]);
    createLog("Изменил зал", { companyId: halls[hallIndex].companyId, hall: halls[hallIndex].name });
    return halls[hallIndex];
}

export function deleteHall(hallId) {
    const halls = storage.get(STORAGE_KEYS.halls, []);
    const hall = halls.find((item) => Number(item.id) === Number(hallId));

    if (!hall) {
        return false;
    }

    saveFloor(halls.filter((item) => Number(item.id) !== Number(hallId)));
    mirrorDelete("halls", hall.companyId, hall);
    createLog("Удалил зал", { companyId: hall.companyId, hall: hall.name });
    return true;
}

export function archiveHall(hallId) {
    return updateHall(hallId, {
        archived: true,
        active: false,
    });
}
