import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Approval, DB, Distribution, DistributionResult, EmployeeClassification, GroupResult, Participation,
  PersonPayout, Suggestion, SuggestionChanges, UUID,
} from './model'

// ─── API client ───────────────────────────────────────────────────────────────
// All endpoints are JSON, snake_case; decimals arrive as strings (see num()).

// Set at build time (VITE_API_BASE); falls back to the local Phoenix dev server.
const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api'
const TOKEN_KEY = 'bdc.token.v1'
const USER_KEY = 'bdc.user.v1'

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Set by StoreProvider; fired on any 401 so the app drops back to /login.
let onUnauthorized: (() => void) | null = null

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function errorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { error?: unknown; errors?: unknown }
  if (typeof p.error === 'string') return p.error
  if (p.errors && typeof p.errors === 'object') {
    return Object.entries(p.errors as Record<string, string[]>)
      .map(([field, msgs]) => `${field} ${msgs.join(', ')}`)
      .join('; ')
  }
  return null
}

async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = opts
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = localStorage.getItem(TOKEN_KEY)
  if (auth && token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Could not reach the server.', 0)
  }

  let payload: unknown = null
  try {
    payload = await res.json()
  } catch { /* empty body */ }

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    onUnauthorized?.()
    throw new ApiError(errorMessage(payload) ?? 'unauthorized', 401)
  }
  if (!res.ok) throw new ApiError(errorMessage(payload) ?? `Request failed (${res.status})`, res.status)

  const env = payload as { data?: unknown } | null
  return (env && typeof env === 'object' && 'data' in env ? env.data : payload) as T
}

// ─── API payload types + mappers (snake_case strings → UI model) ─────────────

interface ApiEmployee {
  id: string; name: string
  classification: EmployeeClassification | null
  archived: boolean; archived_at: string | null
  archived_by: ApiUserRef | null
}
interface ApiShareholder { id: string; name: string; shares: number; employee_id: string | null }
interface ApiGroup { id: string; name: string; employees: { id: string; name: string }[] }
interface ApiDistMember {
  id: string; employee_id: string | null; employee_name: string | null
  hours: string; performance_multiplier: string; note: string | null
}
interface ApiDistGroup {
  id: string; employee_group_id: string | null; name: string; allocation_pct: string
  impact_weight: number | null; effort_weight: number | null
  members: ApiDistMember[]
}
interface ApiSpecialBonus {
  id: string; employee_id: string | null; employee_name: string | null
  name: string | null; amount: string; note: string | null
}
interface ApiUserRef { id: string; username: string }
interface ApiApproval {
  id: string; distribution_id: string; user: ApiUserRef
  selfie: string; approved_at: string
}
interface ApiParticipation {
  user: ApiUserRef
  seen_at: string | null; suggested_at: string | null
  approval: { id: string; selfie: string; approved_at: string } | null
}
interface ApiSuggestion {
  id: string; distribution_id: string; user: ApiUserRef
  explanation: string; changes: ApiSuggestionChanges
  inserted_at: string; updated_at: string
}
// Raw jsonb as stored: snake_case, only fields differing from the base.
interface ApiSuggestionChanges {
  distribution?: { bonus_budget?: unknown; dividends_budget?: unknown; impact_weight?: unknown; effort_weight?: unknown }
  groups?: Record<string, { allocation_pct?: unknown; impact_weight?: unknown; effort_weight?: unknown }>
  members?: Record<string, { hours?: unknown; performance_multiplier?: unknown; note?: string | null }>
  special_bonuses?: { employee_id?: string | null; name?: string; amount?: unknown; note?: string | null }[]
}
interface ApiDistribution {
  id: string; name: string; description: string | null; status: Distribution['status']
  include_shareholders: boolean; bonus_budget: string; dividends_budget: string
  impact_weight: number; inserted_at: string
  planned_date: string | null
  created_by: ApiUserRef | null; finalized_by: ApiUserRef | null; paid_out_by: ApiUserRef | null
  finalized_at: string | null; paid_out_at: string | null
  distribution_groups?: ApiDistGroup[]; special_bonuses?: ApiSpecialBonus[]
}
interface ApiComputation {
  dividends: null | {
    payouts: { shareholder_id: string; shareholder_name: string; shares: number; pct: string; amount: string }[]
  }
  groups: {
    id: string; name: string; allocation_pct: string; group_budget: string
    impact_weight: number; effort_weight: number
    impact_budget: string; effort_budget: string; peso_per_impact: string; peso_per_hour: string
    members: (ApiDistMember & {
      impact_pct: string; effort_pct: string; impact_amount: string; effort_amount: string; total: string
    })[]
  }[]
  persons: {
    employee_id: string | null; shareholder_id: string | null; name: string; total: string
    breakdown: { type: 'effort' | 'impact' | 'special_bonus' | 'dividend'; group_name: string | null; amount: string }[]
  }[]
  totals: {
    bonus_budget: string; computed_bonus_total: string; special_bonuses_total: string
    dividends_budget: string; computed_dividends_total: string; grand_total: string
    within_tolerance: boolean
  }
}

