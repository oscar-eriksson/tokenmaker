<script lang="ts">
    import { tokenConfig } from "../stores";
    import { exportTokens } from "../exportTokens";
    import IconSearch from "./IconSearch.svelte";

    let fileInput: HTMLInputElement;

    function handleFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;

        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            tokenConfig.update((c) => {
                c.svgContent = content;
                return c;
            });
        };
        reader.readAsText(file);
    }

    async function handleExport() {
        await exportTokens($tokenConfig);
    }
</script>

<aside class="controls-panel">
    <div class="header">
        <h1>Token Maker</h1>
        <p>Generate 3D printable DnD tokens with custom icons and labels</p>
    </div>

    <div class="controls-content">
        <div class="control-group">
            <IconSearch />
        </div>

        <div class="control-group">
            <label class="control-label" for="svg-upload"
                >...or Upload custom SVG</label
            >
            <input
                id="svg-upload"
                type="file"
                accept=".svg"
                bind:this={fileInput}
                on:change={handleFileUpload}
                class="file-input"
            />
        </div>

        <div class="control-group">
            <label class="control-label">Base Dimensions (mm)</label>
            <div class="grid-2">
                <div>
                    <label class="control-label" for="width"
                        >Width / Diameter</label
                    >
                    <input
                        id="width"
                        type="number"
                        bind:value={$tokenConfig.width}
                        min="5"
                        max="200"
                        step="1"
                    />
                </div>
                <div>
                    <label class="control-label" for="height">Height</label>
                    <input
                        id="height"
                        type="number"
                        bind:value={$tokenConfig.height}
                        min="1"
                        max="50"
                        step="0.5"
                    />
                </div>
                <div>
                    <label class="control-label" for="margin">Icon Margin</label
                    >
                    <input
                        id="margin"
                        type="number"
                        bind:value={$tokenConfig.iconMargin}
                        min="0"
                        max="50"
                        step="0.5"
                    />
                </div>
            </div>
        </div>

        <div class="control-group">
            <label class="control-label" for="labels"
                >Labels (comma-separated sequence)</label
            >
            <input
                id="labels"
                type="text"
                bind:value={$tokenConfig.labels}
                placeholder="e.g. A, B, C or 1, 2, 3"
            />
        </div>

        <div class="control-group">
            <label class="control-label">Text Alignment & Size</label>
            <div class="grid-2">
                <div>
                    <label class="control-label" for="posx">X Offset</label>
                    <input
                        id="posx"
                        type="number"
                        bind:value={$tokenConfig.textPosX}
                        step="0.5"
                    />
                </div>
                <div>
                    <label class="control-label" for="posy">Y Offset</label>
                    <input
                        id="posy"
                        type="number"
                        bind:value={$tokenConfig.textPosY}
                        step="0.5"
                    />
                </div>
                <div>
                    <label class="control-label" for="size">Text Size</label>
                    <input
                        id="size"
                        type="number"
                        bind:value={$tokenConfig.textSize}
                        min="1"
                        step="0.5"
                    />
                </div>
                <div>
                    <label class="control-label" for="rotation"
                        >Rotation (degrees)</label
                    >
                    <input
                        id="rotation"
                        type="number"
                        bind:value={$tokenConfig.textRotation}
                        step="1"
                    />
                </div>
                <div>
                    <label class="control-label" for="stroke">Stroke Size</label
                    >
                    <input
                        id="stroke"
                        type="number"
                        bind:value={$tokenConfig.textStrokeSize}
                        min="0"
                        step="0.1"
                    />
                </div>
            </div>
        </div>

        <div class="control-group">
            <label class="control-label">Extrusion Depths (mm)</label>
            <div class="grid-2">
                <div>
                    <label class="control-label" for="icon-depth"
                        >Icon Depth</label
                    >
                    <input
                        id="icon-depth"
                        type="number"
                        bind:value={$tokenConfig.iconDepth}
                        min="0.1"
                        step="0.1"
                    />
                </div>
                <div>
                    <label class="control-label" for="text-depth"
                        >Text Depth</label
                    >
                    <input
                        id="text-depth"
                        type="number"
                        bind:value={$tokenConfig.textDepth}
                        min="0.1"
                        step="0.1"
                    />
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        <button class="primary export-btn" on:click={handleExport}>
            Export STL Sequence
        </button>
    </div>
</aside>

<style>
    .controls-panel {
        width: 380px;
        height: 100vh;
        background-color: var(--color-surface);
        border-right: 1px solid var(--color-border);
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-md);
        z-index: 10;
    }

    .header {
        padding: var(--space-5);
        border-bottom: 1px solid var(--color-border);
    }

    .header h1 {
        font-size: var(--font-size-xl);
        margin: 0 0 var(--space-2) 0;
        color: var(--color-primary);
    }

    .header p {
        margin: 0;
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
    }

    .controls-content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-5);
    }

    .file-input {
        width: 100%;
        padding: 0.5rem;
        font-size: var(--font-size-sm);
    }

    .footer {
        padding: var(--space-5);
        border-top: 1px solid var(--color-border);
        background-color: var(--color-surface);
    }

    .export-btn {
        width: 100%;
        font-weight: var(--font-weight-bold);
        padding: 0.75rem;
    }
</style>
