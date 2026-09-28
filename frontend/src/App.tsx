import { SystemStatus } from '@/features/system/system-status'

export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">myGymTracker</h1>
      </header>
      <SystemStatus />
    </main>
  )
}