function mapDistribution(d: ApiDistribution): Distribution {
  return {
    id: d.id,
    name: d.name,
    description: d.description ?? '',
    includeShareholders: d.include_shareholders,
    status: d.status,
    createdAt: (d.inserted_at ?? '').slice(0, 10),
    plannedDate: d.planned_date ?? null,
    createdBy: d.created_by ?? null,
    finalizedBy: d.finalized_by ?? null,
    finalizedAt: d.finalized_at ?? null,
    paidOutBy: d.paid_out_by ?? null,
    paidOutAt: d.paid_out_at ?? null,
    bonusBudget: num(d.bonus_budget),
    dividendBudget: num(d.dividends_budget),
    impactPct: num(d.impact_weight),
    groups: (d.distribution_groups ?? []).map((g) => ({
      id: g.id,
      groupId: g.employee_group_id,
      name: g.name,
      allocationPct: num(g.allocation_pct),
      impactWeight: g.impact_weight ?? null,
      effortWeight: g.effort_weight ?? null,
      members: (g.members ?? []).map((m) => ({
        id: m.id,
        employeeId: m.employee_id,
        name: m.employee_name ?? '—',
        hours: num(m.hours),
        multiplier: num(m.performance_multiplier),
        note: m.note ?? null,
      })),
    })),
    specialBonuses: (d.special_bonuses ?? []).map((b) => ({
      id: b.id,
      employeeId: b.employee_id,
      name: b.employee_name ?? b.name ?? '—',
      amount: num(b.amount),
      note: b.note ?? '',
    })),
    result: null,
  }
}

const BREAKDOWN_LABELS: Record<string, (groupName: string | null) => string> = {
  effort: (g) => `${g} — effort`,
  impact: (g) => `${g} — impact`,
  special_bonus: () => 'Special bonus',
  dividend: () => 'Dividends',
}

function mapComputation(data: ApiComputation): DistributionResult {
  const t = data.totals

  const dividends = (data.dividends?.payouts ?? []).map((p) => ({
    shareholderId: p.shareholder_id,
    name: p.shareholder_name,
    shares: p.shares,
    pct: num(p.pct),
    amount: num(p.amount),
  }))

  const groups: GroupResult[] = data.groups.map((g) => {
    const members = g.members.map((m) => ({
      employeeId: m.employee_id,
      name: m.employee_name ?? '—',
      hours: num(m.hours),
      effortPct: num(m.effort_pct),
      effortAmount: num(m.effort_amount),
      multiplier: num(m.performance_multiplier),
      impactPct: num(m.impact_pct),
      impactAmount: num(m.impact_amount),
      total: num(m.total),
      note: m.note ?? null,
    }))
    return {
      groupId: g.id,
      name: g.name,
      allocationPct: num(g.allocation_pct),
      impactWeight: num(g.impact_weight),
      effortWeight: num(g.effort_weight),
      budget: num(g.group_budget),
      impactBudget: num(g.impact_budget),
      effortBudget: num(g.effort_budget),
      perImpactPoint: num(g.peso_per_impact),
      perHour: num(g.peso_per_hour),
      members,
      paidOut: members.reduce((s, m) => s + m.total, 0),
    }
  })

  const payouts: PersonPayout[] = data.persons.map((p) => {
    const sum = (type: string) =>
      p.breakdown.filter((b) => b.type === type).reduce((s, b) => s + num(b.amount), 0)
    return {
      personId: p.employee_id ?? p.shareholder_id ?? null,
      name: p.name,
      bonusEffort: sum('effort'),
      bonusImpact: sum('impact'),
      specialBonus: sum('special_bonus'),
      dividends: sum('dividend'),
      total: num(p.total),
      breakdown: p.breakdown.map((b) => ({
        label: (BREAKDOWN_LABELS[b.type] ?? (() => b.type))(b.group_name),
        amount: num(b.amount),
      })),
    }
  })

  const bonusBudget = num(t.bonus_budget)
  const bonusPaidOut = num(t.computed_bonus_total)

  return {
    dividends,
    groups,
    payouts,
    bonusBudget,
    bonusPaidOut,
    specialBonusTotal: num(t.special_bonuses_total),
    dividendBudget: num(t.dividends_budget),
    dividendPaidOut: num(t.computed_dividends_total),
    grandTotal: num(t.grand_total),
    withinTolerance: t.within_tolerance,
    toleranceDelta: bonusBudget > 0 ? (Math.abs(bonusBudget - bonusPaidOut) / bonusBudget) * 100 : 0,
  }
}

