import { Router } from "express";
import { prisma } from "../../prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireCompanyAccess } from "../../middleware/tenant.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { createCompanyCrudRouter } from "../shared/crudRouter.js";
import { emitCompanyEvent } from "../../sockets/index.js";

export const posRouter = Router({ mergeParams: true });

posRouter.use("/cash-registers", createCompanyCrudRouter("cashRegister", {
    orderBy: { createdAt: "desc" },
}));

posRouter.use(requireAuth, requireCompanyAccess);

posRouter.get("/receipts", asyncHandler(async (request, response) => {
    const receipts = await prisma.receipt.findMany({
        where: { companyId: request.params.companyId },
        include: { items: true, payments: true },
        orderBy: { createdAt: "desc" },
    });
    response.json(receipts);
}));

posRouter.post("/receipts", asyncHandler(async (request, response) => {
    const items = request.body.items || [];
    const subtotal = items.reduce((sum, item) => sum + Number(item.total ?? item.price * item.quantity), 0);
    const total = Number(request.body.total ?? subtotal - Number(request.body.discount || 0) + Number(request.body.surcharge || 0));

    const receipt = await prisma.receipt.create({
        data: {
            number: request.body.number || `R-${Date.now()}`,
            companyId: request.params.companyId,
            registerId: request.body.registerId,
            cashierId: request.user.id,
            customerId: request.body.customerId,
            status: request.body.status || "open",
            discount: Number(request.body.discount || 0),
            surcharge: Number(request.body.surcharge || 0),
            subtotal,
            total,
            comment: request.body.comment,
            items: {
                create: items.map((item) => ({
                    productId: item.productId,
                    name: item.name,
                    price: Number(item.price || 0),
                    quantity: Number(item.quantity || 1),
                    modifiers: item.modifiers,
                    comment: item.comment,
                    total: Number(item.total ?? item.price * item.quantity),
                })),
            },
        },
        include: { items: true, payments: true },
    });

    response.status(201).json(receipt);
}));

posRouter.patch("/receipts/:id", asyncHandler(async (request, response) => {
    const receipt = await assertReceipt(request.params.companyId, request.params.id);
    const updated = await prisma.receipt.update({
        where: { id: receipt.id },
        data: request.body,
        include: { items: true, payments: true },
    });
    response.json(updated);
}));

posRouter.post("/receipts/:id/pay", asyncHandler(async (request, response) => {
    const receipt = await assertReceipt(request.params.companyId, request.params.id);
    const io = request.app.get("io");

    const paidReceipt = await prisma.$transaction(async (tx) => {
        await tx.payment.create({
            data: {
                receiptId: receipt.id,
                type: request.body.type || "cash",
                amount: Number(request.body.amount ?? receipt.total),
                meta: request.body.meta,
            },
        });

        return tx.receipt.update({
            where: { id: receipt.id },
            data: { status: "paid", paidAt: new Date() },
            include: { items: true, payments: true },
        });
    });

    if (io) {
        emitCompanyEvent(io, request.params.companyId, "pos", "receipt:paid", paidReceipt);
        emitCompanyEvent(io, request.params.companyId, "kitchen", "receipt:paid", paidReceipt);
    }

    response.json(paidReceipt);
}));

posRouter.post("/receipts/:id/hold", asyncHandler(async (request, response) => {
    const receipt = await assertReceipt(request.params.companyId, request.params.id);
    const updated = await prisma.receipt.update({
        where: { id: receipt.id },
        data: { status: "held" },
        include: { items: true, payments: true },
    });
    response.json(updated);
}));

posRouter.post("/receipts/:id/refund", asyncHandler(async (request, response) => {
    const receipt = await assertReceipt(request.params.companyId, request.params.id);
    const refunded = await prisma.$transaction(async (tx) => {
        await tx.payment.create({
            data: {
                receiptId: receipt.id,
                type: "refund",
                amount: -Math.abs(Number(request.body.amount ?? receipt.total)),
                meta: request.body.meta,
            },
        });

        return tx.receipt.update({
            where: { id: receipt.id },
            data: { status: "refund" },
            include: { items: true, payments: true },
        });
    });

    response.json(refunded);
}));

posRouter.get("/receipts/:id/print", asyncHandler(async (request, response) => {
    const receipt = await prisma.receipt.findFirst({
        where: { id: request.params.id, companyId: request.params.companyId },
        include: { items: true, payments: true, company: true },
    });

    if (!receipt) {
        throw new ApiError(404, "Receipt not found");
    }

    response.json({
        title: receipt.company.name,
        receipt,
        printedAt: new Date().toISOString(),
    });
}));

async function assertReceipt(companyId, id) {
    const receipt = await prisma.receipt.findFirst({ where: { id, companyId } });
    if (!receipt) {
        throw new ApiError(404, "Receipt not found");
    }

    return receipt;
}
