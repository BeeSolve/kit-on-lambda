<script lang="ts">
  let { data } = $props();
</script>

<h1>kit-on-lambda — observability example</h1>
<p>Runtime: {data.runtime}</p>
<p>Rendered at: {data.timestamp}</p>
<p>
  A request to this page emits <code>sveltekit.handle.root</code>,
  <code>sveltekit.resolve</code> and <code>sveltekit.load</code> spans.
</p>
