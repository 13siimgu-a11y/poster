import { createCategory, loadCategories, updateCategory } from "./categories.js";
import { api } from "./apiClient.js";
import { getApiIdForLocal, syncCoreData } from "./apiPersistence.js";
import { addProductToReceipt, createReceipt, loadCashRegisters, loadReceipts } from "./pos.js";
import { createProduct, loadProducts, updateProduct } from "./products.js";
import { createEmployee, loadEmployees } from "./employees.js";
import { checkLowStock, createIngredient, loadIngredients, updateIngredient } from "./inventory.js";
import { createHall, loadFloor } from "./floor.js";
import { createTable, loadTables, updateTable } from "./tables.js";
import { createOrder } from "./orders.js";
import { updateEmployee } from "./employees.js";
import { STORAGE_KEYS } from "./storage.js";

const CRITICAL_ACTIONS = ["delete", "price:update", "tax:update", "role:update", "company:delete", "shift:close"];

export async function executeAction(action, context) {
    if (!action) return null;

    if (CRITICAL_ACTIONS.includes(action.type)) {
        return confirmAction(action, context);
    }

    if (action.type === "category:create") {
        return createCategoryWithApi(context, action.payload);
    }

    if (action.type === "category:update") {
        return updateCategoryWithApi(context, action.payload);
    }

    if (action.type === "product:create") {
        return createProductWithApi(context, action.payload);
    }

    if (action.type === "product:update") {
        return updateProductWithApi(context, action.payload.productId, action.payload.patch);
    }

    if (action.type === "bulk:execute") {
        return executeBulkAction(context, action.payload);
    }

    if (action.type === "receipt:add-product") {
        return addProductToReceiptWithApi(context, action.payload);
    }

    if (action.type === "menu:template:create") {
        return createMenuTemplateWithApi(context, action.payload);
    }

    if (action.type === "menu:cocktails:create") {
        const products = [
            { name: "Мохито", price: 12, description: "Ром, мята, лайм, содовая" },
            { name: "Маргарита", price: 14, description: "Текила, лайм, апельсиновый ликер" },
            { name: "Апероль Шприц", price: 13, description: "Апероль, просекко, содовая" },
            { name: "Негрони", price: 15, description: "Джин, кампари, красный вермут" },
            { name: "Виски Сауэр", price: 14, description: "Виски, лимон, сахарный сироп" },
        ];

        return createMenuTemplateWithApi(context, {
            categoryName: "Коктейли",
            category: { description: "Коктейли для бара", color: "#8B5CF6", icon: "🍸" },
            products: products.map((product) => ({ ...product, unit: "стакан", popular: true, tags: ["Популярное"] })),
        });
    }

    if (action.type === "employee:create") {
        return createEmployeeWithApi(context, action.payload);
    }

    if (action.type === "employee:update") {
        return updateEmployeeWithApi(context, action.payload);
    }

    if (action.type === "ingredient:create") {
        return createIngredientWithApi(context, action.payload);
    }

    if (action.type === "ingredient:update") {
        return updateIngredientWithApi(context, action.payload);
    }

    if (action.type === "table:create") {
        return createTableWithApi(context, action.payload);
    }

    if (action.type === "table:update") {
        return updateTableWithApi(context, action.payload);
    }

    if (action.type === "order:create") {
        return createOrderWithApi(context, action.payload);
    }

    if (action.type === "inventory:analyze") {
        return checkLowStock(context.companyId);
    }

    return null;
}

export function confirmAction(action, context) {
    const confirmed = window.confirm(action.confirmText || "Подтвердить действие AI?");
    if (!confirmed) {
        return cancelAction(action);
    }

    if (action.type === "price:update") {
        return Promise.all(action.payload.products.map((product) => updateProductWithApi(context, product.id, { price: product.nextPrice })));
    }

    return executeAction({ ...action, type: action.safeType }, context);
}

async function createCategoryWithApi(context, payload) {
    const localPayload = normalizeCategoryPayload(payload);
    try {
        const category = await api.post(`/companies/${context.companyId}/categories`, localPayload);
        await syncCoreData(context.companyId);
        return category;
    } catch {
        return createCategory(context.companyId, localPayload);
    }
}

