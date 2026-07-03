import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { prisma } from "../prisma.js";
import { ApiError } from "./errorHandler.js";

export function signAccessToken(user) {
    return jwt.sign({
        sub: user.id,
        role: user.role,
        companyId: user.companyId || null,
    }, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpires });
}

export function signRefreshToken(user) {
    return jwt.sign({ sub: user.id }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpires });
}

export async function requireAuth(request, response, next) {
    try {
        const header = request.headers.authorization || "";
        const [, token] = header.split(" ");

        if (!token) {
            throw new ApiError(401, "Authentication required");
        }

        const payload = jwt.verify(token, env.jwtAccessSecret);
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });

        if (!user || user.status === "blocked") {
            throw new ApiError(401, "Invalid user session");
        }

        request.user = user;
        next();
    } catch (error) {
        next(error.status ? error : new ApiError(401, "Invalid or expired access token"));
    }
}

export function requireRole(...roles) {
    return (request, response, next) => {
        if (!roles.includes(request.user?.role)) {
            next(new ApiError(403, "Insufficient permissions"));
            return;
        }

        next();
    };
}
