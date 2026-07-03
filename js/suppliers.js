import { createLog } from "./logs.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export function loadSuppliers(companyId = null) {
    const suppliers = storage.get(STORAGE_KEYS.suppliers, []);
    return companyId ? suppliers.filter((supplier) => Number(supplier.companyId) === Number(companyId)) : suppliers;
}

export function createSupplier(companyId, data) {
    const suppliers = storage.get(STORAGE_KEYS.suppliers, []);
    const now = new Date().toISOString();
    const supplier = {
        id: suppliers.length ? Math.max(...suppliers.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        name: data.name.trim(),
        contactPerson: data.contactPerson || "",
        phone: data.phone || "",
        email: data.email || "",
        website: data.website || "",
        address: data.address || "",
        taxNumber: data.taxNumber || "",
        currency: data.currency || "USD",
        active: data.active !== false,
        archived: false,
        notes: data.notes || "",
        createdAt: now,
        updatedAt: now,
    };

    storage.set(STORAGE_KEYS.suppliers, [...suppliers, supplier]);
    createLog("Создал поставщика", { companyId, supplier: supplier.name });
    return supplier;
}

export function updateSupplier(supplierId, data) {
    const suppliers = storage.get(STORAGE_KEYS.suppliers, []);
    const index = suppliers.findIndex((supplier) => Number(supplier.id) === Number(supplierId));

    if (index === -1) return null;

    suppliers[index] = {
        ...suppliers[index],
        ...data,
        name: data.name?.trim() || suppliers[index].name,
        updatedAt: new Date().toISOString(),
    };
    storage.set(STORAGE_KEYS.suppliers, suppliers);
    return suppliers[index];
}

export function deleteSupplier(supplierId) {
    const suppliers = storage.get(STORAGE_KEYS.suppliers, []);
    storage.set(STORAGE_KEYS.suppliers, suppliers.filter((supplier) => Number(supplier.id) !== Number(supplierId)));
}

export function archiveSupplier(supplierId) {
    return updateSupplier(supplierId, { archived: true, active: false });
}
