<script lang="ts">
  let { data } = $props()
</script>

<svelte:head><title>kit-on-lambda basic example</title></svelte:head>

<h1>kit-on-lambda</h1>
<p>Runtime: {data.runtime}</p>
<p>Time: {data.timestamp}</p>
