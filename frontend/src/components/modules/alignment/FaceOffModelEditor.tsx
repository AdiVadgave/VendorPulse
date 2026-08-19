import type { FaceOffPosition } from '@/types/alignment.types'

interface Props {
  positions: FaceOffPosition[]
}

// NOTE: The editor UI is not yet implemented — this renders an empty container.
// The previous edit state/handlers were unused (dead code) and blocked the
// build under `noUnusedLocals`. Restore them when building this panel out.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function FaceOffModelEditor(_: Props) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden" />
  )
}