async function createProductWithApi(context, payload) {
    const category = await ensureCategoryWithApi(context, payload.categoryName || "Блюда");
    const productPayload = normalizeProductPayload(context, {
        ...payload,
        categoryId: category.apiId || category.id,
    });

    try {
        const product = await api.post(`/companies/${context.companyId}/products`, productPayload);
        await syncCoreData(context.companyId);
        return product;
    } catch {
        return createProduct(context.companyId, {
            ...productPayload,
            categoryId: category.localId || category.id,
        });
    }
}

async function updateCategoryWithApi(context, payload = {}) {
    const category = findByName(loadCategories(context.companyId), payload.name || payload.categoryName);
    if (!category) return { error: `Категория «${payload.name || payload.categoryName}» не найдена.` };

    const patch = {
        name: payload.nextName || payload.newName || payload.patch?.name || category.name,
        description: payload.description ?? payload.patch?.description ?? category.description,
        color: payload.color ?? payload.patch?.color ?? category.color,
        icon: payload.icon ?? payload.patch?.icon ?? category.icon,
        active: payload.active ?? payload.patch?.active ?? category.active,
    };

    try {
        const apiCategoryId = getApiIdForLocal(STORAGE_KEYS.categories, category.id);
        const updated = await api.patch(`/companies/${context.companyId}/categories/${apiCategoryId}`, patch);
        await syncCoreData(context.companyId);
        return updated;
    } catch {
        return updateCategory(category.id, patch);
    }
}

async function updateProductWithApi(context, productId, patch) {
    const product = loadProducts(context.companyId).find((item) => String(item.id) === String(productId));
    if (!product) return null;

    try {
        const apiProductId = getApiIdForLocal(STORAGE_KEYS.products, product.id);
        const updated = await api.patch(`/companies/${context.companyId}/products/${apiProductId}`, normalizeProductPatch(patch));
        await syncCoreData(context.companyId);
        return updated;
    } catch {
        return updateProduct(product.id, patch);
    }
}

async function createMenuTemplateWithApi(context, payload = {}) {
    const categoryNames = payload.categories || [payload.categoryName || "Кофе"];
    const products = payload.products || [];
    const created = [];

    for (const categoryName of categoryNames) {
        const category = await ensureCategoryWithApi(context, categoryName, payload.category);
        created.push(category);
    }

    const defaultCategoryName = payload.categoryName || categoryNames[0] || "Блюда";
    for (const product of products) {
        created.push(await createProductWithApi(context, {
            ...product,
            categoryName: product.categoryName || defaultCategoryName,
        }));
    }

    await syncCoreData(context.companyId);
    return created;
}

async function createEmployeeWithApi(context, payload) {
    const employeePayload = {
        firstName: payload.firstName || payload.name || "Сотрудник",
        lastName: payload.lastName || "",
        phone: payload.phone || "",
        email: payload.email || "",
        role: payload.role || "waiter",
        status: payload.status || "working",
        pinCode: payload.pinCode || String(Math.floor(1000 + Math.random() * 9000)),
        permissions: payload.permissions || [],
        payroll: payload.payroll || { type: "hourly", rate: 0, fixed: 0, percent: 0 },
    };

    try {
        const employee = await api.post(`/companies/${context.companyId}/employees`, employeePayload);
        await syncCoreData(context.companyId);
        return employee;
    } catch {
        return createEmployee(context.companyId, employeePayload);
    }
}

