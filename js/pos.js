import { formatMoney } from "./currency.js";
import { createKitchenOrder } from "./kitchenOrders.js";
import { createLog } from "./logs.js";
import { idsEqual, mirrorCreate, mirrorUpdate } from "./apiPersistence.js";
import { loadProducts } from "./products.js";
import { consumeIngredients } from "./recipes.js";
import { storage, STORAGE_KEYS } from "./storage.js";

export const PAYMENT_TYPES = ["cash", "card", "mixed"];
export const RECEIPT_STATUSES = ["open", "held", "paid", "refund", "void"];

export function loadCashRegisters(companyId) {
    const registers = storage.get(STORAGE_KEYS.cashRegisters, []);
    const companyRegisters = registers.filter((register) => idsEqual(register.companyId, companyId));

    if (companyRegisters.length) {
        return companyRegisters;
    }

    return createDefaultRegisters(companyId);
}

export function createDefaultRegisters(companyId) {
    const registers = storage.get(STORAGE_KEYS.cashRegisters, []);
    const nextId = registers.length ? Math.max(...registers.map((item) => Number(item.id))) + 1 : 1;
    const defaults = [
        {
            id: nextId,
            companyId,
            name: "Касса 1",
            active: true,
            createdAt: new Date().toISOString(),
        },
        {
            id: nextId + 1,
            companyId,
            name: "Касса 2",
            active: true,
            createdAt: new Date().toISOString(),
        },
    ];

    storage.set(STORAGE_KEYS.cashRegisters, [...registers, ...defaults]);
    defaults.forEach((register) => mirrorCreate("cashRegisters", companyId, register));
    return defaults;
}

export function loadReceipts(companyId, status = null) {
    const receipts = storage.get(STORAGE_KEYS.receipts, []);
    return receipts.filter((receipt) => (
        idsEqual(receipt.companyId, companyId)
        && (!status || receipt.status === status)
    ));
}

export function saveReceipts(receipts) {
    return storage.set(STORAGE_KEYS.receipts, receipts);
}

export function createReceipt(companyId, registerId, cashierId) {
    const receipts = storage.get(STORAGE_KEYS.receipts, []);
    const receipt = {
        id: receipts.length ? Math.max(...receipts.map((item) => Number(item.id))) + 1 : 1,
        number: `CHK-${String(receipts.length + 1).padStart(5, "0")}`,
        companyId,
        registerId,
        cashierId,
        status: "open",
        items: [],
        discount: 0,
        surcharge: 0,
        payments: [],
        comment: "",
        subtotal: 0,
        total: 0,
        qrCode: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        paidAt: "",
    };

    receipt.qrCode = createReceiptQr(receipt);
    saveReceipts([...receipts, receipt]);
    mirrorCreate("receipts", companyId, receipt);
    return receipt;
}

export function updateReceipt(receiptId, patch) {
    const receipts = storage.get(STORAGE_KEYS.receipts, []);
    const receiptIndex = receipts.findIndex((receipt) => Number(receipt.id) === Number(receiptId));

    if (receiptIndex === -1) {
        return null;
    }

    const updatedReceipt = calculateReceipt({
        ...receipts[receiptIndex],
        ...patch,
        updatedAt: new Date().toISOString(),
    });
    updatedReceipt.qrCode = createReceiptQr(updatedReceipt);
    receipts[receiptIndex] = updatedReceipt;
    saveReceipts(receipts);
    mirrorUpdate("receipts", updatedReceipt.companyId, updatedReceipt);
    return updatedReceipt;
}

export function addProductToReceipt(receipt, product, options = {}) {
    const itemId = Date.now() + Math.random();
    const item = {
        id: itemId,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        price: Number(product.price || 0),
        quantity: 1,
        comment: options.comment || "",
        modifiers: options.modifiers || [],
        total: Number(product.price || 0),
    };

    return updateReceipt(receipt.id, {
        items: [...receipt.items, item],
    });
}

export function updateReceiptItem(receipt, itemId, patch) {
    const items = receipt.items.map((item) => {
        if (Number(item.id) !== Number(itemId)) {
            return item;
        }

        const modifiers = patch.modifiers ?? item.modifiers;
        const modifierTotal = modifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
        const quantity = Number(patch.quantity ?? item.quantity);

        return {
            ...item,
            ...patch,
            modifiers,
            quantity,
            total: (Number(patch.price ?? item.price) + modifierTotal) * quantity,
        };
    });

    return updateReceipt(receipt.id, { items });
}

export function removeReceiptItem(receipt, itemId) {
    return updateReceipt(receipt.id, {
        items: receipt.items.filter((item) => Number(item.id) !== Number(itemId)),
    });
}

export function holdReceipt(receipt) {
    createLog("Отложил чек", { receipt: receipt.number, companyId: receipt.companyId });
    return updateReceipt(receipt.id, { status: "held" });
}

export function reopenReceipt(receipt) {
    return updateReceipt(receipt.id, { status: "open" });
}

export function applyDiscount(receipt, discount) {
    return updateReceipt(receipt.id, { discount: Number(discount || 0) });
}

export function applySurcharge(receipt, surcharge) {
    return updateReceipt(receipt.id, { surcharge: Number(surcharge || 0) });
}

