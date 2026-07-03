import { loadIngredients } from "./ingredients.js";
import { checkLowStock } from "./stockAlerts.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const PURCHASE_STATUSES = ["draft", "sent", "confirmed", "in_transit", "partial", "received", "cancelled"];

export function loadPurchaseOrders(companyId = null) {
    const orders = storage.get(STORAGE_KEYS.purchaseOrders, []);
    return companyId ? orders.filter((order) => Number(order.companyId) === Number(companyId)) : orders;
}

export function calculatePurchaseTotal(items = [], tax = 0) {
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    return {
        subtotal,
        tax: Number(tax || 0),
        total: subtotal + Number(tax || 0),
        itemCount: items.length,
    };
}

export function createPurchaseOrder(companyId, data) {
    const orders = storage.get(STORAGE_KEYS.purchaseOrders, []);
    const totals = calculatePurchaseTotal(data.items || [], data.tax);
    const order = {
        id: orders.length ? Math.max(...orders.map((item) => Number(item.id))) + 1 : 1,
        companyId: Number(companyId),
        supplierId: Number(data.supplierId),
        orderNumber: data.orderNumber || `PO-${String(orders.length + 1).padStart(6, "0")}`,
        warehouse: data.warehouse || "Основной склад",
        status: "draft",
        items: data.items || [],
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        paymentMethod: data.paymentMethod || "cash",
        paymentStatus: data.paymentStatus || "unpaid",
        expectedDate: data.expectedDate || "",
        receivedAt: "",
        comment: data.comment || "",
        createdBy: Number(data.createdBy || 0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    storage.set(STORAGE_KEYS.purchaseOrders, [order, ...orders]);
    return order;
}

export function updatePurchaseOrder(orderId, patch) {
    const orders = storage.get(STORAGE_KEYS.purchaseOrders, []);
    const index = orders.findIndex((order) => Number(order.id) === Number(orderId));

    if (index === -1) return null;

    const totals = calculatePurchaseTotal(patch.items || orders[index].items, patch.tax ?? orders[index].tax);
    orders[index] = {
        ...orders[index],
        ...patch,
        ...totals,
        updatedAt: new Date().toISOString(),
    };
    storage.set(STORAGE_KEYS.purchaseOrders, orders);
    return orders[index];
}

export function addPurchaseItem(orderId, item) {
    const order = loadPurchaseOrders().find((entry) => Number(entry.id) === Number(orderId));
    if (!order) return null;
    return updatePurchaseOrder(orderId, { items: [...order.items, item] });
}

export function confirmPurchaseOrder(orderId) {
    return updatePurchaseOrder(orderId, { status: "confirmed" });
}

export function generateSupplierRecommendation(companyId) {
    const ingredients = loadIngredients(companyId);
    return checkLowStock(companyId).map((ingredient) => ({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        recommendedQuantity: Math.max(0, Number(ingredient.maxQuantity || 0) - Number(ingredient.quantity || 0)) || Number(ingredient.minQuantity || 0),
        unit: ingredient.unit,
        costPrice: ingredient.costPrice,
        currentQuantity: ingredient.quantity,
        minQuantity: ingredient.minQuantity,
        source: ingredients.length,
    }));
}
