import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../../prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("super_admin", "admin"));

adminRouter.get("/users", asyncHandler(async (request, response) => {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        include: { company: true, subscriptions: true },
    });
    response.json(users.map(({ passwordHash, ...user }) => user));
}));

adminRouter.patch("/users/:id", asyncHandler(async (request, response) => {
    const data = { ...request.body };
    if (data.password) {
        data.passwordHash = await bcrypt.hash(data.password, 12);
        delete data.password;
    }

    const user = await prisma.user.update({
        where: { id: request.params.id },
        data,
    });
    const { passwordHash, ...safeUser } = user;
    response.json(safeUser);
}));

adminRouter.delete("/users/:id", asyncHandler(async (request, response) => {
    await prisma.user.delete({ where: { id: request.params.id } });
    response.status(204).send();
}));

adminRouter.get("/plans", asyncHandler(async (request, response) => {
    const plans = await prisma.plan.findMany({ orderBy: { price: "asc" } });
    response.json(plans);
}));

adminRouter.post("/plans", asyncHandler(async (request, response) => {
    const plan = await prisma.plan.create({ data: request.body });
    response.status(201).json(plan);
}));

adminRouter.patch("/plans/:id", asyncHandler(async (request, response) => {
    const plan = await prisma.plan.update({
        where: { id: request.params.id },
        data: request.body,
    });
    response.json(plan);
}));

adminRouter.delete("/plans/:id", asyncHandler(async (request, response) => {
    await prisma.plan.delete({ where: { id: request.params.id } });
    response.status(204).send();
}));

adminRouter.post("/users/:id/subscription/grant", asyncHandler(async (request, response) => {
    const subscription = await prisma.subscription.create({
        data: {
            userId: request.params.id,
            planId: request.body.planId,
            planName: request.body.planName || "Manual",
            price: Number(request.body.price || 0),
            status: "active",
            lifetime: Boolean(request.body.lifetime),
            endDate: request.body.endDate ? new Date(request.body.endDate) : null,
        },
    });
    response.status(201).json(subscription);
}));

adminRouter.post("/users/:id/subscription/extend", asyncHandler(async (request, response) => {
    const subscription = await prisma.subscription.findFirst({
        where: { userId: request.params.id, status: "active" },
        orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
        throw new ApiError(404, "Active subscription not found");
    }

    const days = Number(request.body.days || 30);
    const endDate = subscription?.endDate || new Date();
    endDate.setDate(endDate.getDate() + days);

    const updated = await prisma.subscription.update({
        where: { id: subscription.id },
        data: { endDate },
    });
    response.json(updated);
}));

adminRouter.delete("/users/:id/subscription", asyncHandler(async (request, response) => {
    await prisma.subscription.updateMany({
        where: { userId: request.params.id, status: "active" },
        data: { status: "cancelled" },
    });
    response.status(204).send();
}));

adminRouter.get("/statistics", asyncHandler(async (request, response) => {
    const [users, companies, receipts, subscriptions] = await Promise.all([
        prisma.user.count(),
        prisma.company.count(),
        prisma.receipt.count(),
        prisma.subscription.count({ where: { status: "active" } }),
    ]);

    response.json({ users, companies, receipts, activeSubscriptions: subscriptions });
}));

adminRouter.get("/logs", asyncHandler(async (request, response) => {
    const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    response.json(logs);
}));
