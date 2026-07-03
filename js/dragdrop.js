export function makeDraggable(element, onMove) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    element.addEventListener("pointerdown", (event) => {
        isDragging = true;
        startX = event.clientX;
        startY = event.clientY;
        initialX = Number(element.dataset.x || 0);
        initialY = Number(element.dataset.y || 0);
        element.setPointerCapture(event.pointerId);
    });

    element.addEventListener("pointermove", (event) => {
        if (!isDragging) {
            return;
        }

        const x = initialX + event.clientX - startX;
        const y = initialY + event.clientY - startY;
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        element.dataset.x = x;
        element.dataset.y = y;
    });

    element.addEventListener("pointerup", () => {
        if (!isDragging) {
            return;
        }

        isDragging = false;
        onMove(Number(element.dataset.x), Number(element.dataset.y));
    });
}
