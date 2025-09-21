# Web Audio Processor (Next.js)

A browser-based audio tool:
- Reads the uploaded audio and repeats/trims to 60 seconds
- Normalizes audio (~ -10 dBFS)
- Overlays sine tones per ear based on Task (base frequency fixed at 100 Hz)
- Amplitude percent uses the same dB mapping as the Python app
- Single Play/Stop button regenerates audio with the current settings and plays it

## Quick Start

```bash
cd web_player
npm install
npm run dev
```

Open http://localhost:3000

## How to Use

1) Select Audio File
- Click “Select Audio File” and choose a WAV or MP3 file
- The file is decoded in the browser (MP3 support depends on your browser)

2) Choose Task
- Base frequency is fixed at 100 Hz (left channel)
- T1: Right ear = 100 Hz + 10.5 Hz
- T2: Right ear = 100 Hz + 22 Hz
- T3: 60-second output is split in halves
  - First half: Right ear = 100 Hz + 5.5 Hz
  - Second half: Right ear = 100 Hz + 1.75 Hz

3) Set Amplitudes (Left/Right)
- Options match the mobile app
- Amplitude mapping follows the Python logic:
  - quiet_db = -70 dB
  - target_db = quiet_db * (100 - p) / 100
  - linear gain = 10^(target_db/20)

4) Play / Stop
- Click “Play” to process with current settings and start playback
- Click “Stop” to pause
- Adjust parameters and click “Play” again to hear the new result

## Processing Details

- Duration: Input is looped/trimmed to 60 seconds
- Normalization: Each channel is normalized to approximately -10 dBFS
- Left Channel: Base sine at 100 Hz overlaid
- Right Channel: Sine overlays with task-dependent offsets (see above)
- Amplitude: Left/Right sine overlays scaled by amplitude mapping
- Output: A stereo 16-bit PCM WAV is generated in-memory and played

## Browser Support
- Modern Chromium-based browsers, Safari, and Firefox with Web Audio API support
- If MP3 doesn’t decode, use WAV (44.1 kHz, 16-bit PCM recommended)

## Scripts

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```
