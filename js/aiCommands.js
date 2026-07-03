import { loadCategories } from "./categories.js";
import { formatMoney } from "./currency.js";
import { checkLowStock } from "./inventory.js";
import { loadReceipts } from "./pos.js";
import { loadProducts } from "./products.js";

export function generateMenu(type = "coffee") {
    if (type.includes("итальян")) {
        return {
            categories: ["Паста", "Пицца", "Салаты", "Десерты", "Напитки"],
            products: ["Маргарита", "Карбонара", "Тирамису", "Лимонад"],
        };
    }

    return {
        categories: ["Кофе", "Чай", "Десерты", "Холодные напитки"],
        products: ["Капучино", "Латте", "Американо", "Чизкейк"],
    };
}

export function generateProducts(prompt) {
    return generateMenu(prompt).products.map((name, index) => ({
        name,
        price: 5 + index,
        description: `AI-предложение: ${name}`,
    }));
}

export function generateRecipe(productName) {
    return [`Рецептура для ${productName}`, "Добавьте ингредиенты из склада перед автосписанием."];
}

export function analyzeInventory(companyId) {
    const lowStock = checkLowStock(companyId);
    return lowStock.length
        ? `Найдено ${lowStock.length} ингредиентов ниже минимума: ${lowStock.map((item) => item.name).join(", ")}.`
        : "Критичных остатков сейчас нет.";
}

export function analyzeSales(context) {
    const receipts = loadReceipts(context.companyId, "paid");
    const today = new Date().toISOString().slice(0, 10);
    const todayReceipts = receipts.filter((receipt) => receipt.paidAt?.startsWith(today));
    const revenue = todayReceipts.reduce((sum, receipt) => sum + Number(receipt.total || 0), 0);
    const average = todayReceipts.length ? revenue / todayReceipts.length : 0;
    const currency = context.company?.settings?.currency || "USD";

    return [
        `Сегодня пробито чеков: ${todayReceipts.length}.`,
        `Выручка: ${formatMoney(revenue, currency)}.`,
        `Средний чек: ${formatMoney(average, currency)}.`,
    ].join(" ");
}

export function analyzeFinance() {
    return "Финансовый анализ подготовлен архитектурно. Сейчас доступны склад, закупки, цены и себестоимость.";
}

export function detectCommand(message, context) {
    const text = message.toLowerCase();
    const productRequest = parseProductCreateRequest(text);
    const priceRequest = parsePriceUpdateRequest(text, context);
    const receiptRequest = parseReceiptAddRequest(text);

    if (text.includes("заканч") || text.includes("ниже минимума")) {
        return { reply: analyzeInventory(context.companyId), action: null };
    }

    if (productRequest) {
        return {
            reply: `Я подготовил товар «${productRequest.name}» с ценой ${productRequest.price}. Напишите «подтверждаю», чтобы добавить его в меню.`,
            action: {
                type: "product:create",
                pending: true,
                description: `Добавить товар «${productRequest.name}» в меню.`,
                payload: productRequest,
            },
        };
    }

    if (priceRequest) {
        return {
            reply: `Я подготовил изменение цен для ${priceRequest.products.length} товаров. Напишите «подтверждаю», чтобы применить.`,
            action: {
                type: "price:update",
                pending: true,
                description: "Изменить цены в меню.",
                confirmText: "AI изменит цены товаров. Подтвердить?",
                payload: priceRequest,
            },
        };
    }

    if (receiptRequest) {
        return {
            reply: `Могу добавить «${receiptRequest.productName}» в открытый чек. Напишите «подтверждаю», чтобы пробить позицию.`,
            action: {
                type: "receipt:add-product",
                pending: true,
                description: `Добавить «${receiptRequest.productName}» в открытый чек.`,
                payload: receiptRequest,
            },
        };
    }

    if (text.includes("коктейл") || text.includes("cocktail")) {
        return {
            reply: "Могу добавить категорию «Коктейли» и 5 популярных коктейлей для бара: Мохито, Маргарита, Апероль Шприц, Негрони, Виски Сауэр. Напишите «подтверждаю», чтобы создать их в меню.",
            action: {
                type: "menu:cocktails:create",
                pending: true,
                description: "Создать категорию «Коктейли» и 5 товаров для бара.",
            },
        };
    }

    if (text.includes("меню")) {
        const generated = generateMenu(text);
        return {
            reply: `Могу предложить меню: категории ${generated.categories.join(", ")}. Товары: ${generated.products.join(", ")}. Подтвердите, если нужно создать.`,
            action: null,
        };
    }

    if (text.includes("касс") || text.includes("выруч") || text.includes("продаж") || text.includes("средний чек")) {
        return { reply: analyzeSales(context), action: null };
    }

    if (text.includes("бармен") || text.includes("официант") || text.includes("пробить")) {
        return {
            reply: [
                "Для пробития: откройте «Касса», выберите категорию, нажмите товар, проверьте чек справа и выберите оплату.",
                "Я также могу добавить товар в открытый чек: напишите «пробей Капучино» или «добавь Мохито в чек».",
            ].join(" "),
            action: null,
        };
    }

    if (text.includes("товар")) {
        return {
            reply: `В заведении ${loadProducts(context.companyId).length} товаров и ${loadCategories(context.companyId).length} категорий.`,
            action: null,
        };
    }

    return {
        reply: "Я понял запрос. Сейчас работаю в локальном AI-режиме: могу анализировать меню, склад, закупки, персонал и подсказывать следующие действия.",
        action: null,
    };
}

