import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useStore } from '@/lib/store'
import { AppShell, SectionHeader } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function Users() {
  const { db, loadUsers, createUser } = useStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUsers().catch(() => {})
  }, [loadUsers])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setBusy(true)
    setError(null)
    const err = await createUser(username, password)
    setBusy(false)
    if (err) {
      setError(err)
    } else {
      setUsername('')
      setPassword('')
    }
  }

  const sorted = [...db.users].sort((a, b) => a.username.localeCompare(b.username))

  return (
    <AppShell>
      <div className="mb-6">
        <p className="kicker mb-1">Admin setup</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Login accounts for the calculator. The creator of a draft owns it — everyone else works through suggestions.
        </p>
      </div>

      <section>
        <SectionHeader title="Accounts" hint={`${db.users.length} users`} />
        <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
          <table className="ledger">
            <thead>
              <tr><th className="w-1/2">Username</th><th className="text-muted-foreground">Password</th></tr>
            </thead>
            <tbody>
              {sorted.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.username}</td>
                  <td className="text-muted-foreground">••••••••</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={2} className="py-8 text-center text-sm text-muted-foreground">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
          <Input className="h-9 w-56" placeholder="Username" autoComplete="off"
            value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input className="h-9 w-56" type="password" placeholder="Password" autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={busy || !username.trim() || !password}>
            <Plus className="mr-1.5 h-4 w-4" /> Add user
          </Button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      </section>
    </AppShell>
  )
}
