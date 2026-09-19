import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { pct } from '@/lib/model'
import { AppShell, NumInput, SectionHeader } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function Shareholders() {
  const { db, addShareholder, updateShareholder, removeShareholder } = useStore()
  const [name, setName] = useState('')
  const [shares, setShares] = useState('')

  const totalShares = db.shareholders.reduce((s, sh) => s + sh.shares, 0)
  const empName = (id: string | null) => db.employees.find((e) => e.id === id)?.name ?? null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(shares)
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return
    addShareholder(name.trim(), n, null)
    setName(''); setShares('')
  }

  return (
    <AppShell>
      <div className="mb-6">
        <p className="kicker mb-1">Admin setup</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Shareholders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dividend budgets are split pro-rata by shares. Link a shareholder to an employee to merge their payout rows.
        </p>
      </div>

      <section>
        <SectionHeader title="Register" hint={`${db.shareholders.length} shareholders · ${totalShares.toLocaleString()} total shares`} />
        <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
          <table className="ledger">
            <thead>
              <tr>
                <th className="w-1/3">Name</th>
                <th className="r">Shares</th>
                <th className="r">Ownership</th>
                <th>Linked employee</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {db.shareholders.map((sh) => (
                <tr key={sh.id}>
                  <td>
                    <input className="cell-input !text-left font-medium" defaultValue={sh.name}
                      onBlur={(e) => e.target.value.trim() && updateShareholder(sh.id, { name: e.target.value.trim() })} />
                  </td>
                  <td className="r w-32">
                    <NumInput value={sh.shares} min={1} onCommit={(n) => updateShareholder(sh.id, { shares: n })} />
                  </td>
                  <td className="r num text-muted-foreground">
                    {totalShares > 0 ? pct((sh.shares / totalShares) * 100) : '—'}
                  </td>
                  <td className="w-52">
                    <Select
                      value={sh.employeeId ?? 'none'}
                      onValueChange={(v) => updateShareholder(sh.id, { employeeId: v === 'none' ? null : v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Not linked" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not linked</SelectItem>
                        {db.employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="r">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeShareholder(sh.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {db.shareholders.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No shareholders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
          <Input className="h-9 w-56" placeholder="Shareholder name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input className="num h-9 w-32 text-right" type="number" min={1} placeholder="Shares" value={shares} onChange={(e) => setShares(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!name.trim() || !shares}>
            <Plus className="mr-1.5 h-4 w-4" /> Add shareholder
          </Button>
          <span className="text-xs text-muted-foreground">
            {db.employees.length > 0 && empName(db.shareholders[0]?.employeeId) === null ? 'Tip: link an employee after adding.' : ''}
          </span>
        </form>
      </section>
    </AppShell>
  )
}
