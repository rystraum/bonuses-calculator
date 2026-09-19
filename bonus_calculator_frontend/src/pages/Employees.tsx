import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { AppShell, SectionHeader } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default function Employees() {
  const { db, addEmployee, renameEmployee, removeEmployee, addGroup, renameGroup, removeGroup, toggleGroupMember } = useStore()
  const [empName, setEmpName] = useState('')
  const [grpName, setGrpName] = useState('')

  const submitEmp = (e: FormEvent) => {
    e.preventDefault()
    if (!empName.trim()) return
    addEmployee(empName.trim()); setEmpName('')
  }
  const submitGrp = (e: FormEvent) => {
    e.preventDefault()
    if (!grpName.trim()) return
    addGroup(grpName.trim()); setGrpName('')
  }

  const groupsOf = (empId: string) => db.groups.filter((g) => g.memberIds.includes(empId))

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
          <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
            <table className="ledger">
              <thead>
                <tr><th>Name</th><th>Groups</th><th className="r" /></tr>
              </thead>
              <tbody>
                {db.employees.map((e) => {
                  const gs = groupsOf(e.id)
                  return (
                    <tr key={e.id}>
                      <td>
                        <input className="cell-input !text-left font-medium" defaultValue={e.name}
                          onBlur={(ev) => ev.target.value.trim() && renameEmployee(e.id, ev.target.value.trim())} />
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {gs.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          {gs.map((g) => (
                            <span key={g.id} className="rounded-full border bg-secondary px-2 py-0.5 text-[0.6875rem] font-medium">{g.name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="r">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeEmployee(e.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
                {db.employees.length === 0 && (
                  <tr><td colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No employees yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <form onSubmit={submitEmp} className="mt-3 flex gap-2">
            <Input className="h-9" placeholder="Employee name" value={empName} onChange={(e) => setEmpName(e.target.value)} />
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
                <div className="flex flex-wrap gap-x-5 gap-y-2 px-3 py-2.5">
                  {db.employees.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={g.memberIds.includes(e.id)}
                        onCheckedChange={() => toggleGroupMember(g.id, e.id)}
                      />
                      {e.name}
                    </label>
                  ))}
                  {db.employees.length === 0 && (
                    <span className="text-xs text-muted-foreground">Add employees first.</span>
                  )}
                </div>
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
