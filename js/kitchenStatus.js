export const KITCHEN_STATUSES = {
    new: { label: "Новый", color: "#3B82F6", icon: "🆕" },
    accepted: { label: "Принят", color: "#06B6D4", icon: "✅" },
    cooking: { label: "Готовится", color: "#F59E0B", icon: "🔥" },
    almostReady: { label: "Почти готов", color: "#8B5CF6", icon: "⏱" },
    ready: { label: "Готов", color: "#16A34A", icon: "🍽" },
    served: { label: "Выдан", color: "#64748B", icon: "📦" },
    closed: { label: "Закрыт", color: "#0F172A", icon: "🔒" },
    cancelled: { label: "Отменен", color: "#DC2626", icon: "✕" },
};

export const KITCHEN_PRIORITIES = {
    vip: 5,
    urgent: 4,
    delivery: 3,
    pickup: 2,
    normal: 1,
};

export function getTimerLevel(minutes) {
    if (minutes > 30) return "danger";
    if (minutes > 20) return "orange";
    if (minutes > 10) return "warning";
    return "success";
}
