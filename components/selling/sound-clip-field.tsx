"use client";

import { Loader2, Mic, Square, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { buttonClasses } from "@/components/ui/button";

// POST 16: an optional sound clip of up to 20 seconds (a scale, a chord, the amp clean and with drive). Recorded here
// or picked from a file, compressed in the browser before upload, and played on the listing only when a buyer taps it.

export const MAX_CLIP_SECONDS = 20;
const MAX_CLIP_BYTES = 1024 * 1024;

export type ClipState = { url: string; duration: number; status: "uploading" | "done" | "error"; progress: number; error?: string } | null;

export type EncodedClip = { blob: Blob; duration: number; type: "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/wav" };

const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

export function SoundClipField({ id, clip, disabled, onClip, onRemove, onRetry }: {
  id: string;
  clip: ClipState;
  disabled?: boolean;
  onClip: (clip: EncodedClip) => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  async function record() {
    setProblem("");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setProblem("Tu navegador no permite grabar aquí. Puedes elegir un archivo de audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      setProblem("No pudimos usar el micrófono. Revisa el permiso del navegador o elige un archivo.");
      return;
    }
    const mimeType = RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const media = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
    const chunks: Blob[] = [];
    const started = Date.now();
    media.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (timer.current) window.clearInterval(timer.current);
      setRecording(false);
      const duration = Math.min(MAX_CLIP_SECONDS, (Date.now() - started) / 1000);
      const type = baseType(media.mimeType || mimeType || "audio/webm");
      const blob = new Blob(chunks, { type: type ?? "" });
      if (duration < 0.5 || !blob.size) return setProblem("La grabación quedó vacía. Inténtalo otra vez.");
      if (blob.size > MAX_CLIP_BYTES || !type) return setProblem("No pudimos comprimir la grabación. Prueba con un archivo.");
      onClip({ blob, duration: Math.round(duration * 10) / 10, type });
    };
    recorder.current = media;
    media.start();
    setRecording(true);
    setElapsed(0);
    timer.current = window.setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(Math.floor(seconds));
      if (seconds >= MAX_CLIP_SECONDS && media.state === "recording") media.stop();
    }, 250);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProblem("");
    setWorking(true);
    try {
      onClip(await compressAudioFile(file));
    } catch {
      setProblem("No pudimos leer ese audio. Prueba con otro archivo o grábalo aquí.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-3" role="group" aria-labelledby={`${id}-titulo`}>
      <div>
        <p id={`${id}-titulo`} className="t-ui font-semibold text-ink">Sonido <span className="font-normal text-ink-2">(opcional)</span></p>
        <p className="t-meta">Hasta {MAX_CLIP_SECONDS} segundos: una escala, un acorde, el amplificador limpio y con distorsión. Se escucha en la publicación solo cuando alguien lo toca, y se revisa junto con ella.</p>
      </div>
      {clip ? (
        <div className="grid gap-2 rounded-panel border border-subtle bg-canvas p-3">
          {/* A short instrument sample has no speech to caption. */}
          <audio controls preload="none" src={clip.url} className="w-full" aria-label="Escuchar el sonido grabado" />
          <p className="t-meta font-semibold">
            {clip.duration.toLocaleString("es-PE", { maximumFractionDigits: 1 })} s · <span role="status">{clip.status === "done" ? "Subido" : clip.status === "error" ? (clip.error ?? "No se subió") : "Subiendo…"}</span>
            {clip.status === "uploading" ? <span aria-hidden> {Math.round(clip.progress * 100)}%</span> : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {clip.status === "error" ? <button type="button" disabled={disabled} onClick={onRetry} className={buttonClasses({ variant: "secondary", size: "sm", className: "min-h-11" })}>Reintentar</button> : null}
            <button type="button" disabled={disabled} onClick={onRemove} className={buttonClasses({ variant: "danger", size: "sm", className: "min-h-11" })}><Trash2 aria-hidden />Quitar sonido</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {recording ? (
            <button type="button" onClick={stop} className={buttonClasses({ variant: "secondary" })}>
              <Square aria-hidden />Detener ({MAX_CLIP_SECONDS - elapsed} s)
            </button>
          ) : (
            <button type="button" disabled={disabled || working} onClick={record} className={buttonClasses({ variant: "secondary" })}>
              <Mic aria-hidden />Grabar sonido
            </button>
          )}
          <label className={buttonClasses({ variant: "secondary", className: "cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink" })}>
            {working ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {working ? "Comprimiendo…" : "Elegir audio"}
            <input id={id} type="file" accept="audio/*" disabled={disabled || recording || working} className="sr-only" onChange={pickFile} />
          </label>
          {recording ? <p className="t-ui font-semibold text-ink"><Mic className="mr-1 inline h-4 w-4" aria-hidden /><span role="status">Grabando…</span><span aria-hidden> {elapsed} s</span></p> : null}
        </div>
      )}
      {problem ? <p className="t-ui font-semibold text-danger" role="alert">{problem}</p> : null}
    </div>
  );
}

function baseType(type: string): EncodedClip["type"] | null {
  const base = type.split(";")[0].trim();
  return base === "audio/webm" || base === "audio/ogg" || base === "audio/mp4" || base === "audio/wav" ? base : null;
}

// A picked file: the first 20 seconds, mono, 22.05 kHz, 16-bit WAV (under 1 MB). Decoding happens in the browser, so
// any format it can play works, and what is uploaded is always small and of a known type.
export async function compressAudioFile(file: File): Promise<EncodedClip> {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass || typeof OfflineAudioContext === "undefined") throw new Error("unsupported");
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const duration = Math.min(MAX_CLIP_SECONDS, decoded.duration);
    if (duration < 0.5) throw new Error("too short");
    const rate = 22050;
    const offline = new OfflineAudioContext(1, Math.ceil(duration * rate), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0, 0, duration);
    const rendered = await offline.startRendering();
    return { blob: encodeWav(rendered.getChannelData(0), rate), duration: Math.round(duration * 10) / 10, type: "audio/wav" };
  } finally {
    void context.close();
  }
}

export function encodeWav(samples: Float32Array, rate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
