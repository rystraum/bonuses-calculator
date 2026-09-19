import { useEffect, useState } from 'react'
import { peso, pct, type DistributionResult, type GroupResult } from '@/lib/model'
import { useStore } from '@/lib/store'
import { AppShell, SectionHeader } from '@/components/chrome'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** Signed peso delta, with % of the A-side base when given: green when B > A, red when B < A. */
function Delta({ value, base }: { value: number; base?: number }) {
  if (Math.abs(value) < 0.005) return <span className="num text-muted-foreground">—</span>
  const sign = value > 0 ? '+' : '−'
  const showPct = base !== undefined && Math.abs(base) >= 0.005
  return (
    <span className={cn('num font-medium', value > 0 ? 'text-green-600' : 'text-red-600')}>
      {sign}{peso(Math.abs(value))}
      {showPct && <span className="ml-1 font-normal opacity-75">({sign}{pct((Math.abs(value) / Math.abs(base!)) * 100)})</span>}
    </span>
  )
}

const dash = <span className="text-muted-foreground">—</span>

/** Union of keys, by first appearance in A then B. */
function unionKeys<T>(a: T[], b: T[], key: (x: T) => string): string[] {
  const out: string[] = []
  for (const x of [...a, ...b]) {
    const k = key(x)
    if (!out.includes(k)) out.push(k)
  }
  return out
}

