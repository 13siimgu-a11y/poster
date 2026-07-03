import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { configureSockets } from "./src/sockets/index.js";

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true,
    },
});

configureSockets(io);
app.set("io", io);

server.listen(env.port, () => {
    logger.info(`POS Poster server started: http://localhost:${env.port}`);
    logger.info(`Swagger docs: http://localhost:${env.port}/api/docs`);
});