async function updateEmployeeWithApi(context, payload = {}) {
    const employees = loadEmployees(context.companyId);
    const employee = findByName(employees, payload.name || payload.firstName, (item) => `${item.firstName || ""} ${item.lastName || ""}`.trim());
    if (!employee) return { error: `Сотрудник «${payload.name || payload.firstName}» не найден.` };

    const patch = {
        firstName: payload.firstName ?? payload.patch?.firstName ?? employee.firstName,
        lastName: payload.lastName ?? payload.patch?.lastName ?? employee.lastName,
        phone: payload.phone ?? payload.patch?.phone ?? employee.phone,
        email: payload.email ?? payload.patch?.email ?? employee.email,
        role: payload.role ?? payload.patch?.role ?? employee.role,
        status: payload.status ?? payload.patch?.status ?? employee.status,
    };

    try {
        const apiEmployeeId = getApiIdForLocal(STORAGE_KEYS.employees, employee.id);
        const updated = await api.patch(`/companies/${context.companyId}/employees/${apiEmployeeId}`, patch);
        await syncCoreData(context.companyId);
        return updated;
    } catch {
        return updateEmployee(employee.id, patch);
    }
}

async function createIngredientWithApi(context, payload) {
    const ingredientPayload = {
        name: payload.name?.trim() || "Новый ингредиент",
        sku: payload.sku || undefined,
        category: payload.category || "Прочее",
        unit: payload.unit || "шт",
        quantity: Number(payload.quantity || 0),
        minQuantity: Number(payload.minQuantity || 0),
        maxQuantity: Number(payload.maxQuantity || 0),
        costPrice: Number(payload.costPrice || 0),
    };

    try {
        const ingredient = await api.post(`/companies/${context.companyId}/ingredients`, ingredientPayload);
        await syncCoreData(context.companyId);
        return ingredient;
    } catch {
        return createIngredient(context.companyId, ingredientPayload);
    }
}

async function updateIngredientWithApi(context, payload = {}) {
    const ingredient = findByName(loadIngredients(context.companyId), payload.name || payload.ingredientName);
    if (!ingredient) return { error: `Ингредиент «${payload.name || payload.ingredientName}» не найден.` };

    const patch = {
        name: payload.nextName || payload.newName || payload.patch?.name || ingredient.name,
        category: payload.category ?? payload.patch?.category ?? ingredient.category,
        unit: payload.unit ?? payload.patch?.unit ?? ingredient.unit,
        quantity: payload.quantity ?? payload.patch?.quantity ?? ingredient.quantity,
        minQuantity: payload.minQuantity ?? payload.patch?.minQuantity ?? ingredient.minQuantity,
        maxQuantity: payload.maxQuantity ?? payload.patch?.maxQuantity ?? ingredient.maxQuantity,
        costPrice: payload.costPrice ?? payload.patch?.costPrice ?? ingredient.costPrice,
    };

    try {
        const apiIngredientId = getApiIdForLocal(STORAGE_KEYS.ingredients, ingredient.id);
        const updated = await api.patch(`/companies/${context.companyId}/ingredients/${apiIngredientId}`, patch);
        await syncCoreData(context.companyId);
        return updated;
    } catch {
        return updateIngredient(ingredient.id, patch);
    }
}

async function createTableWithApi(context, payload = {}) {
    const hall = await ensureHallWithApi(context, payload.hallName || "Основной зал");
    const tablePayload = {
        hallId: hall.apiId || hall.id,
        name: payload.name || `Стол №${loadTables(context.companyId, hall.localId || hall.id).length + 1}`,
        seats: Number(payload.seats || 4),
        status: payload.status || "free",
        type: payload.type || "round",
        x: Number(payload.x || 80),
        y: Number(payload.y || 80),
        width: Number(payload.width || 120),
        height: Number(payload.height || 120),
        rotation: Number(payload.rotation || 0),
        comment: payload.comment || "",
    };

    try {
        const table = await api.post(`/companies/${context.companyId}/tables`, tablePayload);
        await syncCoreData(context.companyId);
        return table;
    } catch {
        return createTable(context.companyId, hall.localId || hall.id, tablePayload);
    }
}

