import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { emitCSource } from './emitter/c.js'
import { emitCssSource } from './emitter/css.js'
import { emitManifest } from './emitter/manifest.js'
import { normalizeToCompilerIR } from './ir.js'
import { parseComponentSource } from './parser.js'

type CliOptions = {
  input: string
  outDir: string
}

const printUsage = (): void => {
  console.log('Usage: node dist/cli.js --input <path/to/file.tsx> --outDir <path/to/output>')
}

const parseArgs = (argv: string[]): CliOptions | null => {
  let input = ''
  let outDir = ''

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i]
    if (current === '--input') {
      input = argv[i + 1] ?? ''
      i += 1
      continue
    }
    if (current === '--outDir') {
      outDir = argv[i + 1] ?? ''
      i += 1
      continue
    }
  }

  if (!input || !outDir) {
    return null
  }

  return { input, outDir }
}

const run = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  if (!options) {
    printUsage()
    process.exitCode = 1
    return
  }

  const sourcePath = path.resolve(options.input)
  const outDir = path.resolve(options.outDir)

  const source = await readFile(sourcePath, 'utf8')
  const parseResult = parseComponentSource(source, sourcePath)
  if (!parseResult.component || parseResult.errors.length > 0) {
    for (const error of parseResult.errors) {
      console.error(`[CCSS_PARSE_ERROR] ${sourcePath}:${error.line}:${error.column} ${error.message}`)
    }
    process.exitCode = 1
    return
  }

  const ir = normalizeToCompilerIR(parseResult.component, sourcePath)
  const generatedC = emitCSource(ir)
  const generatedCss = emitCssSource(ir)
  const generatedManifest = emitManifest(ir)

  await mkdir(outDir, { recursive: true })
  await Promise.all([
    writeFile(path.join(outDir, 'ui.generated.c'), generatedC, 'utf8'),
    writeFile(path.join(outDir, 'ui.generated.css'), generatedCss, 'utf8'),
    writeFile(path.join(outDir, 'ccss.manifest.json'), generatedManifest, 'utf8'),
  ])

  console.log('Generated files:')
  console.log(`- ${path.join(outDir, 'ui.generated.c')}`)
  console.log(`- ${path.join(outDir, 'ui.generated.css')}`)
  console.log(`- ${path.join(outDir, 'ccss.manifest.json')}`)
}

run().catch((error) => {
  console.error('[CCSS_FATAL]', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
