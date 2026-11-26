"use client";

import * as React from "react";

/**
 * useMiddleMousePan — horizontal panning for a strip (tab strip, section
 * jump bar) that may overflow horizontally.
 *
 * ▸ Wheel: a vertical wheel delta pans the strip left/right (true
 *   horizontal deltas keep their native meaning). At the strip's ends
 *   the event is handed back to the page so the surrounding content
 *   keeps scrolling — except while Shift is held, which always pans.
 * ▸ Middle mouse button: press + drag pans the strip (the browser's
 *   autoscroll compass is suppressed while dragging).
 *
 * The hook returns a CALLBACK ref, not an effect-attached ref: the
 * panned elements are CONDITIONIONALLY rendered (the settings dialog's
 * section jump bar mounts only after its sections are measured, and
 * remounts on every tab switch). An effect-based attach sees a null
 * element on the first run and never attaches — the strips then ignore
 * the wheel entirely. The callback ref attaches/detaches on every
 * mount/unmount of the node instead.
 */
export function useMiddleMousePan<T extends HTMLElement>() {
    const cleanupRef = React.useRef<(() => void) | null>(null);

    const ref = React.useCallback((el: T | null) => {
        // Detach whatever the previous node had attached.
        cleanupRef.current?.();
        cleanupRef.current = null;
        if (!el) return;

        let panning = false;
        let startX = 0;
        let startScroll = 0;
        const onDown = (e: MouseEvent) => {
            if (e.button !== 1) return;
            e.preventDefault(); // kill the browser's autoscroll compass
            panning = true;
            startX = e.clientX;
            startScroll = el.scrollLeft;
            document.body.style.cursor = "grabbing";
            el.style.scrollBehavior = "auto";
        };
        const onMove = (e: MouseEvent) => {
            if (!panning) return;
            el.scrollLeft = startScroll - (e.clientX - startX);
        };
        const stop = () => {
            if (!panning) return;
            panning = false;
            document.body.style.cursor = "";
        };
        // Wheel → horizontal. Only takes over when the strip can actually
        // scroll (or is at an edge and the delta heads inward), so a
        // non-overflowing strip keeps native page scrolling.
        const onWheel = (e: WheelEvent) => {
            if (panning) return; // mid-drag: nothing extra to do
            const canScroll = el.scrollWidth - el.clientWidth > 1;
            if (!canScroll) return;
            const vertical = Math.abs(e.deltaY) > Math.abs(e.deltaX);
            if (!vertical) return; // true horizontal delta — native behavior
            const next = el.scrollLeft + e.deltaY;
            const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
            if ((atStart || atEnd) && !e.shiftKey) return; // let the page take over at the ends
            e.preventDefault();
            el.scrollLeft = next;
        };
        el.addEventListener("mousedown", onDown);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", stop);
        el.addEventListener("wheel", onWheel, {passive: false});

        cleanupRef.current = () => {
            el.removeEventListener("mousedown", onDown);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", stop);
            el.removeEventListener("wheel", onWheel);
            document.body.style.cursor = "";
        };
    }, []);

    // Unmount of the OWNER (dialog close) — the callback ref already
    // handles node unmount, this covers the hook's own teardown.
    React.useEffect(() => () => cleanupRef.current?.(), []);

    return ref;
}
