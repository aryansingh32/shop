export async function resolve(specifier, context, nextResolve) {
  const isCustomUtil = context.parentURL && context.parentURL.endsWith('custom-util.mjs');
  if ((specifier === 'node:util' || specifier === 'util') && !isCustomUtil) {
    return {
      shortCircuit: true,
      url: new URL('./custom-util.mjs', import.meta.url).href
    };
  }
  return nextResolve(specifier, context);
}