const EMPTY_DB: DB = { users: [], shareholders: [], employees: [], groups: [], distributions: [] }

// ─── suggestion changes: wire (snake_case jsonb) ↔ UI model (camelCase) ──────

function mapApiChanges(raw: ApiSuggestionChanges | null | undefined): SuggestionChanges {
  const changes: SuggestionChanges = { distribution: {}, groups: {}, members: {}, specialBonuses: [] }
  if (!raw) return changes
  const d = raw.distribution ?? {}
  if (d.bonus_budget !== undefined) changes.distribution.bonusBudget = num(d.bonus_budget)
  if (d.dividends_budget !== undefined) changes.distribution.dividendBudget = num(d.dividends_budget)
  if (d.impact_weight !== undefined) changes.distribution.impactPct = num(d.impact_weight)
  for (const [gid, g] of Object.entries(raw.groups ?? {})) {
    const entry: SuggestionChanges['groups'][string] = {}
    if (g.allocation_pct !== undefined) entry.allocationPct = num(g.allocation_pct)
    if (g.impact_weight !== undefined) entry.impactWeight = num(g.impact_weight)
    if (g.effort_weight !== undefined) entry.effortWeight = num(g.effort_weight)
    changes.groups[gid] = entry
  }
  for (const [mid, m] of Object.entries(raw.members ?? {})) {
    const entry: SuggestionChanges['members'][string] = {}
    if (m.hours !== undefined) entry.hours = num(m.hours)
    if (m.performance_multiplier !== undefined) entry.multiplier = num(m.performance_multiplier)
    if (m.note !== undefined) entry.note = m.note ?? null
    changes.members[mid] = entry
  }
  changes.specialBonuses = (raw.special_bonuses ?? []).map((b) => ({
    employeeId: b.employee_id ?? null,
    name: b.name ?? '—',
    amount: num(b.amount),
    note: b.note ?? '',
  }))
  return changes
}

function mapSuggestion(s: ApiSuggestion): Suggestion {
  return {
    id: s.id,
    user: s.user,
    explanation: s.explanation,
    changes: mapApiChanges(s.changes),
    insertedAt: s.inserted_at,
    updatedAt: s.updated_at,
  }
}

function mapApproval(a: ApiApproval): Approval {
  return { id: a.id, user: a.user, selfie: a.selfie, approvedAt: a.approved_at }
}

function mapParticipation(p: ApiParticipation): Participation {
  return {
    user: p.user,
    seenAt: p.seen_at ?? null,
    suggestedAt: p.suggested_at ?? null,
    approval: p.approval
      ? { id: p.approval.id, selfie: p.approval.selfie, approvedAt: p.approval.approved_at }
      : null,
  }
}

/** UI model → snake_case wire shape accepted by simulate / suggestion upsert. */
export function changesToWire(changes: SuggestionChanges): Record<string, unknown> {
  const wire: Record<string, unknown> = {}
  const d: Record<string, unknown> = {}
  if (changes.distribution.bonusBudget !== undefined) d.bonus_budget = changes.distribution.bonusBudget
  if (changes.distribution.dividendBudget !== undefined) d.dividends_budget = changes.distribution.dividendBudget
  if (changes.distribution.impactPct !== undefined) {
    d.impact_weight = changes.distribution.impactPct
    d.effort_weight = 100 - changes.distribution.impactPct
  }
  if (Object.keys(d).length > 0) wire.distribution = d

  const groups: Record<string, unknown> = {}
  for (const [gid, g] of Object.entries(changes.groups)) {
    const entry: Record<string, unknown> = {}
    if (g.allocationPct !== undefined) entry.allocation_pct = g.allocationPct
    if (g.impactWeight !== undefined) entry.impact_weight = g.impactWeight
    if (g.effortWeight !== undefined) entry.effort_weight = g.effortWeight
    if (Object.keys(entry).length > 0) groups[gid] = entry
  }
  if (Object.keys(groups).length > 0) wire.groups = groups

  const members: Record<string, unknown> = {}
  for (const [mid, m] of Object.entries(changes.members)) {
    const entry: Record<string, unknown> = {}
    if (m.hours !== undefined) entry.hours = m.hours
    if (m.multiplier !== undefined) entry.performance_multiplier = m.multiplier
    if (m.note !== undefined) entry.note = m.note
    if (Object.keys(entry).length > 0) members[mid] = entry
  }
  if (Object.keys(members).length > 0) wire.members = members

  if (changes.specialBonuses.length > 0) {
    wire.special_bonuses = changes.specialBonuses.map((b) => ({
      employee_id: b.employeeId,
      name: b.name,
      amount: b.amount,
      note: b.note || null,
    }))
  }
  return wire
}

