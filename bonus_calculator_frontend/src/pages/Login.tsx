import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Wallet } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const { login } = useStore()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const err = await login(username, password)
    if (err) setError(err)
    else navigate(location.state?.from ?? '/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Bonus & Dividend Calculator</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in with your username and password</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-6 shadow-xs">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" value={username}
              onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" className="w-full">Sign in</Button>
          <p className="text-center text-xs text-muted-foreground">
            Demo accounts — <span className="num font-medium">admin / admin123</span> ·{' '}
            <span className="num font-medium">manager / manager123</span>
          </p>
        </form>
      </div>
    </div>
  )
}
