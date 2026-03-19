<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import * as THREE from "three";
    import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
    import { tokenConfig } from "../stores";
    import { createTokenGroup } from "../tokenGenerator";

    let container: HTMLDivElement;
    let canvas: HTMLCanvasElement;

    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        scene.add(dirLight);

        isSceneReady = true;
        animate();

        window.addEventListener("resize", handleResize);
    });

    onDestroy(() => {
        window.removeEventListener("resize", handleResize);
        controls?.dispose();
        renderer?.dispose();
    });

    $: if (isSceneReady && $tokenConfig) {
        updateToken($tokenConfig);
    }

    // Force renderer to strictly follow the 1:1 Svelte layout constraints
    $: if (renderer && camera && boxSize > 10) {
        camera.aspect = 1; /* It's guaranteed to be a square container! */
        camera.updateProjectionMatrix();
        renderer.setSize(boxSize, boxSize);
    }

    async function updateToken(config: any) {
        if (!scene) return;

        if (currentTokenGroup) {
            scene.remove(currentTokenGroup);
            currentTokenGroup = null;
        }

        const firstLabel = (config.labels || "").split(",")[0].trim();

        const group = await createTokenGroup({
            width: config.width,
            height: config.height,
            svgContent: config.svgContent,
            label: firstLabel,
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
    }

    function initThreeJS() {
        const width = container.clientWidth;
        const height = container.clientHeight;

        scene = new THREE.Scene();
        // We leave scene.background empty so the CSS background-color shines through!

        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        // Position camera to look top-down-ish
        camera.position.set(0, -40, 40);
        camera.up.set(0, 0, 1);

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
        // Redundant since boxSize handles 1:1 bounds, but good fallback
        if (!container || !camera || !renderer) return;
        if (boxSize > 10) {
            camera.aspect = 1;
            camera.updateProjectionMatrix();
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
        >
            <canvas bind:this={canvas}></canvas>
        </div>
    </div>
</div>

<style>
    .preview-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100vh;
        background-color: var(--color-background); /* Matches 2D side! */
        position: relative;
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
        background-color: white;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        overflow: hidden; /* So canvas stays inside rounded corners */
        position: relative;
    }

    canvas {
        width: 100%;
        height: 100%;
        display: block;
        outline: none;
    }
</style>
