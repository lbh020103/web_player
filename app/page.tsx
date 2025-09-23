'use client'

import { useEffect, useRef, useState } from 'react'

type Task = 1 | 2 | 3

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sineRef = useRef<HTMLAudioElement | null>(null)

  const [fileName, setFileName] = useState('')
  const [fileArrayBuffer, setFileArrayBuffer] = useState<ArrayBuffer | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [sineUrl, setSineUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const [baseFreq, setBaseFreq] = useState<number>(100)
  const [task, setTask] = useState<Task>(1)
  const [ratioLeft, setRatioLeft] = useState(70)
  const [ratioRight, setRatioRight] = useState(70)
  const [soloSine, setSoloSine] = useState(false)
  // const [ratioLeft, setRatioLeft] = useState(50)
  // const [ratioRight, setRatioRight] = useState(50)
  // const [soloSine, setSoloSine] = useState(false)

  useEffect(() => {
    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      if (sineUrl) URL.revokeObjectURL(sineUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!/\.(wav|mp3)$/i.test(f.name)) {
      alert('Please select a WAV or MP3 file')
      return
    }
    const ab = await f.arrayBuffer()
    if (currentUrl) URL.revokeObjectURL(currentUrl)
    const url = URL.createObjectURL(new Blob([ab]))
    setFileArrayBuffer(ab)
    setCurrentUrl(null)
    setFileName(f.name)
    setIsPlaying(false)
    setTimeout(() => {
      audioRef.current?.load()
    }, 0)
  }

  const writeWav = (samples: Float32Array[], sampleRate: number) => {
    // Ensure stereo
    const numChannels = 2
    const length = samples[0].length
    const interleaved = new Int16Array(length * numChannels)
    for (let i = 0; i < length; i++) {
      const l = Math.max(-1, Math.min(1, samples[0][i]))
      const r = Math.max(-1, Math.min(1, (samples[1] ?? samples[0])[i]))
      interleaved[i * 2] = (l * 32767) | 0
      interleaved[i * 2 + 1] = (r * 32767) | 0
    }
    const buffer = new ArrayBuffer(44 + interleaved.length * 2)
    const view = new DataView(buffer)
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + interleaved.length * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true) // PCM chunk size
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * 2, true)
    view.setUint16(32, numChannels * 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, 'data')
    view.setUint32(40, interleaved.length * 2, true)
    new Int16Array(buffer, 44).set(interleaved)
    return new Blob([buffer], { type: 'audio/wav' })
  }

  const playSinePreview = async (freq: number) => {
    const sampleRate = 44100
    const durationMs = 1000
    const length = Math.floor((durationMs / 1000) * sampleRate)
    const l = new Float32Array(length)
    const r = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate
      const s = Math.sin(2 * Math.PI * freq * t)
      l[i] = s
      r[i] = s
    }
    const blob = writeWav([l, r], sampleRate)
    if (sineUrl) URL.revokeObjectURL(sineUrl)
    const url = URL.createObjectURL(blob)
    setSineUrl(url)
    setTimeout(async () => {
      try {
        await sineRef.current?.load()
        await sineRef.current?.play()
      } catch {
        /* noop */
      }
    }, 0)
  }

  const processAudio = async () => {
    if (!fileArrayBuffer) return
    setIsProcessing(true)
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)()
      const decoded = await context.decodeAudioData(fileArrayBuffer.slice(0))
      const sampleRate = decoded.sampleRate
      const srcL = decoded.getChannelData(0)
      const srcR = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : decoded.getChannelData(0)

      // Build a 10 mins buffer, repeat or trim like read_music(duration=1)
      const targetLen = 600 * sampleRate
      const inLen = decoded.length
      const outLen = targetLen
      const baseL = new Float32Array(outLen)
      const baseR = new Float32Array(outLen)
      for (let i = 0; i < outLen; i++) {
        const si = i % inLen
        baseL[i] = srcL[si]
        baseR[i] = srcR[si]
      }

      // Normalize music to about -10 dBFS (parity with Python)
      const rms = (arr: Float32Array) => {
        let s = 0
        for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i]
        return Math.sqrt(s / arr.length)
      }
      const dbfs = (r: number) => (r <= 1e-9 ? -120 : 20 * Math.log10(r))
      const gainForTarget = (arr: Float32Array, targetDb: number) => {
        const gDb = targetDb - dbfs(rms(arr))
        return Math.pow(10, gDb / 20)
      }
      const gainL = gainForTarget(baseL, -10)
      const gainR = gainForTarget(baseR, -10)
      for (let i = 0; i < outLen; i++) {
        baseL[i] *= gainL
        baseR[i] *= gainR
      }

      // Parity with Python: no ducking. Solo sine keeps music muted for verification
      if (soloSine) {
        for (let i = 0; i < outLen; i++) {
          baseL[i] = 0
          baseR[i] = 0
        }
      }

      // Generate sine overlays per channel
      const leftFreq = baseFreq
      const rightOffsetForTask = (t: Task) => (t === 1 ? 10.5 : t === 2 ? 22 : 0)
      const rightFreq1 = baseFreq + (task === 3 ? 5.5 : rightOffsetForTask(task))
      const rightFreq2 = task === 3 ? baseFreq + 1.75 : rightFreq1

      // Parity with Python get_percent_volume: quiet_db = -70; target_db = quiet_db * (100 - p) / 100
      const targetDbFromPercent = (p: number) => {
        const quietDb = -70
        return quietDb * (100 - p) / 100
      }
      const ampFromDb = (db: number) => Math.pow(10, db / 20)
      const leftAmp = ampFromDb(targetDbFromPercent(ratioLeft))
      const rightAmp = ampFromDb(targetDbFromPercent(ratioRight))

      const outL = new Float32Array(outLen)
      const outR = new Float32Array(outLen)
      const half = Math.floor(outLen / 2)
      for (let i = 0; i < outLen; i++) {
        const t = i / sampleRate
        const sL = Math.sin(2 * Math.PI * leftFreq * t) * leftAmp
        const rf = i < half ? rightFreq1 : rightFreq2
        const sR = Math.sin(2 * Math.PI * rf * t) * rightAmp
        const vL = baseL[i] + sL
        const vR = baseR[i] + sR
        outL[i] = vL > 1 ? 1 : vL < -1 ? -1 : vL
        outR[i] = vR > 1 ? 1 : vR < -1 ? -1 : vR
      }

      const blob = writeWav([outL, outR], sampleRate)
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      const url = URL.createObjectURL(blob)
      setCurrentUrl(url)
      setTimeout(() => {
        audioRef.current?.load()
      }, 0)
    } catch (e) {
      console.error(e)
      alert('Processing failed. Try a WAV/MP3 supported by your browser.')
    } finally {
      setIsProcessing(false)
    }
  }

  const togglePlay = async () => {
    if (!fileArrayBuffer) return
    try {
      if (isPlaying) {
        await audioRef.current?.pause()
        setIsPlaying(false)
        return
      }
      // Always (re)process on play to reflect current parameters
      await processAudio()
      // Give the browser a tick to load the new source
      setTimeout(async () => {
        try {
          await audioRef.current?.play()
          setIsPlaying(true)
        } catch (e) {
          console.error(e)
          alert('Unable to start playback')
        }
      }, 50)
    } catch (e) {
      console.error(e)
    }
  }

  const amplitudeOptions = () => {
    if (task === 1) return [70, 85, 100]
    if (task === 2) return [40, 55, 70]
    return [10, 25, 40]
  }
  // const amplitudeOptions = () => [0, 50, 100]

  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a' }}>
      <div style={{ width: 680, background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Web Audio Processor</h1>
        <p style={{ color: '#475569', marginTop: 6 }}>Upload WAV/MP3, choose Sine, Task and Amplitude, then Play/Stop</p>

        {/* Sine selection (like Gradio frequency chooser) */}
        <div style={{ marginTop: 16 }}>
          <span style={{ fontWeight: 600 }}>Find Your Sine (Hz)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {Array.from({ length: 13 }, (_, i) => 80 + i * 10).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setBaseFreq(f)
                  playSinePreview(f)
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: baseFreq === f ? '#e2e8f0' : 'white',
                  cursor: 'pointer',
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, color: '#334155' }}>Selected base frequency: {baseFreq} Hz</div>
          <audio ref={sineRef} hidden src={sineUrl ?? undefined} />
        </div>

        {/* File picker */}
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'inline-block', padding: '10px 16px', background: '#2563eb', color: 'white', borderRadius: 8, cursor: 'pointer' }}>
            Select Audio File
            <input type="file" accept="audio/*,.wav,.mp3" onChange={onSelect} style={{ display: 'none' }} />
          </label>
          {fileName && <span style={{ marginLeft: 12, color: '#334155' }}>{fileName}</span>}
        </div>

        {/* Frequency removed; using default base frequency of 100 Hz */}

        {/* Task */}
        <div style={{ marginTop: 16 }}>
          <span style={{ fontWeight: 600 }}>Task</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[1, 2, 3].map((t) => (
              <button key={t} onClick={() => {
                setTask(t as Task)
                if (t === 1) { setRatioLeft(70); setRatioRight(70) }
                if (t === 2) { setRatioLeft(40); setRatioRight(40) }
                if (t === 3) { setRatioLeft(10); setRatioRight(10) }

                // // keep current ratios, but if none set sensible midpoint
                // if (ratioLeft === null || ratioRight === null) {
                //   setRatioLeft(50); setRatioRight(50)
                // }
              }}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: task === t ? '#e2e8f0' : 'white', cursor: 'pointer' }}>
                T{t}
              </button>
            ))}
          </div>
        </div>

        {/* Amplitude */}
        <div style={{ marginTop: 16 }}>
          <span style={{ fontWeight: 600 }}>Amplitude</span>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div>Left</div>
              <select value={ratioLeft} onChange={(e) => setRatioLeft(parseInt(e.target.value))} style={{ width: '100%', padding: 8 }}>
                {amplitudeOptions().map((v) => <option key={'L'+v} value={v}>{v}%</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div>Right</div>
              <select value={ratioRight} onChange={(e) => setRatioRight(parseInt(e.target.value))} style={{ width: '100%', padding: 8 }}>
                {amplitudeOptions().map((v) => <option key={'R'+v} value={v}>{v}%</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Options */}
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={soloSine} onChange={(e) => setSoloSine(e.target.checked)} />
            Solo Sine (mute music to verify tone)
          </label>
        </div>

        {/* Actions */}
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <button onClick={togglePlay} disabled={!fileArrayBuffer || isProcessing} style={{ padding: '10px 16px', background: (!fileArrayBuffer || isProcessing) ? '#9ca3af' : '#16a34a', color: 'white', border: 0, borderRadius: 8, cursor: (!fileArrayBuffer || isProcessing) ? 'not-allowed' : 'pointer' }}>
            {isPlaying ? 'Stop' : (isProcessing ? 'Processing…' : 'Play')}
          </button>
        </div>

        {/* Single player for processed output */}
        <div style={{ marginTop: 16 }}>
          <audio ref={audioRef} controls style={{ width: '100%' }} src={currentUrl ?? undefined} onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} />
        </div>
      </div>
    </main>
  )
}



