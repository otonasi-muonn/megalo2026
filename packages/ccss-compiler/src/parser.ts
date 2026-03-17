import ts from 'typescript'
import type { JsxAttribute, JsxChildNode, JsxNode, ParseOutput, ParsedComponent, ParsedState, SubsetError } from './types.js'

const ALLOWED_TAGS = new Set(['div', 'button', 'input', 'label', 'section', 'main', 'nav', 'canvas'])

type ComponentCandidate = {
  name: string
  functionNode: ts.FunctionLikeDeclaration
  returnExpression: ts.JsxElement | ts.JsxSelfClosingElement
}

const createError = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
  message: string,
): SubsetError => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return {
    message,
    line: line + 1,
    column: character + 1,
  }
}

const getCallExpressionName = (expression: ts.Expression): string | null => {
  if (ts.isIdentifier(expression)) {
    return expression.text
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text
  }
  return null
}

const isAllowedConditionNode = (node: ts.Expression): boolean => {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
    const leftOk = ts.isIdentifier(node.left)
    const rightOk =
      ts.isStringLiteral(node.right) ||
      ts.isNumericLiteral(node.right) ||
      node.right.kind === ts.SyntaxKind.TrueKeyword ||
      node.right.kind === ts.SyntaxKind.FalseKeyword
    return leftOk && rightOk
  }
  return false
}

const parseAttributeValue = (value: ts.JsxAttributeValue | undefined): string | null => {
  if (!value) {
    return null
  }
  if (ts.isStringLiteral(value)) {
    return value.text
  }
  if (ts.isJsxExpression(value)) {
    if (!value.expression) return ''
    if (ts.isStringLiteral(value.expression) || ts.isNoSubstitutionTemplateLiteral(value.expression)) {
      return value.expression.text
    }
    if (ts.isNumericLiteral(value.expression)) {
      return value.expression.text
    }
    if (value.expression.kind === ts.SyntaxKind.TrueKeyword) {
      return 'true'
    }
    if (value.expression.kind === ts.SyntaxKind.FalseKeyword) {
      return 'false'
    }
    return `{{${value.expression.getText()}}}`
  }
  return value.getText()
}

const parseJsxChildren = (
  sourceFile: ts.SourceFile,
  children: readonly ts.JsxChild[],
  errors: SubsetError[],
): JsxChildNode[] => {
  const result: JsxChildNode[] = []

  for (const child of children) {
    if (ts.isJsxText(child)) {
      const trimmed = child.getText().replace(/\s+/g, ' ').trim()
      if (trimmed.length > 0) {
        result.push(trimmed)
      }
      continue
    }

    if (ts.isJsxExpression(child)) {
      if (!child.expression) continue
      if (ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression)) {
        result.push(child.expression.text)
      } else if (ts.isNumericLiteral(child.expression)) {
        result.push(child.expression.text)
      } else {
        result.push(`{{${child.expression.getText()}}}`)
      }
      continue
    }

    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      const parsed = parseJsxNode(sourceFile, child, errors)
      if (parsed) {
        result.push(parsed)
      }
      continue
    }

    if (ts.isJsxFragment(child)) {
      errors.push(createError(sourceFile, child, 'JSXフラグメントはPoCサブセット外です。単一タグでラップしてください。'))
      continue
    }
  }

  return result
}

const parseJsxNode = (
  sourceFile: ts.SourceFile,
  jsxNode: ts.JsxElement | ts.JsxSelfClosingElement,
  errors: SubsetError[],
): JsxNode | null => {
  const opening = ts.isJsxElement(jsxNode) ? jsxNode.openingElement : jsxNode
  const tag = opening.tagName.getText()

  if (!ALLOWED_TAGS.has(tag)) {
    errors.push(createError(sourceFile, opening.tagName, `許可されていないタグ <${tag}> が使用されています。`))
    return null
  }

  const attributes: JsxAttribute[] = []
  for (const prop of opening.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) {
      errors.push(createError(sourceFile, prop, 'スプレッド属性はPoCサブセット外です。'))
      continue
    }
    attributes.push({
      name: prop.name.getText(),
      value: parseAttributeValue(prop.initializer),
    })
  }

  const children = ts.isJsxElement(jsxNode)
    ? parseJsxChildren(sourceFile, jsxNode.children, errors)
    : []

  return {
    tag,
    attributes,
    children,
  }
}

