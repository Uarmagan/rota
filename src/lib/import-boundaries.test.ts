import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The architecture's dependency rules as executable allowlists (ARCHITECTURE.md,
// "Module map"). Deliberately dumb: regex over import specifiers, no AST.

const SRC = resolve(__dirname, '..')
const LLM_PACKAGES = /^(ai$|@ai-sdk\/)/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
}

describe('import boundaries', () => {
  it('engine imports only zod, schema, and engine (allowlist)', () => {
    const engineDir = join(SRC, 'lib', 'engine')
    for (const file of sourceFiles(engineDir)) {
      const isTest = file.endsWith('.test.ts')
      for (const spec of importSpecifiers(file)) {
        if (spec === 'zod') continue
        if (isTest && spec === 'vitest') continue
        expect(spec.startsWith('.'), `${file} imports '${spec}'`).toBe(true)
        const target = resolve(join(file, '..'), spec)
        const allowed =
          target.startsWith(join(SRC, 'lib', 'engine')) ||
          target.startsWith(join(SRC, 'lib', 'schema'))
        expect(allowed, `${file} imports outside engine/schema: '${spec}'`).toBe(true)
      }
    }
  })

  it('LLM packages are imported only under parser/ and prose/', () => {
    for (const file of sourceFiles(SRC)) {
      const allowed =
        file.startsWith(join(SRC, 'lib', 'parser')) ||
        file.startsWith(join(SRC, 'lib', 'prose'))
      if (allowed) continue
      for (const spec of importSpecifiers(file)) {
        expect(
          LLM_PACKAGES.test(spec),
          `${file} imports LLM package '${spec}' outside the LLM boundary`,
        ).toBe(false)
      }
    }
  })

  it('parser non-test files import only LLM packages, zod, schema, and parser files', () => {
    const parserDir = join(SRC, 'lib', 'parser')
    for (const file of sourceFiles(parserDir)) {
      if (file.endsWith('.test.ts')) continue
      for (const spec of importSpecifiers(file)) {
        if (spec === 'zod' || LLM_PACKAGES.test(spec)) continue
        expect(spec.startsWith('.'), `${file} imports '${spec}'`).toBe(true)
        const target = resolve(join(file, '..'), spec)
        const allowed =
          target.startsWith(join(SRC, 'lib', 'parser')) ||
          target.startsWith(join(SRC, 'lib', 'schema'))
        expect(allowed, `${file} imports outside parser/schema: '${spec}'`).toBe(true)
      }
    }
  })

  it('schema imports nothing but zod and other schema files', () => {
    const schemaDir = join(SRC, 'lib', 'schema')
    for (const file of sourceFiles(schemaDir)) {
      for (const spec of importSpecifiers(file)) {
        const ok = spec === 'zod' || spec.startsWith('./')
        expect(ok, `${file} imports '${spec}'`).toBe(true)
      }
    }
  })
})
