import path from 'node:path'
import type { CompilerIR, JsxChildNode, JsxNode, ParsedComponent } from './types.js'

const escapeHtml = (value: string): string => (
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
)

const toKebab = (value: string): string => (
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
)

const serializeAttribute = (name: string, value: string | null): string => {
  const normalizedName = (() => {
    if (name === 'className') return 'class'
    if (name === 'htmlFor') return 'for'
    return name
  })()
  if (value === null) {
    return normalizedName
  }
  return `${normalizedName}="${escapeHtml(value)}"`
}

const serializeChild = (child: JsxChildNode): string => {
  if (typeof child === 'string') {
    return escapeHtml(child)
  }
  return serializeNode(child)
}

const serializeNode = (node: JsxNode): string => {
  const attrs = node.attributes.map((attr) => serializeAttribute(attr.name, attr.value)).join(' ')
  const openTag = attrs.length > 0 ? `<${node.tag} ${attrs}>` : `<${node.tag}>`
  const children = node.children.map(serializeChild).join('')
  return `${openTag}${children}</${node.tag}>`
}

export const normalizeToCompilerIR = (
  component: ParsedComponent,
  sourcePath: string,
): CompilerIR => {
  const basename = path.basename(sourcePath, path.extname(sourcePath))
  const pageSlug = toKebab(basename) || 'poc'
  const componentSlug = toKebab(component.name) || 'component'

  const states = component.states.map((state) => ({
    name: state.name,
    kind: state.kind,
    initialValue: state.initialValue,
    stateId: `ccss:${pageSlug}:${componentSlug}:${toKebab(state.name) || 'state'}`,
  }))

  return {
    componentName: component.name,
    componentSlug,
    sourcePath,
    generatedAt: new Date().toISOString(),
    domRoots: {
      uiRootId: 'ccss-ui-root',
      gameRootId: 'ccss-game-root',
    },
    states,
    html: serializeNode(component.jsxRoot),
  }
}
