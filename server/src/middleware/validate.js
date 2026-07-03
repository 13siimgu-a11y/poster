import { ApiError } from "./errorHandler.js";

export function validate(schema, source = "body") {
    return (request, response, next) => {
        const result = schema.safeParse(request[source]);

        if (!result.success) {
            next(new ApiError(422, "Validation failed", result.error.flatten()));
            return;
        }

        request[source] = result.data;
        next();
    };
}
