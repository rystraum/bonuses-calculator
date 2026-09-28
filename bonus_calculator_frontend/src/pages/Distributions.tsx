import { useState, Fragment, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useStore } from '@/lib/store'
import { peso } from '@/lib/model'
import { AppShell, Money, StatusBadge } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const fmtDate = (iso: string) => format(parseISO(iso.slice(0, 10)), 'MMM d, yyyy')

export default function Distributions() {
  const { db, createDistribution, deleteDistribution, sessionUserId } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [includeShareholders, setIncludeShareholders] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const id = await createDistribution(name.trim(), description.trim(), includeShareholders)
    if (!id) return
    setOpen(false)
    setName(''); setDescription(''); setIncludeShareholders(false)
    navigate(`/distributions/${id}`)
  }

  const sorted = [...db.distributions].sort((a, b) => {
    if (a.plannedDate && b.plannedDate) return b.plannedDate.localeCompare(a.plannedDate)
    if (a.plannedDate) return -1
    if (b.plannedDate) return 1
    return b.createdAt.localeCompare(a.createdAt)
  })

  // group by planned-date year, newest year first (sorted is already planned-desc, nulls last)
  const yearGroups: { year: string; items: typeof sorted }[] = []
  for (const d of sorted) {
    const year = d.plannedDate ? d.plannedDate.slice(0, 4) : 'No planned date'
    const last = yearGroups[yearGroups.length - 1]
    if (last && last.year === year) last.items.push(d)
    else yearGroups.push({ year, items: [d] })
  }

  const groupTotals = (items: typeof sorted) => ({
    bonus: items.reduce((s, d) => s + (d.result ? d.result.bonusPaidOut : d.bonusBudget), 0),
    dividends: items.reduce((s, d) => s + (d.result ? d.result.dividendPaidOut : d.includeShareholders ? d.dividendBudget : 0), 0),
    grand: items.reduce((s, d) => s + (d.result ? d.result.grandTotal : d.bonusBudget + (d.includeShareholders ? d.dividendBudget : 0)), 0),
  })

  const actionLabel = (d: (typeof sorted)[number]) =>
    d.status !== 'drafted'
      ? 'View'
      : d.createdBy != null && d.createdBy.id !== sessionUserId
        ? 'Review'
        : 'Edit'

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker mb-1">Payout cycles</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Distributions</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1.5 h-4 w-4" /> New distribution</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>Create distribution</DialogTitle>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="d-name">Name</Label>
                  <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. FY2026 Mid-Year Payout" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-desc">Description</Label>
                  <Textarea id="d-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this payout for?" rows={3} />
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border bg-muted/40 px-3 py-2.5">
                  <Checkbox checked={includeShareholders}
                    onCheckedChange={(c) => setIncludeShareholders(c === true)} />
                  <span className="text-sm">
                    <span className="font-medium">Include shareholders</span>
                    <span className="block text-xs text-muted-foreground">Adds a dividends section split by shares owned</span>
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Starts as <span className="font-medium">drafted</span> → finalized → paid out. Drafts are editable snapshots.
                </p>
              </div>
              <DialogFooter className="mt-6">
                <Button type="submit" disabled={!name.trim()}>Create draft</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mobile: cards (ledger table doesn't fit small screens) */}
      <div className="space-y-4 md:hidden">
        {yearGroups.map((g) => {
          const { grand: grandTotal } = groupTotals(g.items)
          return (
            <section key={g.year}>
              <div className="flex items-baseline justify-between px-1 pb-1.5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{g.year}</p>
                <p className="num text-xs font-semibold text-muted-foreground">{peso(grandTotal)}</p>
              </div>
              <div className="space-y-2">
                {g.items.map((d) => (
                  <article key={d.id} className="rounded-lg border bg-card p-4 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/distributions/${d.id}`} className="group min-w-0">
                        <span className="block truncate font-medium text-foreground underline-offset-4 group-hover:underline">{d.name}</span>
                        {d.description && <span className="mt-0.5 block text-xs text-muted-foreground">{d.description}</span>}
                        <span className="mt-1 block text-[0.6875rem] text-muted-foreground">
                          {d.createdBy ? `${d.createdBy.username} · ` : ''}created {d.createdAt}
                          {d.plannedDate ? ` · planned ${fmtDate(d.plannedDate)}` : ''}
                        </span>
                      </Link>
                      <StatusBadge status={d.status} />
                    </div>
                    <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">Bonus</dt>
                        <dd className="num"><Money value={d.result ? d.result.bonusPaidOut : d.bonusBudget} /></dd>
                      </div>
                      {d.includeShareholders && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-muted-foreground">Dividends</dt>
                          <dd className="num"><Money value={d.result ? d.result.dividendPaidOut : d.dividendBudget} /></dd>
                        </div>
                      )}
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">Grand total</dt>
                        <dd className="num font-semibold">
                          {d.result ? (
                            <Money value={d.result.grandTotal} />
                          ) : (
                            <span className="text-xs font-normal text-muted-foreground">
                              {peso(d.bonusBudget + (d.includeShareholders ? d.dividendBudget : 0))} planned
                            </span>
                          )}
                        </dd>
                      </div>
                      {d.finalizedAt && (
                        <div className="pt-1 text-[0.6875rem] text-muted-foreground">
                          {d.status === 'paid_out' && d.paidOutAt
                            ? `Paid out ${fmtDate(d.paidOutAt)}`
                            : `Finalized ${fmtDate(d.finalizedAt)}`}
                        </div>
                      )}
                    </dl>
                    <div className="mt-3 flex items-center justify-end gap-1 border-t pt-3">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/distributions/${d.id}`}>
                          {actionLabel(d)} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      {d.status === 'drafted' && (d.createdBy == null || d.createdBy.id === sessionUserId) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteDistribution(d.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
        {db.distributions.length === 0 && (
          <p className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
            No distributions yet — create one to get started.
          </p>
        )}
      </div>

      {/* Desktop: ledger table */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-xs md:block">
        <table className="ledger">
          <thead>
            <tr>
              <th>Distribution</th>
              <th>Created by</th>
              <th>Planned</th>
              <th>Status</th>
              <th className="r">Bonus</th>
              <th className="r">Dividends</th>
              <th className="r">Grand total</th>
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {yearGroups.map((g) => {
              const { bonus: bonusTotal, dividends: dividendTotal, grand: grandTotal } = groupTotals(g.items)
              return (
              <Fragment key={g.year}>
                <tr className="bg-muted/50">
                  <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.year}
                  </td>
                  <td className="r px-3 py-1.5 text-xs font-semibold num text-muted-foreground">{peso(bonusTotal)}</td>
                  <td className="r px-3 py-1.5 text-xs font-semibold num text-muted-foreground">{dividendTotal ? peso(dividendTotal) : ''}</td>
                  <td className="r px-3 py-1.5 text-xs font-semibold num text-muted-foreground">{peso(grandTotal)}</td>
                  <td />
                </tr>
                {g.items.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link to={`/distributions/${d.id}`} className="group block">
                    <span className="font-medium text-foreground underline-offset-4 group-hover:underline">{d.name}</span>
                    <span className="mt-0.5 block max-w-md truncate text-xs text-muted-foreground">{d.description}</span>
                  </Link>
                  <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">Created {d.createdAt}</span>
                </td>
                <td className="text-muted-foreground">{d.createdBy?.username ?? '—'}</td>
                <td>
                  {d.plannedDate ? fmtDate(d.plannedDate) : <span className="text-muted-foreground">—</span>}
                  {d.finalizedAt && (
                    <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
                      {d.status === 'paid_out' && d.paidOutAt
                        ? `Paid out ${fmtDate(d.paidOutAt)}`
                        : `Finalized ${fmtDate(d.finalizedAt)}`}
                    </span>
                  )}
                </td>
                <td><StatusBadge status={d.status} /></td>
                <td className="r"><Money value={d.result ? d.result.bonusPaidOut : d.bonusBudget} /></td>
                <td className="r">
                  {d.includeShareholders ? <Money value={d.result ? d.result.dividendPaidOut : d.dividendBudget} /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="r">
                  {d.result ? (
                    <span className="font-semibold"><Money value={d.result.grandTotal} /></span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {d.includeShareholders ? peso(d.bonusBudget + d.dividendBudget) + ' planned' : peso(d.bonusBudget) + ' planned'}
                    </span>
                  )}
                </td>
                <td className="r">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/distributions/${d.id}`}>
                        {actionLabel(d)}{' '}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    {d.status === 'drafted' && (d.createdBy == null || d.createdBy.id === sessionUserId) && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteDistribution(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
                ))}
              </Fragment>
              )
            })}
            {db.distributions.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No distributions yet — create one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}
