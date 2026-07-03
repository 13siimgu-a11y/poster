import { createLog } from "./logs.js";
import { storage, STORAGE_KEYS } from "./storage.js";
import { dispatchKitchenUpdate, playNotification } from "./kitchenNotifications.js";
import { KITCHEN_PRIORITIES } from "./kitchenStatus.js";

export function loadKitchenOrders(companyId = null, includeArchive = false) {
    const activeOrders = storage.get(STORAGE_KEYS.kitchenOrders, []);
    const archive = includeArchive ? storage.get(STORAGE_KEYS.kitchenArchive, []) : [];
    return [...activeOrders, ...archive].filter((order) => !companyId || Number(order.companyId) === Number(companyId));
}

export function saveKitchenOrders(orders) {
    return storage.set(STORAGE_KEYS.kitchenOrders, orders);
}

export function createKitchenOrder(order, options = {}) {
    const existing = loadKitchenOrders(order.companyId).find((item) => Number(item.orderId) === Number(order.id));

    if (existing) {
        return existing;
    }

    const orders = storage.get(STORAGE_KEYS.kitchenOrders, []);
    const kitchenOrder = {
        id: orders.length ? Math.max(...orders.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(order.companyId),
        orderId: Number(order.id),
        tableId: Number(order.tableId || 0),
        waiterId: Number(order.waiterId || order.cashierId || 0),
        guests: Number(order.guests || 1),
        priority: options.priority || "normal",
        type: options.type || "dine-in",
        status: "new",
        comments: order.comments || order.comment || "",
        createdAt: new Date().toISOString(),
        acceptedAt: null,
        cookingStartedAt: null,
        readyAt: null,
        servedAt: null,
        archivedAt: null,
        cookId: null,
        items: (order.items || []).map((item) => ({
            id: item.id,
            productId: item.productId,
            name: item.name,
            quantity: Number(item.quantity || 1),
            modifiers: item.modifiers || [],
            comment: item.comment || "",
            status: "new",
            createdAt: new Date().toISOString(),
            readyAt: null,
        })),
    };

    saveKitchenOrders([...orders, kitchenOrder]);
    createLog("Создал заказ кухни", { companyId: kitchenOrder.companyId, orderId: kitchenOrder.orderId });
    playNotification();
    dispatchKitchenUpdate({ type: "created", orderId: kitchenOrder.id });
    return kitchenOrder;
}

export function updateKitchenOrder(orderId, patch) {
    const orders = storage.get(STORAGE_KEYS.kitchenOrders, []);
    const index = orders.findIndex((order) => Number(order.id) === Number(orderId));

    if (index === -1) {
        return null;
    }

    orders[index] = {
        ...orders[index],
        ...patch,
        updatedAt: new Date().toISOString(),
    };

    saveKitchenOrders(orders);
    dispatchKitchenUpdate({ type: "updated", orderId });
    return orders[index];
}

export function acceptOrder(orderId, cookId = null) {
    return updateKitchenOrder(orderId, {
        status: "accepted",
        acceptedAt: new Date().toISOString(),
        cookId,
    });
}

export function startCooking(orderId) {
    return updateKitchenOrder(orderId, {
        status: "cooking",
        cookingStartedAt: new Date().toISOString(),
    });
}

export function finishDish(orderId, itemId) {
    const order = loadKitchenOrders().find((item) => Number(item.id) === Number(orderId));

    if (!order) {
        return null;
    }

    const items = order.items.map((item) => (
        Number(item.id) === Number(itemId)
            ? { ...item, status: "ready", readyAt: new Date().toISOString() }
            : item
    ));
    const allReady = items.every((item) => item.status === "ready");

    return updateKitchenOrder(orderId, {
        items,
        status: allReady ? "ready" : order.status,
        readyAt: allReady ? new Date().toISOString() : order.readyAt,
    });
}

export function finishOrder(orderId) {
    return updateKitchenOrder(orderId, {
        status: "ready",
        readyAt: new Date().toISOString(),
        items: loadKitchenOrders().find((order) => Number(order.id) === Number(orderId))?.items.map((item) => ({
            ...item,
            status: "ready",
            readyAt: item.readyAt || new Date().toISOString(),
        })) || [],
    });
}

export function serveOrder(orderId) {
    const order = updateKitchenOrder(orderId, {
        status: "served",
        servedAt: new Date().toISOString(),
    });
    return archiveKitchenOrder(order?.id);
}

export function cancelOrder(orderId) {
    return archiveKitchenOrder(orderId, "cancelled");
}

export function archiveKitchenOrder(orderId, status = "closed") {
    const orders = storage.get(STORAGE_KEYS.kitchenOrders, []);
    const order = orders.find((item) => Number(item.id) === Number(orderId));

    if (!order) {
        return null;
    }

    const archived = {
        ...order,
        status,
        archivedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.kitchenOrders, orders.filter((item) => Number(item.id) !== Number(orderId)));
    storage.set(STORAGE_KEYS.kitchenArchive, [archived, ...storage.get(STORAGE_KEYS.kitchenArchive, [])]);
    dispatchKitchenUpdate({ type: "archived", orderId });
    return archived;
}

export function sortKitchenOrders(orders) {
    return [...orders].sort((left, right) => {
        const priorityDiff = (KITCHEN_PRIORITIES[right.priority] || 1) - (KITCHEN_PRIORITIES[left.priority] || 1);
        if (priorityDiff) return priorityDiff;
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
}

export function filterKitchenOrders(orders, filter = "all", query = "") {
    const normalizedQuery = query.trim().toLowerCase();
    return orders.filter((order) => {
        const matchesFilter = filter === "all"
            || (filter === "cooking" && ["accepted", "cooking", "almostReady"].includes(order.status))
            || (filter === "ready" && order.status === "ready")
            || (filter === "overdue" && Date.now() - new Date(order.createdAt).getTime() > 20 * 60 * 1000)
            || (filter === "delivery" && order.type === "delivery")
            || (filter === "pickup" && order.type === "pickup");
        const matchesQuery = !normalizedQuery
            || String(order.orderId).includes(normalizedQuery)
            || String(order.tableId).includes(normalizedQuery)
            || order.items.some((item) => item.name.toLowerCase().includes(normalizedQuery));

        return matchesFilter && matchesQuery;
    });
}
