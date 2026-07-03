import { createCategory, loadCategories } from "./categories.js";
import { addProductToReceipt, loadReceipts } from "./pos.js";
import { createProduct, loadProducts, updateProduct } from "./products.js";
import { createEmployee } from "./employees.js";
import { checkLowStock } from "./inventory.js";

const CRITICAL_ACTIONS = ["delete", "price:update", "tax:update", "role:update", "company:delete", "shift:close"];

export function executeAction(action, context) {
    if (!action) return null;

    if (CRITICAL_ACTIONS.includes(action.type)) {
        return confirmAction(action, context);
    }

    if (action.type === "category:create") {
        return createCategory(context.companyId, action.payload);
    }

    if (action.type === "product:create") {
        const categories = loadCategories(context.companyId);
        const categoryName = action.payload.categoryName || "Блюда";
        const category = categories.find((item) => item.name.toLowerCase() === categoryName.toLowerCase())
            || createCategory(context.companyId, {
                name: categoryName,
                description: `Создано AI для ${categoryName}`,
                color: "#3B82F6",
                icon: "🍽",
                active: true,
            });

        return createProduct(context.companyId, {
            ...action.payload,
            categoryId: action.payload.categoryId || category.id,
            currency: context.company?.settings?.currency || "USD",
            quantity: action.payload.quantity ?? 999,
            minQuantity: action.payload.minQuantity ?? 0,
            unit: action.payload.unit || "шт",
            active: true,
            qrVisible: true,
            posVisible: true,
        });
    }

    if (action.type === "product:update") {
        return updateProduct(action.payload.productId, action.payload.patch);
    }

    if (action.type === "receipt:add-product") {
        const receipt = loadReceipts(context.companyId, "open")[0];
        const product = loadProducts(context.companyId).find((item) => (
            item.name.toLowerCase().includes(action.payload.productName.toLowerCase())
        ));

        if (!receipt || !product) {
            return {
                error: "Нет открытого чека или товар не найден.",
            };
        }

        return addProductToReceipt(receipt, product, {
            comment: action.payload.comment || "",
        });
    }

    if (action.type === "menu:cocktails:create") {
        const existingCategories = loadCategories(context.companyId);
        const cocktailsCategory = existingCategories.find((category) => category.name.toLowerCase() === "коктейли")
            || createCategory(context.companyId, {
                name: "Коктейли",
                description: "Коктейли для бара",
                color: "#8B5CF6",
                icon: "🍸",
                active: true,
            });
        const products = [
            { name: "Мохито", price: 12, description: "Ром, мята, лайм, содовая" },
            { name: "Маргарита", price: 14, description: "Текила, лайм, апельсиновый ликер" },
            { name: "Апероль Шприц", price: 13, description: "Апероль, просекко, содовая" },
            { name: "Негрони", price: 15, description: "Джин, кампари, красный вермут" },
            { name: "Виски Сауэр", price: 14, description: "Виски, лимон, сахарный сироп" },
        ];

        return products.map((product) => createProduct(context.companyId, {
            ...product,
            categoryId: cocktailsCategory.id,
            costPrice: 0,
            currency: context.company?.settings?.currency || "USD",
            quantity: 999,
            minQuantity: 0,
            unit: "стакан",
            active: true,
            popular: true,
            qrVisible: true,
            posVisible: true,
            tags: ["Популярное"],
        }));
    }

    if (action.type === "employee:create") {
        return createEmployee(context.companyId, action.payload);
    }

    if (action.type === "inventory:analyze") {
        return checkLowStock(context.companyId);
    }

    return null;
}

export function confirmAction(action, context) {
    const confirmed = window.confirm(action.confirmText || "Подтвердить действие AI?");
    if (!confirmed) {
        return cancelAction(action);
    }

    if (action.type === "price:update") {
        return action.payload.products.map((product) => updateProduct(product.id, { price: product.nextPrice }));
    }

    return executeAction({ ...action, type: action.safeType }, context);
}

export function cancelAction(action) {
    return {
        cancelled: true,
        action,
    };
}

export function createEmployeeWithAI(context, name) {
    return {
        type: "employee:create",
        payload: {
            firstName: name,
            role: "waiter",
            status: "working",
        },
    };
}

export function createCompanyWithAI(name) {
    return {
        type: "company:suggest",
        payload: {
            name,
            businessType: "restaurant",
            currency: "USD",
            workingHours: "09:00-22:00",
        },
    };
}