export const countChanges = (changes: SuggestionChanges): number =>
  Object.keys(changes.distribution).length
  + Object.values(changes.groups).reduce((s, g) => s + Object.keys(g).length, 0)
  + Object.values(changes.members).reduce((s, m) => s + Object.keys(m).length, 0)
  + changes.specialBonuses.length

// Read once at module load so React state can be initialized lazily (a render
// must not read localStorage itself).
const storedSession = ((): { id: string; username: string } | null => {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const raw = localStorage.getItem(USER_KEY)
    if (!token || !raw) return null
    return JSON.parse(raw) as { id: string; username: string }
  } catch {
    return null
  }
})()

// ─── Store ────────────────────────────────────────────────────────────────────

interface StoreCtx {
  db: DB
  computations: Record<UUID, DistributionResult>
  suggestions: Record<UUID, Suggestion[]>
  /** Live previews of in-progress suggestion edits, keyed by distribution id. */
  simulations: Record<UUID, DistributionResult>
  sessionUserId: UUID | null
  /** True while a persisted session's initial data load is still in flight. */
  bootstrapping: boolean
  login: (username: string, password: string) => Promise<string | null>
  logout: () => void
  /** PATCHes the current user's username/password; resolves to an error message or null. */
  updateAccount: (patch: { username?: string; password?: string }) => Promise<string | null>
  refreshDistribution: (id: UUID) => Promise<void>
  /** Cached if present, otherwise fetched and cached. */
  getComputation: (id: UUID) => Promise<DistributionResult>
  // suggestions
  loadSuggestions: (distId: UUID) => Promise<void>
  /** Debounced (~300ms) live preview of proposed changes; writes `simulations[distId]`. */
  simulate: (distId: UUID, changes: SuggestionChanges) => void
  /** Fetches one suggestion plus its simulated computation. */
  fetchSuggestion: (suggestionId: UUID) => Promise<{ suggestion: Suggestion; computation: DistributionResult }>
  /** Upserts the current user's suggestion set; resolves to an error message or null. */
  submitSuggestion: (distId: UUID, explanation: string, changes: SuggestionChanges) => Promise<string | null>
  deleteSuggestion: (distId: UUID, suggestionId: UUID) => Promise<string | null>
  // approvals
  approvals: Record<UUID, Approval[]>
  loadApprovals: (distId: UUID) => Promise<void>
  /** selfie is a full data URL captured from the camera; resolves to an error message or null. */
  approveDistribution: (distId: UUID, selfie: string) => Promise<string | null>
  rescindApproval: (distId: UUID) => Promise<string | null>
  // participation
  participation: Record<UUID, Participation[]>
  loadParticipation: (distId: UUID) => Promise<void>
  // users
  loadUsers: () => Promise<void>
  createUser: (username: string, password: string) => Promise<string | null>
  // admin
  addShareholder: (name: string, shares: number, employeeId: UUID | null) => Promise<string | null>
  updateShareholder: (id: UUID, patch: Partial<{ name: string; shares: number; employeeId: UUID | null }>) => Promise<string | null>
  removeShareholder: (id: UUID) => Promise<string | null>
  addEmployee: (name: string, classification: EmployeeClassification | null) => Promise<string | null>
  renameEmployee: (id: UUID, name: string) => Promise<string | null>
  setEmployeeClassification: (id: UUID, classification: EmployeeClassification | null) => Promise<string | null>
  setEmployeeArchived: (id: UUID, archived: boolean) => Promise<string | null>
  removeEmployee: (id: UUID) => Promise<string | null>
  addGroup: (name: string) => Promise<string | null>
  renameGroup: (id: UUID, name: string) => Promise<string | null>
  removeGroup: (id: UUID) => Promise<string | null>
  toggleGroupMember: (groupId: UUID, employeeId: UUID) => Promise<string | null>
  // distributions
  createDistribution: (name: string, description: string, includeShareholders: boolean) => Promise<UUID | null>
  updateDistribution: (id: UUID, patch: Partial<Pick<Distribution, 'name' | 'description' | 'bonusBudget' | 'impactPct' | 'dividendBudget' | 'plannedDate'>>) => Promise<string | null>
  deleteDistribution: (id: UUID) => Promise<string | null>
  addGroupToDistribution: (distId: UUID, groupId: UUID) => Promise<string | null>
  removeGroupFromDistribution: (distId: UUID, distGroupId: UUID) => Promise<string | null>
  updateDistGroupAllocation: (distId: UUID, distGroupId: UUID, allocationPct: number) => Promise<string | null>
  /** Pass nulls to clear back to the distribution-level weights; otherwise both weights, summing to 100. */
  updateDistGroupWeights: (distId: UUID, distGroupId: UUID, impactWeight: number | null, effortWeight: number | null) => Promise<string | null>
  updateDistMember: (distId: UUID, memberId: UUID, patch: Partial<{ hours: number; multiplier: number; note: string | null }>) => Promise<string | null>
  addSpecialBonus: (distId: UUID, employeeId: UUID | null, name: string, amount: number, note: string) => Promise<string | null>
  removeSpecialBonus: (distId: UUID, bonusId: UUID) => Promise<string | null>
  finalizeDistribution: (id: UUID) => Promise<string | null>
  markPaidOut: (id: UUID) => Promise<string | null>
  // seed import
  seedImportResult: SeedImportResult | null
  uploadSeedFile: (file: File) => Promise<string | null>
}

