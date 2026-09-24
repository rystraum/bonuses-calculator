// ─── suggestion helpers ───────────────────────────────────────────────────────
// Change-description and local-edit state for suggestion sets (see
// components/SuggestionsSection.tsx and components/SuggestionEditor.tsx).

import { useCallback, useEffect, useState } from 'react'
import { peso, pct, EMPTY_CHANGES } from './model'
import type { Distribution, SuggestedSpecialBonus, Suggestion, SuggestionChanges, UUID } from './model'
import { countChanges, useStore } from './store'

// ─── change descriptions ──────────────────────────────────────────────────────

export interface ChangeRow {
  key: string
  target: string
  field: string
  before: string
  after: string
  direction: 'up' | 'down' | 'neutral'
}

/** Flattens a suggestion set into before → after rows against the base distribution. */
export function describeChanges(dist: Distribution, changes: SuggestionChanges): ChangeRow[] {
  const rows: ChangeRow[] = []
  const dir = (before: number, after: number): ChangeRow['direction'] =>
    after > before ? 'up' : after < before ? 'down' : 'neutral'
  const weights = (impact: number) => `${pct(impact)} / ${pct(100 - impact)}`

  const d = changes.distribution
  if (d.bonusBudget !== undefined) {
    rows.push({
      key: 'dist-bonus', target: 'Distribution', field: 'Bonus budget',
      before: peso(dist.bonusBudget), after: peso(d.bonusBudget), direction: dir(dist.bonusBudget, d.bonusBudget),
    })
  }
  if (d.dividendBudget !== undefined) {
    rows.push({
      key: 'dist-dividend', target: 'Distribution', field: 'Dividend budget',
      before: peso(dist.dividendBudget), after: peso(d.dividendBudget), direction: dir(dist.dividendBudget, d.dividendBudget),
    })
  }
  if (d.impactPct !== undefined) {
    rows.push({
      key: 'dist-weights', target: 'Distribution', field: 'Weights (impact / effort)',
      before: weights(dist.impactPct), after: weights(d.impactPct), direction: dir(dist.impactPct, d.impactPct),
    })
  }

  for (const [gid, g] of Object.entries(changes.groups)) {
    const group = dist.groups.find((x) => x.id === gid)
    const name = group?.name ?? 'Group'
    if (g.allocationPct !== undefined) {
      rows.push({
        key: `group-${gid}-alloc`, target: name, field: 'Pool share',
        before: pct(group?.allocationPct ?? 0), after: pct(g.allocationPct),
        direction: dir(group?.allocationPct ?? 0, g.allocationPct),
      })
    }
    if (g.impactWeight !== undefined) {
      const baseImpact = group?.impactWeight ?? dist.impactPct
      rows.push({
        key: `group-${gid}-weights`, target: name, field: 'Weights (impact / effort)',
        before: weights(baseImpact), after: weights(g.impactWeight), direction: dir(baseImpact, g.impactWeight),
      })
    }
  }

  for (const [mid, m] of Object.entries(changes.members)) {
    const group = dist.groups.find((g) => g.members.some((mm) => mm.id === mid))
    const member = group?.members.find((mm) => mm.id === mid)
    const label = member ? `${member.name} (${group?.name})` : 'Member'
    if (m.hours !== undefined) {
      rows.push({
        key: `member-${mid}-hours`, target: label, field: 'Hours',
        before: String(member?.hours ?? 0), after: String(m.hours), direction: dir(member?.hours ?? 0, m.hours),
      })
    }
    if (m.multiplier !== undefined) {
      rows.push({
        key: `member-${mid}-multiplier`, target: label, field: 'Multiplier',
        before: pct(member?.multiplier ?? 100), after: pct(m.multiplier),
        direction: dir(member?.multiplier ?? 100, m.multiplier),
      })
    }
    if (m.note !== undefined) {
      rows.push({
        key: `member-${mid}-note`, target: label, field: 'Note',
        before: member?.note || '—', after: m.note || '—', direction: 'neutral',
      })
    }
  }

  changes.specialBonuses.forEach((b, i) => {
    rows.push({
      key: `bonus-${i}`, target: b.name, field: 'New special bonus',
      before: '—', after: peso(b.amount), direction: 'up',
    })
  })
  return rows
}

// ─── inline marker helpers ────────────────────────────────────────────────────

export interface SuggestionMarkItem {
  suggestion: Suggestion
  value: number | string | null
}

