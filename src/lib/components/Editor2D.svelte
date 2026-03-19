<script lang="ts">
    import { tokenConfig, isDragging } from "../stores";

    let svgElement: SVGSVGElement;

    function prepareIconContent(svgContent: string): string {
        return svgContent
            .replace(/<svg[^>]*>/, '')
            .replace(/<\/svg>/, '')
            // Remove background rect (game-icons black background fill)
            .replace(/<rect(?![^>]*fill="none")[^>]*\/?>/gi, '');
    }

    // Detect if SVG uses white fills (game-icons "white on black" format) → needs invert
    // Otherwise render directly with fill="black" override (already-black or no-fill paths)
    $: iconNeedsInvert = $tokenConfig.svgContent
        ? /fill="(?:#fff|#ffffff|white)/i.test($tokenConfig.svgContent)
        : false;
    $: iconContent = $tokenConfig.svgContent ? prepareIconContent($tokenConfig.svgContent) : '';

    // Dragging state
    let draggingTarget: "icon" | "text" | null = null;
    let startMouseX = 0;
    let startMouseY = 0;
    let startPosX = 0;
    let startPosY = 0;

    // Compute SVG viewBox based on token width
    $: halfW = $tokenConfig.width / 2;
    $: viewSize = $tokenConfig.width + 20; // 10mm padding on each side
    $: viewBox = `-${halfW + 10} -${halfW + 10} ${viewSize} ${viewSize}`;

    // Compute Icon Scale based on width and margin (assuming 512x512 standard game-icon)
    $: targetIconSize = Math.max(
        0,
        $tokenConfig.width - $tokenConfig.iconMargin * 2,
    );
    $: iconScale = targetIconSize / 512;

    function getMouseCoords(e: MouseEvent | TouchEvent) {
        if (!svgElement) return { x: 0, y: 0 };
        const CTM = svgElement.getScreenCTM();
        if (!CTM) return { x: 0, y: 0 };

        let clientX, clientY;
        if (e instanceof MouseEvent) {
            clientX = e.clientX;
            clientY = e.clientY;
        } else {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        return {
            x: (clientX - CTM.e) / CTM.a,
            y: (clientY - CTM.f) / CTM.d,
        };
    }

    function onPointerDown(
        e: MouseEvent | TouchEvent,
        target: "icon" | "text",
    ) {
        draggingTarget = target;
        isDragging.set(true);
        const coords = getMouseCoords(e);
        startMouseX = coords.x;
        startMouseY = coords.y;

        if (target === "icon") {
            startPosX = $tokenConfig.iconPosX;
            startPosY = $tokenConfig.iconPosY; // Remember: Y is inverted between 3D and 2D
        } else {
            startPosX = $tokenConfig.textPosX;
            startPosY = $tokenConfig.textPosY;
        }

        // Prevent default to avoid scrolling on touch devices
        if (e.cancelable) e.preventDefault();
    }

    function onPointerMove(e: MouseEvent | TouchEvent) {
        if (!draggingTarget) return;

        const coords = getMouseCoords(e);
        const dx = coords.x - startMouseX;
        const dy = coords.y - startMouseY;

        tokenConfig.update((c: any) => {
            if (draggingTarget === "icon") {
                c.iconPosX = startPosX + dx;
                // Subtract dy because 2D SVG y goes DOWN, but 3D y goes UP.
                c.iconPosY = startPosY - dy;
            } else if (draggingTarget === "text") {
                c.textPosX = startPosX + dx;
                c.textPosY = startPosY - dy;
            }
            return c;
        });
    }

    function onPointerUp() {
        draggingTarget = null;
        isDragging.set(false);
    }
</script>

<svelte:window
    on:mousemove={onPointerMove}
    on:mouseup={onPointerUp}
    on:touchmove={onPointerMove}
    on:touchend={onPointerUp}
/>

<div class="editor-container">
    <div class="header">
        <h2>2D Layout Editor</h2>
        <p>Drag the icon and text to arrange them</p>
    </div>

    <div class="canvas-wrapper">
        <svg
            bind:this={svgElement}
            {viewBox}
            class="interactive-svg"
            xmlns="http://www.w3.org/2000/svg"
        >
            <!-- Grid lines for scale (10mm grid) -->
            <defs>
                <pattern
                    id="grid"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                >
                    <path
                        d="M 10 0 L 0 0 0 10"
                        fill="none"
                        stroke="rgba(0,0,0,0.05)"
                        stroke-width="0.5"
                    />
                </pattern>

                <!-- Clip path to cut the 512x512 game icon into a circle -->
                <clipPath id="icon-clip">
                    <circle cx="256" cy="256" r="256" />
                </clipPath>

            </defs>
            <rect
                x="-1000"
                y="-1000"
                width="2000"
                height="2000"
                fill="url(#grid)"
            />

            <!-- Token Base -->
            <circle
                cx="0"
                cy="0"
                r={halfW}
                fill="white"
                stroke="#111"
                stroke-width="0.5"
            />

            <!-- ICON (Draggable) -->
            {#if $tokenConfig.svgContent}
                <g
                    class="draggable"
                    transform="translate({$tokenConfig.iconPosX}, {-$tokenConfig.iconPosY})"
                    on:mousedown={(e) => onPointerDown(e, "icon")}
                    on:touchstart={(e) => onPointerDown(e, "icon")}
                    role="none"
                >
                    <!-- Center the 512x512 SVG visually -->
                    <g
                        transform="translate({-targetIconSize /
                            2}, {-targetIconSize / 2}) scale({iconScale})"
                        clip-path="url(#icon-clip)"
                    >
                        {#if iconNeedsInvert}
                            <!-- White-on-black format: invert to show black on white -->
                            <g style="filter: invert(1)">
                                {@html iconContent}
                            </g>
                        {:else}
                            <!-- Dark/no-fill format: render directly as black -->
                            <g fill="black">
                                {@html iconContent}
                            </g>
                        {/if}
                    </g>
                    <!-- Hover/Active outline box -->
                    <rect
                        x={-targetIconSize / 2}
                        y={-targetIconSize / 2}
                        width={targetIconSize}
                        height={targetIconSize}
                        fill="transparent"
                        stroke="#3b82f6"
                        stroke-width="0.5"
                        stroke-dasharray="2,2"
                        class="hover-box"
                    />
                </g>
            {/if}

            <!-- TEXT (Draggable) -->
            {#if $tokenConfig.labels}
                <g
                    class="draggable"
                    transform="translate({$tokenConfig.textPosX}, {-$tokenConfig.textPosY}) rotate({-$tokenConfig.textRotation})"
                    on:mousedown={(e) => onPointerDown(e, "text")}
                    on:touchstart={(e) => onPointerDown(e, "text")}
                    role="none"
                >
                    <text
                        x="0"
                        y="0"
                        text-anchor="middle"
                        dominant-baseline="central"
                        font-family="'Roboto Black', Arial Black, sans-serif"
                        font-weight="900"
                        font-size={$tokenConfig.textSize}
                        fill="black"
                        stroke="white"
                        stroke-width={$tokenConfig.textStrokeSize * 2}
                        stroke-linejoin="round"
                        paint-order="stroke"
                    >
                        {$tokenConfig.labels.split(",")[0].trim() || "A"}
                    </text>
                    <!-- Hover/Active outline box -->
                    <circle
                        cx="0"
                        cy="0"
                        r="2"
                        fill="#3b82f6"
                        class="hover-box"
                    />
                </g>
            {/if}
        </svg>
    </div>
</div>

<style>
    .editor-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        background-color: var(--color-background);
        border-right: 1px solid var(--color-border);
        min-width: 300px;
    }

    .header {
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
        text-align: center;
    }

    .header h2 {
        font-size: var(--font-size-lg);
        color: var(--color-text);
        margin: 0;
    }

    .header p {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        margin: 0;
    }

    .canvas-wrapper {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: var(--space-4);
        overflow: hidden;
        background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="10" fill="rgba(0,0,0,0.02)"/><rect x="10" y="10" width="10" height="10" fill="rgba(0,0,0,0.02)"/></svg>');
    }

    .interactive-svg {
        max-width: 100%;
        max-height: 100%;
        box-shadow: var(--shadow-sm);
        background-color: white;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
    }

    .draggable {
        cursor: grab;
    }

    .draggable:active {
        cursor: grabbing;
    }

    /* Secret bounding box that only shows on hover */
    .hover-box {
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
    }

    .draggable:hover .hover-box,
    .draggable:active .hover-box {
        opacity: 1;
    }
</style>
