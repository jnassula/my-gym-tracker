/** "Exportar PDF": where the file comes from and how it leaves the phone. */
import { api } from '@/lib/api'

export const exportUrl = (planId: string, weights: boolean) =>
  `/api/workouts/${planId}/export.pdf${weights ? '?weights=true' : ''}`

/** The server's own file name ("Treino 01.pdf"), from Content-Disposition; else from the plan. */
export function fileNameOf(planName: string): string {
  const stem = planName.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim() || 'treino'
  return `${stem.slice(0, 80)}.pdf`
}

export async function fetchPdf(planId: string, planName: string, weights: boolean): Promise<File> {
  const blob = await api<Blob>(exportUrl(planId, weights), { responseType: 'blob' })
  return new File([blob], fileNameOf(planName), { type: 'application/pdf' })
}

/** Web Share with files: Safari on iOS, Chrome on Android; not Firefox nor most desktops. */
export function canShareFiles(): boolean {
  const probe = new File([''], 'probe.pdf', { type: 'application/pdf' })
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })
}

export async function sharePdf(file: File, title: string): Promise<void> {
  await navigator.share({ files: [file], title })
}

/** The browser's download (or, on an iPhone, its preview with the share sheet). */
export function downloadPdf(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
