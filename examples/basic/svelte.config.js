const adapterType = process.env.ADAPTER_TYPE ?? 'esb'
const out = process.env.ADAPTER_OUT ?? 'build'

const adapter =
  adapterType === 'bun'
    ? (await import('kit-on-lambda/bun')).default({ out, runtime: 'node' })
    : (await import('kit-on-lambda')).default({ out })

export default { kit: { adapter } }
