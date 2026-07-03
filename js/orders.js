import { createLog } from "./logs.js";
import { createKitchenOrder } from "./kitchenOrders.js";
import { idsEqual, mirrorCreate, mirrorUpdate } from "./apiPersistence.js";
import { updateTable } from "./tables.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export function loadOrders(companyId = null, status = null) {
    const orders = storage.get(STORAGE_KEYS.tableOrders, []);
    return orders.filter((order) => (
        (!companyId || idsEqual(order.companyId, companyId))
        && (!status || order.status === status)
    ));
}

export function saveOrders(orders) {
    return storage.set(STORAGE_KEYS.tableOrders, orders);
}

export function createOrder(companyId, hallId, tableId, data = {}) {
    const orders = storage.get(STORAGE_KEYS.tableOrders, []);
    const now = new Date().toISOString();
    const order = calculateOrder({
        id: orders.length ? Math.max(...orders.map((item) => Number(item.id))) + 1 : 1,
        number: `ORD-${String(orders.length + 1).padStart(5, "0")}`,
        companyId,
        hallId,
        tableId,
        cashierId: data.cashierId || null,
        waiterId: data.waiterId || null,
        guests: Number(data.guests || 1),
        status: "opened",
        items: data.items || [],
        subtotal: 0,
        discount: Number(data.discount || 0),
        tax: Number(data.tax || 0),
        total: 0,
        payments: [],
        comments: data.comments || "",
        history: [{ action: "Создан заказ", createdAt: now }],
        createdAt: now,
        updatedAt: now,
    });

    saveOrders([...orders, order]);
    mirrorCreate("tableOrders", companyId, order);
    updateTable(tableId, { status: "occupied", activeOrderId: order.id });
    if (order.items.length) {
        createKitchenOrder(order);
    }
    createLog("Создал заказ на стол", { companyId, order: order.number, tableId });
    return order;
}

export function updateOrder(orderId, data) {
    const orders = storage.get(STORAGE_KEYS.tableOrders, []);
    const orderIndex = orders.findIndex((order) => Number(order.id) === Number(orderId));

    if (orderIndex === -1) {
        return null;
    }

    orders[orderIndex] = calculateOrder({
        ...orders[orderIndex],
        ...data,
        history: [
            ...(orders[orderIndex].history || []),
            { action: data.historyAction || "Изменен заказ", createdAt: new Date().toISOString() },
        ],
        updatedAt: new Date().toISOString(),
    });

    saveOrders(orders);
    mirrorUpdate("tableOrders", orders[orderIndex].companyId, orders[orderIndex]);
    return orders[orderIndex];
}

export function closeOrder(orderId, payments = []) {
    const order = updateOrder(orderId, {
        status: "closed",
        payments,
        historyAction: "Заказ закрыт",
    });

    if (order) {
        updateTable(order.tableId, { status: "cleaning", activeOrderId: null });
        createLog("Закрыл заказ", { companyId: order.companyId, order: order.number });
    }

    return order;
}

export function cancelOrder(orderId) {
    const order = updateOrder(orderId, {
        status: "cancelled",
        historyAction: "Заказ отменен",
    });

    if (order) {
        updateTable(order.tableId, { status: "free", activeOrderId: null });
        createLog("Отменил заказ", { companyId: order.companyId, order: order.number });
    }

    return order;
}

export function transferOrder(orderId, newTableId) {
    const order = loadOrders().find((item) => Number(item.id) === Number(orderId));

    if (!order) {
        return null;
    }

    updateTable(order.tableId, { status: "free", activeOrderId: null });
    updateTable(newTableId, { status: "occupied", activeOrderId: order.id });
    return updateOrder(orderId, {
        tableId: Number(newTableId),
        historyAction: "Заказ перенесен",
    });
}

export function calculateOrder(order) {
    const subtotal = order.items.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const total = Math.max(0, subtotal - Number(order.discount || 0) + Number(order.tax || 0));

    return {
        ...order,
        subtotal,
        total,
    };
}
