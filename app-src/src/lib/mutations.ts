import { db } from '../db'
import type { OutboxMutation } from '../types'
import { getDeviceId, newId } from './ids'

export async function queueMutation(args: Omit<OutboxMutation, 'mutationId' | 'createdAt' | 'deviceId' | 'idempotencyKey' | 'syncStatus' | 'retryCount'>) {
  const mutation: OutboxMutation = {
    ...args,
    mutationId: newId(),
    createdAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    idempotencyKey: newId(),
    syncStatus: 'pending',
    retryCount: 0,
  }
  await db.outbox.put(mutation)
  return mutation
}

export async function audit(entityId: string, entityType: string, action: string, payload?: unknown) {
  await db.audit.put({
    id: newId(),
    entityId,
    entityType,
    action,
    payload,
    createdAt: new Date().toISOString(),
    deviceId: getDeviceId(),
  })
}
