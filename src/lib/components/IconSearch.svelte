<script lang="ts">
    import { onMount } from "svelte";
    import { tokenConfig, isGenerating } from "../stores";

    let searchQuery = "";
    let showResults = false;
    let allIcons: { name: string; path: string }[] = [];
    let filteredIcons: { name: string; path: string }[] = [];
    let activeIndex = -1;
    let dropdownEl: HTMLUListElement;

    onMount(async () => {
        try {
            const res = await fetch("/icons.json");
            if (res.ok) {
                allIcons = await res.json();
            }
        } catch (e) {
            console.error("Failed to load icons list", e);
        }
    });

    function handleSearch(event: Event) {
        const query = (event.target as HTMLInputElement).value.toLowerCase();
        searchQuery = query;
        activeIndex = -1;
        if (query.trim().length > 1) {
            filteredIcons = allIcons
                .filter((icon) => icon.name.toLowerCase().includes(query))
                .slice(0, 50);
            showResults = true;
        } else {
            showResults = false;
            filteredIcons = [];
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (!showResults || filteredIcons.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, filteredIcons.length - 1);
            scrollActiveIntoView();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, -1);
            scrollActiveIntoView();
        } else if ((e.key === 'Enter' || e.key === ' ') && activeIndex >= 0) {
            e.preventDefault();
            selectIcon(filteredIcons[activeIndex]);
        } else if (e.key === 'Escape') {
            showResults = false;
            activeIndex = -1;
        }
    }

    function scrollActiveIntoView() {
        if (!dropdownEl || activeIndex < 0) return;
        const item = dropdownEl.children[activeIndex] as HTMLElement;
        item?.scrollIntoView({ block: 'nearest' });
    }

    async function selectIcon(icon: { name: string; path: string }) {
        searchQuery = icon.name;
        showResults = false;
        isGenerating.set(true);

        // Fetch the raw SVG from github
        const url = `https://raw.githubusercontent.com/game-icons/icons/master/${icon.path}`;
        try {
            const res = await fetch(url);
            if (res.ok) {
                const svgContent = await res.text();
                tokenConfig.update((c) => {
                    c.svgContent = svgContent;
                    return c;
                });
            } else {
                console.error("Failed to fetch icon", url);
            }
        } catch (e) {
            console.error("Error fetching icon SVG", e);
            isGenerating.set(false);
        }
    }
</script>

<div class="search-container">
    <label class="control-label" for="icon-search">Search game-icons.net</label>
    <div class="input-wrapper">
        <input
            id="icon-search"
            type="text"
            placeholder="e.g. sword, shield, fire..."
            value={searchQuery}
            on:input={handleSearch}
            on:keydown={handleKeydown}
            on:focus={() => {
                if (searchQuery.trim().length > 1) showResults = true;
            }}
            on:blur={() => {
                setTimeout(() => (showResults = false), 200);
            }}
            autocomplete="off"
        />
    </div>

    {#if showResults && filteredIcons.length > 0}
        <ul class="dropdown" bind:this={dropdownEl}>
            {#each filteredIcons as icon, i}
                <li>
                    <button
                        class="result-btn"
                        class:active={i === activeIndex}
                        on:click={() => selectIcon(icon)}
                    >
                        {icon.name}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .search-container {
        position: relative;
        width: 100%;
    }

    .input-wrapper input {
        width: 100%;
        padding: 0.6rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: var(--font-size-sm);
    }

    .dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: 4px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        max-height: 250px;
        overflow-y: auto;
        z-index: 100;
        padding: 0;
        list-style: none;
    }

    .dropdown li {
        margin: 0;
        padding: 0;
    }

    .result-btn {
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        padding: 0.5rem 1rem;
        font-size: var(--font-size-sm);
        color: var(--color-text);
        border-radius: 0;
        cursor: pointer;
    }

    .result-btn:hover,
    .result-btn:focus,
    .result-btn.active {
        background: var(--color-surface-hover);
        color: var(--color-primary);
        outline: none;
    }
</style>
