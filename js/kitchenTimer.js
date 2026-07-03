export function calculateCookingTime(order) {
    const end = order.servedAt || order.readyAt || new Date().toISOString();
    return Math.max(0, Math.floor((new Date(end).getTime() - new Date(order.createdAt).getTime()) / 1000));
}

export function formatCookingTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

export function getCookingMinutes(order) {
    return Math.floor(calculateCookingTime(order) / 60);
}
