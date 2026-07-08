export function printReceiptElement(receiptElement, paperWidth = 58) {
    if (!receiptElement) {
        window.print();
        return;
    }

    const width = Number(paperWidth) === 80 ? 80 : 58;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Receipt print");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    document.body.append(iframe);

    const clonedReceipt = receiptElement.cloneNode(true);
    clonedReceipt.classList.remove("is-print-target");
    clonedReceipt.classList.toggle("print-receipt--58mm", width === 58);
    clonedReceipt.classList.toggle("print-receipt--80mm", width === 80);

    const documentRef = iframe.contentDocument || iframe.contentWindow.document;
    documentRef.open();
    documentRef.write(`
        <!doctype html>
        <html>
            <head>
                <meta charset="utf-8">
                <title>Receipt</title>
                <style>${buildReceiptPrintCss(width)}</style>
            </head>
            <body>${clonedReceipt.outerHTML}</body>
        </html>
    `);
    documentRef.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => iframe.remove(), 800);
    }, 120);
}

function buildReceiptPrintCss(width) {
    const receiptWidth = `${width}mm`;
    const bodyPadding = width === 58 ? "1mm" : "2mm";
    const fontSize = width === 58 ? "15px" : "14px";
    const titleSize = width === 58 ? "18px" : "18px";

    return `
        @page {
            size: ${receiptWidth} auto;
            margin: 0;
        }

        * {
            box-sizing: border-box;
        }

        html,
        body {
            width: ${receiptWidth};
            min-width: 0;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
        }

        body {
            padding: ${bodyPadding};
        }

        .print-receipt {
            display: grid;
            gap: 5px;
            width: 100%;
            max-width: ${receiptWidth};
            margin: 0;
            padding: 0;
            border: 0;
            background: #fff;
            color: #000;
            font-family: "Courier New", Consolas, monospace;
            font-size: ${fontSize};
            line-height: 1.22;
            text-align: center;
        }

        .print-receipt__header,
        .print-receipt__footer,
        .print-receipt__totals {
            display: grid;
            gap: 3px;
        }

        .print-receipt h2,
        .print-receipt p {
            margin: 0;
        }

        .print-receipt h2 {
            font-size: ${titleSize};
            line-height: 1.1;
            text-transform: uppercase;
        }

        .print-receipt table {
            width: 100%;
            border-collapse: collapse;
        }

        .print-receipt th,
        .print-receipt td {
            padding: 3px 1px;
            border-bottom: 1px dashed #000;
            text-align: left;
            vertical-align: top;
        }

        .print-receipt th {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
        }

        .print-receipt th:nth-child(n + 2),
        .print-receipt td:nth-child(n + 2) {
            text-align: right;
            white-space: nowrap;
        }

        .print-receipt__item strong,
        .print-receipt__item small {
            display: block;
            overflow-wrap: anywhere;
        }

        .print-receipt__item small {
            font-size: 12px;
        }

        .print-receipt__totals {
            padding-top: 3px;
            border-top: 1px dashed #000;
        }

        .print-receipt__totals p {
            display: flex;
            justify-content: space-between;
            gap: 8px;
        }

        .print-receipt__grand-total {
            padding-top: 4px;
            border-top: 1px solid #000;
            font-size: ${width === 58 ? "18px" : "17px"};
            font-weight: 900;
        }

        .print-receipt img {
            display: none;
        }

        ${width === 58 ? buildH58Css() : ""}
    `;
}

function buildH58Css() {
    return `
        .print-receipt thead {
            display: none;
        }

        .print-receipt table,
        .print-receipt tbody {
            display: block;
        }

        .print-receipt tr.print-receipt__item {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 1px 6px;
            padding: 4px 0;
            border-bottom: 1px dashed #000;
        }

        .print-receipt tr.print-receipt__item td {
            display: block;
            padding: 0;
            border: 0;
        }

        .print-receipt tr.print-receipt__item td:first-child {
            grid-column: 1 / -1;
            font-size: 15px;
            font-weight: 800;
            text-align: left;
            white-space: normal;
        }

        .print-receipt tr.print-receipt__item td:nth-child(2),
        .print-receipt tr.print-receipt__item td:nth-child(3) {
            color: #111;
            font-size: 13px;
            text-align: left;
            white-space: normal;
        }

        .print-receipt tr.print-receipt__item td:nth-child(2)::before {
            content: "Qty ";
        }

        .print-receipt tr.print-receipt__item td:nth-child(3)::before {
            content: "Price ";
        }

        .print-receipt tr.print-receipt__item td:nth-child(4) {
            grid-column: 2;
            grid-row: 2 / span 2;
            align-self: center;
            font-size: 15px;
            font-weight: 900;
            text-align: right;
        }
    `;
}
