import { updateOrder } from "./orders.js";

export function mergeOrders(targetOrder, sourceOrder) {
    const mergedOrder = updateOrder(targetOrder.id, {
        items: [...targetOrder.items, ...sourceOrder.items],
        historyAction: `Объединен с заказом ${sourceOrder.number}`,
    });

    updateOrder(sourceOrder.id, {
        status: "merged",
        historyAction: `Объединен в заказ ${targetOrder.number}`,
    });

    return mergedOrder;
}
