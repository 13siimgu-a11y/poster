import { checkSubscription as checkUserSubscription } from "./subscriptions.js";

export function checkSubscription(user) {
    return checkUserSubscription(user);
}

export function getSubscriptionInfo(user) {
    const subscription = user?.subscription;

    if (!subscription) {
        return {
            plan: "none",
            status: "expired",
            daysLeft: 0,
            warning: true,
        };
    }

    if (subscription.lifetime) {
        return {
            ...subscription,
            daysLeft: "∞",
            warning: false,
        };
    }

    const msLeft = new Date(subscription.endDate).getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));

    return {
        ...subscription,
        daysLeft,
        warning: daysLeft < 7,
    };
}
