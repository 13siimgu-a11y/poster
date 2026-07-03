import { createLog } from "./logs.js";
import { getPlanByName } from "./plans.js";
import { createTrialSubscription, getUserById, updateUser } from "./users.js";

export function isSubscriptionExpired(subscription) {
    if (!subscription || subscription.lifetime) {
        return false;
    }

    if (!subscription.endDate) {
        return true;
    }

    return new Date(subscription.endDate).getTime() < Date.now();
}

export function checkSubscription(user) {
    if (!user?.subscription) {
        return {
            ...user,
            subscription: {
                plan: "none",
                price: 0,
                startDate: "",
                endDate: "",
                lifetime: false,
                status: "expired",
            },
        };
    }

    if (isSubscriptionExpired(user.subscription) && user.subscription.status !== "expired") {
        const updatedUser = updateUser(user.id, {
            subscription: {
                ...user.subscription,
                status: "expired",
            },
        });

        createLog("Подписка истекла", { userId: user.id, username: user.username });
        return updatedUser;
    }

    return user;
}

export function activateTrial(userId) {
    const user = getUserById(userId);

    if (!user) {
        return null;
    }

    const updatedUser = updateUser(userId, {
        subscription: createTrialSubscription(),
    });

    createLog("Выдал Trial", { userId: user.id, username: user.username });
    return updatedUser;
}

export function grantSubscription(userId, planName) {
    const user = getUserById(userId);

    if (!user) {
        return null;
    }

    const normalizedPlanName = planName.toLowerCase();
    const startDate = new Date();
    let subscription = null;

    if (normalizedPlanName === "trial") {
        return activateTrial(userId);
    }

    if (normalizedPlanName === "lifetime") {
        subscription = {
            plan: "lifetime",
            price: 0,
            startDate: startDate.toISOString(),
            endDate: "",
            lifetime: true,
            status: "active",
        };
    } else {
        const plan = getPlanByName(planName);

        if (!plan) {
            return null;
        }

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + Number(plan.days));

        subscription = {
            plan: plan.name,
            price: Number(plan.price),
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            lifetime: false,
            status: "active",
        };
    }

    const updatedUser = updateUser(userId, { subscription, status: "active" });
    createLog(`Выдал ${subscription.plan}`, { userId: user.id, username: user.username });
    return updatedUser;
}

export function removeSubscription(userId) {
    const user = getUserById(userId);

    if (!user) {
        return null;
    }

    const updatedUser = updateUser(userId, {
        subscription: {
            plan: "none",
            price: 0,
            startDate: "",
            endDate: "",
            lifetime: false,
            status: "expired",
        },
    });

    createLog("Удалил подписку", { userId: user.id, username: user.username });
    return updatedUser;
}

export function extendSubscription(userId, days = 30) {
    const user = getUserById(userId);

    if (!user || user.subscription?.lifetime) {
        return user;
    }

    const baseDate = user.subscription?.endDate && !isSubscriptionExpired(user.subscription)
        ? new Date(user.subscription.endDate)
        : new Date();
    baseDate.setDate(baseDate.getDate() + Number(days));

    const updatedUser = updateUser(userId, {
        subscription: {
            ...user.subscription,
            endDate: baseDate.toISOString(),
            status: "active",
        },
        status: "active",
    });

    createLog("Продлил подписку", { userId: user.id, username: user.username, days: Number(days) });
    return updatedUser;
}
