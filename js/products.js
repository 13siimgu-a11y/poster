import { createLog } from "./logs.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const PRODUCT_UNITS = ["шт", "г", "кг", "мл", "л", "порция", "бутылка", "стакан"];
export const PRODUCT_STATUSES = ["active", "hidden", "out_of_stock", "archive"];
export const PRODUCT_TAGS = ["Новинка", "Острое", "Вегетарианское", "Без сахара", "Халяль", "Кошерное", "Без глютена", "Популярное"];

export function loadProducts(companyId = null) {
    const products = storage.get(STORAGE_KEYS.products, []);
    return companyId ? products.filter((product) => Number(product.companyId) === Number(companyId)) : products;
}

export function saveProducts(products) {
    return storage.set(STORAGE_KEYS.products, products);
}

export function generateSku(companyId) {
    const companyProducts = loadProducts(companyId);
    const nextNumber = companyProducts.length + 1;
    return `SKU-${String(nextNumber).padStart(4, "0")}`;
}

function normalizeProduct(companyId, data, existingProduct = {}) {
    const now = new Date().toISOString();

    return {
        id: existingProduct.id,
        companyId: Number(companyId),
        categoryId: Number(data.categoryId ?? existingProduct.categoryId ?? 0),
        name: data.name?.trim() || existingProduct.name || "",
        sku: data.sku || existingProduct.sku || generateSku(companyId),
        description: data.description?.trim() ?? existingProduct.description ?? "",
        fullDescription: data.fullDescription?.trim() ?? existingProduct.fullDescription ?? "",
        images: data.images || existingProduct.images || [],
        gallery: data.gallery || existingProduct.gallery || [],
        price: Number(data.price ?? existingProduct.price ?? 0),
        costPrice: Number(data.costPrice ?? existingProduct.costPrice ?? 0),
        currency: data.currency || existingProduct.currency || "USD",
        quantity: Number(data.quantity ?? existingProduct.quantity ?? 0),
        minQuantity: Number(data.minQuantity ?? existingProduct.minQuantity ?? 0),
        unit: data.unit || existingProduct.unit || "шт",
        weight: Number(data.weight ?? existingProduct.weight ?? 0),
        volume: Number(data.volume ?? existingProduct.volume ?? 0),
        portions: Number(data.portions ?? existingProduct.portions ?? 1),
        active: data.active !== undefined ? Boolean(data.active) : existingProduct.active ?? true,
        featured: data.featured !== undefined ? Boolean(data.featured) : Boolean(existingProduct.featured),
        popular: data.popular !== undefined ? Boolean(data.popular) : Boolean(existingProduct.popular),
        novelty: data.novelty !== undefined ? Boolean(data.novelty) : Boolean(existingProduct.novelty),
        recommended: data.recommended !== undefined ? Boolean(data.recommended) : Boolean(existingProduct.recommended),
        qrVisible: data.qrVisible !== undefined ? Boolean(data.qrVisible) : existingProduct.qrVisible ?? true,
        posVisible: data.posVisible !== undefined ? Boolean(data.posVisible) : existingProduct.posVisible ?? true,
        status: data.status || existingProduct.status || "active",
        tags: data.tags || existingProduct.tags || [],
        modifiers: data.modifiers || existingProduct.modifiers || [],
        variants: data.variants || existingProduct.variants || [],
        nutrition: {
            calories: Number(data.calories || existingProduct.nutrition?.calories || 0),
            protein: Number(data.protein || existingProduct.nutrition?.protein || 0),
            fat: Number(data.fat || existingProduct.nutrition?.fat || 0),
            carbs: Number(data.carbs || existingProduct.nutrition?.carbs || 0),
        },
        ingredients: data.ingredients || existingProduct.ingredients || [],
        createdAt: existingProduct.createdAt || now,
        updatedAt: now,
    };
}

export function createProduct(companyId, data) {
    const products = storage.get(STORAGE_KEYS.products, []);
    const product = normalizeProduct(companyId, data);
    product.id = products.length ? Math.max(...products.map((item) => Number(item.id))) + 1 : 1;

    saveProducts([...products, product]);
    createLog("Создал товар", { companyId, product: product.name, sku: product.sku });
    return product;
}

export function updateProduct(productId, data) {
    const products = storage.get(STORAGE_KEYS.products, []);
    const productIndex = products.findIndex((product) => Number(product.id) === Number(productId));

    if (productIndex === -1) {
        return null;
    }

    products[productIndex] = normalizeProduct(products[productIndex].companyId, data, products[productIndex]);
    saveProducts(products);
    createLog("Изменил товар", { companyId: products[productIndex].companyId, product: products[productIndex].name });
    return products[productIndex];
}

export function deleteProduct(productId) {
    const products = storage.get(STORAGE_KEYS.products, []);
    const product = products.find((item) => Number(item.id) === Number(productId));

    if (!product) {
        return false;
    }

    saveProducts(products.filter((item) => Number(item.id) !== Number(productId)));
    createLog("Удалил товар", { companyId: product.companyId, product: product.name });
    return true;
}

export function duplicateProduct(productId) {
    const product = loadProducts().find((item) => Number(item.id) === Number(productId));

    if (!product) {
        return null;
    }

    return createProduct(product.companyId, {
        ...product,
        name: `${product.name} копия`,
        sku: generateSku(product.companyId),
    });
}

export function archiveProduct(productId) {
    return updateProduct(productId, { status: "archive", active: false });
}

export function changePrice(productId, price) {
    return updateProduct(productId, { price: Number(price) });
}

export function changeCategory(productId, categoryId) {
    return updateProduct(productId, { categoryId: Number(categoryId) });
}