function parseProductCreateRequest(text) {
    const match = text.match(/(?:добавь|создай)\s+(.+?)\s+за\s+(\d+(?:[.,]\d+)?)/i);

    if (!match) return null;

    const name = capitalize(match[1]
        .replace(/в меню|товар|блюдо|напиток|коктейль|коктейли|для бара/g, "")
        .trim());
    const price = Number(match[2].replace(",", "."));
    const isDrink = /кофе|чай|латте|капучино|мохито|коктейл|сок|лимонад|пиво|вино/.test(name.toLowerCase());

    return {
        name,
        price,
        categoryName: isDrink ? "Напитки" : "Блюда",
        description: `Добавлено AI: ${name}`,
        costPrice: 0,
        popular: false,
        novelty: true,
        recommended: false,
    };
}

function parsePriceUpdateRequest(text, context) {
    const percentMatch = text.match(/(?:подними|увеличь|сделай дороже|повысь).+?на\s+(\d+(?:[.,]\d+)?)%/i);
    const lowerPercentMatch = text.match(/(?:снизь|уменьши|сделай дешевле).+?на\s+(\d+(?:[.,]\d+)?)%/i);

    if (!percentMatch && !lowerPercentMatch) return null;

    const percent = Number((percentMatch?.[1] || lowerPercentMatch?.[1]).replace(",", "."));
    const direction = percentMatch ? 1 : -1;
    const products = loadProducts(context.companyId).filter((product) => {
        if (text.includes("кофе")) return product.name.toLowerCase().includes("кофе") || product.name.toLowerCase().includes("капучино") || product.name.toLowerCase().includes("латте") || product.name.toLowerCase().includes("американо");
        if (text.includes("десерт")) return product.tags?.includes("Десерты") || product.name.toLowerCase().includes("чизкейк");
        return true;
    }).map((product) => ({
        id: product.id,
        name: product.name,
        oldPrice: product.price,
        nextPrice: Math.max(0, Number((product.price * (1 + direction * percent / 100)).toFixed(2))),
    }));

    return { products };
}

function parseReceiptAddRequest(text) {
    const match = text.match(/(?:пробей|добавь)\s+(.+?)(?:\s+в чек|$)/i);

    if (!match || text.includes("меню")) return null;

    return {
        productName: capitalize(match[1].trim()),
    };
}

function capitalize(value) {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
}
