import { createLog } from "./logs.js";
import { idsEqual, mirrorCreate, mirrorDelete, mirrorUpdate } from "./apiPersistence.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const DEFAULT_CATEGORY_NAMES = [
    "Напитки",
    "Кофе",
    "Чай",
    "Алкоголь",
    "Закуски",
    "Салаты",
    "Супы",
    "Горячие блюда",
    "Паста",
    "Пицца",
    "Бургеры",
    "Десерты",
    "Кальяны",
    "Соусы",
    "Другое",
];

const CATEGORY_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4"];

export function loadCategories(companyId = null) {
    const categories = storage.get(STORAGE_KEYS.categories, []);
    return companyId ? categories.filter((category) => idsEqual(category.companyId, companyId)) : categories;
}

export function saveCategories(categories) {
    return storage.set(STORAGE_KEYS.categories, categories);
}

export function ensureDefaultCategories(companyId) {
    const existing = loadCategories(companyId);

    if (existing.length) {
        return existing;
    }

    const allCategories = storage.get(STORAGE_KEYS.categories, []);
    const now = new Date().toISOString();
    const nextId = allCategories.length ? Math.max(...allCategories.map((item) => Number(item.id))) + 1 : 1;
    const defaults = DEFAULT_CATEGORY_NAMES.map((name, index) => ({
        id: nextId + index,
        companyId,
        name,
        description: "",
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        icon: "🍽",
        image: "",
        sortOrder: index + 1,
        active: true,
        createdAt: now,
        updatedAt: now,
    }));

    saveCategories([...allCategories, ...defaults]);
    defaults.forEach((category) => mirrorCreate("categories", companyId, category));
    return defaults;
}

export function createCategory(companyId, data) {
    const categories = storage.get(STORAGE_KEYS.categories, []);
    const companyCategories = loadCategories(companyId);
    const category = {
        id: categories.length ? Math.max(...categories.map((item) => Number(item.id))) + 1 : 1,
        companyId,
        name: data.name.trim(),
        description: data.description?.trim() || "",
        color: data.color || "#3B82F6",
        icon: data.icon || "🍽",
        image: data.image || "",
        sortOrder: companyCategories.length + 1,
        active: data.active !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    saveCategories([...categories, category]);
    mirrorCreate("categories", companyId, category);
    createLog("Создал категорию", { companyId, category: category.name });
    return category;
}

export function updateCategory(categoryId, data) {
    const categories = storage.get(STORAGE_KEYS.categories, []);
    const categoryIndex = categories.findIndex((category) => Number(category.id) === Number(categoryId));

    if (categoryIndex === -1) {
        return null;
    }

    categories[categoryIndex] = {
        ...categories[categoryIndex],
        ...data,
        name: data.name?.trim() || categories[categoryIndex].name,
        description: data.description?.trim() ?? categories[categoryIndex].description,
        updatedAt: new Date().toISOString(),
    };

    saveCategories(categories);
    mirrorUpdate("categories", categories[categoryIndex].companyId, categories[categoryIndex]);
    createLog("Изменил категорию", { companyId: categories[categoryIndex].companyId, category: categories[categoryIndex].name });
    return categories[categoryIndex];
}

export function deleteCategory(categoryId) {
    const categories = storage.get(STORAGE_KEYS.categories, []);
    const category = categories.find((item) => Number(item.id) === Number(categoryId));

    if (!category) {
        return false;
    }

    saveCategories(categories.filter((item) => Number(item.id) !== Number(categoryId)));
    mirrorDelete("categories", category.companyId, category);
    createLog("Удалил категорию", { companyId: category.companyId, category: category.name });
    return true;
}

export function sortCategories(companyId, orderedIds) {
    const categories = storage.get(STORAGE_KEYS.categories, []);
    const updatedCategories = categories.map((category) => {
        if (!idsEqual(category.companyId, companyId)) {
            return category;
        }

        const orderIndex = orderedIds.findIndex((id) => Number(id) === Number(category.id));
        return {
            ...category,
            sortOrder: orderIndex === -1 ? category.sortOrder : orderIndex + 1,
            updatedAt: new Date().toISOString(),
        };
    });

    saveCategories(updatedCategories);
    updatedCategories.filter((category) => idsEqual(category.companyId, companyId)).forEach((category) => {
        mirrorUpdate("categories", companyId, category);
    });
    createLog("Изменил порядок категорий", { companyId });
    return loadCategories(companyId);
}
