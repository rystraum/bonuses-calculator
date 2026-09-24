import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CheckCheck, Lock, Plus, Share2, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { peso, pct, EMPTY_RESULT, type DistGroup, type Distribution } from '@/lib/model'
import { useStore } from '@/lib/store'
import { AppShell, Money, NoteInput, NumInput, SectionHeader, StatusBadge } from '@/components/chrome'
import SummaryView from '@/components/SummaryView'
import SuggestionEditor, { SubmitSuggestionButton } from '@/components/SuggestionEditor'
import SuggestionsSection, { SuggestionMark, SuggestionViewDialog } from '@/components/SuggestionsSection'
import ApprovalControl, { ApprovalsSection } from '@/components/ApprovalsSection'
import { collectMarks, useSuggestionChanges } from '@/lib/suggestions'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const fmtDateTime = (iso: string) => format(new Date(iso), "MMM d, yyyy 'at' h:mm a")
const fmtDate = (iso: string) => format(parseISO(iso.slice(0, 10)), 'MMM d, yyyy')

export default function DistributionDetail() {
  const { id } = useParams<{ id: string }>()
  const store = useStore()
  const { refreshDistribution, loadSuggestions, loadApprovals } = store
  const dist = store.db.distributions.find((d) => d.id === id)

  // Fresh snapshot + computation + suggestions + approvals whenever this page is opened.
  useEffect(() => {
    if (id) {
      refreshDistribution(id).catch(() => {})
      loadSuggestions(id).catch(() => {})
      loadApprovals(id).catch(() => {})
    }
  }, [refreshDistribution, loadSuggestions, loadApprovals, id])

  if (!dist) {
    // First render after a refresh has an empty db until the initial load
    // resolves — wait for it instead of bouncing to the list.
    if (store.bootstrapping) {
      return (
        <AppShell>
          <div className="py-10 text-center text-sm text-muted-foreground">Loading distribution…</div>
        </AppShell>
      )
    }
    return <Navigate to="/" replace />
  }

  return (
    <AppShell>
      <DetailContent dist={dist} />
    </AppShell>
  )
}

function DetailContent({ dist }: { dist: Distribution }) {
  const store = useStore()
  // Legacy rows have no owner; otherwise only the creator edits the draft directly.
  const isOwner = dist.createdBy == null || dist.createdBy.id === store.sessionUserId
  const suggestionState = useSuggestionChanges(dist)
  const [viewSuggestionId, setViewSuggestionId] = useState<string | null>(null)

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All distributions
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-semibold tracking-tight">{dist.name}</h1>
              <StatusBadge status={dist.status} />
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{dist.description}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <span>Created{dist.createdBy ? ` by ${dist.createdBy.username}` : ''} · {dist.createdAt}</span>
              {dist.finalizedBy && dist.finalizedAt && (
                <span>Finalized by {dist.finalizedBy.username} · {fmtDateTime(dist.finalizedAt)}</span>
              )}
              {dist.paidOutBy && dist.paidOutAt && (
                <span>Paid out by {dist.paidOutBy.username} · {fmtDateTime(dist.paidOutAt)}</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <span>Planned: {dist.plannedDate ? fmtDate(dist.plannedDate) : '—'}</span>
              <span>Finalized: {dist.finalizedAt ? fmtDate(dist.finalizedAt) : '—'}</span>
              <span>Payout: {dist.paidOutAt ? fmtDate(dist.paidOutAt) : '—'}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {dist.status === 'drafted' && (isOwner
              ? <FinalizeButton dist={dist} />
              : (
                <>
                  <SubmitSuggestionButton dist={dist} state={suggestionState} />
                  <ApprovalControl dist={dist} />
                </>
              ))}
            {dist.status === 'finalized' && <HandoffButton dist={dist} />}
            {dist.status === 'finalized' && isOwner && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary"><CheckCheck className="mr-1.5 h-4 w-4" /> Mark as paid out</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Mark as paid out?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This records that all payouts for “{dist.name}” have been disbursed. The distribution stays frozen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => store.markPaidOut(dist.id)}>Mark paid out</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {dist.status === 'drafted' ? (
        <div className="space-y-10">
          {isOwner
            ? <DraftEditor dist={dist} onViewSuggestion={setViewSuggestionId} />
            : <SuggestionEditor dist={dist} state={suggestionState} />}
          <SuggestionsSection dist={dist} onView={setViewSuggestionId} />
          {isOwner && <ApprovalsSection dist={dist} />}
        </div>
      ) : (
        <SummaryView dist={dist} />
      )}
      <SuggestionViewDialog
        key={viewSuggestionId ?? 'closed'}
        dist={dist}
        suggestionId={viewSuggestionId}
        onClose={() => setViewSuggestionId(null)}
      />
    </>
  )
}

