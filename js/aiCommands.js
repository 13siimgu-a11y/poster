import { loadCategories } from "./categories.js";
import { formatMoney } from "./currency.js";
import { checkLowStock } from "./inventory.js";
import { loadReceipts } from "./pos.js";
import { loadProducts } from "./products.js";

export function generateMenu(type = "coffee") {
    if (type.includes("итальян")) {
        return {
            categories: ["Паста", "Пицца", "Салаты", "Десерты", "Напитки"],
            products: [
                { name: "Пицца Маргарита", categoryName: "Пицца", price: 12, description: "Томатный соус, моцарелла, базилик" },
                { name: "Паста Карбонара", categoryName: "Паста", price: 11, description: "Паста, сливочный соус, бекон" },
                { name: "Тирамису", categoryName: "Десерты", price: 7, description: "Классический итальянский десерт" },
                { name: "Лимонад", categoryName: "Напитки", price: 4, description: "Домашний лимонад" },
            ],
        };
    }

    return {
        categories: ["Кофе", "Чай", "Десерты", "Холодные напитки"],
        products: [
            { name: "Капучино", categoryName: "Кофе", price: 4, description: "Эспрессо, молоко, молочная пена" },
            { name: "Латте", categoryName: "Кофе", price: 4.5, description: "Мягкий кофейный напиток с молоком" },
            { name: "Американо", categoryName: "Кофе", price: 3, description: "Эспрессо с горячей водой" },
            { name: "Чизкейк", categoryName: "Десерты", price: 6, description: "Классический сливочный чизкейк" },
        ],
    };
}

