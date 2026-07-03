import { api } from "./apiClient.js";
import { storage, STORAGE_KEYS } from "./storage.js";

const RESOURCES = {
    categories: { key: STORAGE_KEYS.categories, path: "categories" },
    products: { key: STORAGE_KEYS.products, path: "products", refs: { categoryId: STORAGE_KEYS.categories } },
    halls: { key: STORAGE_KEYS.halls, path: "halls" },
    cashRegisters: { key: STORAGE_KEYS.cashRegisters, path: "cash-registers" },
    tables: {
        key: STORAGE_KEYS.tables,
        path: "tables",
        refs: { hallId: STORAGE_KEYS.halls, activeOrderId: STORAGE_KEYS.tableOrders, reservationId: STORAGE_KEYS.reservations },
    },
    reservations: {
        key: STORAGE_KEYS.reservations,
        path: "reservations",
        refs: { tableId: STORAGE_KEYS.tables, customerId: STORAGE_KEYS.customers },
    },
    tableOrders: {
        key: STORAGE_KEYS.tableOrders,
        path: "table-orders",
        refs: { hallId: STORAGE_KEYS.halls, tableId: STORAGE_KEYS.tables, customerId: STORAGE_KEYS.customers },
        itemRefs: { productId: STORAGE_KEYS.products },
    },
    receipts: {
        key: STORAGE_KEYS.receipts,
        path: "receipts",
        refs: { registerId: STORAGE_KEYS.cashRegisters, customerId: STORAGE_KEYS.customers },
        itemRefs: { productId: STORAGE_KEYS.products },
    },
    ingredients: { key: STORAGE_KEYS.ingredients, path: "ingredients" },
    stockMovements: { key: STORAGE_KEYS.stockMovements, path: "stock-movements", refs: { ingredientId: STORAGE_KEYS.ingredients } },
    positions: { key: STORAGE_KEYS.positions, path: "positions" },
    employees: { key: STORAGE_KEYS.employees, path: "employees", refs: { positionId: STORAGE_KEYS.positions } },
    shifts: { key: STORAGE_KEYS.staffShifts, path: "shifts", refs: { employeeId: STORAGE_KEYS.employees, positionId: STORAGE_KEYS.positions } },
    customers: { key: STORAGE_KEYS.customers, path: "customers" },
};

const SYNC_ORDER = ["categories", "products", "halls", "cashRegisters", "customers", "tables", "reservations", "tableOrders", "receipts", "ingredients", "stockMovements", "positions", "employees", "shifts"];

export function idsEqual(left, right) {
    if (left === null || left === undefined || right === null || right === undefined) {
        return false;
    }
    return String(left) === String(right);
}

export async function syncCoreData(companyId) {
    if (!companyId) {
        return;
    }

    for (const resourceName of SYNC_ORDER) {
        await syncResource(companyId, resourceName).catch(() => null);
    }
}

export function mirrorCreate(resourceName, companyId, localRecord) {
    const config = RESOURCES[resourceName];
    if (!config || !companyId || localRecord?._apiId) {
        return;
    }

    api.post(apiPath(companyId, config.path), toApiPayload(resourceName, localRecord))
        .then((remoteRecord) => {
            patchLocalApiId(config.key, localRecord.id, remoteRecord.id);
            if (resourceName === "tableOrders" && localRecord.tableId) {
                updateTableActiveOrder(companyId, localRecord.tableId, remoteRecord.id);
            }
        })
        .catch(() => null);
}

export function mirrorUpdate(resourceName, companyId, localRecord) {
    const config = RESOURCES[resourceName];
    const apiId = localRecord?._apiId;
    if (!config || !companyId || !apiId) {
        return;
    }

    api.patch(`${apiPath(companyId, config.path)}/${apiId}`, toApiPayload(resourceName, localRecord))
        .catch(() => null);
}

export function mirrorDelete(resourceName, companyId, localRecord) {
    const config = RESOURCES[resourceName];
    const apiId = localRecord?._apiId;
    if (!config || !companyId || !apiId) {
        return;
    }

    api.delete(`${apiPath(companyId, config.path)}/${apiId}`).catch(() => null);
}

export function getApiIdForLocal(storageKey, localId) {
    return getApiId(storageKey, localId);
}

async function syncResource(companyId, resourceName) {
    const config = RESOURCES[resourceName];
    const remoteRecords = await api.get(apiPath(companyId, config.path));
    const existingRecords = storage.get(config.key, []);
    let nextId = nextLocalId(existingRecords);
    const localRecords = Array.isArray(remoteRecords)
        ? remoteRecords.map((record) => {
            const existing = existingRecords.find((item) => item._apiId && idsEqual(item._apiId, record.id));
            const localId = existing?.id || nextId++;
            return toLocalRecord(companyId, resourceName, record, localId);
        })
        : [];
    mergeCompanyCache(config.key, companyId, localRecords);
}