async function updateTableWithApi(context, payload = {}) {
    const table = findByName(loadTables(context.companyId), payload.name || payload.tableName);
    if (!table) return { error: `Стол «${payload.name || payload.tableName}» не найден.` };

    const patch = {
        name: payload.nextName || payload.newName || payload.patch?.name || table.name,
        seats: payload.seats ?? payload.patch?.seats ?? table.seats,
        status: payload.status ?? payload.patch?.status ?? table.status,
        comment: payload.comment ?? payload.patch?.comment ?? table.comment,
    };

    try {
        const apiTableId = getApiIdForLocal(STORAGE_KEYS.tables, table.id);
        const updated = await api.patch(`/companies/${context.companyId}/tables/${apiTableId}`, patch);
        await syncCoreData(context.companyId);
        return updated;
    } catch {
        return updateTable(table.id, patch);
    }
}

async function createOrderWithApi(context, payload = {}) {
    const table = await ensureTableWithApi(context, payload);
    const items = buildOrderItems(context, payload);
    const orderPayload = {
        hallId: table.hallApiId || getApiIdForLocal(STORAGE_KEYS.halls, table.hallId),
        tableId: table.apiId || table._apiId || getApiIdForLocal(STORAGE_KEYS.tables, table.id),
        waiterId: context.user.id,
        guests: Number(payload.guests || 1),
        status: "opened",
        items,
        discount: 0,
        tax: 0,
        subtotal: items.reduce((sum, item) => sum + Number(item.total || 0), 0),
        total: items.reduce((sum, item) => sum + Number(item.total || 0), 0),
        comments: payload.comments || "",
        history: [{ action: "Создано AI", createdAt: new Date().toISOString() }],
    };

    try {
        const order = await api.post(`/companies/${context.companyId}/table-orders`, orderPayload);
        await api.patch(`/companies/${context.companyId}/tables/${orderPayload.tableId}`, {
            status: "occupied",
            activeOrderId: order.id,
        }).catch(() => null);
        await syncCoreData(context.companyId);
        return order;
    } catch {
        const localOrder = createOrder(context.companyId, table.hallId, table.id, {
            guests: orderPayload.guests,
            waiterId: context.user.id,
            items: items.map((item) => ({
                ...item,
                productId: loadProducts(context.companyId).find((product) => product.name === item.name)?.id || item.productId,
            })),
            comments: orderPayload.comments,
        });
        updateTable(table.id, { status: "occupied", activeOrderId: localOrder.id });
        return localOrder;
    }
}

async function addProductToReceiptWithApi(context, payload) {
    const product = loadProducts(context.companyId).find((item) => (
        item.name.toLowerCase().includes(payload.productName.toLowerCase())
    ));

    if (!product) {
        return { error: `Товар «${payload.productName}» не найден в меню.` };
    }

    let receipt = loadReceipts(context.companyId, "open")[0];
    const item = {
        productId: getApiIdForLocal(STORAGE_KEYS.products, product.id),
        name: product.name,
        sku: product.sku,
        price: Number(product.price || 0),
        quantity: Number(payload.quantity || 1),
        comment: payload.comment || "",
        modifiers: [],
        total: Number(product.price || 0) * Number(payload.quantity || 1),
    };

    try {
        if (!receipt) {
            const registerId = await ensureCashRegisterApiId(context);
            const createdReceipt = await api.post(`/companies/${context.companyId}/receipts`, {
                registerId,
                status: "open",
                items: [item],
            });
            await syncCoreData(context.companyId);
            return createdReceipt;
        }

        const apiReceiptId = getApiIdForLocal(STORAGE_KEYS.receipts, receipt.id);
        const updatedItems = [...(receipt.items || []), item];
        const updatedReceipt = await api.patch(`/companies/${context.companyId}/receipts/${apiReceiptId}`, {
            ...receipt,
            registerId: getApiIdForLocal(STORAGE_KEYS.cashRegisters, receipt.registerId),
            items: updatedItems,
        });
        await syncCoreData(context.companyId);
        return updatedReceipt;
    } catch {
        if (!receipt) {
            const register = loadCashRegisters(context.companyId)[0];
            receipt = createReceipt(context.companyId, register?.id || 0, context.user.id);
        }
        return addProductToReceipt(receipt, product, { comment: payload.comment || "" });
    }
}

