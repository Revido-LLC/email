import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button } from '@revido/ui'
import { CircleStop, Loader2, Mic, Pause, Play, Video } from 'lucide-react'
import * as React from 'react'
import { apiFetch } from '@/lib/api'

export const Route = createFileRoute('/app/meetings')({
  component: MeetingsScreen,
})

interface MeetingListItem {
  id: string
  title: string
  status: string
  durationMs: number | null
  startedAt: string | null
  createdAt: string
}

function useMeetings() {
  return useQuery({
    queryKey: ['meetings'],
    queryFn: () =>
      apiFetch<{ items: MeetingListItem[]; nextCursor: string | null }>('/meetings'),
    refetchInterval: 10_000,
  })
}

function MeetingsScreen() {
  const meetings = useMeetings()
  const items = Array.isArray(meetings.data?.items) ? meetings.data.items : []
  return (
    <div className="h-full overflow-y-auto">
      <header className="glass-thin sticky top-0 z-10 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Video className="size-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Meetings</h1>
            <p className="text-sm text-muted-foreground">
              Record without a bot, then search the transcript alongside your email.
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <Recorder />
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">Recent meetings</h2>
          {meetings.isPending ? (
            <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
          ) : items.length ? (
            <div className="mt-4 divide-y divide-border">
              {items.map((meeting) => (
                <div key={meeting.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meeting.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(meeting.startedAt ?? meeting.createdAt).toLocaleString()}
                      {meeting.durationMs ? ` · ${Math.round(meeting.durationMs / 60000)} min` : ''}
                    </p>
                  </div>
                  <Badge variant="outline">{meeting.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">
              Your completed recordings will appear here.
            </p>
          )}
        </section>
      </main>
    </div>
  )
}

function Recorder() {
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [consent, setConsent] = React.useState(false)
  const [state, setState] = React.useState<'idle' | 'recording' | 'paused' | 'uploading'>('idle')
  const [error, setError] = React.useState<string>()
  const recorderRef = React.useRef<MediaRecorder | undefined>(undefined)
  const streamsRef = React.useRef<MediaStream[]>([])
  const meetingIdRef = React.useRef<string | undefined>(undefined)
  const sequenceRef = React.useRef(0)
  const startedAtRef = React.useRef(0)
  const uploadsRef = React.useRef(Promise.resolve())

  const start = async () => {
    setError(undefined)
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamsRef.current = [display, mic]
      const audioTracks = [...display.getAudioTracks(), ...mic.getAudioTracks()]
      if (!audioTracks.length) throw new Error('No audio source was shared.')
      const session = await apiFetch<{ id: string }>('/recordings/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || 'Untitled meeting',
          source: 'web',
          recordingMode: 'tab-and-mic',
          consentAcknowledged: true,
        }),
      })
      meetingIdRef.current = session.id
      sequenceRef.current = 0
      startedAtRef.current = Date.now()
      uploadsRef.current = Promise.resolve()
      const recorder = new MediaRecorder(new MediaStream(audioTracks), {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      recorder.ondataavailable = (event) => {
        if (!event.data.size || !meetingIdRef.current) return
        const sequence = sequenceRef.current++
        const meetingId = meetingIdRef.current
        uploadsRef.current = uploadsRef.current.then(() =>
          apiFetch(`/recordings/${meetingId}/chunks?sequence=${sequence}`, {
            method: 'POST',
            headers: { 'content-type': event.data.type || 'audio/webm' },
            body: event.data,
          }),
        )
      }
      recorder.start(2_000)
      recorderRef.current = recorder
      setState('recording')
    } catch (cause) {
      streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
      setError(cause instanceof Error ? cause.message : 'Recording could not start.')
      setState('idle')
    }
  }

  const stop = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setState('uploading')
    recorder.addEventListener(
      'stop',
      async () => {
        streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
        try {
          await uploadsRef.current
          if (!meetingIdRef.current || sequenceRef.current === 0) {
            throw new Error('No audio was captured.')
          }
          await apiFetch(`/recordings/${meetingIdRef.current}/complete`, {
            method: 'POST',
            body: JSON.stringify({
              durationMs: Math.max(1, Date.now() - startedAtRef.current),
              finalSequence: sequenceRef.current - 1,
            }),
          })
          await queryClient.invalidateQueries({ queryKey: ['meetings'] })
          setTitle('')
          setState('idle')
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Recording upload failed.')
          setState('idle')
        }
      },
      { once: true },
    )
    recorder.stop()
  }

  const togglePause = () => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      recorder.pause()
      setState('paused')
    } else if (recorder.state === 'paused') {
      recorder.resume()
      setState('recording')
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <Mic className="size-4 text-primary" />
        <h2 className="font-semibold">New recording</h2>
      </div>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={state !== 'idle'}
        placeholder="Meeting title"
        className="mt-4 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <label className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          disabled={state !== 'idle'}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          I have permission to record and understand I am responsible for following local
          consent laws.
        </span>
      </label>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex gap-2">
        {state === 'idle' ? (
          <Button onClick={start} disabled={!consent}>
            <Mic className="size-4" /> Start recording
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={togglePause} disabled={state === 'uploading'}>
              {state === 'paused' ? <Play className="size-4" /> : <Pause className="size-4" />}
              {state === 'paused' ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="destructive" onClick={stop} disabled={state === 'uploading'}>
              {state === 'uploading' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CircleStop className="size-4" />
              )}
              {state === 'uploading' ? 'Finishing…' : 'Stop'}
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
