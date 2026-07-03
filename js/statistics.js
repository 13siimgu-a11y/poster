import { loadUsers } from "./users.js";

function isSameDay(dateValue, dayOffset) {
    const date = new Date(dateValue);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - dayOffset);

    return date.toDateString() === targetDate.toDateString();
}

export function getStatistics() {
    const users = loadUsers();
    const paidUsers = users.filter((user) => (
        user.subscription?.status === "active"
        && user.subscription?.plan !== "trial"
        && Number(user.subscription?.price) > 0
    ));
    const activeSubscriptions = users.filter((user) => user.subscription?.status === "active");
    const expiredSubscriptions = users.filter((user) => user.subscription?.status === "expired");
    const newRegistrations = users.filter((user) => {
        const createdAt = new Date(user.createdAt).getTime();
        return Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;
    });

    const chartDays = Array.from({ length: 7 }, (_, index) => 6 - index).map((dayOffset) => ({
        label: dayOffset === 0 ? "Сегодня" : `${dayOffset} дн.`,
        users: users.filter((user) => isSameDay(user.createdAt, dayOffset)).length,
        paid: paidUsers.filter((user) => isSameDay(user.subscription?.startDate, dayOffset)).length,
    }));

    return {
        totalUsers: users.length,
        activeUsers: users.filter((user) => user.status === "active").length,
        trialAccounts: users.filter((user) => user.subscription?.plan === "trial").length,
        paidAccounts: paidUsers.length,
        expiredSubscriptions: expiredSubscriptions.length,
        revenue: paidUsers.reduce((sum, user) => sum + Number(user.subscription?.price || 0), 0),
        newRegistrations: newRegistrations.length,
        activeSubscriptions: activeSubscriptions.length,
        charts: chartDays,
    };
}
