import { Router } from "express";
import { prisma } from "../../prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireCompanyAccess } from "../../middleware/tenant.js";
import { ApiError } from "../../middleware/errorHandler.js";

function toCompanyData(request, extra = {}) {
    return {
        ...request.body,
        ...extra,
        companyId: request.params.companyId,
    };
}

export function createCompanyCrudRouter(modelName, options = {}) {
    const router = Router({ mergeParams: true });
    const model = prisma[modelName];

    if (!model) {
        throw new Error(`Unknown Prisma model: ${modelName}`);
    }

    router.use(requireAuth, requireCompanyAccess);

    router.get("/", asyncHandler(async (request, response) => {
        const records = await model.findMany({
            where: { companyId: request.params.companyId },
            orderBy: options.orderBy || { createdAt: "desc" },
        });
        response.json(records);
    }));

    router.post("/", asyncHandler(async (request, response) => {
        const data = options.createData
            ? await options.createData(request)
            : toCompanyData(request);
        const record = await model.create({ data });
        response.status(201).json(record);
    }));

    router.get("/:id", asyncHandler(async (request, response) => {
        const record = await model.findFirst({
            where: { id: request.params.id, companyId: request.params.companyId },
        });

        if (!record) {
            throw new ApiError(404, "Record not found");
        }

        response.json(record);
    }));

    router.patch("/:id", asyncHandler(async (request, response) => {
        const existing = await model.findFirst({
            where: { id: request.params.id, companyId: request.params.companyId },
        });

        if (!existing) {
            throw new ApiError(404, "Record not found");
        }

        const record = await model.update({
            where: { id: request.params.id },
            data: request.body,
        });
        response.json(record);
    }));

    router.delete("/:id", asyncHandler(async (request, response) => {
        const existing = await model.findFirst({
            where: { id: request.params.id, companyId: request.params.companyId },
        });

        if (!existing) {
            throw new ApiError(404, "Record not found");
        }

        await model.delete({ where: { id: request.params.id } });
        response.status(204).send();
    }));

    return router;
}
