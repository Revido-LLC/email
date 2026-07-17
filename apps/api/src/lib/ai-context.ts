/**
 * Shared loaders for the AI routes: the caller's output-language preference and
 * learned voice profile, and a thread rendered into the domain `Thread` +
 * `Message[]` the `@revido/core` prompt builders consume.
 *
 * The voice profile (`users.voice_profile_ct`) is written by the worker and read
 * here (decrypted) so drafts can be written "in the user's voice"; the
 * output-language preference (`users.output_language`) steers every builder's
 * language directive. Thread + message content is decrypted through the same
 * row⇄DTO mappers the CRUD reads use, so an AI prompt sees exactly what the UI
 * shows.
 */
import type { DbTransaction } from '@revido/db/client'
import { messages, threads, users } from '@revido/db/schema'
import type { Message, OutputLanguage, Thread } from '@revido/db'
import { asc, eq } from 'drizzle-orm'
import type { UserCrypto } from './crypto'
import { assembleMessages, assembleThread } from './mappers'

/** The per-user AI steering context: language preference + optional voice profile. */
export interface UserAiContext {
  outputLanguage: OutputLanguage
  /** Decrypted learned writing-voice description, when the worker has built one. */
  voiceProfile?: string
}

/** Load the caller's output-language preference and (decrypted) voice profile. */
export async function loadUserAiContext(
  tx: DbTransaction,
  crypto: UserCrypto,
  userId: string,
): Promise<UserAiContext> {
  const row = (
    await tx
      .select({ outputLanguage: users.outputLanguage, voiceProfileCt: users.voiceProfileCt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  ).at(0)
  const context: UserAiContext = { outputLanguage: row?.outputLanguage ?? 'match' }
  const voice = crypto.decryptOptional(row?.voiceProfileCt)
  if (voice) context.voiceProfile = voice
  return context
}

/** A thread and its messages, decrypted into the domain DTOs for prompt building. */
export interface ThreadForPrompt {
  thread: Thread
  messages: Message[]
}

/** Load + decrypt a thread and its messages (oldest first), or `undefined` if absent. */
export async function loadThreadForPrompt(
  tx: DbTransaction,
  crypto: UserCrypto,
  threadId: string,
): Promise<ThreadForPrompt | undefined> {
  const row = (await tx.select().from(threads).where(eq(threads.id, threadId)).limit(1)).at(0)
  const thread = await assembleThread(tx, crypto, row)
  if (!thread) return undefined
  const messageRows = await tx
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.date))
  const assembled = await assembleMessages(tx, crypto, messageRows)
  return { thread, messages: assembled }
}
