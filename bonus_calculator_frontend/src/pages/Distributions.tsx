import { useState, type FormEvent } from 'react'
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
  const { db, createDistribution, deleteDistribution } = useStore()
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

      <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
        <table className="ledger">
          <thead>
            <tr>
              <th>Distribution</th>
              <th>Created by</th>
              <th>Planned</th>
              <th>Status</th>
              <th className="r">Bonus budget</th>
              <th className="r">Dividends</th>
              <th className="r">Grand total</th>
              <th className="r" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
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
                <td className="r"><Money value={d.bonusBudget} /></td>
                <td className="r">
                  {d.includeShareholders ? <Money value={d.dividendBudget} /> : <span className="text-muted-foreground">—</span>}
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
                        {d.status === 'drafted' ? 'Edit' : 'View'} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    {d.status === 'drafted' && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteDistribution(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {db.distributions.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No distributions yet — create one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}
