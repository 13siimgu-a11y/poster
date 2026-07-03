import { createLog } from "./logs.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const DEFAULT_PLANS = [
    {
        id: 1,
        name: "Starter",
        price: 10,
        days: 30,
        description: "Подходит небольшим кафе.",
    },
    {
        id: 2,
        name: "Business",
        price: 25,
        days: 90,
        description: "Для большинства ресторанов.",
    },
    {
        id: 3,
        name: "Professional",
        price: 50,
        days: 180,
        description: "Для сетевых заведений.",
    },
    {
        id: 4,
        name: "Enterprise",
        price: 100,
        days: 365,
        description: "Полный функционал.",
    },
];

export function loadPlans() {
    return storage.get(STORAGE_KEYS.plans, []);
}

export function savePlans(plans) {
    return storage.set(STORAGE_KEYS.plans, plans);
}

export function createDefaultPlans() {
    const plans = loadPlans();

    if (plans.length) {
        return plans;
    }

    savePlans(DEFAULT_PLANS);
    return DEFAULT_PLANS;
}

export function getPlanByName(planName) {
    return loadPlans().find((plan) => plan.name.toLowerCase() === planName.toLowerCase()) || null;
}

export function createPlan(planData) {
    const plans = loadPlans();
    const plan = {
        id: plans.length ? Math.max(...plans.map((item) => item.id)) + 1 : 1,
        name: planData.name.trim(),
        price: Number(planData.price),
        days: Number(planData.days),
        description: planData.description.trim(),
    };

    plans.push(plan);
    savePlans(plans);
    createLog("Создал тариф", { plan: plan.name });
    return plan;
}

export function updatePlan(planId, planData) {
    const plans = loadPlans();
    const planIndex = plans.findIndex((plan) => Number(plan.id) === Number(planId));

    if (planIndex === -1) {
        return null;
    }

    plans[planIndex] = {
        ...plans[planIndex],
        name: planData.name.trim(),
        price: Number(planData.price),
        days: Number(planData.days),
        description: planData.description.trim(),
    };

    savePlans(plans);
    createLog("Изменил тариф", { plan: plans[planIndex].name });
    return plans[planIndex];
}

export function deletePlan(planId) {
    const plans = loadPlans();
    const plan = plans.find((item) => Number(item.id) === Number(planId));

    if (!plan) {
        return false;
    }

    savePlans(plans.filter((item) => Number(item.id) !== Number(planId)));
    createLog("Удалил тариф", { plan: plan.name });
    return true;
}