export interface SeedImportResult {
  employeesCreated: number
  groupsCreated: number
  shareholdersCreated: number
  distributionsCreated: number
  distributionsSkipped: number
}

interface ApiSeedImportResult {
  employees_created: number; groups_created: number; shareholders_created: number
  distributions_created: number; distributions_skipped: number
}

const Ctx = createContext<StoreCtx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() =>
    storedSession
      ? { ...EMPTY_DB, users: [{ id: storedSession.id, username: storedSession.username, password: '', name: storedSession.username }] }
      : EMPTY_DB,
  )
  const [bootstrapping, setBootstrapping] = useState(() => storedSession !== null)
  const [computations, setComputations] = useState<Record<UUID, DistributionResult>>({})
  const [suggestions, setSuggestions] = useState<Record<UUID, Suggestion[]>>({})
  const [approvals, setApprovals] = useState<Record<UUID, Approval[]>>({})
  const [participation, setParticipation] = useState<Record<UUID, Participation[]>>({})
  const [simulations, setSimulations] = useState<Record<UUID, DistributionResult>>({})
  const [sessionUserId, setSessionUserId] = useState<UUID | null>(storedSession?.id ?? null)
  const [seedImportResult, setSeedImportResult] = useState<SeedImportResult | null>(null)
  const dbRef = useRef(db)
  useEffect(() => { dbRef.current = db }, [db])
  const computationsRef = useRef(computations)
  useEffect(() => { computationsRef.current = computations }, [computations])
  const refreshTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const simulateTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const fetchDistFull = useCallback(async (id: UUID) => {
    const [full, comp] = await Promise.all([
      apiFetch<ApiDistribution>(`/distributions/${id}`),
      apiFetch<ApiComputation>(`/distributions/${id}/computation`),
    ])
    const result = mapComputation(comp)
    const dist = mapDistribution(full)
    // Drafts keep result null so the list view shows the planned budget;
    // their live preview lives in `computations`.
    if (dist.status !== 'drafted') dist.result = result
    return { dist, result }
  }, [])

  const refreshDistribution = useCallback(async (id: UUID) => {
    const { dist, result } = await fetchDistFull(id)
    setDb((prev) => ({
      ...prev,
      distributions: prev.distributions.some((d) => d.id === id)
        ? prev.distributions.map((d) => (d.id === id ? dist : d))
        : [dist, ...prev.distributions],
    }))
    setComputations((prev) => ({ ...prev, [id]: result }))
    // The base moved; any cached suggestion simulation is stale.
    setSimulations((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [fetchDistFull])

  const loadSuggestions = useCallback(async (distId: UUID) => {
    const list = await apiFetch<ApiSuggestion[]>(`/distributions/${distId}/suggestions`)
    setSuggestions((prev) => ({ ...prev, [distId]: list.map(mapSuggestion) }))
  }, [])

  const loadApprovals = useCallback(async (distId: UUID) => {
    const list = await apiFetch<ApiApproval[]>(`/distributions/${distId}/approvals`)
    setApprovals((prev) => ({ ...prev, [distId]: list.map(mapApproval) }))
  }, [])

  const loadParticipation = useCallback(async (distId: UUID) => {
    const list = await apiFetch<ApiParticipation[]>(`/distributions/${distId}/participation`)
    setParticipation((prev) => ({ ...prev, [distId]: list.map(mapParticipation) }))
  }, [])

  // Debounced live preview while composing a suggestion (~300ms).
  const simulate = useCallback((distId: UUID, changes: SuggestionChanges) => {
    clearTimeout(simulateTimers.current[distId])
    simulateTimers.current[distId] = setTimeout(() => {
      apiFetch<ApiComputation>(`/distributions/${distId}/simulate`, {
        method: 'POST',
        body: { changes: changesToWire(changes) },
      })
        .then((comp) => setSimulations((prev) => ({ ...prev, [distId]: mapComputation(comp) })))
        .catch(() => {})
    }, 300)
  }, [])

  const fetchSuggestion = useCallback(async (suggestionId: UUID) => {
    const data = await apiFetch<{ suggestion: ApiSuggestion; computation: ApiComputation }>(`/suggestions/${suggestionId}`)
    return { suggestion: mapSuggestion(data.suggestion), computation: mapComputation(data.computation) }
  }, [])

  const loadUsers = useCallback(async () => {
    const users = await apiFetch<ApiUserRef[]>('/users')
    setDb((prev) => ({
      ...prev,
      users: users.map((u) => ({ id: u.id, username: u.username, password: '', name: u.username })),
    }))
  }, [])

  const getComputation = useCallback(async (id: UUID): Promise<DistributionResult> => {
    const cached = computationsRef.current[id]
    if (cached) return cached
    const comp = await apiFetch<ApiComputation>(`/distributions/${id}/computation`)
    const result = mapComputation(comp)
    setComputations((prev) => ({ ...prev, [id]: result }))
    return result
  }, [])

  const reloadCore = useCallback(async () => {
    const [employees, shareholders, groups] = await Promise.all([
      apiFetch<ApiEmployee[]>('/employees'),
      apiFetch<ApiShareholder[]>('/shareholders'),
      apiFetch<ApiGroup[]>('/employee_groups'),
    ])
    setDb((prev) => ({
      ...prev,
      employees: employees.map((e) => ({
        id: e.id, name: e.name,
        classification: e.classification ?? null,
        archived: !!e.archived, archivedAt: e.archived_at ?? null,
        archivedBy: e.archived_by ?? null,
      })),
      shareholders: shareholders.map((s) => ({
        id: s.id, name: s.name, shares: num(s.shares), employeeId: s.employee_id,
      })),
      groups: groups.map((g) => ({
        id: g.id, name: g.name, memberIds: (g.employees ?? []).map((e) => e.id),
      })),
    }))
  }, [])

  const reloadDistributions = useCallback(async () => {
    const summaries = await apiFetch<ApiDistribution[]>('/distributions')
    const fulls = await Promise.all(summaries.map((s) => fetchDistFull(s.id)))
    setDb((prev) => ({ ...prev, distributions: fulls.map((f) => f.dist) }))
    setComputations(Object.fromEntries(fulls.map((f) => [f.dist.id, f.result])))
  }, [fetchDistFull])

  const loadAll = useCallback(async () => {
    await Promise.all([reloadCore(), reloadDistributions()])
  }, [reloadCore, reloadDistributions])

  // Restore a persisted session on reload: fetch everything once.
  const handleUnauthorized = useCallback(() => {
    setSessionUserId(null)
    setDb(EMPTY_DB)
    setComputations({})
    setSuggestions({})
    setApprovals({})
    setParticipation({})
    setSimulations({})
    setBootstrapping(false)
  }, [])

  useEffect(() => {
    onUnauthorized = handleUnauthorized
    if (storedSession) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load: setState only fires after the async fetches resolve
      loadAll()
        .catch(() => {})
        .finally(() => setBootstrapping(false))
    }
    return () => { onUnauthorized = null }
  }, [loadAll, handleUnauthorized])

  // Debounced refetch after member edits (~300ms).
  const scheduleRefresh = useCallback((distId: UUID) => {
    clearTimeout(refreshTimers.current[distId])
    refreshTimers.current[distId] = setTimeout(() => {
      refreshDistribution(distId).catch(() => {})
    }, 300)
  }, [refreshDistribution])

  /** Runs a mutation, then resyncs the affected data. Returns an error message or null. */
  const run = useCallback(async (
    fn: () => Promise<unknown>,
    resync: () => Promise<void>,
  ): Promise<string | null> => {
    try {
      await fn()
      await resync()
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Something went wrong.'
    }
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      const data = await apiFetch<{ token: string; user: { id: string; username: string } }>(
        '/session',
        { method: 'POST', body: { username: username.trim(), password }, auth: false },
      )
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      setSessionUserId(data.user.id)
      setDb((prev) => ({
        ...prev,
        users: [{ id: data.user.id, username: data.user.username, password: '', name: data.user.username }],
      }))
      await loadAll()
      return null
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return 'Invalid username or password.'
      return e instanceof Error ? e.message : 'Something went wrong.'
    }
  }, [loadAll])

  const logout = useCallback(() => {
    apiFetch('/session', { method: 'DELETE' }).catch(() => {}).finally(() => {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      setSessionUserId(null)
      setDb(EMPTY_DB)
      setComputations({})
      setSuggestions({})
      setApprovals({})
      setParticipation({})
      setSimulations({})
    })
  }, [])

  const api = useMemo<StoreCtx>(() => ({
    db, computations, suggestions, approvals, participation, simulations, sessionUserId, bootstrapping,
    login, logout, refreshDistribution, getComputation,
    loadSuggestions, simulate, fetchSuggestion, loadUsers, loadApprovals, loadParticipation,

    submitSuggestion: async (distId, explanation, changes) => {
      try {
        await apiFetch<ApiSuggestion>(`/distributions/${distId}/suggestion`, {
          method: 'POST',
          body: { explanation, changes: changesToWire(changes) },
        })
        setSimulations((prev) => {
          const next = { ...prev }
          delete next[distId]
          return next
        })
        await loadSuggestions(distId)
        await loadParticipation(distId)
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Something went wrong.'
      }
    },
    deleteSuggestion: (distId, suggestionId) =>
      run(
        () => apiFetch(`/suggestions/${suggestionId}`, { method: 'DELETE' }),
        async () => { await Promise.all([loadSuggestions(distId), loadParticipation(distId)]) },
      ),

    approveDistribution: (distId, selfie) =>
      run(
        () => apiFetch(`/distributions/${distId}/approval`, { method: 'POST', body: { selfie } }),
        async () => { await Promise.all([loadApprovals(distId), loadParticipation(distId)]) },
      ),
    rescindApproval: (distId) =>
      run(
        () => apiFetch(`/distributions/${distId}/approval`, { method: 'DELETE' }),
        async () => { await Promise.all([loadApprovals(distId), loadParticipation(distId)]) },
      ),

    createUser: (username, password) =>
      run(
        () => apiFetch('/users', { method: 'POST', body: { username: username.trim(), password } }),
        loadUsers,
      ),

    updateAccount: async (patch) => {
      try {
        await apiFetch('/user', { method: 'PATCH', body: patch })
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Something went wrong.'
      }
    },

    addShareholder: (name, shares, employeeId) =>
      run(() => apiFetch('/shareholders', { method: 'POST', body: { name, shares, employee_id: employeeId } }), reloadCore),
    updateShareholder: (id, patch) =>
      run(() => apiFetch(`/shareholders/${id}`, {
        method: 'PATCH',
        body: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.shares !== undefined ? { shares: patch.shares } : {}),
          ...(patch.employeeId !== undefined ? { employee_id: patch.employeeId } : {}),
        },
      }), reloadCore),
    removeShareholder: (id) =>
      run(() => apiFetch(`/shareholders/${id}`, { method: 'DELETE' }), reloadCore),

    addEmployee: (name, classification) =>
      run(() => apiFetch('/employees', { method: 'POST', body: { name, classification } }), reloadCore),
    renameEmployee: (id, name) =>
      run(() => apiFetch(`/employees/${id}`, { method: 'PATCH', body: { name } }), reloadCore),
    setEmployeeClassification: (id, classification) =>
      run(() => apiFetch(`/employees/${id}`, { method: 'PATCH', body: { classification } }), reloadCore),
    setEmployeeArchived: (id, archived) =>
      run(() => apiFetch(`/employees/${id}`, { method: 'PATCH', body: { archived } }), reloadCore),
    removeEmployee: (id) =>
      run(() => apiFetch(`/employees/${id}`, { method: 'DELETE' }), reloadCore),

    addGroup: (name) =>
      run(() => apiFetch('/employee_groups', { method: 'POST', body: { name } }), reloadCore),
    renameGroup: (id, name) =>
      run(() => apiFetch(`/employee_groups/${id}`, { method: 'PATCH', body: { name } }), reloadCore),
    removeGroup: (id) =>
      run(() => apiFetch(`/employee_groups/${id}`, { method: 'DELETE' }), reloadCore),
    toggleGroupMember: (groupId, employeeId) => {
      const isMember = dbRef.current.groups.find((g) => g.id === groupId)?.memberIds.includes(employeeId)
      return run(
        () => isMember
          ? apiFetch(`/employee_groups/${groupId}/members/${employeeId}`, { method: 'DELETE' })
          : apiFetch(`/employee_groups/${groupId}/members`, { method: 'POST', body: { employee_id: employeeId } }),
        reloadCore,
      )
    },

    createDistribution: async (name, description, includeShareholders) => {
      try {
        const data = await apiFetch<ApiDistribution>('/distributions', {
          method: 'POST',
          body: { name, description, include_shareholders: includeShareholders },
        })
        await reloadDistributions()
        return data.id
      } catch {
        return null
      }
    },
    updateDistribution: (id, patch) => {
      const body: Record<string, unknown> = {}
      if (patch.name !== undefined) body.name = patch.name
      if (patch.description !== undefined) body.description = patch.description
      if (patch.bonusBudget !== undefined) body.bonus_budget = patch.bonusBudget
      if (patch.dividendBudget !== undefined) body.dividends_budget = patch.dividendBudget
      if (patch.plannedDate !== undefined) body.planned_date = patch.plannedDate
      if (patch.impactPct !== undefined) {
        body.impact_weight = patch.impactPct
        body.effort_weight = 100 - patch.impactPct
      }
      return run(() => apiFetch(`/distributions/${id}`, { method: 'PATCH', body }), () => refreshDistribution(id))
    },
    deleteDistribution: (id) =>
      run(() => apiFetch(`/distributions/${id}`, { method: 'DELETE' }), reloadDistributions),

    addGroupToDistribution: (distId, groupId) =>
      run(
        () => apiFetch(`/distributions/${distId}/groups`, {
          method: 'POST',
          body: { employee_group_id: groupId, allocation_pct: 0 },
        }),
        () => refreshDistribution(distId),
      ),
    removeGroupFromDistribution: (distId, distGroupId) =>
      run(
        () => apiFetch(`/distribution_groups/${distGroupId}`, { method: 'DELETE' }),
        () => refreshDistribution(distId),
      ),
    updateDistGroupAllocation: (distId, distGroupId, allocationPct) =>
      run(
        () => apiFetch(`/distribution_groups/${distGroupId}`, {
          method: 'PATCH',
          body: { allocation_pct: allocationPct },
        }),
        () => refreshDistribution(distId),
      ),
    updateDistGroupWeights: (distId, distGroupId, impactWeight, effortWeight) =>
      run(
        () => apiFetch(`/distribution_groups/${distGroupId}`, {
          method: 'PATCH',
          body: { impact_weight: impactWeight, effort_weight: effortWeight },
        }),
        () => refreshDistribution(distId),
      ),
    updateDistMember: async (distId, memberId, patch) => {
      try {
        const body: Record<string, unknown> = {}
        if (patch.hours !== undefined) body.hours = patch.hours
        if (patch.multiplier !== undefined) body.performance_multiplier = patch.multiplier
        if (patch.note !== undefined) body.note = patch.note
        const m = await apiFetch<ApiDistMember>(`/distribution_group_members/${memberId}`, { method: 'PATCH', body })
        // Apply the row optimistically; the computation refetch is debounced.
        setDb((prev) => ({
          ...prev,
          distributions: prev.distributions.map((d) =>
            d.id !== distId ? d : {
              ...d,
              groups: d.groups.map((g) => ({
                ...g,
                members: g.members.map((mm) =>
                  mm.id === memberId
                    ? { ...mm, hours: num(m.hours), multiplier: num(m.performance_multiplier), note: m.note ?? null }
                    : mm),
              })),
            }),
        }))
        scheduleRefresh(distId)
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Something went wrong.'
      }
    },

    addSpecialBonus: (distId, employeeId, name, amount, note) =>
      run(
        () => apiFetch(`/distributions/${distId}/special_bonuses`, {
          method: 'POST',
          body: {
            employee_id: employeeId,
            amount,
            note: note || null,
            ...(employeeId ? {} : { name }),
          },
        }),
        () => refreshDistribution(distId),
      ),
    removeSpecialBonus: (distId, bonusId) =>
      run(
        () => apiFetch(`/special_bonuses/${bonusId}`, { method: 'DELETE' }),
        () => refreshDistribution(distId),
      ),

    finalizeDistribution: (id) =>
      run(() => apiFetch(`/distributions/${id}/finalize`, { method: 'POST' }), () => refreshDistribution(id)),
    markPaidOut: (id) =>
      run(() => apiFetch(`/distributions/${id}/mark_paid`, { method: 'POST' }), () => refreshDistribution(id)),

    seedImportResult,
    uploadSeedFile: async (file) => {
      let payload: unknown
      try {
        payload = JSON.parse(await file.text())
      } catch {
        return 'That file is not valid JSON.'
      }
      try {
        const data = await apiFetch<ApiSeedImportResult>('/seed_upload', { method: 'POST', body: payload })
        setSeedImportResult({
          employeesCreated: num(data.employees_created),
          groupsCreated: num(data.groups_created),
          shareholdersCreated: num(data.shareholders_created),
          distributionsCreated: num(data.distributions_created),
          distributionsSkipped: num(data.distributions_skipped),
        })
        await loadAll()
        return null
      } catch (e) {
        setSeedImportResult(null)
        return e instanceof Error ? e.message : 'Something went wrong.'
      }
    },
  }), [
    db, computations, suggestions, approvals, participation, simulations, sessionUserId, bootstrapping, login, logout, seedImportResult,
    refreshDistribution, getComputation, reloadCore, reloadDistributions, loadAll, run, scheduleRefresh,
    loadSuggestions, simulate, fetchSuggestion, loadUsers, loadApprovals, loadParticipation,
  ])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore outside provider')
  return ctx
}
