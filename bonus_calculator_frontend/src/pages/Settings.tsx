import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from '@/lib/store'
import { AppShell, SectionHeader } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Settings() {
  const { db, sessionUserId, updateAccount, logout } = useStore()
  const navigate = useNavigate()
  const user = db.users.find((u) => u.id === sessionUserId)

  const [email, setEmail] = useState('')
  const [emailConfirm, setEmailConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const emailChanged = email.trim() !== ''
    const passwordChanged = password !== ''

    if (emailChanged && email.trim() !== emailConfirm.trim()) {
      return setError('Email addresses do not match.')
    }
    if (passwordChanged && password !== passwordConfirm) {
      return setError('Passwords do not match.')
    }
    if (passwordChanged && password.length < 6) {
      return setError('Password must be at least 6 characters.')
    }
    if (!emailChanged && !passwordChanged) {
      return setError('Enter a new email and/or a new password.')
    }

    const body: { username?: string; password?: string } = {}
    if (emailChanged) body.username = email.trim()
    if (passwordChanged) body.password = password

    setBusy(true)
    const err = await updateAccount(body)
    setBusy(false)
    if (err) return setError(err)

    // Force a fresh sign-in with the new credentials.
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <AppShell>
      <SectionHeader title="Settings" hint="Change your sign-in email and/or password" />

      <form onSubmit={submit} className="max-w-md space-y-5 rounded-lg border bg-card p-6 shadow-xs">
        <div className="space-y-1.5">
          <Label>Current email</Label>
          <Input value={user?.username ?? ''} disabled />
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-email">New email</Label>
            <Input id="new-email" type="email" autoComplete="off" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="Leave blank to keep current" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-email">Confirm new email</Label>
            <Input id="confirm-email" type="email" autoComplete="off" value={emailConfirm}
              onChange={(e) => setEmailConfirm(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          You'll be signed out after saving — sign back in with your new credentials.
        </p>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </AppShell>
  )
}
