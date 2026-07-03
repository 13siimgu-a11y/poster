import { Router } from "express";
import OpenAI from "openai";
import { env } from "../../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

export const aiRouter = Router();

const openai = new OpenAI({
    apiKey: env.openaiApiKey || "missing",
});

aiRouter.use(requireAuth);

aiRouter.post("/chat", asyncHandler(async (request, response) => {
    if (!env.openaiApiKey) {
        response.status(500).json({ reply: "OPENAI_API_KEY не настроен на сервере.", action: null });
        return;
    }

    const { message, context } = request.body;
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
            {
                role: "system",
                content: [
                    "Ты AI-помощник POS-системы ресторана.",
                    "Отвечай кратко, по делу и на русском языке.",
                    "Не выполняй критичные действия без подтверждения.",
                    "Если нужно действие, верни только JSON с полями reply и action.",
                    "Если действие не нужно, верни JSON с action:null.",
                    "Разрешенные action.type: bulk:execute, category:create, category:update, product:create, product:update, menu:template:create, receipt:add-product, employee:create, employee:update, ingredient:create, ingredient:update, table:create, table:update, order:create, inventory:analyze.",
                    "Для выполнения действия добавляй pending:true и понятный description.",
                    "category:create payload: {name, description?, color?, icon?, active?}.",
                    "product:create payload: {name, price, categoryName?, description?, costPrice?, quantity?, unit?, tags?}.",
                    "menu:template:create payload: {categories:[string], products:[{name, price, categoryName, description?}]}",
                    "receipt:add-product payload: {productName, quantity?, comment?}.",
                    "employee:create payload: {firstName, lastName?, role?, phone?, email?, pinCode?}.",
                    "ingredient:create payload: {name, quantity?, unit?, category?, minQuantity?, costPrice?}.",
                    "table:create payload: {name?, seats?, hallName?, status?}.",
                    "order:create payload: {tableName, guests?, productName?, quantity?, comments?}.",
                    "bulk:execute payload: {categories?:[], products?:[], ingredients?:[], tables?:[], employees?:[], updates?:[]} для больших промптов.",
                    "Для изменения существующих данных используй соответствующий *:update и payload с name/tableName/productId и patch или полями.",
                    "Если пользователь вставил большой список с несколькими разделами, предпочитай bulk:execute.",
                    "Не создавай удаления, оплату, возвраты, смену ролей и изменение цен без отдельного подтверждения пользователя.",
                ].join(" "),
            },
            {
                role: "user",
                content: JSON.stringify({ message, context }),
            },
        ],
        response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = safeParseJson(content);

    response.json({
        reply: parsed.reply || "Я обработал запрос.",
        action: parsed.action || null,
    });
}));

function safeParseJson(content) {
    try {
        return JSON.parse(content);
    } catch {
        return {
            reply: "Я понял запрос, но не смог подготовить действие. Попробуйте написать проще: например «создай категорию Десерты» или «добавь Капучино за 4».",
            action: null,
        };
    }
}
