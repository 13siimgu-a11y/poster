import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../../../config/env.js";
import { prisma } from "../../prisma.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { signAccessToken, signRefreshToken } from "../../middleware/auth.js";

const SALT_ROUNDS = 12;
const DEFAULT_SUPER_ADMIN_USERNAME = "zzzret";
const DEFAULT_SUPER_ADMIN_EMAIL = "creator@posposter.local";
const DEFAULT_SUPER_ADMIN_PASSWORD = "1r4d945i";

function publicUser(user) {
    if (!user) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

export async function registerUser(data) {
    await ensureDefaultSuperAdmin();

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { username: data.username },
                { email: data.email.toLowerCase() },
            ],
        },
    });

    if (existingUser) {
        throw new ApiError(409, "User with this username or email already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    const user = await prisma.user.create({
        data: {
            username: data.username,
            email: data.email.toLowerCase(),
            passwordHash,
            role: data.role || "manager",
        },
    });

    return issueAuthTokens(user);
}

export async function loginUser(data, meta = {}) {
    await ensureDefaultSuperAdmin();

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { username: data.usernameOrEmail },
                { email: data.usernameOrEmail.toLowerCase() },
            ],
        },
    });

    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
        throw new ApiError(401, "Invalid username/email or password");
    }

    if (user.status === "blocked") {
        throw new ApiError(403, "User account is blocked");
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });

    return issueAuthTokens(user, meta);
}

async function ensureDefaultSuperAdmin() {
    const existing = await prisma.user.findFirst({
        where: {
            OR: [
                { username: DEFAULT_SUPER_ADMIN_USERNAME },
                { email: DEFAULT_SUPER_ADMIN_EMAIL },
            ],
        },
    });

    if (existing) {
        return existing;
    }

    const passwordHash = await bcrypt.hash(DEFAULT_SUPER_ADMIN_PASSWORD, SALT_ROUNDS);
    return prisma.user.create({
        data: {
            username: DEFAULT_SUPER_ADMIN_USERNAME,
            email: DEFAULT_SUPER_ADMIN_EMAIL,
            passwordHash,
            role: "super_admin",
        },
    });
}

export async function issueAuthTokens(user, meta = {}) {
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const decoded = jwt.decode(refreshToken);

    await prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: hashToken(refreshToken),
            userAgent: meta.userAgent,
            ip: meta.ip,
            expiresAt: new Date(decoded.exp * 1000),
        },
    });

    return {
        accessToken,
        refreshToken,
        user: publicUser(user),
    };
}

export async function refreshAuthToken(refreshToken) {
    if (!refreshToken) {
        throw new ApiError(401, "Refresh token required");
    }

    const payload = jwt.verify(refreshToken, env.jwtRefreshSecret);
    const tokenRecord = await prisma.refreshToken.findFirst({
        where: {
            userId: payload.sub,
            tokenHash: hashToken(refreshToken),
            revokedAt: null,
            expiresAt: { gt: new Date() },
        },
        include: { user: true },
    });

    if (!tokenRecord) {
        throw new ApiError(401, "Invalid refresh token");
    }

    const accessToken = signAccessToken(tokenRecord.user);
    return {
        accessToken,
        user: publicUser(tokenRecord.user),
    };
}

export async function revokeRefreshToken(refreshToken) {
    if (!refreshToken) {
        return;
    }

    await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
    });
}

export { publicUser };