export function generateProducts(prompt) {
    return generateMenu(prompt).products;
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
    const bulkRequest = parseBulkRequest(message);
    const categoryListRequest = parseCategoryListRequest(message);
    const categoryProductsRequest = parseCategoryProductsRequest(message);
    const updateRequest = parseUpdateRequest(message, context);
    const productRequest = parseProductCreateRequest(text);
    const categoryRequest = parseCategoryCreateRequest(text);
    const ingredientRequest = parseIngredientCreateRequest(text);
    const tableRequest = parseTableCreateRequest(text);
    const orderRequest = parseOrderCreateRequest(text);
    const priceRequest = parsePriceUpdateRequest(text, context);
    const receiptRequest = parseReceiptAddRequest(text);

    if (text.includes("заканч") || text.includes("ниже минимума")) {
        return { reply: analyzeInventory(context.companyId), action: null };
    }

    if (bulkRequest) {
        const total = countBulkItems(bulkRequest);
        return {
            reply: `Я разобрал большой промпт: найдено объектов для создания/изменения: ${total}. Напишите «подтверждаю», чтобы применить всё через API и базу.`,
            action: {
                type: "bulk:execute",
                pending: true,
                description: `Выполнить большой промпт: ${total} объектов.`,
                payload: bulkRequest,
            },
        };
    }

    if (updateRequest) {
        return {
            reply: `Я подготовил изменение: ${updateRequest.description}. Напишите «подтверждаю», чтобы сохранить в базе.`,
            action: {
                ...updateRequest.action,
                pending: true,
                description: updateRequest.description,
            },
        };
    }

    if (categoryListRequest) {
        return {
            reply: `Я подготовил ${categoryListRequest.categories.length} категорий: ${categoryListRequest.categories.join(", ")}. Напишите «подтверждаю», чтобы создать их в базе.`,
            action: {
                type: "menu:template:create",
                pending: true,
                description: `Создать категории: ${categoryListRequest.categories.join(", ")}.`,
                payload: {
                    categories: categoryListRequest.categories,
                    products: [],
                },
            },
        };
    }

    if (categoryProductsRequest) {
        return {
            reply: `Я подготовил ${categoryProductsRequest.products.length} товаров для категории «${categoryProductsRequest.categoryName}»: ${categoryProductsRequest.products.map((item) => `${item.name} ${item.price}`).join(", ")}. Напишите «подтверждаю», чтобы добавить их в меню и базу.`,
            action: {
                type: "menu:template:create",
                pending: true,
                description: `Добавить товары в категорию «${categoryProductsRequest.categoryName}».`,
                payload: {
                    categories: [categoryProductsRequest.categoryName],
                    products: categoryProductsRequest.products,
                },
            },
        };
    }

    if (categoryRequest) {
        return {
            reply: `Я подготовил категорию «${categoryRequest.name}». Напишите «подтверждаю», чтобы создать её в базе и меню.`,
            action: {
                type: "category:create",
                pending: true,
                description: `Создать категорию «${categoryRequest.name}».`,
                payload: categoryRequest,
            },
        };
    }

    if (ingredientRequest) {
        return {
            reply: `Я подготовил ингредиент «${ingredientRequest.name}» с остатком ${ingredientRequest.quantity} ${ingredientRequest.unit}. Напишите «подтверждаю», чтобы добавить на склад.`,
            action: {
                type: "ingredient:create",
                pending: true,
                description: `Создать ингредиент «${ingredientRequest.name}» на складе.`,
                payload: ingredientRequest,
            },
        };
    }

    if (tableRequest) {
        return {
            reply: `Я подготовил стол «${tableRequest.name}» на ${tableRequest.seats} мест. Напишите «подтверждаю», чтобы создать его в зале.`,
            action: {
                type: "table:create",
                pending: true,
                description: `Создать стол «${tableRequest.name}».`,
                payload: tableRequest,
            },
        };
    }

    if (orderRequest) {
        return {
            reply: `Я подготовил заказ для «${orderRequest.tableName}». Напишите «подтверждаю», чтобы открыть заказ.`,
            action: {
                type: "order:create",
                pending: true,
                description: `Создать заказ для «${orderRequest.tableName}».`,
                payload: orderRequest,
            },
        };
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
            reply: `Могу создать меню: категории ${generated.categories.join(", ")}. Товары: ${generated.products.map((item) => item.name).join(", ")}. Напишите «подтверждаю», чтобы добавить это в базу.`,
            action: {
                type: "menu:template:create",
                pending: true,
                description: "Создать готовое меню с категориями и товарами.",
                payload: generated,
            },
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

function parseCategoryCreateRequest(text) {
    const match = text.match(/(?:создай|добавь)\s+категори[юя]\s+(.+?)(?:$| с | для )/i);
    if (!match) return null;

    return {
        name: capitalize(match[1].replace(/в меню/g, "").trim()),
        description: "Создано AI",
        color: "#3B82F6",
        icon: "🍽",
        active: true,
    };
}

function parseCategoryListRequest(message) {
    const match = message.match(/(?:создай|добавь)\s+категори(?:и|й)\s*(?:такие|:)?\s+(.+)$/i);
    if (!match) return null;

    const categories = match[1]
        .split(",")
        .map((name) => name.trim())
        .map((name) => name.replace(/[.;]+$/g, "").trim())
        .filter(Boolean);

    return categories.length > 1 ? { categories } : null;
}

function parseCategoryProductsRequest(message) {
    const match = message.match(/(?:добавь|создай|закинь|добавить).{0,40}?в\s+категори[юя]\s+([^,]+?)\s+(.+)$/i);
    if (!match) return null;

    const categoryName = match[1]
        .replace(/товары|позиции|напитки|меню/gi, "")
        .trim();
    const productsText = match[2]
        .replace(/^товары\s*/i, "")
        .replace(/^позиции\s*/i, "")
        .trim();
    const products = productsText
        .split(",")
        .map(parsePricedProduct)
        .filter(Boolean)
        .map((product) => ({
            ...product,
            categoryName,
            description: `Добавлено AI: ${product.name}`,
            costPrice: 0,
            quantity: 999,
            unit: "шт",
            active: true,
            posVisible: true,
            qrVisible: true,
        }));

    return categoryName && products.length ? { categoryName, products } : null;
}

function parseBulkRequest(message) {
    const lines = message
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length < 2) return null;

    const payload = {
        categories: [],
        products: [],
        ingredients: [],
        tables: [],
        employees: [],
        updates: [],
    };
    let section = "";
    let productCategory = "";

    lines.forEach((line) => {
        const sectionMatch = line.match(/^(categories|категории|products|товары|меню|ingredients|склад|ингредиенты|tables|столы|employees|сотрудники|персонал|updates|изменения)\s*[:\-]\s*(.*)$/i);
        const categoryProductsLine = line.match(/^([a-zа-я0-9 /_-]+)\s*[:\-]\s*(.+)$/i);

        if (sectionMatch) {
            section = normalizeSection(sectionMatch[1]);
            const rest = sectionMatch[2]?.trim();
            if (rest) {
                appendBulkLine(payload, section, rest, productCategory);
            }
            return;
        }

        if (categoryProductsLine && parsePricedList(categoryProductsLine[2]).length) {
            productCategory = categoryProductsLine[1].trim();
            parsePricedList(categoryProductsLine[2]).forEach((product) => {
                payload.products.push({
                    ...product,
                    categoryName: productCategory,
                    description: `Добавлено AI: ${product.name}`,
                    quantity: 999,
                    unit: "шт",
                });
            });
            return;
        }

        appendBulkLine(payload, section, line, productCategory);
    });

    return countBulkItems(payload) ? payload : null;
}

function appendBulkLine(payload, section, line, productCategory = "") {
    if (section === "categories") {
        payload.categories.push(...splitList(line));
        return;
    }

    if (section === "products") {
        parsePricedList(line).forEach((product) => {
            payload.products.push({
                ...product,
                categoryName: product.categoryName || productCategory || "Блюда",
                description: `Добавлено AI: ${product.name}`,
                quantity: 999,
                unit: "шт",
            });
        });
        return;
    }

    if (section === "ingredients") {
        splitList(line).map(parseIngredientItem).filter(Boolean).forEach((ingredient) => payload.ingredients.push(ingredient));
        return;
    }

    if (section === "tables") {
        splitList(line).map(parseTableItem).filter(Boolean).forEach((table) => payload.tables.push(table));
        return;
    }

    if (section === "employees") {
        splitList(line).map(parseEmployeeItem).filter(Boolean).forEach((employee) => payload.employees.push(employee));
        return;
    }

    if (section === "updates") {
        const update = parseUpdateRequest(line, { companyId: "", pageData: {} });
        if (update?.action) payload.updates.push(update.action);
    }
}

function parsePricedList(value) {
    return value.split(",").map(parsePricedProduct).filter(Boolean);
}

function parseIngredientItem(value) {
    const match = value.trim().match(/^(.+?)(?:\s+(\d+(?:[.,]\d+)?)\s*(кг|г|л|мл|шт|pcs|kg|g|l|ml)?)?$/i);
    if (!match) return null;
    return {
        name: capitalize(match[1].trim()),
        quantity: Number((match[2] || 0).replace(",", ".")),
        unit: match[3] || "шт",
        category: "Прочее",
        minQuantity: 0,
        costPrice: 0,
    };
}

function parseTableItem(value) {
    const match = value.trim().match(/(?:стол\s*)?(?:№|номер)?\s*(\d+)?(?:\s+на\s+(\d+)\s+мест)?/i);
    if (!match) return null;
    return {
        name: match[1] ? `Стол №${match[1]}` : capitalize(value.trim()),
        seats: Number(match[2] || 4),
        hallName: "Основной зал",
        status: "free",
    };
}

function parseEmployeeItem(value) {
    const [namePart, rolePart] = value.split("-");
    const names = namePart.trim().split(/\s+/);
    return {
        firstName: capitalize(names[0] || "Сотрудник"),
        lastName: names.slice(1).join(" "),
        role: normalizeRole(rolePart || ""),
        status: "working",
    };
}

function parseUpdateRequest(message, context) {
    const text = message.toLowerCase();
    const renameCategory = message.match(/переименуй\s+категори[юя]\s+(.+?)\s+в\s+(.+)$/i);
    if (renameCategory) {
        return {
            description: `переименовать категорию «${renameCategory[1]}» в «${renameCategory[2]}»`,
            action: {
                type: "category:update",
                payload: { name: renameCategory[1].trim(), nextName: renameCategory[2].trim() },
            },
        };
    }

    const productPrice = message.match(/(?:измени|поменяй|обнови|поставь)\s+цен[уы]\s+(.+?)\s+(?:на\s+)?(\d+(?:[.,]\d+)?)$/i);
    if (productPrice) {
        const product = loadProducts(context.companyId).find((item) => item.name.toLowerCase().includes(productPrice[1].trim().toLowerCase()));
        if (!product) return null;
        return {
            description: `изменить цену товара «${product.name}» на ${productPrice[2]}`,
            action: {
                type: "product:update",
                payload: { productId: product.id, patch: { price: Number(productPrice[2].replace(",", ".")) } },
            },
        };
    }

    const ingredientQuantity = message.match(/(?:измени|поменяй|обнови|поставь)\s+(?:остаток|количество)\s+(.+?)\s+(?:на\s+)?(\d+(?:[.,]\d+)?)$/i);
    if (ingredientQuantity) {
        return {
            description: `изменить остаток ингредиента «${ingredientQuantity[1]}» на ${ingredientQuantity[2]}`,
            action: {
                type: "ingredient:update",
                payload: { name: ingredientQuantity[1].trim(), quantity: Number(ingredientQuantity[2].replace(",", ".")) },
            },
        };
    }

    const tableStatus = text.match(/(?:измени|поставь|сделай)\s+стол\s*(?:№|номер)?\s*(\d+).*(свобод|free|занят|occupied|уборк|cleaning)/i);
    if (tableStatus) {
        return {
            description: `изменить статус стола №${tableStatus[1]}`,
            action: {
                type: "table:update",
                payload: { name: `Стол №${tableStatus[1]}`, status: normalizeTableStatus(tableStatus[2]) },
            },
        };
    }

    return null;
}

function normalizeSection(section) {
    const value = section.toLowerCase();
    if (["categories", "категории"].includes(value)) return "categories";
    if (["products", "товары", "меню"].includes(value)) return "products";
    if (["ingredients", "склад", "ингредиенты"].includes(value)) return "ingredients";
    if (["tables", "столы"].includes(value)) return "tables";
    if (["employees", "сотрудники", "персонал"].includes(value)) return "employees";
    if (["updates", "изменения"].includes(value)) return "updates";
    return "";
}

function splitList(value) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function countBulkItems(payload) {
    return ["categories", "products", "ingredients", "tables", "employees", "updates"]
        .reduce((sum, key) => sum + (payload[key]?.length || 0), 0);
}

function normalizeRole(value) {
    const role = value.trim().toLowerCase();
    if (role.includes("касс")) return "cashier";
    if (role.includes("бар")) return "bartender";
    if (role.includes("кух") || role.includes("повар")) return "kitchen";
    if (role.includes("менедж")) return "manager";
    return "waiter";
}

function normalizeTableStatus(value) {
    if (value.includes("занят") || value.includes("occupied")) return "occupied";
    if (value.includes("уборк") || value.includes("cleaning")) return "cleaning";
    return "free";
}

function parsePricedProduct(value) {
    const normalized = value
        .replace(/\b(?:gel|лари|₾|стоит|цена)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    const match = normalized.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/);
    if (!match) return null;

    return {
        name: capitalize(match[1].trim()),
        price: Number(match[2].replace(",", ".")),
    };
}

function parseIngredientCreateRequest(text) {
    const match = text.match(/(?:добавь|создай)\s+ингредиент\s+(.+?)(?:\s+(\d+(?:[.,]\d+)?)\s*(кг|г|л|мл|шт)?)?$/i);
    if (!match) return null;

    return {
        name: capitalize(match[1].trim()),
        quantity: Number((match[2] || 0).replace?.(",", ".") || 0),
        unit: match[3] || "шт",
        category: "Прочее",
        minQuantity: 0,
        costPrice: 0,
    };
}

function parseTableCreateRequest(text) {
    const match = text.match(/(?:создай|добавь)\s+стол\s*(?:№|номер)?\s*(\d+)?(?:\s+на\s+(\d+)\s+мест)?/i);
    if (!match) return null;

    const number = match[1] || "";
    return {
        name: number ? `Стол №${number}` : "Стол №1",
        seats: Number(match[2] || 4),
        hallName: "Основной зал",
        status: "free",
    };
}

function parseOrderCreateRequest(text) {
    const match = text.match(/(?:создай|открой)\s+заказ\s+на\s+стол\s*(?:№|номер)?\s*(\d+)(?:\s+(.+))?/i);
    if (!match) return null;

    const rest = (match[2] || "").replace(/с\s+/i, "").trim();
    return {
        tableName: `Стол №${match[1]}`,
        guests: 1,
        productName: rest || "",
        quantity: 1,
        comments: "Создано AI",
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
    const match = text.match(/(?:пробей|добавь)\s+(?:(\d+)\s+)?(.+?)(?:\s+в чек|$)/i);

    if (!match || text.includes("меню")) return null;

    return {
        quantity: Number(match[1] || 1),
        productName: capitalize(match[2].trim()),
    };
}

function capitalize(value) {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
}