export default function Compare() {
  const store = useStore()
  const dists = store.db.distributions
  const [aPick, setAPick] = useState('')
  const [bPick, setBPick] = useState('')
  // Default: B = latest by planned date, A = second latest (Δ = B − A). Falls back to index order.
  const byPlannedDesc = [...dists].sort((x, y) => {
    if (x.plannedDate && y.plannedDate) return y.plannedDate.localeCompare(x.plannedDate)
    if (x.plannedDate) return -1
    if (y.plannedDate) return 1
    return y.createdAt.localeCompare(x.createdAt)
  })
  const aId = aPick || byPlannedDesc[1]?.id || dists[1]?.id || ''
  const bId = bPick || byPlannedDesc[0]?.id || dists[0]?.id || ''
  const [a, setA] = useState<DistributionResult | null>(null)
  const [b, setB] = useState<DistributionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { getComputation } = store
  useEffect(() => {
    let cancelled = false
    if (aId) {
      getComputation(aId)
        .then((r) => { if (!cancelled) setA(r) })
        .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.') })
    }
    if (bId) {
      getComputation(bId)
        .then((r) => { if (!cancelled) setB(r) })
        .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.') })
    }
    return () => { cancelled = true }
  }, [aId, bId, getComputation])

  const distA = dists.find((d) => d.id === aId)
  const distB = dists.find((d) => d.id === bId)

  const picker = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="kicker">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Pick a distribution…" /></SelectTrigger>
        <SelectContent>
          {dists.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  )

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker mb-1">Side by side</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Compare distributions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Δ is B − A — what changed from the base to the comparison.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {picker(aId, setAPick, 'A · base')}
          {picker(bId, setBPick, 'B · compare')}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {dists.length < 2 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Need at least two distributions to compare.
        </div>
      )}

      {a && b && distA && distB && (
        <div className="space-y-10">
          <section>
            <SectionHeader
              title="Groups"
              hint={
                `${distA.name} (${distA.status}) vs ${distB.name} (${distB.status}) — ` +
                'members aligned by name across both sides'
              }
            />
            <div className="space-y-4">
              {unionKeys(a.groups, b.groups, (g) => g.name).map((name) => (
                <GroupDiff key={name} name={name}
                  a={a.groups.find((g) => g.name === name)}
                  b={b.groups.find((g) => g.name === name)} />
              ))}
              {a.groups.length === 0 && b.groups.length === 0 && (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No groups on either side.</div>
              )}
            </div>
          </section>

          <section>
            <SectionHeader title="Per-person payouts" hint="Expand a row for the per-side breakdown" />
            <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
              <table className="ledger">
                <thead>
                  <tr><th>Person</th><th className="r">A total</th><th className="r">B total</th><th className="r">Δ</th></tr>
                </thead>
                <tbody>
                  {unionKeys(a.payouts, b.payouts, (p) => p.name).map((name) => {
                    const pa = a.payouts.find((p) => p.name === name)
                    const pb = b.payouts.find((p) => p.name === name)
                    return (
                      <tr key={name}>
                        <td>
                          <details>
                            <summary className="cursor-pointer font-medium">{name}</summary>
                            <div className="mt-1 grid max-w-lg grid-cols-2 gap-6">
                              {[{ label: 'A', p: pa }, { label: 'B', p: pb }].map(({ label, p }) => (
                                <div key={label} className="space-y-0.5">
                                  <div className="kicker">{label}</div>
                                  {(p?.breakdown ?? []).map((bd, i) => (
                                    <div key={i} className="num flex justify-between gap-4 text-[0.6875rem] text-muted-foreground">
                                      <span>{bd.label}</span><span>{peso(bd.amount)}</span>
                                    </div>
                                  ))}
                                  {!p && <div className="text-[0.6875rem] text-muted-foreground">—</div>}
                                </div>
                              ))}
                            </div>
                          </details>
                        </td>
                        <td className="r num align-top">{pa ? peso(pa.total) : dash}</td>
                        <td className="r num align-top">{pb ? peso(pb.total) : dash}</td>
                        <td className="r align-top"><Delta value={(pb?.total ?? 0) - (pa?.total ?? 0)} base={pa?.total} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {(a.dividends.length > 0 || b.dividends.length > 0) && (
            <section>
              <SectionHeader title="Dividends" hint="Aligned by shareholder name" />
              <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Shareholder</th><th className="r">A shares</th><th className="r">B shares</th>
                      <th className="r">A dividend</th><th className="r">B dividend</th><th className="r">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unionKeys(a.dividends, b.dividends, (d) => d.name).map((name) => {
                      const da = a.dividends.find((d) => d.name === name)
                      const db = b.dividends.find((d) => d.name === name)
                      return (
                        <tr key={name}>
                          <td className="font-medium">{name}</td>
                          <td className="r num">{da ? da.shares : dash}</td>
                          <td className="r num">{db ? db.shares : dash}</td>
                          <td className="r num">{da ? peso(da.amount) : dash}</td>
                          <td className="r num">{db ? peso(db.amount) : dash}</td>
                          <td className="r"><Delta value={(db?.amount ?? 0) - (da?.amount ?? 0)} base={da?.amount} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <SectionHeader title="Totals" />
            <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
              <table className="ledger">
                <thead>
                  <tr><th>Metric</th><th className="r">A</th><th className="r">B</th><th className="r">Δ</th></tr>
                </thead>
                <tbody>
                  {([
                    ['Bonus budget', a.bonusBudget, b.bonusBudget],
                    ['Bonuses paid out', a.bonusPaidOut, b.bonusPaidOut],
                    ['Special bonuses', a.specialBonusTotal, b.specialBonusTotal],
                    ['Dividend budget', a.dividendBudget, b.dividendBudget],
                    ['Dividends paid out', a.dividendPaidOut, b.dividendPaidOut],
                    ['Grand total', a.grandTotal, b.grandTotal],
                  ] as [string, number, number][]).map(([label, va, vb]) => (
                    <tr key={label} className={label === 'Grand total' ? 'bg-muted/50 font-semibold' : ''}>
                      <td>{label}</td>
                      <td className="r num">{peso(va)}</td>
                      <td className="r num">{peso(vb)}</td>
                      <td className="r"><Delta value={vb - va} base={va} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  )
}

function GroupDiff({ name, a, b }: { name: string; a?: GroupResult; b?: GroupResult }) {
  const names = unionKeys(a?.members ?? [], b?.members ?? [], (m) => m.name)
  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b bg-muted/40 px-3 py-2.5">
        <span className="font-display text-base font-semibold">
          {name}
          {!a && <span className="ml-2 text-xs font-normal text-green-600">added in B</span>}
          {!b && <span className="ml-2 text-xs font-normal text-red-600">removed in B</span>}
        </span>
        <span className="num space-x-4 text-xs text-muted-foreground">
          {a && <span>A: {pct(a.allocationPct)} of pool · {a.impactWeight}/{a.effortWeight}</span>}
          {b && <span>B: {pct(b.allocationPct)} of pool · {b.impactWeight}/{b.effortWeight}</span>}
        </span>
      </div>
      <table className="ledger">
        <thead>
          <tr>
            <th>Employee</th>
            <th className="r">A hours</th><th className="r">B hours</th>
            <th className="r">A mult</th><th className="r">B mult</th>
            <th className="r">A total</th><th className="r">B total</th>
            <th className="r">Δ</th>
          </tr>
        </thead>
        <tbody>
          {names.map((n) => {
            const ma = a?.members.find((m) => m.name === n)
            const mb = b?.members.find((m) => m.name === n)
            return (
              <tr key={n}>
                <td className="font-medium">
                  {n}
                  {ma && !mb && <span className="ml-1.5 text-[0.6875rem] text-red-600">removed</span>}
                  {!ma && mb && <span className="ml-1.5 text-[0.6875rem] text-green-600">added</span>}
                </td>
                <td className="r num">{ma ? ma.hours : dash}</td>
                <td className="r num">{mb ? mb.hours : dash}</td>
                <td className="r num">{ma ? pct(ma.multiplier) : dash}</td>
                <td className="r num">{mb ? pct(mb.multiplier) : dash}</td>
                <td className="r num">{ma ? peso(ma.total) : dash}</td>
                <td className="r num">{mb ? peso(mb.total) : dash}</td>
                <td className="r"><Delta value={(mb?.total ?? 0) - (ma?.total ?? 0)} base={ma?.total} /></td>
              </tr>
            )
          })}
          {names.length === 0 && (
            <tr><td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">No members on either side.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
