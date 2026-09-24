import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { Plus, Send, Trash2 } from 'lucide-react'
import {
  EMPTY_RESULT, peso, pct,
  type DistGroup, type Distribution,
} from '@/lib/model'
import { useStore } from '@/lib/store'
import { describeChanges, type SuggestionState } from '@/lib/suggestions'
import { Money, NoteInput, NumInput, SectionHeader } from '@/components/chrome'
import { ChangeTable } from '@/components/SuggestionsSection'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const fmtDate = (iso: string) => format(parseISO(iso.slice(0, 10)), 'MMM d, yyyy')

// Edited cells: green when raised vs base, red when lowered; notes get amber.
const numRing = (edited: boolean, value: number, base: number): string =>
  !edited ? '' : value > base ? 'ring-2 ring-emerald-500' : value < base ? 'ring-2 ring-red-500' : ''
const noteRing = (edited: boolean): string => (edited ? 'ring-2 ring-amber-400' : '')

// ─── suggestion editor ────────────────────────────────────────────────────────

/** DraftEditor mirror for non-owners: edits land in a local SuggestionChanges. */
export default function SuggestionEditor({ dist, state }: { dist: Distribution; state: SuggestionState }) {
  const store = useStore()
  const { changes } = state
  const preview = store.simulations[dist.id] ?? store.computations[dist.id] ?? EMPTY_RESULT

  const bonusBudget = changes.distribution.bonusBudget ?? dist.bonusBudget
  const dividendBudget = changes.distribution.dividendBudget ?? dist.dividendBudget
  const impactPct = changes.distribution.impactPct ?? dist.impactPct
  const allocOf = (g: DistGroup) => changes.groups[g.id]?.allocationPct ?? g.allocationPct
  const allocTotal = dist.groups.reduce((s, g) => s + allocOf(g), 0)
  const totalBudget = bonusBudget + (dist.includeShareholders ? dividendBudget : 0)
  const totalShares = preview.dividends.reduce((s, d) => s + d.shares, 0)
  const totalOwnership = preview.dividends.reduce((s, d) => s + d.pct, 0)

  return (
    <div className="space-y-10">
      {/* config strip */}
      <section className="rounded-lg border bg-card p-4 shadow-xs">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-4">
            <label className="block">
              <span className="kicker mb-1.5 block">Total bonus budget</span>
              <NumInput
                className={cn('!border-input h-10 !bg-background text-lg font-semibold',
                  numRing(changes.distribution.bonusBudget !== undefined, bonusBudget, dist.bonusBudget))}
                value={bonusBudget}
                onCommit={(n) => state.setDistribution({ bonusBudget: n })} />
            </label>
            {dist.includeShareholders && (
              <label className="block">
                <span className="kicker mb-1.5 block">Total dividend budget</span>
                <NumInput
                  className={cn('!border-input h-10 !bg-background text-lg font-semibold',
                    numRing(changes.distribution.dividendBudget !== undefined, dividendBudget, dist.dividendBudget))}
                  value={dividendBudget}
                  onCommit={(n) => state.setDistribution({ dividendBudget: n })} />
              </label>
            )}
            <div>
              <span className="kicker mb-1.5 block">Total budget</span>
              <div className="num flex h-10 items-center text-lg font-semibold">{peso(totalBudget)}</div>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">Bonus + dividends, read-only.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <span className="kicker mb-1.5 block">Impact / effort weighting</span>
              <div className="flex items-center gap-2">
                <NumInput
                  className={cn('!border-input h-10 !bg-background font-semibold',
                    numRing(changes.distribution.impactPct !== undefined, impactPct, dist.impactPct))}
                  value={impactPct} suffix="% impact"
                  onCommit={(n) => state.setDistribution({ impactPct: Math.min(100, Math.max(0, Math.round(n))) })} />
                <NumInput className="!border-input h-10 !bg-background font-semibold" value={100 - impactPct} suffix="% effort"
                  onCommit={(n) => state.setDistribution({ impactPct: Math.min(100, Math.max(0, Math.round(100 - n))) })} />
              </div>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">Always totals 100% — editing one side adjusts the other.</p>
            </div>
            <div>
              <span className="kicker mb-1.5 block">Group allocation</span>
              <div className={cn(
                'num flex h-10 items-center text-lg font-semibold',
                Math.abs(allocTotal - 100) < 0.001 ? 'text-emerald-700' : 'text-amber-700',
              )}>
                {pct(allocTotal)}
              </div>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                {Math.abs(allocTotal - 100) < 0.001 ? 'Fully allocated.' : 'Should total 100% across groups.'}
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <span className="kicker mb-1.5 block">Planned date</span>
              <div className="flex h-10 items-center font-semibold">
                {dist.plannedDate ? fmtDate(dist.plannedDate) : '—'}
              </div>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">Only the owner can change the planned date.</p>
            </div>
          </div>
        </div>
      </section>

      {/* dividends preview */}
      {dist.includeShareholders && (
        <section>
          <SectionHeader title="Dividends" hint="Auto-split of the dividend budget by shares owned — updates live as you type">
            <Money value={preview.dividendPaidOut} className="text-sm font-semibold" />
          </SectionHeader>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
            <table className="ledger">
              <thead>
                <tr><th>Shareholder</th><th className="r">Shares</th><th className="r">Ownership</th><th className="r">Dividend</th></tr>
              </thead>
              <tbody>
                {preview.dividends.map((d) => (
                  <tr key={d.shareholderId}>
                    <td className="font-medium">{d.name}</td>
                    <td className="r num">{d.shares}</td>
                    <td className="r num text-muted-foreground">{pct(d.pct)}</td>
                    <td className="r"><Money value={d.amount} className="font-semibold" /></td>
                  </tr>
                ))}
                {preview.dividends.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No shareholders yet — add them under Admin setup → Shareholders.
                  </td></tr>
                )}
              </tbody>
              {preview.dividends.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="font-semibold">Total</td>
                    <td className="r num font-semibold">{totalShares.toLocaleString()}</td>
                    <td className="r num text-muted-foreground">{pct(totalOwnership)}</td>
                    <td className="r"><Money value={preview.dividendPaidOut} className="font-semibold" /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* bonus groups */}
      <section>
        <SectionHeader title="Bonuses by group"
          hint="Your edits here become a suggestion for the owner — amounts update live from the simulated result" />

        <div className="space-y-4">
          {dist.groups.map((g) => {
            const pg = preview.groups.find((x) => x.groupId === g.id)
            const gChanges = changes.groups[g.id]
            const alloc = allocOf(g)
            const baseImpact = g.impactWeight ?? dist.impactPct
            const baseEffort = g.effortWeight ?? 100 - dist.impactPct
            const effImpact = gChanges?.impactWeight ?? baseImpact
            const effEffort = gChanges?.effortWeight ?? baseEffort
            return (
              <div key={g.id} className="overflow-x-auto rounded-lg border bg-card shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-muted/40 px-3 py-2">
                  <span className="font-display text-base font-semibold">{g.name}</span>
                  <div className="flex items-center gap-4">
                    <label className="flex w-44 items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="shrink-0">Pool share</span>
                      <NumInput value={alloc} suffix="%"
                        className={numRing(gChanges?.allocationPct !== undefined, alloc, g.allocationPct)}
                        onCommit={(n) => state.setGroup(g.id, { allocationPct: n })} />
                    </label>
                    <SuggestionGroupWeights
                      key={`${effImpact}-${effEffort}`}
                      impact={effImpact}
                      effort={effEffort}
                      className={gChanges?.impactWeight === undefined
                        ? ''
                        : numRing(true, effImpact, baseImpact)}
                      onCommit={(i, e) => state.setGroup(g.id, i === null || e === null
                        ? { impactWeight: undefined, effortWeight: undefined }
                        : { impactWeight: i, effortWeight: e })}
                    />
                    {pg && (
                      <span className="num hidden text-xs text-muted-foreground sm:block">
                        {peso(pg.budget)} budget → <b className="text-foreground">{peso(pg.paidOut)}</b> paid
                      </span>
                    )}
                  </div>
                </div>
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th className="r w-32">Hours (effort)</th>
                      <th className="r w-36">Multiplier (impact)</th>
                      <th className="w-56">Note</th>
                      <th className="r">Effort ₱</th>
                      <th className="r">Impact ₱</th>
                      <th className="r">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.members.map((m) => {
                      const pm = pg?.members.find((x) => x.employeeId === m.employeeId)
                      const mChanges = changes.members[m.id]
                      const hours = mChanges?.hours ?? m.hours
                      const multiplier = mChanges?.multiplier ?? m.multiplier
                      const note = mChanges?.note !== undefined ? (mChanges.note ?? null) : m.note
                      return (
                        <tr key={m.id}>
                          <td className="font-medium">{m.name}</td>
                          <td className="r">
                            <NumInput value={hours} suffix="hrs"
                              className={numRing(mChanges?.hours !== undefined, hours, m.hours)}
                              onCommit={(n) => state.setMember(m.id, { hours: n })} />
                          </td>
                          <td className="r">
                            <NumInput value={multiplier} suffix="%"
                              className={numRing(mChanges?.multiplier !== undefined, multiplier, m.multiplier)}
                              onCommit={(n) => state.setMember(m.id, { multiplier: n })} />
                          </td>
                          <td>
                            <NoteInput value={note} className={noteRing(mChanges?.note !== undefined)}
                              onCommit={(n) => state.setMember(m.id, { note: n })} />
                          </td>
                          <td className="r num text-muted-foreground">{pm ? peso(pm.effortAmount) : '—'}</td>
                          <td className="r num text-muted-foreground">{pm ? peso(pm.impactAmount) : '—'}</td>
                          <td className="r">{pm ? <Money value={pm.total} className="font-semibold" /> : '—'}</td>
                        </tr>
                      )
                    })}
                    {g.members.length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">This group has no members.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          })}
          {dist.groups.length === 0 && (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              This distribution has no groups yet.
            </div>
          )}
        </div>
      </section>

      <SuggestedSpecialBonuses dist={dist} state={state} />
    </div>
  )
}

/** Per-group impact/effort weights for a suggestion. Remounted (via key) when the suggested value changes. */
function SuggestionGroupWeights({
  impact, effort, className, onCommit,
}: {
  impact: number
  effort: number
  className?: string
  onCommit: (impact: number | null, effort: number | null) => void
}) {
  const [i, setI] = useState(String(impact))
  const [e, setE] = useState(String(effort))
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    const ti = i.trim()
    const te = e.trim()
    if (!ti && !te) {
      setError(null)
      onCommit(null, null)
      return
    }
    const ni = Number(ti)
    const ne = Number(te)
    if (!ti || !te || !Number.isInteger(ni) || !Number.isInteger(ne)) {
      setError('Set both weights as whole numbers, or leave both empty to revert your suggestion.')
      return
    }
    if (ni + ne !== 100) {
      setError('Impact + effort must sum to 100.')
      return
    }
    setError(null)
    if (ni !== impact || ne !== effort) onCommit(ni, ne)
  }

  const onKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur()
  }

  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground"
        title="Per-group impact/effort weights — leave both empty to revert to the current values">
        <span className="shrink-0">Weights</span>
        <input className={cn('cell-input w-12', className)} inputMode="numeric"
          value={i} onChange={(ev) => setI(ev.target.value)} onBlur={commit} onKeyDown={onKeyDown} />
        <span className="shrink-0 text-[0.6875rem]">impact /</span>
        <input className={cn('cell-input w-12', className)} inputMode="numeric"
          value={e} onChange={(ev) => setE(ev.target.value)} onBlur={commit} onKeyDown={onKeyDown} />
        <span className="shrink-0 text-[0.6875rem]">effort</span>
      </label>
      {error && <span className="text-[0.6875rem] text-red-600">{error}</span>}
    </div>
  )
}

// ─── special bonuses (suggested additions only) ──────────────────────────────

function SuggestedSpecialBonuses({ dist, state }: { dist: Distribution; state: SuggestionState }) {
  const { db } = useStore()
  const [empId, setEmpId] = useState('')
  const [customName, setCustomName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) return
    const isCustom = empId === 'custom' || !empId
    const name = isCustom ? customName.trim() : db.employees.find((x) => x.id === empId)?.name ?? ''
    if (!name) return
    state.addSpecialBonus({ employeeId: isCustom ? null : empId, name, amount: amt, note: note.trim() })
    setEmpId(''); setCustomName(''); setAmount(''); setNote('')
  }

  const suggested = state.changes.specialBonuses

  return (
    <section>
      <SectionHeader title="Special bonuses"
        hint="Fixed amounts for specific people — you can suggest additions; existing ones can only be changed by the owner" />
      {(dist.specialBonuses.length > 0 || suggested.length > 0) && (
        <div className="mb-3 overflow-x-auto rounded-lg border bg-card shadow-xs">
          <table className="ledger">
            <thead>
              <tr><th>Person</th><th>Note</th><th className="r">Amount</th><th className="r" /></tr>
            </thead>
            <tbody>
              {dist.specialBonuses.map((b) => (
                <tr key={b.id}>
                  <td className="font-medium">{b.name}</td>
                  <td className="text-muted-foreground">{b.note || '—'}</td>
                  <td className="r"><Money value={b.amount} className="font-semibold" /></td>
                  <td className="r" />
                </tr>
              ))}
              {suggested.map((b, i) => (
                <tr key={`suggested-${i}`} className="bg-amber-50/60">
                  <td className="font-medium">
                    {b.name}
                    <span className="ml-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-amber-800">
                      Suggested
                    </span>
                  </td>
                  <td className="text-muted-foreground">{b.note || '—'}</td>
                  <td className="r"><Money value={b.amount} className="font-semibold" /></td>
                  <td className="r">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Remove suggested bonus"
                      onClick={() => state.removeSpecialBonus(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Select value={empId} onValueChange={setEmpId}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Pick employee…" /></SelectTrigger>
          <SelectContent>
            {db.employees.filter((e) => !e.archived).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            <SelectItem value="custom">Someone else…</SelectItem>
          </SelectContent>
        </Select>
        {(empId === 'custom' || !empId) && (
          <Input className="h-9 w-40" placeholder="Name" value={customName} onChange={(e) => setCustomName(e.target.value)} />
        )}
        <Input className="num h-9 w-36 text-right" type="number" min={1} placeholder="Amount (₱)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input className="h-9 w-52" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!amount}>
          <Plus className="mr-1.5 h-4 w-4" /> Suggest special bonus
        </Button>
      </form>
    </section>
  )
}

// ─── submit dialog ────────────────────────────────────────────────────────────

/** Replaces Finalize for non-owners: explanation + read-only change summary. */
export function SubmitSuggestionButton({ dist, state }: { dist: Distribution; state: SuggestionState }) {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rows = describeChanges(dist, state.changes)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const err = await store.submitSuggestion(dist.id, explanation.trim(), state.changes)
    setBusy(false)
    if (err) {
      setError(err)
    } else {
      state.reset()
      setExplanation('')
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={state.count === 0}>
          <Send className="mr-1.5 h-4 w-4" /> Submit suggestion{state.count > 0 ? ` (${state.count})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Submit suggestion</DialogTitle>
          <DialogDescription>
            This sends your proposed changes for “{dist.name}” to {dist.createdBy?.username ?? 'the owner'} for review.
            Submitting again replaces your previous suggestion.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ChangeTable rows={rows} />
          <label className="block">
            <span className="kicker mb-1.5 block">Explanation (required)</span>
            <Textarea
              rows={4}
              placeholder="Why are you proposing these changes?"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </label>
        </div>
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-sm text-red-600">{error}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !explanation.trim() || state.count === 0}>
              <Send className="mr-1.5 h-4 w-4" /> Submit suggestion
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