// ─── finalize ────────────────────────────────────────────────────────────────

function FinalizeButton({ dist }: { dist: Distribution }) {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const computation = store.computations[dist.id]

  // Pull the freshest snapshot + computation each time the review opens.
  useEffect(() => {
    if (open) {
      setError(null)
      store.refreshDistribution(dist.id).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the dialog opens
  }, [open, dist.id])

  const confirm = async () => {
    setBusy(true)
    setError(null)
    const err = await store.finalizeDistribution(dist.id)
    setBusy(false)
    if (err) setError(err)
    else setOpen(false)
  }

  const preview: Distribution = { ...dist, result: computation ?? null }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Lock className="mr-1.5 h-4 w-4" /> Finalize</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review before finalizing</DialogTitle>
          <DialogDescription>
            This is exactly what will be locked in for “{dist.name}”. Finalizing freezes it into a read-only snapshot —
            later changes to employees, groups, or shareholders will not affect it.
          </DialogDescription>
        </DialogHeader>
        {preview.result ? (
          <SummaryView dist={preview} />
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading the latest computation…</div>
        )}
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-sm text-red-600">{error}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={confirm} disabled={busy || !preview.result}>
              <Lock className="mr-1.5 h-4 w-4" /> Confirm finalize
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── handoff view ─────────────────────────────────────────────────────────────

function HandoffButton({ dist }: { dist: Distribution }) {
  const navigate = useNavigate()
  return (
    <Button variant="outline" onClick={() => navigate(`/distributions/${dist.id}/handoff`)}>
      <Share2 className="mr-1.5 h-4 w-4" /> Handoff view
    </Button>
  )
}

// ─── draft editor ─────────────────────────────────────────────────────────────

function DraftEditor({ dist, onViewSuggestion }: { dist: Distribution; onViewSuggestion: (suggestionId: string) => void }) {
  const store = useStore()
  const { db } = store
  const preview = store.computations[dist.id] ?? EMPTY_RESULT
  const suggestions = store.suggestions[dist.id] ?? []

  const allocTotal = dist.groups.reduce((s, g) => s + g.allocationPct, 0)
  const addableGroups = db.groups.filter((g) => !dist.groups.some((dg) => dg.groupId === g.id))
  const totalBudget = dist.bonusBudget + (dist.includeShareholders ? dist.dividendBudget : 0)
  const totalSpecialBonuses = dist.specialBonuses.reduce((s, b) => s + b.amount, 0)
  const totalShares = preview.dividends.reduce((s, d) => s + d.shares, 0)
  const totalOwnership = preview.dividends.reduce((s, d) => s + d.pct, 0)

  return (
    <div className="space-y-10">
      {/* config strip */}
      <section className="rounded-lg border bg-card p-4 shadow-xs">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-4">
            <label className="block">
              <span className="kicker mb-1.5 flex items-center gap-1.5">
                Total bonus budget
                <SuggestionMark
                  items={collectMarks(suggestions, (c) => c.distribution.bonusBudget)}
                  base={dist.bonusBudget} kind="money" onView={onViewSuggestion} />
              </span>
              <NumInput className="!border-input h-10 !bg-background text-lg font-semibold" value={dist.bonusBudget}
                onCommit={(n) => store.updateDistribution(dist.id, { bonusBudget: n })} />
            </label>
            {dist.includeShareholders && (
              <label className="block">
                <span className="kicker mb-1.5 flex items-center gap-1.5">
                  Total dividend budget
                  <SuggestionMark
                    items={collectMarks(suggestions, (c) => c.distribution.dividendBudget)}
                    base={dist.dividendBudget} kind="money" onView={onViewSuggestion} />
                </span>
                <NumInput className="!border-input h-10 !bg-background text-lg font-semibold" value={dist.dividendBudget}
                  onCommit={(n) => store.updateDistribution(dist.id, { dividendBudget: n })} />
              </label>
            )}
            <div>
              <span className="kicker mb-1.5 block">Total special bonuses</span>
              <div className="num flex h-10 items-center text-lg font-semibold">{peso(totalSpecialBonuses)}</div>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">Sum of the special bonuses pool below, read-only.</p>
            </div>
            <div>
              <span className="kicker mb-1.5 block">Total budget</span>
              <div className="num flex h-10 items-center text-lg font-semibold">{peso(totalBudget + totalSpecialBonuses)}</div>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">Bonus + dividends + special bonuses, read-only.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <span className="kicker mb-1.5 flex items-center gap-1.5">
                Impact / effort weighting
                <SuggestionMark
                  items={collectMarks(suggestions, (c) => c.distribution.impactPct)}
                  base={dist.impactPct} kind="pct" onView={onViewSuggestion} />
              </span>
              <div className="flex items-center gap-2">
                <NumInput className="!border-input h-10 !bg-background font-semibold" value={dist.impactPct} suffix="% impact"
                  onCommit={(n) => store.updateDistribution(dist.id, { impactPct: Math.min(100, Math.max(0, n)) })} />
                <NumInput className="!border-input h-10 !bg-background font-semibold" value={100 - dist.impactPct} suffix="% effort"
                  onCommit={(n) => store.updateDistribution(dist.id, { impactPct: Math.min(100, Math.max(0, 100 - n)) })} />
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
            <label className="block">
              <span className="kicker mb-1.5 block">Planned date</span>
              <Input type="date" className="h-10 bg-background font-semibold"
                value={dist.plannedDate ?? ''}
                onChange={(e) => store.updateDistribution(dist.id, { plannedDate: e.target.value || null })} />
            </label>
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
        <SectionHeader title="Bonuses by group" hint="Encode hours (effort) and multiplier (impact) per member — amounts update live">
          <Select value="" onValueChange={(gid) => gid && store.addGroupToDistribution(dist.id, gid)} disabled={addableGroups.length === 0}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder={addableGroups.length ? '+ Add employee group' : 'All groups added'} />
            </SelectTrigger>
            <SelectContent>
              {addableGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name} ({g.memberIds.length})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SectionHeader>

        <div className="space-y-4">
          {dist.groups.map((g) => {
            const pg = preview.groups.find((x) => x.groupId === g.id)
            return (
              <div key={g.id} className="overflow-x-auto rounded-lg border bg-card shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-muted/40 px-3 py-2">
                  <span className="font-display text-base font-semibold">{g.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <label className="flex w-44 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="shrink-0">Pool share</span>
                        <NumInput value={g.allocationPct} suffix="%"
                          onCommit={(n) => store.updateDistGroupAllocation(dist.id, g.id, n)} />
                      </label>
                      <SuggestionMark
                        items={collectMarks(suggestions, (c) => c.groups[g.id]?.allocationPct)}
                        base={g.allocationPct} kind="pct" onView={onViewSuggestion} />
                    </span>
                    <span className="flex items-center gap-1">
                      <GroupWeightInputs
                        key={`${g.impactWeight ?? ''}-${g.effortWeight ?? ''}`}
                        distId={dist.id}
                        group={g}
                        effective={pg ? { impact: pg.impactWeight, effort: pg.effortWeight } : null}
                      />
                      <SuggestionMark
                        items={collectMarks(suggestions, (c) => c.groups[g.id]?.impactWeight)}
                        base={g.impactWeight ?? dist.impactPct} kind="pct" onView={onViewSuggestion} />
                    </span>
                    {pg && (
                      <span className="num hidden text-xs text-muted-foreground sm:block">
                        {peso(pg.budget)} budget → <b className="text-foreground">{peso(pg.paidOut)}</b> paid
                      </span>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Remove group"
                      onClick={() => store.removeGroupFromDistribution(dist.id, g.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
                      return (
                        <tr key={m.id}>
                          <td className="font-medium">{m.name}</td>
                          <td className="r">
                            <span className="flex items-center justify-end gap-1">
                              <NumInput value={m.hours} suffix="hrs"
                                onCommit={(n) => store.updateDistMember(dist.id, m.id, { hours: n })} />
                              <SuggestionMark
                                items={collectMarks(suggestions, (c) => c.members[m.id]?.hours)}
                                base={m.hours} kind="number" onView={onViewSuggestion} />
                            </span>
                          </td>
                          <td className="r">
                            <span className="flex items-center justify-end gap-1">
                              <NumInput value={m.multiplier} suffix="%"
                                onCommit={(n) => store.updateDistMember(dist.id, m.id, { multiplier: n })} />
                              <SuggestionMark
                                items={collectMarks(suggestions, (c) => c.members[m.id]?.multiplier)}
                                base={m.multiplier} kind="pct" onView={onViewSuggestion} />
                            </span>
                          </td>
                          <td>
                            <span className="flex items-start gap-1">
                              <NoteInput value={m.note}
                                onCommit={(note) => store.updateDistMember(dist.id, m.id, { note })} />
                              <SuggestionMark
                                items={collectMarks(suggestions, (c) => c.members[m.id]?.note)}
                                base={null} kind="text" onView={onViewSuggestion} />
                            </span>
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
              Add an employee group to start encoding bonuses.
            </div>
          )}
        </div>
      </section>

      <SpecialBonuses dist={dist} />
    </div>
  )
}

// ─── group weights ────────────────────────────────────────────────────────────

/** Optional per-group impact/effort weights. Remounted (via key) when the store value changes. */
function GroupWeightInputs({
  distId, group, effective,
}: {
  distId: string
  group: DistGroup
  effective: { impact: number; effort: number } | null
}) {
  const { updateDistGroupWeights } = useStore()
  const [impact, setImpact] = useState(group.impactWeight?.toString() ?? '')
  const [effort, setEffort] = useState(group.effortWeight?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  const commit = async () => {
    const i = impact.trim()
    const e = effort.trim()
    if (!i && !e) {
      setError(group.impactWeight === null ? null : await updateDistGroupWeights(distId, group.id, null, null))
      return
    }
    const ni = Number(i)
    const ne = Number(e)
    if (!i || !e || !Number.isInteger(ni) || !Number.isInteger(ne)) {
      setError('Set both weights as whole numbers, or leave both empty to use the distribution default.')
      return
    }
    if (ni + ne !== 100) {
      setError('Impact + effort must sum to 100.')
      return
    }
    if (ni === group.impactWeight && ne === group.effortWeight) {
      setError(null)
      return
    }
    setError(await updateDistGroupWeights(distId, group.id, ni, ne))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }

  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground"
        title="Per-group impact/effort weights — leave empty to use the distribution default">
        <span className="shrink-0">Weights</span>
        <input className="cell-input w-12" inputMode="numeric"
          placeholder={effective ? String(effective.impact) : ''}
          value={impact} onChange={(e) => setImpact(e.target.value)} onBlur={commit} onKeyDown={onKeyDown} />
        <span className="shrink-0 text-[0.6875rem]">impact /</span>
        <input className="cell-input w-12" inputMode="numeric"
          placeholder={effective ? String(effective.effort) : ''}
          value={effort} onChange={(e) => setEffort(e.target.value)} onBlur={commit} onKeyDown={onKeyDown} />
        <span className="shrink-0 text-[0.6875rem]">effort</span>
      </label>
      {error && <span className="text-[0.6875rem] text-red-600">{error}</span>}
    </div>
  )
}

// ─── special bonuses ─────────────────────────────────────────────────────────

function SpecialBonuses({ dist }: { dist: Distribution }) {
  const store = useStore()
  const { db } = store
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
    store.addSpecialBonus(dist.id, isCustom ? null : empId, name, amt, note.trim())
    setEmpId(''); setCustomName(''); setAmount(''); setNote('')
  }

  return (
    <section>
      <SectionHeader title="Special bonuses" hint="Fixed amounts for specific people — excluded from the 5% budget tolerance check" />
      {dist.specialBonuses.length > 0 && (
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
                  <td className="r">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => store.removeSpecialBonus(dist.id, b.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="font-semibold">Total</td>
                <td />
                <td className="r"><Money value={dist.specialBonuses.reduce((s, b) => s + b.amount, 0)} className="font-semibold" /></td>
                <td />
              </tr>
            </tfoot>
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
          <Plus className="mr-1.5 h-4 w-4" /> Add special bonus
        </Button>
      </form>
    </section>
  )
}
