import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export function configureSockets(io) {
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                next(new Error("Socket authentication required"));
                return;
            }

            socket.user = jwt.verify(token, env.jwtAccessSecret);
            next();
        } catch {
            next(new Error("Invalid socket token"));
        }
    });

    io.on("connection", (socket) => {
        const companyId = socket.user?.companyId;

        if (companyId) {
            ["kitchen", "floor", "pos", "inventory"].forEach((room) => {
                socket.join(`company:${companyId}:${room}`);
            });
        }

        logger.info("Socket connected", { socketId: socket.id, userId: socket.user?.sub });
    });
}

export function emitCompanyEvent(io, companyId, room, event, payload) {
    io.to(`company:${companyId}:${room}`).emit(event, payload);
}
