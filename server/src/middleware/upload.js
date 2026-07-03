import path from "node:path";
import multer from "multer";
import { env } from "../../config/env.js";
import { ApiError } from "./errorHandler.js";

const storage = multer.diskStorage({
    destination: env.uploadDir,
    filename(request, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
    },
});

export const uploadImage = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter(request, file, callback) {
        const allowed = ["image/png", "image/jpeg", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
            callback(new ApiError(415, "Only PNG, JPG and WEBP images are allowed"));
            return;
        }

        callback(null, true);
    },
});
