// ─── Domain model ─────────────────────────────────────────────────────────────
// UI-facing model. All data comes from the Phoenix API (see lib/store.tsx);
// decimals arrive as strings and are coerced with `num()` at the boundary.

export type UUID = string

export type DistributionStatus = 'drafted' | 'finalized' | 'paid_out'

export interface User {
  id: UUID
  username: string
  password: string
  name: string
}

export interface Shareholder {
  id: UUID
  name: string
  shares: number
  employeeId: UUID | null
}

export type EmployeeClassification = 'full_time' | 'contractual' | 'professional' | 'foreigner'

/** Hardcoded withholding rates on bonuses, by employee classification. */
export const TAX_WITHHELD_RATES: Record<EmployeeClassification, number> = {
  full_time: 0,
  contractual: 0.05,
  professional: 0.05,
  foreigner: 0.25,
}

/** Hardcoded withholding rate on dividends (shareholders). */
export const SHAREHOLDER_TAX_WITHHELD_RATE = 0.10

export interface Employee {
  id: UUID
  name: string
  classification: EmployeeClassification | null
  archived: boolean
  archivedAt: string | null
  archivedBy: { id: UUID; username: string } | null
}

export interface EmployeeGroup {
  id: UUID
  name: string
  memberIds: UUID[]
}

export interface DistMember {
  id: UUID // distribution_group_member row id (PATCH target)
  employeeId: UUID | null // source employee; null if the employee was deleted
  name: string // snapshot
  hours: number
  multiplier: number // impact, percent — starts at 100
  note: string | null // e.g. rating justification
}

export interface DistGroup {
  id: UUID // distribution_group row id (PATCH/DELETE target)
  groupId: UUID | null // source employee group; null if the group was deleted
  name: string // snapshot
  allocationPct: number
  impactWeight: number | null // per-group override; null = distribution default
  effortWeight: number | null
  members: DistMember[]
}

export interface SpecialBonus {
  id: UUID
  employeeId: UUID | null
  name: string // snapshot / free text
  amount: number
  note: string
}

export interface DividendLine {
  shareholderId: UUID
  name: string
  shares: number
  pct: number
  amount: number
}

export interface GroupMemberLine {
  employeeId: UUID | null
  name: string
  hours: number
  effortPct: number
  effortAmount: number
  multiplier: number
  impactPct: number
  impactAmount: number
  total: number
  note: string | null
}

export interface GroupResult {
  groupId: UUID
  name: string
  allocationPct: number
  impactWeight: number // effective weights (group override or distribution default)
  effortWeight: number
  budget: number
  impactBudget: number
  effortBudget: number
  perImpactPoint: number
  perHour: number
  members: GroupMemberLine[]
  paidOut: number
}

export interface PersonPayout {
  personId: UUID | null
  name: string
  bonusEffort: number
  bonusImpact: number
  specialBonus: number
  dividends: number
  total: number
  breakdown: { label: string; amount: number }[]
}

export interface DistributionResult {
  dividends: DividendLine[]
  groups: GroupResult[]
  payouts: PersonPayout[]
  bonusBudget: number
  bonusPaidOut: number
  specialBonusTotal: number
  dividendBudget: number
  dividendPaidOut: number
  grandTotal: number
  withinTolerance: boolean
  toleranceDelta: number
}

export interface Distribution {
  id: UUID
  name: string
  description: string
  includeShareholders: boolean
  status: DistributionStatus
  createdAt: string
  plannedDate: string | null
  createdBy: { id: UUID; username: string } | null
  finalizedBy: { id: UUID; username: string } | null
  finalizedAt: string | null
  paidOutBy: { id: UUID; username: string } | null
  paidOutAt: string | null
  bonusBudget: number
  impactPct: number // effort = 100 - impact
  groups: DistGroup[]
  dividendBudget: number
  specialBonuses: SpecialBonus[]
  result: DistributionResult | null // set for finalized / paid_out distributions
}

// ─── suggestion sets ──────────────────────────────────────────────────────────
// A non-owner's proposed edits to a draft. Only fields that differ from the
// base distribution are recorded; the wire shape is the snake_case mirror (see
// changesToWire / mapApiChanges in lib/store.tsx).

export interface SuggestedSpecialBonus {
  employeeId: UUID | null
  name: string
  amount: number
  note: string
}

export interface SuggestionChanges {
  distribution: {
    bonusBudget?: number
    dividendBudget?: number
    impactPct?: number // effort = 100 - impact
  }
  groups: Record<UUID, {
    allocationPct?: number
    impactWeight?: number
    effortWeight?: number
  }>
  members: Record<UUID, {
    hours?: number
    multiplier?: number
    note?: string | null
  }>
  specialBonuses: SuggestedSpecialBonus[] // additions only
}

export const EMPTY_CHANGES: SuggestionChanges = { distribution: {}, groups: {}, members: {}, specialBonuses: [] }

export interface Suggestion {
  id: UUID
  user: { id: UUID; username: string }
  explanation: string
  changes: SuggestionChanges
  insertedAt: string
  updatedAt: string
}

export interface DB {
  users: User[]
  shareholders: Shareholder[]
  employees: Employee[]
  groups: EmployeeGroup[]
  distributions: Distribution[]
}

export const EMPTY_RESULT: DistributionResult = {
  dividends: [], groups: [], payouts: [],
  bonusBudget: 0, bonusPaidOut: 0, specialBonusTotal: 0,
  dividendBudget: 0, dividendPaidOut: 0, grandTotal: 0,
  withinTolerance: true, toleranceDelta: 0,
}

export const uid = (): UUID => crypto.randomUUID()

export const peso = (n: number): string =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const pct = (n: number): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%'
