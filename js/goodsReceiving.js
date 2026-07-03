import { addStock, loadIngredients, updateIngredient } from "./ingredients.js";
import { updatePurchaseOrder } from "./purchaseOrders.js";

export function updateAverageCost(ingredient, receivedQuantity, receivedPrice) {
    const currentValue = Number(ingredient.quantity || 0) * Number(ingredient.costPrice || 0);
    const receivedValue = Number(receivedQuantity || 0) * Number(receivedPrice || 0);
    const totalQuantity = Number(ingredient.quantity || 0) + Number(receivedQuantity || 0);

    return totalQuantity > 0 ? (currentValue + receivedValue) / totalQuantity : Number(receivedPrice || 0);
}

export function receiveGoods(order, receivedItems, userId = 0) {
    const ingredients = loadIngredients(order.companyId);
    const updatedItems = order.items.map((item) => {
        const received = receivedItems.find((entry) => Number(entry.ingredientId) === Number(item.ingredientId));

        if (!received) return item;

        const ingredient = ingredients.find((entry) => Number(entry.id) === Number(item.ingredientId));
        if (ingredient) {
            const costPrice = updateAverageCost(ingredient, received.quantity, item.unitPrice);
            updateIngredient(ingredient.id, { costPrice });
            addStock(ingredient.id, received.quantity, `Приемка ${order.orderNumber}`, userId);
        }

        return {
            ...item,
            receivedQuantity: Number(item.receivedQuantity || 0) + Number(received.quantity || 0),
        };
    });
    const isFull = updatedItems.every((item) => Number(item.receivedQuantity || 0) >= Number(item.quantity || 0));

    return updatePurchaseOrder(order.id, {
        items: updatedItems,
        status: isFull ? "received" : "partial",
        receivedAt: isFull ? new Date().toISOString() : order.receivedAt,
    });
}
