import { ApiError } from "./errorHandler.js";

export function requireCompanyAccess(request, response, next) {
    const { companyId } = request.params;

    if (!companyId) {
        next();
        return;
    }

    if (request.user?.role === "super_admin" || request.user?.companyId === companyId) {
        next();
        return;
    }

    next(new ApiError(403, "Company access denied"));
}
