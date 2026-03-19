<script lang="ts">
  import Controls from "./lib/components/Controls.svelte";
  import Editor2D from "./lib/components/Editor2D.svelte";
  import Canvas from "./lib/components/Canvas.svelte";
</script>

<main class="app-container">
  <Controls />
  <div class="previews-container">
    <Editor2D />
    <Canvas />
  </div>
</main>

<style>
  .app-container {
    display: flex;
    flex-direction: row;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .previews-container {
    flex: 1;
    display: flex;
    flex-direction: row;
    overflow: hidden;
  }

  /* Force both previews to share space exactly 50/50 */
  .previews-container > :global(*) {
    flex: 1 1 0px !important;
    min-width: 0 !important;
  }

  /* Stack previews on narrow screens */
  @media (max-width: 1100px) {
    .previews-container {
        flex-direction: column;
        overflow-y: auto;
    }
  }
</style>
