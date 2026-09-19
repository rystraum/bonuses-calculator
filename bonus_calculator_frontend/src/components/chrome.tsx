import { useState, type ReactNode } from 'react'
import { NavLink, Navigate, useLocation, useNavigate } from 'react-router'
import {
  Banknote, Coins, LogOut, UserRound, UsersRound, Wallet,
} from 'lucide-react'
import { peso, type DistributionStatus } from '@/lib/model'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// ─── primitives ───────────────────────────────────────────────────────────────

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn('num', className)}>{peso(value)}</span>
}

export function StatusBadge({ status }: { status: DistributionStatus }) {
  const map: Record<DistributionStatus, { label: string; cls: string; dot: string }> = {
    drafted: { label: 'Drafted', cls: 'border-border bg-secondary text-muted-foreground', dot: 'bg-muted-foreground' },
    finalized: { label: 'Finalized', cls: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
    paid_out: { label: 'Paid out', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  }
  const { label, cls, dot } = map[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em]', cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {label}
    </span>
  )
}

export function SectionHeader({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** Responsive encoding input: local string state while focused, commits on blur / Enter. */
export function NumInput({
  value, onCommit, suffix, className, min = 0, disabled,
}: {
  value: number
  onCommit: (n: number) => void
  suffix?: string
  className?: string
  min?: number
  disabled?: boolean
}) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  const [lastValue, setLastValue] = useState(value)
  if (!focused && value !== lastValue) {
    setLastValue(value)
    setText(String(value))
  }

  const commit = () => {
    const n = Number(text)
    if (Number.isFinite(n) && n >= min && n !== value) onCommit(n)
    else setText(String(value))
  }

  const input = (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      value={text}
      disabled={disabled}
      className={cn('cell-input', disabled && 'opacity-60', className)}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { setFocused(false); commit() }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
  if (!suffix) return input
  return (
    <span className="inline-flex w-full items-center justify-end gap-1">
      {input}
      <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{suffix}</span>
    </span>
  )
}

// ─── shell ────────────────────────────────────────────────────────────────────

export function RequireAuth({ children }: { children: ReactNode }) {
  const { sessionUserId } = useStore()
  const location = useLocation()
  if (!sessionUserId) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

const NAV = [
  { to: '/', label: 'Distributions', icon: Banknote },
  { to: '/shareholders', label: 'Shareholders', icon: Coins },
  { to: '/employees', label: 'Employees & Groups', icon: UsersRound },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { db, sessionUserId, logout } = useStore()
  const navigate = useNavigate()
  const user = db.users.find((u) => u.id === sessionUserId)

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-muted/40 px-3 py-5 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-semibold">Bonus & Dividend</div>
            <div className="text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">Calculator</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t pt-3">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{user?.name}</span>
            </span>
            <button onClick={() => { logout(); navigate('/login') }} title="Sign out"
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/90 px-4 py-2.5 backdrop-blur md:hidden">
          <span className="font-display text-sm font-semibold">Bonus & Dividend Calculator</span>
          <nav className="flex gap-1">
            {NAV.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === '/'}
                className={({ isActive }) =>
                  cn('rounded-md px-2 py-1 text-xs font-medium', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')
                }>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  )
}