export function payReceipt(receipt, paymentType, amounts = {}) {
    const total = calculateReceipt(receipt).total;
    const payments = paymentType === "mixed"
        ? [
            { type: "cash", amount: Number(amounts.cash || 0) },
            { type: "card", amount: Number(amounts.card || 0) },
        ].filter((payment) => payment.amount > 0)
        : [{ type: paymentType, amount: total }];

    const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    if (paidAmount < total) {
        return null;
    }

    const updatedReceipt = updateReceipt(receipt.id, {
        status: "paid",
        payments,
        paidAt: new Date().toISOString(),
    });

    createKitchenOrder({
        ...updatedReceipt,
        orderId: updatedReceipt.id,
        tableId: 0,
        waiterId: updatedReceipt.cashierId,
        guests: 1,
        items: updatedReceipt.items,
    });
    consumeIngredients(updatedReceipt.companyId, updatedReceipt.items, updatedReceipt.cashierId);
    createLog("Пробил чек", { receipt: updatedReceipt.number, companyId: updatedReceipt.companyId, total });
    return updatedReceipt;
}

export function refundReceipt(receipt) {
    const refund = createReceipt(receipt.companyId, receipt.registerId, receipt.cashierId);
    const refundItems = receipt.items.map((item) => ({
        ...item,
        quantity: -Math.abs(Number(item.quantity)),
        total: -Math.abs(Number(item.total)),
    }));

    const updatedRefund = updateReceipt(refund.id, {
        status: "refund",
        items: refundItems,
        payments: receipt.payments,
        comment: `Возврат по чеку ${receipt.number}`,
        paidAt: new Date().toISOString(),
    });

    createLog("Сделал возврат", { receipt: receipt.number, companyId: receipt.companyId });
    return updatedRefund;
}

export function calculateReceipt(receipt) {
    const subtotal = receipt.items.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const total = Math.max(0, subtotal - Number(receipt.discount || 0) + Number(receipt.surcharge || 0));

    return {
        ...receipt,
        subtotal,
        total,
    };
}

export function createReceiptQr(receipt) {
    const payload = `POS-POSTER-RECEIPT:${receipt.companyId}:${receipt.number}:${receipt.total}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(payload)}`;
}

export function printReceiptHtml(receipt, company) {
    const calculatedReceipt = calculateReceipt(receipt);
    const currency = company?.settings?.currency || "USD";
    const address = [
        company?.address?.street,
        company?.address?.city,
    ].filter(Boolean).join(", ");
    const paidAt = calculatedReceipt.paidAt || calculatedReceipt.updatedAt || calculatedReceipt.createdAt || new Date().toISOString();
    const discountPercent = getReceiptDiscountPercent(calculatedReceipt);
    const rows = calculatedReceipt.items.map((item) => `
        <tr class="print-receipt__item">
            <td>
                <strong>${escapeReceiptText(item.name || "Позиция")}</strong>
                ${item.comment ? `<small>${escapeReceiptText(item.comment)}</small>` : ""}
            </td>
            <td>${formatReceiptQuantity(item.quantity)}</td>
            <td>${formatMoney(Number(item.price || 0), currency)}</td>
            <td>${formatMoney(getReceiptItemTotal(item), currency)}</td>
        </tr>
    `).join("");

    return `
        <section class="print-receipt" data-printer="hoin-thermal">
            <header class="print-receipt__header">
                <h2>${escapeReceiptText(company?.name || "NO FACE POS")}</h2>
                ${address ? `<p>${escapeReceiptText(address)}</p>` : ""}
                <p>Чек: ${escapeReceiptText(calculatedReceipt.number || "Без номера")}</p>
                <p>${formatReceiptDate(paidAt)}</p>
            </header>
            <table class="print-receipt__table" aria-label="Позиции чека">
                <thead>
                    <tr>
                        <th>Блюдо</th>
                        <th>Кол.</th>
                        <th>Цена</th>
                        <th>Сумма</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || `
                        <tr>
                            <td colspan="4">Позиции отсутствуют</td>
                        </tr>
                    `}
                </tbody>
            </table>
            <div class="print-receipt__totals">
                <p><span>Сумма блюд</span><strong>${formatMoney(calculatedReceipt.subtotal, currency)}</strong></p>
                ${Number(calculatedReceipt.discount || 0) ? `<p><span>Скидка ${discountPercent}%</span><strong>-${formatMoney(calculatedReceipt.discount, currency)}</strong></p>` : ""}
                ${Number(calculatedReceipt.surcharge || 0) ? `<p><span>Сервис/надбавка</span><strong>${formatMoney(calculatedReceipt.surcharge, currency)}</strong></p>` : ""}
                <p class="print-receipt__grand-total"><span>Итого</span><strong>${formatMoney(calculatedReceipt.total, currency)}</strong></p>
            </div>
            <footer class="print-receipt__footer">
                <p>Спасибо за покупку</p>
                <p>NO FACE POS</p>
                ${calculatedReceipt.qrCode ? `<img src="${calculatedReceipt.qrCode}" alt="QR">` : ""}
            </footer>
        </section>
    `;
}

function getReceiptItemTotal(item) {
    if (Number.isFinite(Number(item.total))) {
        return Number(item.total);
    }

    return Number(item.price || 0) * Number(item.quantity || 1);
}

function formatReceiptQuantity(quantity) {
    const value = Number(quantity || 1);
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getReceiptDiscountPercent(receipt) {
    const subtotal = Number(receipt.subtotal || 0);

    if (!subtotal) {
        return 0;
    }

    return Math.round((Number(receipt.discount || 0) / subtotal) * 10000) / 100;
}

function formatReceiptDate(value) {
    return new Date(value).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function escapeReceiptText(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function getAvailablePosProducts(companyId) {
    return loadProducts(companyId).filter((product) => (
        product.posVisible
        && product.active
        && product.status === "active"
        && product.quantity > 0
    ));
}
