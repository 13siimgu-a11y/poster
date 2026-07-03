import { Router } from "express";
import { prisma } from "../../prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireCompanyAccess } from "../../middleware/tenant.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { createCompanyCrudRouter } from "../shared/crudRouter.js";
import { emitCompanyEvent } from "../../sockets/index.js";

export const operationsRouter = Router({ mergeParams: true });

operationsRouter.use("/halls", createCompanyCrudRouter("hall"));
operationsRouter.use("/tables", createCompanyCrudRouter("restaurantTable"));
operationsRouter.use("/table-orders", createCompanyCrudRouter("tableOrder"));
operationsRouter.use("/reservations", createCompanyCrudRouter("reservation"));
operationsRouter.use("/ingredients", createCompanyCrudRouter("ingredient", {
    createData(request) {
        return {
            ...request.body,
            companyId: request.params.companyId,
            sku: request.body.sku || `ING-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
            unit: request.body.unit || "шт",
        };
    },
}));
operationsRouter.use("/recipes", createCompanyCrudRouter("recipe"));
operationsRouter.use("/suppliers", createCompanyCrudRouter("supplier"));
operationsRouter.use("/purchase-orders", createCompanyCrudRouter("purchaseOrder", {
    createData(request) {
        return {
            ...request.body,
            companyId: request.params.companyId,
            orderNumber: request.body.orderNumber || `PO-${Date.now()}`,
        };
    },
}));
operationsRouter.use("/supplier-returns", createCompanyCrudRouter("supplierReturn"));
operationsRouter.use("/employees", createCompanyCrudRouter("employee"));
operationsRouter.use("/positions", createCompanyCrudRouter("position"));
operationsRouter.use("/shifts", createCompanyCrudRouter("shift"));
operationsRouter.use("/customers", createCompanyCrudRouter("customer", {
    createData(request) {
        return {
            ...request.body,
            companyId: request.params.companyId,
            clientNumber: request.body.clientNumber || `C-${Date.now()}`,
            firstName: request.body.firstName || request.body.name || "Клиент",
        };
    },
}));
operationsRouter.use("/promo-codes", createCompanyCrudRouter("promoCode"));
operationsRouter.use("/loyalty-levels", createCompanyCrudRouter("loyaltyLevel"));

operationsRouter.use(requireAuth, requireCompanyAccess);

operationsRouter.post("/table-orders/:id/close", updateTableOrderStatus("closed", "order:updated"));
operationsRouter.post("/table-orders/:id/cancel", updateTableOrderStatus("cancelled", "order:updated"));

operationsRouter.get("/kitchen/orders", asyncHandler(async (request, response) => {
    const orders = await prisma.kitchenOrder.findMany({
        where: { companyId: request.params.companyId },
        include: { items: true },
        orderBy: { createdAt: "asc" },
    });
    response.json(orders);
}));

operationsRouter.post("/kitchen/orders/:id/accept", updateKitchenStatus("accepted", "acceptedAt"));
operationsRouter.post("/kitchen/orders/:id/start", updateKitchenStatus("cooking", "cookingStartedAt"));
operationsRouter.post("/kitchen/orders/:id/ready", updateKitchenStatus("ready", "readyAt"));
operationsRouter.post("/kitchen/orders/:id/serve", updateKitchenStatus("served", "servedAt"));

operationsRouter.post("/ingredients/:id/income", stockMovement("income"));
operationsRouter.post("/ingredients/:id/write-off", stockMovement("writeoff"));
operationsRouter.post("/ingredients/:id/audit", asyncHandler(async (request, response) => {
    const ingredient = await getIngredient(request);
    const actualQuantity = Number(request.body.actualQuantity ?? ingredient.quantity);
    const audit = await prisma.$transaction(async (tx) => {
        const record = await tx.inventoryAudit.create({
            data: {
                companyId: request.params.companyId,
                ingredientId: ingredient.id,
                expectedQuantity: ingredient.quantity,
                actualQuantity,
                difference: actualQuantity - ingredient.quantity,
                userId: request.user.id,
            },
        });

        await tx.ingredient.update({
            where: { id: ingredient.id },
            data: { quantity: actualQuantity },
        });

        return record;
    });

    response.status(201).json(audit);
}));

operationsRouter.get("/stock-movements", asyncHandler(async (request, response) => {
    const movements = await prisma.stockMovement.findMany({
        where: { companyId: request.params.companyId },
        orderBy: { createdAt: "desc" },
    });
    response.json(movements);
}));

operationsRouter.post("/purchase-orders/:id/receive", asyncHandler(async (request, response) => {
    await assertCompanyRecord("purchaseOrder", request.params.companyId, request.params.id, "Purchase order not found");
    const order = await prisma.purchaseOrder.update({
        where: { id: request.params.id },
        data: { status: "received" },
        include: { lines: true },
    });

    const io = request.app.get("io");
    if (io) {
        emitCompanyEvent(io, request.params.companyId, "inventory", "purchase:received", order);
    }

    response.json(order);
}));

operationsRouter.post("/shifts/open-by-pin", asyncHandler(async (request, response) => {
    const employee = await prisma.employee.findFirst({
        where: {
            companyId: request.params.companyId,
            pinCode: request.body.pinCode,
        },
    });

    if (!employee) {
        throw new ApiError(404, "Employee not found for PIN");
    }

    const shift = await prisma.shift.create({
        data: {
            companyId: request.params.companyId,
            employeeId: employee.id,
            date: new Date(),
            startTime: new Date(),
            status: "opened",
        },
    });

    response.status(201).json(shift);
}));

operationsRouter.post("/shifts/:id/close", asyncHandler(async (request, response) => {
    await assertCompanyRecord("shift", request.params.companyId, request.params.id, "Shift not found");
    const shift = await prisma.shift.update({
        where: { id: request.params.id },
        data: {
            endTime: new Date(),
            status: "closed",
            comment: request.body.comment,
        },
    });
    response.json(shift);
}));

operationsRouter.get("/customers/:id/profile", asyncHandler(async (request, response) => {
    const customer = await prisma.customer.findFirst({
        where: { id: request.params.id, companyId: request.params.companyId },
        include: {
            notes: true,
            visitsList: true,
            bonusOperations: true,
            cards: true,
            loyaltyLevel: true,
        },
    });

    if (!customer) {
        throw new ApiError(404, "Customer not found");
    }

    response.json(customer);
}));

operationsRouter.post("/customers/:id/bonus/add", bonusOperation("add"));
operationsRouter.post("/customers/:id/bonus/redeem", bonusOperation("redeem"));
operationsRouter.post("/customers/:id/blacklist", customerBlacklist(true));
operationsRouter.post("/customers/:id/restore", customerBlacklist(false));

function updateTableOrderStatus(status, event) {
    return asyncHandler(async (request, response) => {
        const existing = await assertCompanyRecord("tableOrder", request.params.companyId, request.params.id, "Table order not found");
        const order = await prisma.tableOrder.update({
            where: { id: existing.id },
            data: {
                status,
                closedAt: status === "closed" ? new Date() : undefined,
            },
        });

        const io = request.app.get("io");
        if (io) {
            emitCompanyEvent(io, request.params.companyId, "floor", event, order);
        }

        response.json(order);
    });
}

function updateKitchenStatus(status, timestampField) {
    return asyncHandler(async (request, response) => {
        const existing = await assertCompanyRecord("kitchenOrder", request.params.companyId, request.params.id, "Kitchen order not found");
        const order = await prisma.kitchenOrder.update({
            where: { id: existing.id },
            data: {
                status,
                [timestampField]: new Date(),
            },
            include: { items: true },
        });

        const io = request.app.get("io");
        if (io) {
            emitCompanyEvent(io, request.params.companyId, "kitchen", "kitchen:status-changed", order);
        }

        response.json(order);
    });
}

function stockMovement(type) {
    return asyncHandler(async (request, response) => {
        const ingredient = await getIngredient(request);
        const quantity = Number(request.body.quantity || 0);
        const delta = type === "writeoff" ? -Math.abs(quantity) : Math.abs(quantity);
        const balanceAfter = ingredient.quantity + delta;

        const movement = await prisma.$transaction(async (tx) => {
            await tx.ingredient.update({
                where: { id: ingredient.id },
                data: { quantity: balanceAfter },
            });

            return tx.stockMovement.create({
                data: {
                    companyId: request.params.companyId,
                    ingredientId: ingredient.id,
                    type,
                    quantity: delta,
                    reason: request.body.reason,
                    userId: request.user.id,
                    balanceAfter,
                },
            });
        });

        response.status(201).json(movement);
    });
}

async function getIngredient(request) {
    const ingredient = await prisma.ingredient.findFirst({
        where: { id: request.params.id, companyId: request.params.companyId },
    });

    if (!ingredient) {
        throw new ApiError(404, "Ingredient not found");
    }

    return ingredient;
}

function bonusOperation(type) {
    return asyncHandler(async (request, response) => {
        const existing = await assertCompanyRecord("customer", request.params.companyId, request.params.id, "Customer not found");
        const amount = Math.abs(Number(request.body.amount || 0));
        const signedAmount = type === "redeem" ? -amount : amount;

        const customer = await prisma.customer.update({
            where: { id: existing.id },
            data: {
                bonusBalance: { increment: signedAmount },
                bonusOperations: {
                    create: {
                        type,
                        amount: signedAmount,
                        reason: request.body.reason,
                    },
                },
            },
            include: { bonusOperations: true },
        });

        response.json(customer);
    });
}

function customerBlacklist(value) {
    return asyncHandler(async (request, response) => {
        const existing = await assertCompanyRecord("customer", request.params.companyId, request.params.id, "Customer not found");
        const customer = await prisma.customer.update({
            where: { id: existing.id },
            data: {
                blacklist: value,
                blacklistEntries: value
                    ? { create: { reason: request.body.reason || "Manual blacklist", comment: request.body.comment } }
                    : undefined,
            },
        });

        response.json(customer);
    });
}

async function assertCompanyRecord(modelName, companyId, id, message) {
    const record = await prisma[modelName].findFirst({
        where: { id, companyId },
    });

    if (!record) {
        throw new ApiError(404, message);
    }

    return record;
}
