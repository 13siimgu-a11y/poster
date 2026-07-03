import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../../prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { publicUser } from "../auth/auth.service.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/me", asyncHandler(async (request, response) => {
    response.json({ user: publicUser(request.user) });
}));

usersRouter.patch("/me", asyncHandler(async (request, response) => {
    const data = { ...request.body };
    if (data.password) {
        data.passwordHash = await bcrypt.hash(data.password, 12);
        delete data.password;
    }

    const user = await prisma.user.update({
        where: { id: request.user.id },
        data,
    });

    response.json({ user: publicUser(user) });
}));