const extractUseStateDeclarations = (
  sourceFile: ts.SourceFile,
  functionNode: ts.FunctionLikeDeclaration,
  errors: SubsetError[],
): ParsedState[] => {
  const states: ParsedState[] = []
  if (!functionNode.body || !ts.isBlock(functionNode.body)) {
    return states
  }

  for (const statement of functionNode.body.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isArrayBindingPattern(declaration.name) || !declaration.initializer) continue
      if (!ts.isCallExpression(declaration.initializer)) continue

      const calleeName = getCallExpressionName(declaration.initializer.expression)
      if (calleeName !== 'useState') continue

      const first = declaration.name.elements[0]
      const second = declaration.name.elements[1]
      if (
        !first ||
        !second ||
        !ts.isBindingElement(first) ||
        !ts.isBindingElement(second) ||
        !ts.isIdentifier(first.name) ||
        !ts.isIdentifier(second.name)
      ) {
        errors.push(createError(sourceFile, declaration.name, 'useStateの分割代入は [state, setState] 形式のみ許可します。'))
        continue
      }

      const initialArg = declaration.initializer.arguments[0]
      if (!initialArg) {
        errors.push(createError(sourceFile, declaration.initializer, 'useStateの初期値は必須です。'))
        continue
      }

      if (initialArg.kind === ts.SyntaxKind.TrueKeyword || initialArg.kind === ts.SyntaxKind.FalseKeyword) {
        states.push({
          name: first.name.text,
          setterName: second.name.text,
          kind: 'boolean',
          initialValue: initialArg.kind === ts.SyntaxKind.TrueKeyword,
        })
        continue
      }

      if (ts.isStringLiteral(initialArg) || ts.isNoSubstitutionTemplateLiteral(initialArg)) {
        states.push({
          name: first.name.text,
          setterName: second.name.text,
          kind: 'enum',
          initialValue: initialArg.text,
        })
        continue
      }

      errors.push(createError(sourceFile, initialArg, 'useState初期値は boolean または文字列リテラルのみ許可します。'))
    }
  }

  return states
}

const validateComponentBody = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
  errors: SubsetError[],
): void => {
  const walk = (current: ts.Node): void => {
    if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
      errors.push(createError(sourceFile, current, 'Class構文はPoCサブセット外です。関数コンポーネントを使用してください。'))
    }

    if (ts.isCallExpression(current) && getCallExpressionName(current.expression) === 'useEffect') {
      errors.push(createError(sourceFile, current, 'useEffectはPoCサブセット外です。'))
    }

    if (ts.isIfStatement(current) && !isAllowedConditionNode(current.expression)) {
      errors.push(createError(sourceFile, current.expression, 'if条件は `state === literal` 形式のみ許可します。'))
    }

    if (ts.isConditionalExpression(current) && !isAllowedConditionNode(current.condition)) {
      errors.push(createError(sourceFile, current.condition, '三項演算条件は `state === literal` 形式のみ許可します。'))
    }

    ts.forEachChild(current, walk)
  }

  walk(node)
}

const getJsxLikeExpression = (
  expression: ts.Expression | null | undefined,
): ts.JsxElement | ts.JsxSelfClosingElement | null => {
  if (!expression) return null

  let current: ts.Expression = expression
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression
  }

  if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
    return current
  }
  return null
}

const findReturnExpression = (functionLike: ts.FunctionLikeDeclaration): ts.Expression | null => {
  if (!functionLike.body) return null

  if (ts.isBlock(functionLike.body)) {
    for (const statement of functionLike.body.statements) {
      if (ts.isReturnStatement(statement) && statement.expression) {
        return statement.expression
      }
    }
    return null
  }

  return functionLike.body
}

const findComponentCandidate = (sourceFile: ts.SourceFile): ComponentCandidate | null => {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const returnExpression = findReturnExpression(statement)
      const jsxExpression = getJsxLikeExpression(returnExpression)
      if (jsxExpression) {
        return {
          name: statement.name.text,
          functionNode: statement,
          returnExpression: jsxExpression,
        }
      }
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isArrowFunction(declaration.initializer)) {
          continue
        }
        const returnExpression = findReturnExpression(declaration.initializer)
        const jsxExpression = getJsxLikeExpression(returnExpression)
        if (!jsxExpression) {
          continue
        }
        return {
          name: declaration.name.text,
          functionNode: declaration.initializer,
          returnExpression: jsxExpression,
        }
      }
    }
  }

  return null
}

export const parseComponentSource = (
  sourceText: string,
  sourcePath: string,
): ParseOutput => {
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const errors: SubsetError[] = []

  const candidate = findComponentCandidate(sourceFile)
  if (!candidate) {
    return {
      component: null,
      errors: [{ message: 'JSXを返す関数コンポーネントが見つかりません。', line: 1, column: 1 }],
    }
  }

  validateComponentBody(sourceFile, candidate.functionNode, errors)

  const states = extractUseStateDeclarations(sourceFile, candidate.functionNode, errors)
  const jsxRoot = parseJsxNode(sourceFile, candidate.returnExpression, errors)
  if (!jsxRoot) {
    return {
      component: null,
      errors,
    }
  }

  const component: ParsedComponent = {
    name: candidate.name,
    states,
    jsxRoot,
  }

  return {
    component,
    errors,
  }
}
