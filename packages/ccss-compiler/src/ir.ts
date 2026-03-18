import path from 'node:path'
import type {
  CompilerIR,
  CompilerState,
  JsxAttribute,
  JsxChildNode,
  JsxNode,
  ParsedComponent,
} from './types.js'

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

const collectStateInputIds = (node: JsxNode, result: Set<string>): void => {
  if (node.tag === 'input') {
    const idAttr = node.attributes.find((attribute) => attribute.name === 'id')
    if (typeof idAttr?.value === 'string' && idAttr.value.startsWith('ccss:')) {
      result.add(idAttr.value)
    }
  }

  for (const child of node.children) {
    if (typeof child === 'string') {
      continue
    }
    collectStateInputIds(child, result)
  }
}

const createStateInputNode = (state: CompilerState): JsxNode => {
  const attributes: JsxAttribute[] = [
    { name: 'id', value: state.stateId },
    { name: 'className', value: 'ccss-state-input' },
    { name: 'type', value: 'checkbox' },
  ]

  if (state.kind === 'boolean' && state.initialValue === true) {
    attributes.push({ name: 'checked', value: null })
  }

  return {
    tag: 'input',
    attributes,
    children: [],
  }
}

const injectMissingStateInputs = (
  jsxRoot: JsxNode,
  states: CompilerState[],
): JsxNode => {
  const existingStateInputIds = new Set<string>()
  collectStateInputIds(jsxRoot, existingStateInputIds)

  const missingStateInputs = states
    .filter((state) => !existingStateInputIds.has(state.stateId))
    .map(createStateInputNode)

  if (missingStateInputs.length === 0) {
    return jsxRoot
  }

  return {
    ...jsxRoot,
    children: [...missingStateInputs, ...jsxRoot.children],
  }
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
  const jsxRootWithStateInputs = injectMissingStateInputs(component.jsxRoot, states)

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
    html: serializeNode(jsxRootWithStateInputs),
  }
}
