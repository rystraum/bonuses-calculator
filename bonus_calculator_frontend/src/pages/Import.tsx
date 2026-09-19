import { useState, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'
import { useStore } from '@/lib/store'
import { AppShell, SectionHeader } from '@/components/chrome'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function Import() {
  const { uploadSeedFile, seedImportResult } = useStore()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    setError(null)
  }

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    const err = await uploadSeedFile(file)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <AppShell>
      <div className="mb-6">
        <p className="kicker mb-1">Seed data</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Upload a JSON seed file to bulk-create employees, groups, shareholders, and historical distributions.
          Distributions that already exist are skipped.
        </p>
      </div>

      <section className="max-w-xl">
        <SectionHeader title="Seed file" hint="The parsed JSON is posted as-is to the server" />
        <div className="flex flex-wrap items-center gap-2">
          <Input type="file" accept=".json,application/json" className="h-9 w-72" onChange={onPick} />
          <Button onClick={upload} disabled={!file || busy}>
            <Upload className="mr-1.5 h-4 w-4" /> Upload seed file
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {seedImportResult && (
          <dl className="mt-6 grid max-w-sm grid-cols-[1fr_auto] gap-x-8 gap-y-1.5 rounded-lg border bg-card p-4 text-sm shadow-xs">
            <dt className="text-muted-foreground">Employees created</dt>
            <dd className="num text-right font-semibold">{seedImportResult.employeesCreated}</dd>
            <dt className="text-muted-foreground">Groups created</dt>
            <dd className="num text-right font-semibold">{seedImportResult.groupsCreated}</dd>
            <dt className="text-muted-foreground">Shareholders created</dt>
            <dd className="num text-right font-semibold">{seedImportResult.shareholdersCreated}</dd>
            <dt className="text-muted-foreground">Distributions created</dt>
            <dd className="num text-right font-semibold">{seedImportResult.distributionsCreated}</dd>
            <dt className="text-muted-foreground">Distributions skipped</dt>
            <dd className="num text-right font-semibold">{seedImportResult.distributionsSkipped}</dd>
          </dl>
        )}
      </section>
    </AppShell>
  )
}
