import { emitCompanyEvent } from "./index.js";

export function emitTableUpdated(io, companyId, table) {
    emitCompanyEvent(io, companyId, "floor", "table:updated", table);
}

export function emitOrderUpdated(io, companyId, order) {
    emitCompanyEvent(io, companyId, "floor", "order:updated", order);
}
