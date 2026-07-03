import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireCompanyAccess } from "../../middleware/tenant.js";
import { validate } from "../../middleware/validate.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const companiesRouter = Router();

const companySchema = z.object({
    name: z.string().min(2),
    legalName: z.string().optional(),
    businessType: z.string().optional(),
    description: z.string().optional(),
    logo: z.string().optional(),
    banner: z.string().optional(),
    address: z.any().optional(),
    contacts: z.any().optional(),
    settings: z.any().optional(),
});

companiesRouter.use(requireAuth);

companiesRouter.get("/current", asyncHandler(async (request, response) => {
    if (!request.user.companyId) {
        response.json(null);
        return;
    }

    const company = await prisma.company.findUnique({ where: { id: request.user.companyId } });
    response.json(company);
}));

companiesRouter.post("/", validate(companySchema), asyncHandler(async (request, response) => {
    const company = await prisma.company.create({
        data: {
            ...request.body,
            ownerId: request.user.id,
            members: {
                connect: { id: request.user.id },
            },
        },
    });

    await prisma.user.update({
        where: { id: request.user.id },
        data: { companyId: company.id },
    });

    response.status(201).json(company);
}));

companiesRouter.get("/:companyId", requireCompanyAccess, asyncHandler(async (request, response) => {
    const company = await prisma.company.findUnique({ where: { id: request.params.companyId } });

    if (!company) {
        throw new ApiError(404, "Company not found");
    }

    response.json(company);
}));

companiesRouter.patch("/:companyId", requireCompanyAccess, asyncHandler(async (request, response) => {
    const company = await prisma.company.update({
        where: { id: request.params.companyId },
        data: request.body,
    });
    response.json(company);
}));

companiesRouter.delete("/:companyId", requireCompanyAccess, asyncHandler(async (request, response) => {
    await prisma.company.delete({ where: { id: request.params.companyId } });
    response.status(204).send();
}));
