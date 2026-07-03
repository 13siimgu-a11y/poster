import { Router } from "express";
import { z } from "zod";
import { env } from "../../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
    loginUser,
    publicUser,
    refreshAuthToken,
    registerUser,
    resetPasswordByEmail,
    revokeRefreshToken,
} from "./auth.service.js";

export const authRouter = Router();

const registerSchema = z.object({
    username: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(["admin", "manager", "cashier", "kitchen", "waiter", "storekeeper", "accountant", "bartender"]).optional(),
});

const loginSchema = z.object({
    usernameOrEmail: z.string().min(1),
    password: z.string().min(1),
});

const resetPasswordSchema = z.object({
    email: z.string().email(),
});

function setRefreshCookie(response, refreshToken) {
    response.cookie(env.refreshCookieName, refreshToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "lax",
        path: "/api/auth",
    });
}

authRouter.post("/register", validate(registerSchema), asyncHandler(async (request, response) => {
    const result = await registerUser(request.body);
    setRefreshCookie(response, result.refreshToken);
    response.status(201).json({ accessToken: result.accessToken, user: result.user });
}));

authRouter.post("/login", validate(loginSchema), asyncHandler(async (request, response) => {
    const result = await loginUser(request.body, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
    });
    setRefreshCookie(response, result.refreshToken);
    response.json({ accessToken: result.accessToken, user: result.user });
}));

authRouter.post("/reset-password", validate(resetPasswordSchema), asyncHandler(async (request, response) => {
    const result = await resetPasswordByEmail(request.body.email);
    response.json(result);
}));

authRouter.post("/refresh", asyncHandler(async (request, response) => {
    const result = await refreshAuthToken(request.cookies?.[env.refreshCookieName]);
    response.json(result);
}));

authRouter.post("/logout", asyncHandler(async (request, response) => {
    await revokeRefreshToken(request.cookies?.[env.refreshCookieName]);
    response.clearCookie(env.refreshCookieName, { path: "/api/auth" });
    response.status(204).send();
}));

authRouter.get("/me", requireAuth, asyncHandler(async (request, response) => {
    response.json({ user: publicUser(request.user) });
}));
