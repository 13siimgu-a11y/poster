import { Router } from "express";
import OpenAI from "openai";
import { env } from "../../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const aiRouter = Router();

const openai = new OpenAI({
    apiKey: env.openaiApiKey || "missing",
});

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
                    "Если нужно действие, верни JSON с полями reply и action.",
                    "Если действие не нужно, верни JSON с action:null.",
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
    const parsed = JSON.parse(content);

    response.json({
        reply: parsed.reply || "Я обработал запрос.",
        action: parsed.action || null,
    });
}));
