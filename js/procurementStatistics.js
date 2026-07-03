import { checkLowStock } from "./stockAlerts.js";
import { loadPurchaseOrders } from "./purchaseOrders.js";
import { loadSuppliers } from "./suppliers.js";

export function loadProcurementDashboard(companyId) {
    const suppliers = loadSuppliers(companyId);
    const orders = loadPurchaseOrders(companyId);
    const month = new Date().toISOString().slice(0, 7);
    const monthlyOrders = orders.filter((order) => order.createdAt.startsWith(month));
    const lastReceived = orders.find((order) => order.status === "received");

    return {
        activeSuppliers: suppliers.filter((supplier) => supplier.active && !supplier.archived).length,
        openOrders: orders.filter((order) => !["received", "cancelled"].includes(order.status)).length,
        monthlyPurchases: monthlyOrders.length,
        purchaseAmount: monthlyOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
        lastDelivery: lastReceived?.receivedAt || "—",
        lowStockIngredients: checkLowStock(companyId).length,
    };
}
