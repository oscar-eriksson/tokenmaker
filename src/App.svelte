<script lang="ts">
  import Controls from "./lib/components/Controls.svelte";
  import Editor2D from "./lib/components/Editor2D.svelte";
  import Canvas from "./lib/components/Canvas.svelte";
</script>

<main class="app-container">
  <Controls />
  <Editor2D />
  <Canvas />
</main>

<style>
  .app-container {
    display: flex;
    flex-direction: row;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }
</style>
