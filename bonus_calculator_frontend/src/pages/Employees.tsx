import { useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, Plus, Trash2, X } from 'lucide-react'
import { format } from 'date-fns'
import { useStore } from '@/lib/store'
import type { EmployeeClassification } from '@/lib/model'
import { AppShell, SectionHeader } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const fmtDateTime = (iso: string) => format(new Date(iso), "MMM d, yyyy 'at' h:mm a")

const CLASSIFICATION_LABELS: Record<EmployeeClassification, string> = {
  full_time: 'Full-time',
  contractual: 'Contractual',
  professional: 'Professional',
}

type StatusFilter = 'active' | 'archived' | 'all'

export default function Employees() {
  const { db, addEmployee, renameEmployee, setEmployeeClassification, setEmployeeArchived, removeEmployee, addGroup, renameGroup, removeGroup, toggleGroupMember } = useStore()
  const [empName, setEmpName] = useState('')
  const [empClass, setEmpClass] = useState<EmployeeClassification | 'none'>('none')
  const [grpName, setGrpName] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [classFilter, setClassFilter] = useState<EmployeeClassification | 'all'>('all')

  const submitEmp = (e: FormEvent) => {
    e.preventDefault()
    if (!empName.trim()) return
    addEmployee(empName.trim(), empClass === 'none' ? null : empClass)
    setEmpName(''); setEmpClass('none')
  }
  const submitGrp = (e: FormEvent) => {
    e.preventDefault()
    if (!grpName.trim()) return
    addGroup(grpName.trim()); setGrpName('')
  }

  const groupsOf = (empId: string) => db.groups.filter((g) => g.memberIds.includes(empId))

  const visibleEmployees = db.employees
    .filter((e) => {
      if (statusFilter === 'archived' && !e.archived) return false
      if (classFilter !== 'all' && e.classification !== classFilter) return false
      return true
    })
    // default ("active") view: active employees first, archived still listed (muted) at the bottom
    .sort((a, b) => {
      if (statusFilter !== 'active') return 0
      return Number(a.archived) - Number(b.archived)
    })

  return (
    <AppShell>
      <div className="mb-6">
        <p className="kicker mb-1">Admin setup</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Employees & Groups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Employees can belong to many groups, and groups to many employees. Changes here never alter existing distributions — those are snapshots.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* employees */}
        <section className="lg:col-span-2">
          <SectionHeader title="Employees" hint={`${db.employees.length} on record`} />
          <div className="mb-2 flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Select value={classFilter} onValueChange={(v) => setClassFilter(v as EmployeeClassification | 'all')}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classifications</SelectItem>
                {(Object.keys(CLASSIFICATION_LABELS) as EmployeeClassification[]).map((c) => (
                  <SelectItem key={c} value={c}>{CLASSIFICATION_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
            <table className="ledger">
              <thead>
                <tr><th>Name</th><th>Classification</th><th>Groups</th><th className="r" /></tr>
              </thead>
              <tbody>
                {visibleEmployees.map((e) => {
                  const gs = groupsOf(e.id)
                  return (
                    <tr key={e.id} className={cn(e.archived && 'text-muted-foreground')}>
                      <td>
                        <div className="flex items-center gap-2">
                          <input className="cell-input !text-left font-medium" defaultValue={e.name}
                            onBlur={(ev) => ev.target.value.trim() && renameEmployee(e.id, ev.target.value.trim())} />
                          {e.archived && (
                            <span className="shrink-0 rounded-full border bg-secondary px-2 py-0.5 text-[0.6875rem] font-medium">Archived</span>
                          )}
                          {e.archived && e.archivedAt && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {e.archivedBy ? `Archived by ${e.archivedBy.username}` : 'Archived'} · {fmtDateTime(e.archivedAt)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="w-36">
                        <Select
                          value={e.classification ?? 'none'}
                          onValueChange={(v) => setEmployeeClassification(e.id, v === 'none' ? null : v as EmployeeClassification)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Unset" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unset</SelectItem>
                            {(Object.keys(CLASSIFICATION_LABELS) as EmployeeClassification[]).map((c) => (
                              <SelectItem key={c} value={c}>{CLASSIFICATION_LABELS[c]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {gs.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          {gs.map((g) => (
                            <span key={g.id} className="rounded-full border bg-secondary px-2 py-0.5 text-[0.6875rem] font-medium">{g.name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="r whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                          title={e.archived ? 'Unarchive' : 'Archive'}
                          onClick={() => setEmployeeArchived(e.id, !e.archived)}>
                          {e.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeEmployee(e.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
                {visibleEmployees.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No employees match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <form onSubmit={submitEmp} className="mt-3 flex gap-2">
            <Input className="h-9" placeholder="Employee name" value={empName} onChange={(e) => setEmpName(e.target.value)} />
            <Select value={empClass} onValueChange={(v) => setEmpClass(v as EmployeeClassification | 'none')}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Classification" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unset</SelectItem>
                {(Object.keys(CLASSIFICATION_LABELS) as EmployeeClassification[]).map((c) => (
                  <SelectItem key={c} value={c}>{CLASSIFICATION_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary" disabled={!empName.trim()}>
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </form>
        </section>

        {/* groups */}
        <section className="lg:col-span-3">
          <SectionHeader title="Employee groups" hint={`${db.groups.length} groups`} />
          <div className="space-y-3">
            {db.groups.map((g) => (
              <div key={g.id} className="rounded-lg border bg-card shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <input
                    className={cn('w-full bg-transparent font-display text-base font-semibold outline-none')}
                    defaultValue={g.name}
                    onBlur={(e) => e.target.value.trim() && renameGroup(g.id, e.target.value.trim())}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">{g.memberIds.length} members</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeGroup(g.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {(() => {
                  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
                  const members = g.memberIds
                    .map((id) => db.employees.find((e) => e.id === id))
                    .filter((e): e is NonNullable<typeof e> => Boolean(e))
                    .sort(byName)
                  const available = db.employees
                    .filter((e) => !e.archived && !g.memberIds.includes(e.id))
                    .sort(byName)
                  return (
                    <div className="grid grid-cols-2 divide-x">
                      <div className="px-3 py-2.5">
                        <p className="kicker mb-2">Added</p>
                        <div className="space-y-0.5">
                          {members.map((e) => (
                            <button key={e.id} type="button" onClick={() => toggleGroupMember(g.id, e.id)}
                              title="Remove from group"
                              className="group/member flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-sm hover:bg-destructive/10">
                              <span className="flex items-center gap-2">
                                {e.name}
                                {e.archived && (
                                  <span className="rounded-full border bg-secondary px-1.5 py-0 text-[0.625rem] font-medium text-muted-foreground">Archived</span>
                                )}
                              </span>
                              <X className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/member:opacity-100" />
                            </button>
                          ))}
                          {members.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">No members yet.</p>}
                        </div>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="kicker mb-2">Not added</p>
                        <div className="space-y-0.5">
                          {available.map((e) => (
                            <button key={e.id} type="button" onClick={() => toggleGroupMember(g.id, e.id)}
                              title="Add to group"
                              className="group/member flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                              {e.name}
                              <Plus className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/member:opacity-100" />
                            </button>
                          ))}
                          {available.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">Everyone is in.</p>}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
            {db.groups.length === 0 && (
              <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No groups yet.</div>
            )}
          </div>
          <form onSubmit={submitGrp} className="mt-3 flex gap-2">
            <Input className="h-9" placeholder="Group name (e.g. Engineering)" value={grpName} onChange={(e) => setGrpName(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={!grpName.trim()}>
              <Plus className="mr-1.5 h-4 w-4" /> Add group
            </Button>
          </form>
        </section>
      </div>
    </AppShell>
  )
}
