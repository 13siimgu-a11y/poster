import { Prisma } from "@prisma/client";
import { logger } from "../../config/logger.js";

export class ApiError extends Error {
    constructor(status, message, details = null) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

export function notFoundHandler(request, response, next) {
    next(new ApiError(404, `Route not found: ${request.method} ${request.originalUrl}`));
}

export function errorHandler(error, request, response, next) {
    if (response.headersSent) {
        next(error);
        return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        response.status(400).json({
            error: "Database request failed",
            code: error.code,
        });
        return;
    }

    const status = error.status || 500;
    if (status >= 500) {
        logger.error(error.message, { stack: error.stack });
    }

    response.status(status).json({
        error: error.message || "Internal server error",
        details: error.details || undefined,
    });
}
