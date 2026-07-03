import { createOrder, updateOrder } from "./orders.js";

export function splitBill(order, mode = "equal", payload = {}) {
    if (mode === "equal") {
        const parts = Number(payload.parts || order.guests || 2);
        const amount = order.total / parts;
        return Array.from({ length: parts }, (_, index) => ({
            id: index + 1,
            total: amount,
            items: [],
        }));
    }

    if (mode === "items") {
        return payload.groups || [];
    }

    return [];
}

export function createSplitOrders(order, groups) {
    updateOrder(order.id, { status: "split", historyAction: "Счет разделен" });
    return groups.map((group) => createOrder(order.companyId, order.hallId, order.tableId, {
        waiterId: order.waiterId,
        guests: group.guests || 1,
        items: group.items || [],
        comments: `Разделение счета ${order.number}`,
    }));
}
