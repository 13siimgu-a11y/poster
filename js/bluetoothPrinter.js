const SETTINGS_KEY = "posPosterHoinPrinterSettings";

const DEFAULT_SETTINGS = {
    paperWidth: 58,
    chunkSize: 180,
    lastDeviceName: "",
};

const HOIN_SERVICE_CANDIDATES = [
    {
        service: "000018f0-0000-1000-8000-00805f9b34fb",
        characteristic: "00002af1-0000-1000-8000-00805f9b34fb",
    },
    {
        service: "0000ff00-0000-1000-8000-00805f9b34fb",
        characteristic: "0000ff02-0000-1000-8000-00805f9b34fb",
    },
    {
        service: "0000ffe0-0000-1000-8000-00805f9b34fb",
        characteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
    },
    {
        service: "49535343-fe7d-4ae5-8fa9-9fafd205e455",
        characteristic: "49535343-8841-43f4-a8d4-ecbe34729bb3",
    },
];

const HOIN_OPTIONAL_SERVICES = [...new Set(HOIN_SERVICE_CANDIDATES.map((item) => item.service))];

export function loadHoinPrinterSettings() {
    try {
        return {
            ...DEFAULT_SETTINGS,
            ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveHoinPrinterSettings(patch = {}) {
    const settings = {
        ...loadHoinPrinterSettings(),
        ...patch,
    };

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return settings;
}

export function getHoinPrinterStatus() {
    const isIos = isIosDevice();
    const isBluetoothSupported = Boolean(navigator.bluetooth?.requestDevice);

    if (isIos) {
        return {
            isIos,
            isBluetoothSupported,
            message: "iPhone: установите Hoin Printer из App Store, подключите H58 в приложении, затем нажмите Share to HOIN iOS и выберите Hoin Printer. Прямой Bluetooth из браузера iOS запрещен.",
        };
    }

    if (!isBluetoothSupported) {
        return {
            isIos,
            isBluetoothSupported,
            message: "Bluetooth HOIN работает в браузерах с Web Bluetooth, например Chrome/Edge на Android или ПК. Для iPhone используйте обычную печать.",
        };
    }

    return {
        isIos,
        isBluetoothSupported,
        message: "Bluetooth HOIN доступен. Включите принтер, выберите его в списке и подтвердите подключение.",
    };
}

export function isIosDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function shareReceiptForIos(text, title = "NO FACE receipt") {
    if (navigator.share) {
        await navigator.share({
            title,
            text,
        });
        return "shared";
    }

    await copyReceiptText(text);
    return "copied";
}

export async function copyReceiptText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
}

export function openHoinPrinterAppStore() {
    window.location.href = "itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?term=Hoin%20Printer";
}

export async function selectHoinPrinter() {
    const device = await requestHoinDevice();
    const server = await device.gatt.connect();
    await findWritableCharacteristic(server);
    device.gatt.disconnect();

    return saveHoinPrinterSettings({
        lastDeviceName: device.name || "HOIN printer",
    });
}

export async function printTextToHoinBluetooth(text, options = {}) {
    const status = getHoinPrinterStatus();

    if (status.isIos) {
        throw new Error(status.message);
    }

    if (!status.isBluetoothSupported) {
        throw new Error(status.message);
    }

    const settings = {
        ...loadHoinPrinterSettings(),
        ...options,
    };
    const device = await requestHoinDevice();
    const server = await device.gatt.connect();
    const characteristic = await findWritableCharacteristic(server);

    await writeEscPos(characteristic, text, settings);
    device.gatt.disconnect();
    saveHoinPrinterSettings({
        ...settings,
        lastDeviceName: device.name || settings.lastDeviceName || "HOIN printer",
    });
}

async function requestHoinDevice() {
    return navigator.bluetooth.requestDevice({
        filters: [
            { namePrefix: "HOIN" },
            { namePrefix: "Printer" },
            { namePrefix: "POS" },
            { namePrefix: "MTP" },
        ],
        optionalServices: HOIN_OPTIONAL_SERVICES,
    });
}

async function findWritableCharacteristic(server) {
    for (const candidate of HOIN_SERVICE_CANDIDATES) {
        try {
            const service = await server.getPrimaryService(candidate.service);
            return await service.getCharacteristic(candidate.characteristic);
        } catch {
            // Try the next common ESC/POS BLE profile.
        }
    }

    throw new Error("Не удалось найти Bluetooth-канал печати HOIN. Проверьте, что принтер включен в BLE-режиме.");
}

async function writeEscPos(characteristic, text, settings = {}) {
    const payload = buildEscPosPayload(text);
    const chunkSize = Number(settings.chunkSize || DEFAULT_SETTINGS.chunkSize);

    for (let index = 0; index < payload.length; index += chunkSize) {
        const chunk = payload.slice(index, index + chunkSize);

        if (characteristic.writeValueWithoutResponse) {
            await characteristic.writeValueWithoutResponse(chunk);
        } else {
            await characteristic.writeValue(chunk);
        }

        await delay(35);
    }
}

function buildEscPosPayload(text) {
    const normalizedText = normalizePrinterText(text);
    const encoder = new TextEncoder();
    const init = new Uint8Array([0x1B, 0x40]);
    const biggerText = new Uint8Array([0x1B, 0x21, 0x10]);
    const alignLeft = new Uint8Array([0x1B, 0x61, 0x00]);
    const body = encoder.encode(normalizedText);
    const normalText = new Uint8Array([0x1B, 0x21, 0x00]);
    const feedAndCut = new Uint8Array([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x00]);
    const payload = new Uint8Array(init.length + biggerText.length + alignLeft.length + body.length + normalText.length + feedAndCut.length);

    payload.set(init, 0);
    payload.set(biggerText, init.length);
    payload.set(alignLeft, init.length + biggerText.length);
    payload.set(body, init.length + biggerText.length + alignLeft.length);
    payload.set(normalText, init.length + biggerText.length + alignLeft.length + body.length);
    payload.set(feedAndCut, init.length + biggerText.length + alignLeft.length + body.length + normalText.length);

    return payload;
}

function normalizePrinterText(text) {
    return String(text)
        .replaceAll("₾", " GEL")
        .replaceAll("€", " EUR")
        .replaceAll("$", " USD")
        .replaceAll("₽", " RUB")
        .replaceAll("—", "-")
        .replaceAll("×", "x")
        .replaceAll("№", "No");
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
