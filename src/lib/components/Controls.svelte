<script lang="ts">
    import { tokenConfig, exportStatus, isGenerating } from "../stores";
    const buildDate = __BUILD_DATE__;
    import { exportTokens } from "../exportTokens";
    import IconSearch from "./IconSearch.svelte";

    let fileInput: HTMLInputElement;

    function handleFileUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;

        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            isGenerating.set(true);
            const content = e.target?.result as string;
            tokenConfig.update((c) => {
                c.svgContent = content;
                c.iconName = file.name.replace(/\.svg$/i, '');
                return c;
            });
        };
        reader.readAsText(file);
    }

    async function handleExport() {
        await exportTokens($tokenConfig);
    }

    // Proportional Scaling Logic
    let lastWidth = $tokenConfig.width;
    $: {
        const newWidth = $tokenConfig.width;
        if (newWidth !== lastWidth && lastWidth > 0) {
            const ratio = newWidth / lastWidth;
            tokenConfig.update(c => ({
                ...c,
                textSize: Number((c.textSize * ratio).toFixed(2)),
                textPosX: Number((c.textPosX * ratio).toFixed(2)),
                textPosY: Number((c.textPosY * ratio).toFixed(2)),
                iconPosX: Number((c.iconPosX * ratio).toFixed(2)),
                iconPosY: Number((c.iconPosY * ratio).toFixed(2)),
                iconMargin: Number((c.iconMargin * ratio).toFixed(2)),
                textStrokeSize: Number((c.textStrokeSize * ratio).toFixed(2))
            }));
            lastWidth = newWidth;
        }
    }
</script>

<aside class="controls-panel">
    <div class="header">
        <div class="brand">
            <img src="/favicon.png" alt="Logo" class="logo" />
            <h1>Token Maker</h1>
        </div>
        <p>Generate 3D printable DnD tokens with custom icons and labels</p>
    </div>

    <div class="controls-content">
        <div class="control-group">
            <span class="control-label">Presets</span>
            <div class="preset-buttons">
                <button 
                    class="preset-btn"
                    class:active={$tokenConfig.width === 25}
                    on:click={() => {
                        lastWidth = 25; // Update lastWidth first to avoid double-scaling
                        tokenConfig.update(c => ({
                            ...c,
                            width: 25,
                            height: 5,
                            iconMargin: 2,
                            textSize: 10,
                            textStrokeSize: 1,
                            iconDepth: 2,
                            textDepth: 2,
                            textPosX: 0,
                            textPosY: 0,
                            iconPosX: 0,
                            iconPosY: 0
                        }));
                    }}
                >
                    Normal
                </button>
                <button 
                    class="preset-btn"
                    class:active={$tokenConfig.width === 12.5}
                    on:click={() => {
                        lastWidth = 12.5; // Update lastWidth first to avoid double-scaling
                        tokenConfig.update(c => ({
                            ...c,
                            width: 12.5,
                            height: 3,
                            iconMargin: 0.4,
                            textSize: 5,
                            textStrokeSize: 0.5,
                            iconDepth: 1,
                            textDepth: 1,
                            textPosX: 0,
                            textPosY: 0,
                            iconPosX: 0,
                            iconPosY: 0
                        }));
                    }}
                >
                    Small
                </button>
            </div>
        </div>

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
            <span class="control-label">Text Alignment & Size</span>
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
            <span class="control-label">Extrusion Depths (mm)</span>
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
        <button 
            class="primary export-btn" 
            on:click={handleExport}
            disabled={$exportStatus.active}
            style="width: 100%; margin-bottom: 1rem;"
        >
            {$exportStatus.active ? 'Exporting...' : 'Export STL Sequence'}
        </button>

        <footer class="panel-footer">
            <div class="footer-links">
              <!-- Repository is private, commenting out GitHub link per request -->
              <!-- 
              <a
                href="https://github.com/oscar-eriksson/tokenmaker"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><path
                    d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7a3.37 3.37 0 0 0-.94 2.58V22"
                  ></path></svg
                >
                GitHub
              </a>
              -->
              <a href="https://ko-fi.com/oscareriksson2" target="_blank" rel="noopener noreferrer">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                  <line x1="6" y1="1" x2="6" y2="4"></line>
                  <line x1="10" y1="1" x2="10" y2="4"></line>
                  <line x1="14" y1="1" x2="14" y2="4"></line>
                </svg>
                Ko-fi
              </a>
            </div>
            <div class="credits">
              <span>By Oscar Eriksson</span>
              <span class="version">v1.1.0 (Build: {buildDate})</span>
            </div>
        </footer>
    </div>
