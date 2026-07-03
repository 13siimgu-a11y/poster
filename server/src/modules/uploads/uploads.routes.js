import { Router } from "express";
import { uploadImage } from "../../middleware/upload.js";

export const uploadsRouter = Router();

uploadsRouter.post("/image", uploadImage.single("image"), (request, response) => {
    response.status(201).json({
        url: `/${request.file.path.replaceAll("\\", "/")}`,
        filename: request.file.filename,
    });
});
