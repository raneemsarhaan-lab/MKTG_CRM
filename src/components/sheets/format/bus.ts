'use client'

/**
 * The format toolbar and the open sheet talk through two document events
 * (spec 015 contracts/ui.md §1), as the undo buttons do (spec 013): the
 * Content and Video sheets are rendered by the board's page, not by the
 * workbook, so neither can hand the other props.
 *
 * - The sheet announces what is selected (`FORMAT_STATE`): the active
 *   cell's look, its value, whether it may be changed.
 * - The toolbar sends what to do (`FORMAT_CMD`): a style patch, a border
 *   preset, a merge, a new comment. The sheet turns it into format records,
 *   one undo step, and saves it.
 */
import { useEffect, useRef } from 'react'
import type { BorderSide, CellStyle } from '@/types/index'
import type { BorderPreset, StylePatch } from '@/lib/sheet-format'

export const FORMAT_STATE = 'momentum:format-state'
export const FORMAT_CMD = 'momentum:format-cmd'

export type FormatSource = 'blank' | 'linked'

export interface FormatState {
  source: FormatSource
  /** The active cell's look, all layers resolved. */
  style: CellStyle | null
  /** The active cell's value as typed. */
  value: string
  /** How people name the active cell: B4, or "Ramadan teaser · Status". */
  cell: string
  /** Why this member can't change the formatting here, or null. */
  readOnly: string | null
  /** Why Merge is off here (the Content and Video sheets), or null. */
  mergeOff: string | null
  /** The active cell is part of a merge. */
  merged: boolean
  /** More than one cell is selected. */
  multi: boolean
}

export type MergeMode = 'center' | 'across' | 'cells' | 'unmerge'
export type FormatCmd =
  | { kind: 'patch'; patch: StylePatch; label: string }
  | { kind: 'borders'; preset: BorderPreset; line: BorderSide }
  | { kind: 'merge'; mode: MergeMode }
  | { kind: 'comment' }

export const announceFormat = (s: FormatState | { source: FormatSource; gone: true }) =>
  document.dispatchEvent(new CustomEvent(FORMAT_STATE, { detail: s }))
export const sendFormat = (target: FormatSource, cmd: FormatCmd) =>
  document.dispatchEvent(new CustomEvent(FORMAT_CMD, { detail: { target, cmd } }))

/**
 * A sheet's side of the bus: announce `state` whenever it changes, and run
 * commands meant for this sheet. `enabled` false (a hidden linked pane) keeps
 * it quiet.
 */
export function useFormatBridge(source: FormatSource, enabled: boolean, state: FormatState | null, run: (cmd: FormatCmd) => void) {
  const runRef = useRef(run)
  runRef.current = run
  const key = state ? JSON.stringify(state) : ''
  useEffect(() => {
    if (enabled && state) announceFormat(state)
  }, [enabled, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled) return
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ target: FormatSource; cmd: FormatCmd }>).detail
      if (d.target === source) runRef.current(d.cmd)
    }
    document.addEventListener(FORMAT_CMD, on)
    return () => { document.removeEventListener(FORMAT_CMD, on); announceFormat({ source, gone: true }) }
  }, [enabled, source])
}
