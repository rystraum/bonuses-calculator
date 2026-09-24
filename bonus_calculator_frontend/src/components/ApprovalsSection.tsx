import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, RotateCcw, Undo2 } from 'lucide-react'
import { format } from 'date-fns'
import type { Distribution } from '@/lib/model'
import { useStore } from '@/lib/store'
import { SectionHeader } from '@/components/chrome'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

const fmtDateTime = (iso: string) => format(new Date(iso), "MMM d, yyyy 'at' h:mm a")

// ─── non-owner approve control ────────────────────────────────────────────────

/** "Approve" button, or an Approved indicator + Rescind when the current user already approved. */
export default function ApprovalControl({ dist }: { dist: Distribution }) {
  const store = useStore()
  const approvals = store.approvals[dist.id] ?? []
  const mine = approvals.find((a) => a.user.id === store.sessionUserId)

  if (!mine) return <ApproveDialog dist={dist} />

  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
      <img src={mine.selfie} alt={`${mine.user.username}'s approval selfie`} className="h-8 w-8 rounded-full object-cover" />
      <div className="leading-tight">
        <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Approved
        </div>
        <div className="text-[0.6875rem] text-muted-foreground">{fmtDateTime(mine.approvedAt)}</div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="ml-1 bg-background">
            <Undo2 className="mr-1.5 h-4 w-4" /> Rescind
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rescind your approval?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your approval of “{dist.name}”. You can approve again later while it is still a draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => store.rescindApproval(dist.id)}>Rescind approval</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── camera capture dialog ────────────────────────────────────────────────────

function ApproveDialog({ dist }: { dist: Distribution }) {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Request the camera while the dialog is open without a captured photo;
  // release every track on close, capture, retake cycle, and unmount.
  useEffect(() => {
    let cancelled = false
    if (open && !photo) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = stream
          const video = videoRef.current
          if (video) {
            video.srcObject = stream
            video.play().catch(() => {})
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCameraError('Camera access is required to approve. Allow the camera in your browser and try again.')
          }
        })
    }
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [open, photo])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setPhoto(null)
      setCameraError(null)
      setError(null)
    }
  }

  const takePhoto = () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setPhoto(canvas.toDataURL('image/jpeg', 0.8))
  }

  const confirm = async () => {
    if (!photo) return
    setBusy(true)
    setError(null)
    const err = await store.approveDistribution(dist.id, photo)
    setBusy(false)
    if (err) setError(err)
    else handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button><CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve “{dist.name}”</DialogTitle>
          <DialogDescription>
            Approving requires a live selfie as proof of assent — there is no way to approve without a photo.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border bg-muted/40">
          {photo ? (
            <img src={photo} alt="Captured selfie" className="aspect-video w-full -scale-x-100 object-cover" />
          ) : cameraError ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 p-6 text-center">
              <Camera className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-red-600">{cameraError}</p>
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full -scale-x-100 object-cover" />
          )}
        </div>
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-sm text-red-600">{error}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={busy}>Cancel</Button>
            {photo ? (
              <Button variant="secondary" onClick={() => setPhoto(null)} disabled={busy}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> Retake
              </Button>
            ) : (
              <Button variant="secondary" onClick={takePhoto} disabled={busy || !!cameraError}>
                <Camera className="mr-1.5 h-4 w-4" /> Take photo
              </Button>
            )}
            <Button onClick={confirm} disabled={busy || !photo}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Submit approval
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── owner approvals panel ────────────────────────────────────────────────────

export function ApprovalsSection({ dist }: { dist: Distribution }) {
  const store = useStore()
  const { loadApprovals, loadUsers } = store
  const approvals = store.approvals[dist.id] ?? []

  // The panel needs both this draft's approvals and the full user list.
  useEffect(() => {
    loadApprovals(dist.id).catch(() => {})
    loadUsers().catch(() => {})
  }, [loadApprovals, loadUsers, dist.id])

  const approverIds = new Set(approvals.map((a) => a.user.id))
  const pending = store.db.users.filter((u) => u.id !== dist.createdBy?.id && !approverIds.has(u.id))
  const total = approvals.length + pending.length

  return (
    <section>
      <SectionHeader
        title="Approvals"
        hint="Sign-offs from non-owners, each backed by a selfie taken at approval time"
      >
        <span className="num text-sm font-semibold">{approvals.length} of {total} approved</span>
      </SectionHeader>

      {approvals.length === 0 && pending.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No other users can approve this draft yet.
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border bg-card p-4 shadow-xs">
          <div>
            <span className="kicker mb-2 block">Approved</span>
            {approvals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approvals yet.</p>
            ) : (
              <ul className="space-y-2">
                {approvals.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <img src={a.selfie} alt={`${a.user.username}'s approval selfie`}
                      className="h-10 w-10 rounded-full object-cover" />
                    <div className="leading-tight">
                      <div className="text-sm font-medium">{a.user.username}</div>
                      <div className="text-xs text-muted-foreground">{fmtDateTime(a.approvedAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {pending.length > 0 && (
            <div>
              <span className="kicker mb-2 block">Not yet approved</span>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {pending.map((u) => (
                  <li key={u.id} className="text-sm text-muted-foreground">{u.username}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
