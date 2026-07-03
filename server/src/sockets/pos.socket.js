import { emitCompanyEvent } from "./index.js";

export function emitReceiptPaid(io, companyId, receipt) {
    emitCompanyEvent(io, companyId, "pos", "receipt:paid", receipt);
}
