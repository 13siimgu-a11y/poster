import { moveTable, resizeTable, rotateTable, updateTable } from "./tables.js";

export function updateHallObject(tableId, patch) {
    return updateTable(tableId, patch);
}

export function moveHallObject(tableId, x, y) {
    return moveTable(tableId, x, y);
}

export function rotateHallObject(tableId, rotation) {
    return rotateTable(tableId, rotation);
}

export function resizeHallObject(tableId, width, height) {
    return resizeTable(tableId, width, height);
}
