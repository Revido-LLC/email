import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FakeStorageProvider,
  LocalFsStorageProvider,
  S3StorageProvider,
  createStorageProvider,
} from './index'

describe('LocalFsStorageProvider', () => {
  let baseDir: string
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'revido-storage-test-'))
  })
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('round-trips put → get and returns the key as the ref', async () => {
    const store = new LocalFsStorageProvider(baseDir)
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const { ref } = await store.put('attachments/u1/a.bin', bytes)
    expect(ref).toBe('attachments/u1/a.bin')
    expect(await store.get(ref)).toEqual(bytes)
    // The bytes really landed on disk at <baseDir>/<ref>.
    expect(new Uint8Array(await readFile(join(baseDir, ref)))).toEqual(bytes)
  })

  it('creates nested key directories on put', async () => {
    const store = new LocalFsStorageProvider(baseDir)
    await store.put('deep/nested/dir/obj', new Uint8Array([9]))
    expect(await store.get('deep/nested/dir/obj')).toEqual(new Uint8Array([9]))
  })

  it('delete removes the object and is idempotent', async () => {
    const store = new LocalFsStorageProvider(baseDir)
    await store.put('gone', new Uint8Array([7]))
    await store.delete('gone')
    await expect(store.get('gone')).rejects.toThrow()
    // Deleting a missing ref is a no-op (force: true).
    await expect(store.delete('gone')).resolves.toBeUndefined()
  })

  it('refuses a ref that escapes the base dir', async () => {
    const store = new LocalFsStorageProvider(baseDir)
    await expect(store.get('../escape')).rejects.toThrow(/escapes base dir/)
    await expect(store.put('../../etc/evil', new Uint8Array([1]))).rejects.toThrow(
      /escapes base dir/,
    )
  })
})

describe('FakeStorageProvider', () => {
  it('is deterministic: same key round-trips identical bytes', async () => {
    const store = new FakeStorageProvider()
    const bytes = new Uint8Array([10, 20, 30])
    const { ref } = await store.put('k', bytes)
    expect(ref).toBe('k')
    expect(await store.get('k')).toEqual(bytes)
  })

  it('clones bytes in and out so stored state is isolated from callers', async () => {
    const store = new FakeStorageProvider()
    const input = new Uint8Array([1, 2, 3])
    await store.put('k', input)
    input[0] = 99 // mutate the caller's array after storing
    const out = await store.get('k')
    expect(out).toEqual(new Uint8Array([1, 2, 3]))
    out[0] = 42 // mutate the returned array
    expect(await store.get('k')).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('get throws for a missing ref; delete updates size', async () => {
    const store = new FakeStorageProvider()
    await expect(store.get('missing')).rejects.toThrow(/not found/)
    await store.put('a', new Uint8Array([1]))
    await store.put('b', new Uint8Array([2]))
    expect(store.size).toBe(2)
    await store.delete('a')
    expect(store.size).toBe(1)
  })
})

describe('S3StorageProvider (unimplemented cloud swap)', () => {
  it('constructs but throws a clear message on every I/O method', async () => {
    const store = new S3StorageProvider({ bucket: 'revido-mail' })
    await expect(store.put('k', new Uint8Array([1]))).rejects.toThrow(/not implemented/i)
    await expect(store.get('k')).rejects.toThrow(/revido-mail/)
    await expect(store.delete('k')).rejects.toThrow(/not implemented/i)
  })
})

describe('createStorageProvider', () => {
  it('defaults to the local filesystem provider', () => {
    expect(createStorageProvider({} as NodeJS.ProcessEnv)).toBeInstanceOf(LocalFsStorageProvider)
  })

  it('honours STORAGE_LOCAL_DIR', () => {
    const provider = createStorageProvider({ STORAGE_LOCAL_DIR: '/var/revido' } as NodeJS.ProcessEnv)
    expect(provider).toBeInstanceOf(LocalFsStorageProvider)
    expect((provider as LocalFsStorageProvider).baseDir).toBe('/var/revido')
  })

  it('selects the S3 provider when STORAGE_S3_BUCKET is set', () => {
    expect(
      createStorageProvider({ STORAGE_S3_BUCKET: 'revido-mail' } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(S3StorageProvider)
  })
})
