/**
 * StorageProvider — the provider-agnostic object-storage seam (W8).
 *
 * Attachments split by size at rest: files at/below the inline cap are encrypted
 * into `attachments.content_ct` (jsonb) by the API; larger files are streamed to
 * an object store here and only their (encrypted) object ref lands in
 * `attachments.storage_ref_ct`. This module is the narrow seam every large-file
 * path calls through, mirroring the `EmbeddingsClient` / `LlmClient` shape:
 * an interface, a couple of real implementations, a deterministic fake for tests,
 * and an env-driven factory.
 *
 * Implementations:
 *  - {@link LocalFsStorageProvider} — the dev/CI backing: writes under a base dir
 *    (`STORAGE_LOCAL_DIR`); the object ref is the relative path. Real, works today.
 *  - {@link FakeStorageProvider} — in-memory, deterministic; for unit tests.
 *  - {@link S3StorageProvider} — production S3 / Cloudflare R2 backing using the
 *    AWS SDK v3, including custom endpoints and path-style requests.
 *
 * The stored ref itself is opaque to callers; the API encrypts it under the user
 * DEK before persisting, so the object store never sees plaintext refs and the
 * DB never sees plaintext bytes.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'

/** Per-object write hints. Cloud backings map these to object metadata. */
export interface PutOptions {
  /** MIME type recorded as the object's Content-Type (cloud backings). */
  contentType?: string
}

/**
 * The object-storage contract. `put` writes bytes under a caller-chosen `key` and
 * returns the canonical `ref` used to `get`/`delete` later (for local + S3 the ref
 * is the key; a backing is free to canonicalize it). All three are idempotent-safe
 * to retry.
 */
export interface StorageProvider {
  put(key: string, bytes: Uint8Array, opts?: PutOptions): Promise<{ ref: string }>
  get(ref: string): Promise<Uint8Array>
  delete(ref: string): Promise<void>
}

/** Default local base dir when `STORAGE_LOCAL_DIR` is unset (dev/CI convenience). */
const DEFAULT_LOCAL_DIR = join(tmpdir(), 'revido-attachments')

/**
 * Filesystem-backed storage for dev/CI. Objects live under {@link baseDir}; the
 * `ref` is the relative path passed as `key`. Refs are confined to the base dir
 * (a `..`/absolute ref that would escape is rejected) so a tampered, decrypted ref
 * can never read or clobber a file outside the store.
 */
export class LocalFsStorageProvider implements StorageProvider {
  readonly baseDir: string

  constructor(baseDir: string = DEFAULT_LOCAL_DIR) {
    this.baseDir = resolve(baseDir)
  }

  /** Resolve `ref` against the base dir, refusing anything that escapes it. */
  private resolveWithin(ref: string): string {
    const full = resolve(this.baseDir, ref)
    const prefix = this.baseDir.endsWith(sep) ? this.baseDir : this.baseDir + sep
    if (full !== this.baseDir && !full.startsWith(prefix)) {
      throw new Error(`storage ref escapes base dir: ${ref}`)
    }
    return full
  }

  async put(key: string, bytes: Uint8Array, _opts?: PutOptions): Promise<{ ref: string }> {
    const full = this.resolveWithin(key)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, bytes)
    return { ref: key }
  }

  async get(ref: string): Promise<Uint8Array> {
    const buf = await readFile(this.resolveWithin(ref))
    return new Uint8Array(buf)
  }

  async delete(ref: string): Promise<void> {
    await rm(this.resolveWithin(ref), { force: true })
  }
}

/**
 * Deterministic in-memory storage for tests. Same `key` ⇒ same `ref`; `get`
 * returns a copy of exactly what was `put` (bytes are cloned in and out so callers
 * cannot mutate stored state through the returned array).
 */
export class FakeStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, Uint8Array>()

  async put(key: string, bytes: Uint8Array, _opts?: PutOptions): Promise<{ ref: string }> {
    this.objects.set(key, Uint8Array.from(bytes))
    return { ref: key }
  }

  async get(ref: string): Promise<Uint8Array> {
    const bytes = this.objects.get(ref)
    if (!bytes) throw new Error(`storage ref not found: ${ref}`)
    return Uint8Array.from(bytes)
  }

  async delete(ref: string): Promise<void> {
    this.objects.delete(ref)
  }

  /** Test helper: number of stored objects. */
  get size(): number {
    return this.objects.size
  }
}

/** Connection config for the cloud backing (S3 or any S3-compatible store, e.g. R2). */
export interface S3StorageOptions {
  bucket: string
  region?: string
  /** Custom endpoint for S3-compatible stores (Cloudflare R2, MinIO). */
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
}

export interface S3CommandClient {
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>
}

/**
 * The production swap point — S3 / Cloudflare R2 backed object storage.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3CommandClient

  constructor(
    private readonly options: S3StorageOptions,
    client?: S3CommandClient,
  ) {
    const config: S3ClientConfig = {
      region: options.region ?? 'auto',
      ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}),
      ...(options.accessKeyId && options.secretAccessKey
        ? {
            credentials: {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            },
          }
        : {}),
    }
    this.client = client ?? new S3Client(config)
  }

  async put(key: string, bytes: Uint8Array, opts?: PutOptions): Promise<{ ref: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: bytes,
        ...(opts?.contentType ? { ContentType: opts.contentType } : {}),
      }),
    )
    return { ref: key }
  }

  async get(ref: string): Promise<Uint8Array> {
    const response = (await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: ref }),
    )) as {
      Body?: {
        transformToByteArray(): Promise<Uint8Array>
      }
    }
    if (!response.Body) throw new Error(`S3 object has no body: ${ref}`)
    return Uint8Array.from(await response.Body.transformToByteArray())
  }

  async delete(ref: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: ref }),
    )
  }
}

/**
 * Select a storage provider from the environment: the S3/R2 backing when
 * `STORAGE_S3_BUCKET` is set, else
 * the local filesystem provider under `STORAGE_LOCAL_DIR` (or a temp-dir default).
 * Never throws for the local path, so it is safe as a lazy default.
 */
export function createStorageProvider(env: NodeJS.ProcessEnv = process.env): StorageProvider {
  if (env.STORAGE_S3_BUCKET) {
    return new S3StorageProvider({
      bucket: env.STORAGE_S3_BUCKET,
      region: env.STORAGE_S3_REGION,
      endpoint: env.STORAGE_S3_ENDPOINT,
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
    })
  }
  return new LocalFsStorageProvider(env.STORAGE_LOCAL_DIR ?? DEFAULT_LOCAL_DIR)
}
