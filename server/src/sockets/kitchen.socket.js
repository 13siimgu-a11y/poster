import { emitCompanyEvent } from "./index.js";

export function emitKitchenCreated(io, companyId, order) {
    emitCompanyEvent(io, companyId, "kitchen", "kitchen:created", order);
}

export function emitKitchenStatusChanged(io, companyId, order) {
    emitCompanyEvent(io, companyId, "kitchen", "kitchen:status-changed", order);
}
