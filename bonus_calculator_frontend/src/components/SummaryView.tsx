import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { peso, pct, fmtDateTime, type Distribution } from '@/lib/model'
import { useStore } from '@/lib/store'
import { Money, SectionHeader } from '@/components/chrome'
import { cn } from '@/lib/utils'

/** Read-only finalized summary: approvals → dividends → per group → per person → totals. */
export default function SummaryView({ dist }: { dist: Distribution }) {
  const store = useStore()
  const r = dist.result

  useEffect(() => {
    store.loadApprovals(dist.id).catch(() => {})
  }, [store, dist.id])

  const approvals = store.approvals[dist.id] ?? []
  if (!r) return null

  return (
    <div className="space-y-10">
      {/* approvals collected while this was a draft */}
      {approvals.length > 0 && (
        <section>
          <SectionHeader title="Approvals" hint="Sign-offs collected while this distribution was a draft" />
          <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
            <table className="ledger">
              <thead>
                <tr><th>User</th><th>Approved</th></tr>
              </thead>
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.user.username}</td>
                    <td className="text-muted-foreground">{fmtDateTime(a.approvedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {/* dividends */}
      {dist.includeShareholders && (
        <section>
          <SectionHeader title="Dividends" hint={`Budget ${peso(r.dividendBudget)} · split pro-rata across ${r.dividends.reduce((s, d) => s + d.shares, 0).toLocaleString()} shares`} />
          <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
            <table className="ledger">
              <thead>
                <tr><th>Shareholder</th><th className="r">Shares</th><th className="r">Ownership</th><th className="r">Dividend</th></tr>
              </thead>
              <tbody>
                {[...r.dividends].sort((a, b) => b.shares - a.shares).map((d) => (
                  <tr key={d.shareholderId}>
                    <td className="font-medium">{d.name}</td>
                    <td className="r num">{d.shares}</td>
                    <td className="r num text-muted-foreground">{pct(d.pct)}</td>
                    <td className="r"><Money value={d.amount} className="font-semibold" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className="px-3 py-2">Total dividends</td>
                  <td className="px-3 py-2 text-right num">{r.dividends.reduce((s, d) => s + d.shares, 0).toLocaleString()}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right"><Money value={r.dividendPaidOut} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* per group */}
      <section>
        <SectionHeader title="Per group" hint="Each member's share of effort (hours) and impact (multiplier) within their group" />
        <div className="space-y-4">
          {r.groups.map((g) => (
            <div key={g.groupId} className="overflow-x-auto rounded-lg border bg-card shadow-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b bg-muted/40 px-3 py-2.5">
                <span className="font-display text-base font-semibold">
                  {g.name} <span className="num ml-1 text-sm font-normal text-muted-foreground">· {pct(g.allocationPct)} of pool</span>
                </span>
                <span className="num space-x-4 text-xs text-muted-foreground">
                  <span>Budget <b className="text-foreground">{peso(g.budget)}</b></span>
                  <span>Impact pool <b className="text-foreground">{peso(g.impactBudget)}</b> @ {peso(g.perImpactPoint)}/pt</span>
                  <span>Effort pool <b className="text-foreground">{peso(g.effortBudget)}</b> @ {peso(g.perHour)}/hr</span>
                </span>
              </div>
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="r">Hours</th>
                    <th className="r">% effort</th>
                    <th className="r">Effort ₱</th>
                    <th className="r">Multiplier</th>
                    <th className="r">% impact</th>
                    <th className="r">Impact ₱</th>
                    <th className="r">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {g.members.map((m) => (
                    <tr key={m.employeeId}>
                      <td className="font-medium">{m.name}</td>
                      <td className="r num">{m.hours}</td>
                      <td className="r num text-muted-foreground">{pct(m.effortPct)}</td>
                      <td className="r num">{peso(m.effortAmount)}</td>
                      <td className="r num">{pct(m.multiplier)}</td>
                      <td className="r num text-muted-foreground">{pct(m.impactPct)}</td>
                      <td className="r num">{peso(m.impactAmount)}</td>
                      <td className="r"><Money value={m.total} className="font-semibold" /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-semibold">
                    <td className="px-3 py-2" colSpan={7}>Group paid out (budget {peso(g.budget)})</td>
                    <td className="px-3 py-2 text-right"><Money value={g.paidOut} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
          {r.groups.length === 0 && (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No groups in this distribution.</div>
          )}
        </div>
      </section>

      {/* per person payout */}
      <section>
        <SectionHeader title="Per person payout" hint="Bonuses + special bonuses + dividends, rolled up per person" />
        <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
          <table className="ledger">
            <thead>
              <tr>
                <th>Person</th>
                <th className="r">Effort</th>
                <th className="r">Impact</th>
                <th className="r">Special</th>
                <th className="r">Dividends</th>
                <th className="r">Total payout</th>
              </tr>
            </thead>
            <tbody>
              {r.payouts.map((p) => (
                <tr key={p.personId ?? p.name}>
                  <td>
                    <div className="font-medium">{p.name}</div>
                    <div className="mt-0.5 space-y-0.5">
                      {p.breakdown.map((b, i) => (
                        <div key={i} className="num flex justify-between gap-6 text-[0.6875rem] text-muted-foreground">
                          <span>{b.label}</span><span>{peso(b.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="r num align-top">{p.bonusEffort ? peso(p.bonusEffort) : '—'}</td>
                  <td className="r num align-top">{p.bonusImpact ? peso(p.bonusImpact) : '—'}</td>
                  <td className="r num align-top">{p.specialBonus ? peso(p.specialBonus) : '—'}</td>
                  <td className="r num align-top">{p.dividends ? peso(p.dividends) : '—'}</td>
                  <td className="r align-top"><Money value={p.total} className="text-base font-bold" /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-semibold">
                <td className="px-3 py-2" colSpan={5}>Grand total</td>
                <td className="px-3 py-2 text-right"><Money value={r.grandTotal} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* totals & tolerance */}
      <section>
        <SectionHeader title="Totals" hint="Rounding means the paid total rarely equals the budget exactly — within 5% is fine" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-4 shadow-xs">
            <div className="kicker">Bonus budget</div>
            <div className="num mt-1 font-display text-2xl font-semibold">{peso(r.bonusBudget)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-xs">
            <div className="kicker">Bonuses paid out</div>
            <div className="num mt-1 font-display text-2xl font-semibold">{peso(r.bonusPaidOut)}</div>
            <div className="num mt-0.5 text-xs text-muted-foreground">
              {r.toleranceDelta.toFixed(2)}% under budget · excludes special bonuses
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-xs">
            <div className="kicker">Special bonuses</div>
            <div className="num mt-1 font-display text-2xl font-semibold">{peso(r.specialBonusTotal)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-xs">
            <div className="kicker">Dividends paid out</div>
            <div className="num mt-1 font-display text-2xl font-semibold">{peso(r.dividendPaidOut)}</div>
          </div>
        </div>

        <div
          className={cn(
            'mt-3 flex items-start gap-3 rounded-lg border p-4',
            r.withinTolerance ? 'border-emerald-300 bg-emerald-50' : 'border-amber-400 bg-amber-50',
          )}
        >
          {r.withinTolerance
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
          <div className="text-sm">
            <div className={cn('font-semibold', r.withinTolerance ? 'text-emerald-800' : 'text-amber-800')}>
              {r.withinTolerance ? 'Within tolerance — no flag' : 'Flagged: payout deviates from budget'}
            </div>
            <p className="mt-0.5 text-muted-foreground">
              Paid bonuses (excluding special bonuses) are {r.toleranceDelta.toFixed(2)}% away from the {peso(r.bonusBudget)} budget.
              The tolerance is 5%. Difference comes from rounding down per-hour / per-point rates.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border bg-card p-4 shadow-xs">
          <div>
            <div className="kicker">Grand total</div>
            <div className="num mt-1 font-display text-3xl font-semibold">{peso(r.grandTotal)}</div>
          </div>
          <div className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>Bonuses {peso(r.bonusPaidOut)}</span>
            <span aria-hidden>+</span>
            <span>Special {peso(r.specialBonusTotal)}</span>
            <span aria-hidden>+</span>
            <span>Dividends {peso(r.dividendPaidOut)}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
