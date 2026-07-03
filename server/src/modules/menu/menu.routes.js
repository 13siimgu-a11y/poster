import { Router } from "express";
import { prisma } from "../../prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireCompanyAccess } from "../../middleware/tenant.js";
import { createCompanyCrudRouter } from "../shared/crudRouter.js";

export const menuRouter = Router({ mergeParams: true });

menuRouter.use("/categories", createCompanyCrudRouter("category", {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
}));

menuRouter.use("/products", createCompanyCrudRouter("product", {
    orderBy: [{ name: "asc" }],
    createData(request) {
        return {
            ...request.body,
            companyId: request.params.companyId,
            sku: request.body.sku || `SKU-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        };
    },
}));

menuRouter.post("/products/import", requireAuth, requireCompanyAccess, asyncHandler(async (request, response) => {
    const items = Array.isArray(request.body?.items) ? request.body.items : [];
    const products = await prisma.$transaction(items.map((item) => prisma.product.create({
        data: {
            ...item,
            companyId: request.params.companyId,
            sku: item.sku || `SKU-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
        },
    })));

    response.status(201).json({ imported: products.length, products });
}));

menuRouter.get("/products/export", requireAuth, requireCompanyAccess, asyncHandler(async (request, response) => {
    const products = await prisma.product.findMany({
        where: { companyId: request.params.companyId },
        orderBy: { name: "asc" },
    });

    response.json(products);
}));