async function executeBulkAction(context, payload = {}) {
    const results = [];

    for (const category of payload.categories || []) {
        results.push(await createCategoryWithApi(context, typeof category === "string" ? { name: category } : category));
    }

    for (const product of payload.products || []) {
        results.push(await createProductWithApi(context, product));
    }

    for (const ingredient of payload.ingredients || []) {
        results.push(await createIngredientWithApi(context, ingredient));
    }

    for (const table of payload.tables || []) {
        results.push(await createTableWithApi(context, table));
    }

    for (const employee of payload.employees || []) {
        results.push(await createEmployeeWithApi(context, employee));
    }

    for (const update of payload.updates || []) {
        results.push(await executeAction(update, context));
    }

    await syncCoreData(context.companyId);
    return results;
}

async function ensureCategoryWithApi(context, categoryName, patch = {}) {
    const existing = loadCategories(context.companyId).find((item) => item.name.toLowerCase() === categoryName.toLowerCase());
    if (existing) {
        if (!existing._apiId) {
            try {
                const remote = await api.post(`/companies/${context.companyId}/categories`, normalizeCategoryPayload({
                    name: existing.name,
                    description: existing.description,
                    color: existing.color,
                    icon: existing.icon,
                    active: existing.active,
                }));
                await syncCoreData(context.companyId);
                const synced = loadCategories(context.companyId).find((item) => item._apiId === remote.id);
                return {
                    ...(synced || existing),
                    localId: synced?.id || existing.id,
                    apiId: remote.id,
                };
            } catch {
                return {
                    ...existing,
                    localId: existing.id,
                    apiId: existing.id,
                };
            }
        }

        return {
            ...existing,
            localId: existing.id,
            apiId: existing._apiId || getApiIdForLocal(STORAGE_KEYS.categories, existing.id),
        };
    }

    const created = await createCategoryWithApi(context, {
        name: categoryName,
        description: patch.description || `Создано AI: ${categoryName}`,
        color: patch.color || "#3B82F6",
        icon: patch.icon || "🍽",
        active: true,
    });
    const localCategory = loadCategories(context.companyId).find((item) => (
        item._apiId === created.id || item.name.toLowerCase() === categoryName.toLowerCase()
    ));

    return {
        ...(localCategory || created),
        localId: localCategory?.id || created.id,
        apiId: created.id,
    };
}

async function ensureCashRegisterApiId(context) {
    const register = loadCashRegisters(context.companyId)[0];
    if (register?._apiId) {
        return register._apiId;
    }

    try {
        const created = await api.post(`/companies/${context.companyId}/cash-registers`, {
            name: register?.name || "Касса 1",
            active: true,
        });
        await syncCoreData(context.companyId);
        return created.id;
    } catch {
        return register?.id || null;
    }
}

async function ensureHallWithApi(context, hallName) {
    const existing = loadFloor(context.companyId).find((item) => item.name.toLowerCase() === hallName.toLowerCase());
    if (existing?._apiId) {
        return { ...existing, localId: existing.id, apiId: existing._apiId };
    }

    if (existing) {
        try {
            const remote = await api.post(`/companies/${context.companyId}/halls`, normalizeHallPayload(existing));
            await syncCoreData(context.companyId);
            const synced = loadFloor(context.companyId).find((item) => item._apiId === remote.id);
            return { ...(synced || existing), localId: synced?.id || existing.id, apiId: remote.id };
        } catch {
            return { ...existing, localId: existing.id, apiId: existing.id };
        }
    }

    const payload = normalizeHallPayload({ name: hallName });
    try {
        const hall = await api.post(`/companies/${context.companyId}/halls`, payload);
        await syncCoreData(context.companyId);
        const synced = loadFloor(context.companyId).find((item) => item._apiId === hall.id);
        return { ...(synced || hall), localId: synced?.id || hall.id, apiId: hall.id };
    } catch {
        const hall = createHall(context.companyId, payload);
        return { ...hall, localId: hall.id, apiId: hall.id };
    }
}

