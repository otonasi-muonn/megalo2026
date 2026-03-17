import type { CompilerIR } from '../types.js'

export const emitManifest = (ir: CompilerIR): string => JSON.stringify({
  schemaVersion: 1,
  compiler: '@ccss/compiler',
  generatedAt: ir.generatedAt,
  sourcePath: ir.sourcePath,
  component: {
    name: ir.componentName,
    slug: ir.componentSlug,
  },
  domRoots: ir.domRoots,
  states: ir.states.map((state) => ({
    name: state.name,
    kind: state.kind,
    initialValue: state.initialValue,
    stateId: state.stateId,
  })),
}, null, 2) + '\n'
