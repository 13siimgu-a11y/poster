import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { openApiDocument } from "./src/docs/swagger.js";
import { authRouter } from "./src/modules/auth/auth.routes.js";
import { usersRouter } from "./src/modules/users/users.routes.js";
import { companiesRouter } from "./src/modules/companies/companies.routes.js";
import { menuRouter } from "./src/modules/menu/menu.routes.js";
import { posRouter } from "./src/modules/pos/pos.routes.js";
import { operationsRouter } from "./src/modules/operations/operations.routes.js";
import { adminRouter } from "./src/modules/admin/admin.routes.js";
import { uploadsRouter } from "./src/modules/uploads/uploads.routes.js";
import { aiRouter } from "./src/modules/ai/ai.routes.js";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler.js";

export function createApp() {
    const app = express();

    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));
    app.use(cors({ origin: true, credentials: true }));
    app.use(morgan(env.isProduction ? "combined" : "dev"));
    app.use(express.json({ limit: "2mb" }));
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    app.get("/api/health", (request, response) => {
        response.json({
            ok: true,
            service: "pos-poster-api",
            environment: env.nodeEnv,
            timestamp: new Date().toISOString(),
        });
    });

    app.get("/api/openapi.json", (request, response) => response.json(openApiDocument));
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
    app.use("/api/auth", authRouter);
    app.use("/api/users", usersRouter);
    app.use("/api/companies", companiesRouter);
    app.use("/api/companies/:companyId", menuRouter);
    app.use("/api/companies/:companyId", posRouter);
    app.use("/api/companies/:companyId", operationsRouter);
    app.use("/api/admin", adminRouter);
    app.use("/api/uploads", uploadsRouter);
    app.use("/api/ai", aiRouter);

    app.use(`/${env.uploadDir}`, express.static(path.join(process.cwd(), env.uploadDir)));
    app.use(express.static(process.cwd()));

    app.use("/api", notFoundHandler);
    app.use(errorHandler);

    return app;
}