async function ensureTableWithApi(context, payload = {}) {
    const tableName = payload.tableName || payload.name || "Стол №1";
    const existing = loadTables(context.companyId).find((item) => item.name.toLowerCase() === tableName.toLowerCase());
    if (existing) {
        return {
            ...existing,
            apiId: existing._apiId || getApiIdForLocal(STORAGE_KEYS.tables, existing.id),
            hallApiId: getApiIdForLocal(STORAGE_KEYS.halls, existing.hallId),
        };
    }

    const created = await createTableWithApi(context, {
        ...payload,
        name: tableName,
    });
    await syncCoreData(context.companyId);
    const localTable = loadTables(context.companyId).find((item) => item._apiId === created.id || item.name === tableName);
    return {
        ...(localTable || created),
        apiId: created.id || localTable?._apiId,
        hallApiId: localTable ? getApiIdForLocal(STORAGE_KEYS.halls, localTable.hallId) : created.hallId,
    };
}

function buildOrderItems(context, payload = {}) {
    if (!payload.productName) {
        return [];
    }

    const product = loadProducts(context.companyId).find((item) => item.name.toLowerCase().includes(payload.productName.toLowerCase()));
    if (!product) {
        return [];
    }

    const quantity = Number(payload.quantity || 1);
    return [{
        productId: getApiIdForLocal(STORAGE_KEYS.products, product.id),
        name: product.name,
        price: Number(product.price || 0),
        quantity,
        modifiers: [],
        comment: payload.comment || "",
        total: Number(product.price || 0) * quantity,
    }];
}

function normalizeHallPayload(payload = {}) {
    return {
        name: payload.name?.trim() || "Основной зал",
        active: payload.active !== false,
        archived: Boolean(payload.archived),
        sortOrder: Number(payload.sortOrder || 0),
        objects: payload.objects || [],
    };
}

function normalizeCategoryPayload(payload = {}) {
    return {
        name: payload.name?.trim() || "Новая категория",
        description: payload.description || "",
        color: payload.color || "#3B82F6",
        icon: payload.icon || "🍽",
        sortOrder: Number(payload.sortOrder || 0),
        active: payload.active !== false,
    };
}

function normalizeProductPayload(context, payload = {}) {
    return {
        categoryId: payload.categoryId || null,
        name: payload.name?.trim() || "Новый товар",
        sku: payload.sku || undefined,
        description: payload.description || `Добавлено AI: ${payload.name || "товар"}`,
        fullDescription: payload.fullDescription || "",
        images: payload.images || [],
        price: Number(payload.price || 0),
        costPrice: Number(payload.costPrice || 0),
        currency: payload.currency || context.company?.settings?.currency || "USD",
        quantity: Number(payload.quantity ?? 999),
        minQuantity: Number(payload.minQuantity || 0),
        unit: payload.unit || "шт",
        status: payload.status || "active",
        active: payload.active !== false,
        popular: Boolean(payload.popular),
        novelty: payload.novelty !== false,
        recommended: Boolean(payload.recommended),
        qrVisible: payload.qrVisible !== false,
        posVisible: payload.posVisible !== false,
        tags: payload.tags || [],
        nutrition: payload.nutrition || {},
    };
}

function normalizeProductPatch(patch = {}) {
    const nextPatch = { ...patch };
    if (nextPatch.price !== undefined) {
        nextPatch.price = Number(nextPatch.price);
    }
    return nextPatch;
}

function findByName(items, name, getName = (item) => item.name) {
    const normalizedName = String(name || "").trim().toLowerCase();
    if (!normalizedName) return null;

    return items.find((item) => getName(item).toLowerCase() === normalizedName)
        || items.find((item) => getName(item).toLowerCase().includes(normalizedName));
}

export function cancelAction(action) {
    return {
        cancelled: true,
        action,
    };
}

export function createEmployeeWithAI(context, name) {
    return {
        type: "employee:create",
        payload: {
            firstName: name,
            role: "waiter",
            status: "working",
        },
    };
}

export function createCompanyWithAI(name) {
    return {
        type: "company:suggest",
        payload: {
            name,
            businessType: "restaurant",
            currency: "USD",
            workingHours: "09:00-22:00",
        },
    };
}