function toLocalRecord(companyId, resourceName, record, localId) {
    const config = RESOURCES[resourceName];
    const localRecord = {
        ...record,
        id: localId,
        _apiId: record.id,
        companyId,
    };

    Object.entries(config.refs || {}).forEach(([field, storageKey]) => {
        if (record[field]) {
            localRecord[field] = getLocalId(storageKey, record[field]);
        }
    });

    if (Array.isArray(record.items)) {
        localRecord.items = record.items.map((item, index) => {
            const localItem = { ...item, id: index + 1, _apiId: item.id };
            Object.entries(config.itemRefs || {}).forEach(([field, storageKey]) => {
                if (item[field]) {
                    localItem[field] = getLocalId(storageKey, item[field]);
                }
            });
            return localItem;
        });
    }

    return localRecord;
}

function toApiPayload(resourceName, localRecord) {
    const config = RESOURCES[resourceName];
    const hadApiId = Boolean(localRecord._apiId);
    const payload = { ...localRecord };
    delete payload.id;
    delete payload._apiId;
    delete payload.companyId;
    delete payload.createdAt;
    delete payload.updatedAt;

    Object.entries(config.refs || {}).forEach(([field, storageKey]) => {
        if (payload[field]) {
            payload[field] = getApiId(storageKey, payload[field]);
        }
        if (!payload[field]) {
            delete payload[field];
        }
    });

    if (Array.isArray(payload.items)) {
        payload.items = payload.items.map((item) => {
            const apiItem = { ...item };
            delete apiItem.id;
            delete apiItem._apiId;
            Object.entries(config.itemRefs || {}).forEach(([field, storageKey]) => {
                if (apiItem[field]) {
                    apiItem[field] = getApiId(storageKey, apiItem[field]);
                }
                if (!apiItem[field]) {
                    delete apiItem[field];
                }
            });
            return apiItem;
        });
    }

    if (resourceName === "products") {
        delete payload.gallery;
        delete payload.variants;
        delete payload.modifiers;
        delete payload.ingredients;
        delete payload.featured;
        delete payload.weight;
        delete payload.volume;
        delete payload.portions;
    }

    if (resourceName === "categories") {
        delete payload.image;
    }

    if (resourceName === "halls") {
        delete payload.description;
        delete payload.image;
    }

    if (resourceName === "tables") {
        delete payload.deposit;
        delete payload.color;
    }

    if (resourceName === "reservations" && payload.date && payload.date.length === 10) {
        payload.date = `${payload.date}T00:00:00.000Z`;
    }

    if (resourceName === "ingredients") {
        delete payload.barcode;
        delete payload.description;
        delete payload.active;
    }

    if (resourceName === "employees") {
        delete payload.employeeNumber;
        delete payload.birthDate;
        delete payload.gender;
        delete payload.address;
        if (hadApiId || !payload.password) {
            delete payload.password;
        }
        if (!payload.positionId || !looksLikeApiId(payload.positionId)) {
            delete payload.positionId;
        }
        if (!payload.hireDate) {
            delete payload.hireDate;
        } else if (payload.hireDate.length === 10) {
            payload.hireDate = `${payload.hireDate}T00:00:00.000Z`;
        }
    }

    if (resourceName === "receipts") {
        delete payload.qrCode;
        delete payload.cashierId;
    }

    if (resourceName === "shifts") {
        ["employeeId", "positionId"].forEach((field) => {
            if (!payload[field]) {
                delete payload[field];
            }
        });
        ["plannedStart", "plannedEnd", "startTime", "endTime"].forEach((field) => {
            if (!payload[field]) {
                delete payload[field];
            }
        });
        if (payload.date && payload.date.length === 10) {
            payload.date = `${payload.date}T00:00:00.000Z`;
        }
    }

    return payload;
}

function getLocalId(storageKey, apiId) {
    const records = storage.get(storageKey, []);
    const existing = records.find((item) => item._apiId && idsEqual(item._apiId, apiId));
    if (existing) {
        return existing.id;
    }
    return nextLocalId(records);
}

function getApiId(storageKey, localId) {
    const record = storage.get(storageKey, []).find((item) => idsEqual(item.id, localId));
    return record?._apiId || localId;
}

function nextLocalId(records) {
    const numericIds = records.map((item) => Number(item.id)).filter(Number.isFinite);
    return numericIds.length ? Math.max(...numericIds) + 1 : 1;
}

function mergeCompanyCache(storageKey, companyId, localRecords) {
    const records = storage.get(storageKey, []);
    const otherCompanyRecords = records.filter((record) => !idsEqual(record.companyId, companyId));
    const unsyncedCompanyRecords = records.filter((record) => idsEqual(record.companyId, companyId) && !record._apiId);
    storage.set(storageKey, [...otherCompanyRecords, ...localRecords, ...unsyncedCompanyRecords]);
}

function patchLocalApiId(storageKey, localId, apiId) {
    const records = storage.get(storageKey, []);
    storage.set(storageKey, records.map((record) => (
        idsEqual(record.id, localId) ? { ...record, _apiId: apiId } : record
    )));
}

function apiPath(companyId, resourcePath) {
    return `/companies/${companyId}/${resourcePath}`;
}

function looksLikeApiId(value) {
    return typeof value === "string" && !/^\d+$/.test(value);
}

function updateTableActiveOrder(companyId, localTableId, apiOrderId) {
    const table = storage.get(STORAGE_KEYS.tables, []).find((item) => idsEqual(item.id, localTableId));
    if (!table?._apiId) {
        return;
    }
    api.patch(`${apiPath(companyId, "tables")}/${table._apiId}`, { activeOrderId: apiOrderId }).catch(() => null);
}
