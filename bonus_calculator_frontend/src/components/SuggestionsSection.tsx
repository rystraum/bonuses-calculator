import { useEffect, useState } from 'react'
import { Lightbulb, Trash2 } from 'lucide-react'
import { fmtDateTime, peso, pct, type Distribution, type DistributionResult, type Suggestion, type UUID } from '@/lib/model'
import { countChanges, useStore } from '@/lib/store'
import { describeChanges, type ChangeRow, type SuggestionMarkItem } from '@/lib/suggestions'
import { SectionHeader } from '@/components/chrome'
import SummaryView from '@/components/SummaryView'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ─── change table ─────────────────────────────────────────────────────────────

export function ChangeTable({ rows }: { rows: ChangeRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No field changes.</p>
  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
      <table className="ledger">
        <thead>
          <tr><th>Target</th><th>Field</th><th className="r">Current</th><th className="r">Suggested</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="font-medium">{r.target}</td>
              <td className="text-muted-foreground">{r.field}</td>
              <td className="r num text-muted-foreground">{r.before}</td>
              <td className={cn(
                'r num font-semibold',
                r.direction === 'up' && 'text-emerald-700',
                r.direction === 'down' && 'text-red-600',
              )}>{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── inline markers (owner view) ──────────────────────────────────────────────

/** Amber count chip beside a field that suggestion sets target; popover lists each suggestion. */
export function SuggestionMark({
  items, base, kind, onView,
}: {
  items: SuggestionMarkItem[]
  /** Numeric base for computing deltas; null for text fields. */
  base: number | null
  kind: 'money' | 'pct' | 'number' | 'text'
  onView: (suggestionId: UUID) => void
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  const fmt = (v: number | string | null): string => {
    if (v === null) return '—'
    if (kind === 'money') return peso(Number(v))
    if (kind === 'pct') return pct(Number(v))
    return String(v)
  }
  const delta = (v: number | string | null): number | null =>
    base === null || typeof v !== 'number' ? null : v - base

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${items.length} suggestion${items.length === 1 ? '' : 's'} for this field`}
          className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 text-[0.6875rem] font-semibold text-amber-800 normal-case tracking-normal hover:bg-amber-100"
        >
          <Lightbulb className="h-3 w-3" />
          {items.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b px-3 py-2 text-xs font-semibold">Suggested changes</div>
        <ul className="max-h-60 overflow-y-auto p-1.5">
          {items.map(({ suggestion, value }) => {
            const d = delta(value)
            return (
              <li key={suggestion.id} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60">
                <div className="min-w-0">
                  <div className="text-xs font-medium">{suggestion.user.username}</div>
                  <div className="num truncate text-xs text-muted-foreground" title={fmt(value)}>
                    {fmt(value)}
                    {d !== null && d !== 0 && (
                      <span className={d > 0 ? 'text-emerald-700' : 'text-red-600'}>
                        {' '}({d > 0 ? '+' : ''}{fmt(d)})
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setOpen(false); onView(suggestion.id) }}>
                  View
                </Button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// ─── suggestion list ──────────────────────────────────────────────────────────

export default function SuggestionsSection({ dist, onView }: { dist: Distribution; onView: (suggestionId: UUID) => void }) {
  const store = useStore()
  const suggestions = store.suggestions[dist.id] ?? []

  return (
    <section>
      <SectionHeader title="Suggestions" hint="Changes proposed by non-owners — nothing here is applied until the owner encodes it" />
      {suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No suggestions yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
          <table className="ledger">
            <thead>
              <tr><th>Author</th><th>Updated</th><th className="r">Changes</th><th>Explanation</th><th className="r" /></tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{s.user.username}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(s.updatedAt)}</td>
                  <td className="r num">{countChanges(s.changes)}</td>
                  <td className="max-w-md"><span className="block truncate text-muted-foreground">{s.explanation}</span></td>
                  <td className="r">
                    <Button variant="secondary" size="sm" onClick={() => onView(s.id)}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ─── full suggestion view ─────────────────────────────────────────────────────

export function SuggestionViewDialog({
  dist, suggestionId, onClose,
}: {
  dist: Distribution
  suggestionId: UUID | null
  onClose: () => void
}) {
  const store = useStore()
  const { fetchSuggestion, deleteSuggestion, sessionUserId } = store
  const [data, setData] = useState<{ suggestion: Suggestion; computation: DistributionResult } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!suggestionId) return
    let cancelled = false
    fetchSuggestion(suggestionId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong.') })
    return () => { cancelled = true }
  }, [suggestionId, fetchSuggestion])

  const suggestion = data?.suggestion ?? null
  // Simulated results, presented through the read-only summary with the
  // suggested top-level fields overlaid on the base distribution.
  const synthesized: Distribution | null = data && suggestion
    ? {
        ...dist,
        bonusBudget: suggestion.changes.distribution.bonusBudget ?? dist.bonusBudget,
        dividendBudget: suggestion.changes.distribution.dividendBudget ?? dist.dividendBudget,
        impactPct: suggestion.changes.distribution.impactPct ?? dist.impactPct,
        result: data.computation,
      }
    : null

  const remove = async () => {
    if (!suggestion) return
    setBusy(true)
    setError(null)
    const err = await deleteSuggestion(dist.id, suggestion.id)
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Dialog open={suggestionId !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Suggestion{suggestion ? ` by ${suggestion.user.username}` : ''}</DialogTitle>
          <DialogDescription>
            {suggestion
              ? `Submitted ${fmtDateTime(suggestion.insertedAt)} · ${countChanges(suggestion.changes)} changes`
              : 'Loading…'}
          </DialogDescription>
        </DialogHeader>
        {suggestion && (
          <div className="space-y-4">
            <blockquote className="rounded-lg border-l-4 border-amber-300 bg-amber-50 px-4 py-3 text-sm whitespace-pre-wrap">
              {suggestion.explanation}
            </blockquote>
            <ChangeTable rows={describeChanges(dist, suggestion.changes)} />
          </div>
        )}
        {synthesized ? (
          <SummaryView dist={synthesized} />
        ) : !error && (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading simulated results…</div>
        )}
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-sm text-red-600">{error}</span>
          <div className="flex gap-2">
            {suggestion && suggestion.user.id === sessionUserId && (
              <Button variant="destructive" onClick={remove} disabled={busy}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete my suggestion
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
