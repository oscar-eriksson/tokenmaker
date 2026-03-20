<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import * as THREE from "three";
    import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
    import { tokenConfig, isDragging, isGenerating, isEditingLabels } from "../stores";
    import { createTokenGroup } from "../tokenGenerator";

    let container: HTMLDivElement;
    let canvas: HTMLCanvasElement;

    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.OrthographicCamera;
    let controls: OrbitControls;
    let currentTokenGroup: THREE.Group | null = null;
    let isSceneReady = false;

    // Responsive container bounds
    let wrapperW = 0;
    let wrapperH = 0;
    $: boxSize = Math.max(10, Math.min(wrapperW, wrapperH));

    onMount(() => {
        initThreeJS();

        // Add default lighting
        // Refined lighting for better depth perception
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
        mainLight.position.set(40, 0, 40);
        scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
        fillLight.position.set(-40, 0, 40);
        scene.add(fillLight);

        isSceneReady = true;
        animate();

        window.addEventListener("resize", handleResize);
    });

    onDestroy(() => {
        window.removeEventListener("resize", handleResize);
        controls?.dispose();
        renderer?.dispose();
    });

    $: if (isSceneReady && $tokenConfig && !$isDragging && !$isEditingLabels) {
        updateToken($tokenConfig);
    }

    // Keep orthographic camera frustum synced with token size (match 2D viewBox: width + 20mm padding)
    $: if (camera && $tokenConfig) {
        const d = $tokenConfig.width / 2 + 10;
        camera.left = -d;
        camera.right = d;
        camera.top = d;
        camera.bottom = -d;
        camera.updateProjectionMatrix();
    }

    // Force renderer to strictly follow the 1:1 Svelte layout constraints
    $: if (renderer && boxSize > 10) {
        renderer.setSize(boxSize, boxSize);
    }

    async function updateToken(config: any) {
        if (!scene) return;

        isGenerating.set(true);
        // Yield thread so Svelte can render the UI change before CPU blocks
        await new Promise(r => setTimeout(r, 100)); // Increased delay for safer rendering

        try {
            if (currentTokenGroup) {
                scene.remove(currentTokenGroup);
                currentTokenGroup = null;
            }

            const firstLabel = (config.labels || "").split(",")[0].trim();

            const group = await createTokenGroup({
                width: config.width,
                height: config.height,
                svgContent: config.svgContent,
                label: config.skipLabel ? "" : firstLabel,
                textPosX: config.textPosX,
                textPosY: config.textPosY,
                textRotation: config.textRotation,
                textSize: config.textSize,
                textDepth: config.textDepth,
                textStrokeSize: config.textStrokeSize,
                iconPosX: config.iconPosX,
                iconPosY: config.iconPosY,
                iconMargin: config.iconMargin,
                iconDepth: config.iconDepth,
            });

            currentTokenGroup = group;
            scene.add(group);
        } finally {
            isGenerating.set(false);
        }
    }

    function initThreeJS() {
        const width = container.clientWidth;
        const height = container.clientHeight;

        scene = new THREE.Scene();
        // We leave scene.background empty so the CSS background-color shines through!

        // Orthographic camera: 1 world unit = 1mm, frustum sized to match 2D viewBox
        const d = 22.5; // default half-size (25mm token + 10mm padding each side) — updated reactively
        camera = new THREE.OrthographicCamera(-d, d, d, -d, 0.1, 1000);
        // Near top-down view (5° tilt) so X/Y proportions match the 2D editor.
        // camera.up = (0,1,0) because (0,0,1) would be collinear with the view direction.
        camera.position.set(0, -5, 55);
        camera.up.set(0, 1, 0);

        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
    }

    function handleResize() {
        if (!container || !camera || !renderer) return;
        if (boxSize > 10) {
            renderer.setSize(boxSize, boxSize);
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
</script>

<div class="preview-container">
    <div class="header">
        <h2>3D Layout Preview</h2>
        <p>Interactive 3D token preview</p>
    </div>
    <div class="canvas-wrapper">
        <div
            class="canvas-measure"
            bind:clientWidth={wrapperW}
            bind:clientHeight={wrapperH}
        ></div>
        <div
            class="interactive-canvas-box"
            style="width: {boxSize}px; height: {boxSize}px;"
            bind:this={container}
            class:paused={$isDragging || $isGenerating || $isEditingLabels}
        >
            <canvas bind:this={canvas}></canvas>
            {#if $isDragging}
                <div class="pause-overlay">Paused while dragging 2D layout...</div>
            {:else if $isEditingLabels}
                <div class="pause-overlay">Paused while editing labels...</div>
            {:else if $isGenerating}
                <div class="pause-overlay">
                    <span class="spinner"></span> Generating 3D token...
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .preview-container {
        flex: 1 1 0%;
        display: flex;
        flex-direction: column;
        background-color: var(--color-background); /* Matches 2D side! */
        position: relative;
        border-left: 1px solid var(--color-border);
    }

    /* Remove border when stacked */
    @media (max-width: 1100px) {
        .preview-container {
            border-left: none;
            border-top: 1px solid var(--color-border);
            min-height: 400px;
        }
    }

    .header {
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
        text-align: center;
        z-index: 10;
        position: relative;
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

    .canvas-measure {
        position: absolute;
        top: var(--space-4);
        left: var(--space-4);
        right: var(--space-4);
        bottom: var(--space-4);
        pointer-events: none;
        z-index: -1;
    }

    .interactive-canvas-box {
        /* Width and height are set inline dynamically via Svelte to maintain 1:1 aspect bounding box */
        box-shadow: var(--shadow-sm);
        background-color: #f5f5f5;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        overflow: hidden; /* So canvas stays inside rounded corners */
        position: relative;
        transition: opacity 0.2s;
    }

    .interactive-canvas-box.paused {
        opacity: 0.6;
    }

    .pause-overlay {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-weight: bold;
        pointer-events: none;
        z-index: 100;
        display: flex;
        align-items: center;
    }

    .spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255,255,255,0.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 1s linear infinite;
        margin-right: 8px;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    canvas {
        width: 100%;
        height: 100%;
        display: block;
        outline: none;
    }
</style>
