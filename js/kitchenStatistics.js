import { loadKitchenOrders } from "./kitchenOrders.js";
import { calculateCookingTime } from "./kitchenTimer.js";

export function updateKitchenStatistics(companyId) {
    const orders = loadKitchenOrders(companyId, true);
    const activeOrders = orders.filter((order) => !["closed", "cancelled", "served"].includes(order.status));
    const today = new Date().toISOString().slice(0, 10);
    const readyToday = orders.filter((order) => order.readyAt?.startsWith(today));
    const overdue = activeOrders.filter((order) => calculateCookingTime(order) > 20 * 60);
    const averageSeconds = readyToday.length
        ? readyToday.reduce((sum, order) => sum + calculateCookingTime(order), 0) / readyToday.length
        : 0;
    const dishCounter = new Map();

    orders.forEach((order) => {
        order.items.forEach((item) => {
            dishCounter.set(item.name, (dishCounter.get(item.name) || 0) + Number(item.quantity || 1));
        });
    });

    const mostPopularDish = [...dishCounter.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "—";

    return {
        activeOrders: activeOrders.length,
        averageCookingTime: Math.round(averageSeconds / 60),
        readyToday: readyToday.length,
        overdue: overdue.length,
        mostPopularDish,
        fastestCook: "—",
        overduePercent: activeOrders.length ? Math.round((overdue.length / activeOrders.length) * 100) : 0,
    };
}
