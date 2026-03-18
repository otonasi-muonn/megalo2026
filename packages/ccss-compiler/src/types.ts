export type SubsetError = {
  message: string
  line: number
  column: number
}

export type ParsedState = {
  name: string
  setterName: string
  kind: 'boolean' | 'enum'
  initialValue: boolean | string
  enumValues?: string[]
}

export type JsxAttribute = {
  name: string
  value: string | null
}

export type JsxChildNode = JsxNode | string

export type JsxNode = {
  tag: string
  attributes: JsxAttribute[]
  children: JsxChildNode[]
}

export type ParsedComponent = {
  name: string
  states: ParsedState[]
  jsxRoot: JsxNode
}

export type ParseOutput = {
  component: ParsedComponent | null
  errors: SubsetError[]
}

export type CompilerState = {
  name: string
  kind: 'boolean' | 'enum'
  initialValue: boolean | string
  stateId: string
  enumValues?: string[]
}

export type CompilerIR = {
  componentName: string
  componentSlug: string
  sourcePath: string
  generatedAt: string
  domRoots: {
    uiRootId: 'ccss-ui-root'
    gameRootId: 'ccss-game-root'
  }
  states: CompilerState[]
  html: string
}