/** Picks the suggested value for one field out of every suggestion set. */
export function collectMarks(
  suggestions: Suggestion[],
  pick: (changes: SuggestionChanges) => number | string | null | undefined,
): SuggestionMarkItem[] {
  return suggestions.flatMap((suggestion) => {
    const value = pick(suggestion.changes)
    return value === undefined ? [] : [{ suggestion, value }]
  })
}

// ─── local suggestion state ───────────────────────────────────────────────────

export interface SuggestionState {
  changes: SuggestionChanges
  count: number
  setDistribution: (patch: Partial<SuggestionChanges['distribution']>) => void
  setGroup: (groupId: UUID, patch: Partial<SuggestionChanges['groups'][string]>) => void
  setMember: (memberId: UUID, patch: Partial<SuggestionChanges['members'][string]>) => void
  addSpecialBonus: (bonus: SuggestedSpecialBonus) => void
  removeSpecialBonus: (index: number) => void
  reset: () => void
}

/** Applies a patch to a change entry; `undefined` deletes a key. */
function mergePatch<T extends object>(entry: T, patch: Partial<T>): T {
  const merged = { ...entry }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (merged as Record<string, unknown>)[k]
    else (merged as Record<string, unknown>)[k] = v
  }
  return merged
}

/**
 * Local SuggestionChanges for a non-owner composing a suggestion. Fields that
 * match the base value are pruned, so only real deltas are recorded; edits
 * trigger the store's debounced simulate for live numbers.
 */
export function useSuggestionChanges(dist: Distribution): SuggestionState {
  const { simulate } = useStore()
  const [changes, setChanges] = useState<SuggestionChanges>(EMPTY_CHANGES)
  const count = countChanges(changes)

  // Live preview (debounced in the store); skipped while untouched — the base
  // computation already covers that case.
  useEffect(() => {
    if (countChanges(changes) > 0) simulate(dist.id, changes)
  }, [simulate, dist.id, changes])

  const setDistribution = useCallback((patch: Partial<SuggestionChanges['distribution']>) => {
    setChanges((prev) => {
      const merged = { ...prev.distribution, ...patch }
      if (merged.bonusBudget === dist.bonusBudget) delete merged.bonusBudget
      if (merged.dividendBudget === dist.dividendBudget) delete merged.dividendBudget
      if (merged.impactPct === dist.impactPct) delete merged.impactPct
      return { ...prev, distribution: merged }
    })
  }, [dist.bonusBudget, dist.dividendBudget, dist.impactPct])

  const setGroup = useCallback((groupId: UUID, patch: Partial<SuggestionChanges['groups'][string]>) => {
    setChanges((prev) => {
      const group = dist.groups.find((g) => g.id === groupId)
      if (!group) return prev
      const merged = mergePatch(prev.groups[groupId] ?? {}, patch)
      if (merged.allocationPct === group.allocationPct) delete merged.allocationPct
      if (merged.impactWeight === (group.impactWeight ?? dist.impactPct)) delete merged.impactWeight
      if (merged.effortWeight === (group.effortWeight ?? 100 - dist.impactPct)) delete merged.effortWeight
      const groups = { ...prev.groups }
      if (Object.keys(merged).length === 0) delete groups[groupId]
      else groups[groupId] = merged
      return { ...prev, groups }
    })
  }, [dist.groups, dist.impactPct])

  const setMember = useCallback((memberId: UUID, patch: Partial<SuggestionChanges['members'][string]>) => {
    setChanges((prev) => {
      const member = dist.groups.flatMap((g) => g.members).find((m) => m.id === memberId)
      if (!member) return prev
      const merged = mergePatch(prev.members[memberId] ?? {}, patch)
      if (merged.hours === member.hours) delete merged.hours
      if (merged.multiplier === member.multiplier) delete merged.multiplier
      if (merged.note === (member.note ?? null)) delete merged.note
      const members = { ...prev.members }
      if (Object.keys(merged).length === 0) delete members[memberId]
      else members[memberId] = merged
      return { ...prev, members }
    })
  }, [dist.groups])

  const addSpecialBonus = useCallback((bonus: SuggestedSpecialBonus) => {
    setChanges((prev) => ({ ...prev, specialBonuses: [...prev.specialBonuses, bonus] }))
  }, [])
  const removeSpecialBonus = useCallback((index: number) => {
    setChanges((prev) => ({ ...prev, specialBonuses: prev.specialBonuses.filter((_, i) => i !== index) }))
  }, [])
  const reset = useCallback(() => setChanges(EMPTY_CHANGES), [])

  return { changes, count, setDistribution, setGroup, setMember, addSpecialBonus, removeSpecialBonus, reset }
}