</aside>

{#if $exportStatus.active}
    <div class="export-overlay">
        <div class="export-card">
            <div class="spinner"></div>
            <h3>Building STL Sequence</h3>
            <p>Processing: <strong>{$exportStatus.label}</strong></p>
            <div class="progress-bar">
                <div 
                    class="progress-fill" 
                    style="width: {($exportStatus.current / $exportStatus.total) * 100}%"
                ></div>
            </div>
            <span class="progress-text">
                {$exportStatus.current} of {$exportStatus.total} tokens
            </span>
        </div>
    </div>
{/if}

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
        margin: 0;
        color: var(--color-primary);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-bottom: var(--space-2);
    }

    .logo {
        width: 32px;
        height: 32px;
        object-fit: contain;
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

    .preset-buttons {
        display: flex;
        gap: var(--space-3);
        margin-top: var(--space-2);
    }

    .preset-btn {
        flex: 1;
        background: var(--color-bg-subtle);
        border: 1px solid var(--color-border);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        font-size: var(--font-size-sm);
        cursor: pointer;
        transition: all 0.2s;
    }

    .preset-btn:hover {
        background: var(--color-bg-hover);
        border-color: var(--color-primary);
    }

    .preset-btn.active {
        background: var(--color-primary-muted);
        border-color: var(--color-primary);
        color: var(--color-primary);
        font-weight: 600;
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

    .export-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .version {
        font-size: 0.65rem;
        opacity: 0.6;
    }

    .panel-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        margin-top: 0.5rem;
    }

    .footer-links {
        display: flex;
        gap: 0.8rem;
    }

    .panel-footer a {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--color-text-muted);
        text-decoration: none;
        transition: color 0.2s;
    }

    .panel-footer a:hover {
        color: var(--color-primary);
    }

    .credits {
        text-align: right;
        opacity: 0.8;
        line-height: 1.2;
    }

    .credits span {
        display: block;
    }

    .export-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
    }

    .export-card {
        background: var(--color-surface);
        padding: var(--space-8);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        width: 350px;
        text-align: center;
        border: 1px solid var(--color-border);
    }

    .export-card h3 {
        margin: var(--space-4) 0 var(--space-2);
        color: var(--color-text);
    }

    .export-card p {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        margin-bottom: var(--space-6);
    }

    .progress-bar {
        height: 8px;
        background: var(--color-bg-subtle);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: var(--space-2);
    }

    .progress-fill {
        height: 100%;
        background: var(--color-primary);
        transition: width 0.3s ease;
    }

    .progress-text {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--color-bg-subtle);
        border-top: 3px solid var(--color-primary);
        border-radius: 50%;
        margin: 0 auto;
        animation: spin 1s linear infinite;
    }

    .export-card {
        background: var(--color-surface);
        padding: var(--space-8);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        width: 350px;
        text-align: center;
        border: 1px solid var(--color-border);
    }

    .export-card h3 {
        margin: var(--space-4) 0 var(--space-2);
        color: var(--color-text);
    }

    .export-card p {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        margin-bottom: var(--space-6);
    }

    .progress-bar {
        height: 8px;
        background: var(--color-bg-subtle);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: var(--space-2);
    }

    .progress-fill {
        height: 100%;
        background: var(--color-primary);
        transition: width 0.3s ease;
    }

    .progress-text {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--color-bg-subtle);
        border-top: 3px solid var(--color-primary);
        border-radius: 50%;
        margin: 0 auto;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>
