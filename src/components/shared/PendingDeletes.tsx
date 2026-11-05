'use client'

import { useEffect } from 'react'
import { removeAttachment } from '@/actions/tasks'
import { configurePendingDeletes } from '@/lib/pending-deletes'
import { PendingDeleteMessage } from './PendingDeleteMessage'

/**
 * Mounted once in the signed-in layout, above every page that opens a task
 * panel (the board and the personal board): wires pending attachment deletes
 * to the real server action and shows the bottom Undo message (spec 007 R4).
 */
export function PendingDeletes() {
  useEffect(() => { configurePendingDeletes(id => removeAttachment(id)) }, [])
  return <PendingDeleteMessage />
}
