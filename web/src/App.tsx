import { SibylRuntimeProvider } from './runtime'
import { Thread } from './thread'

export function App() {
  return (
    <SibylRuntimeProvider>
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <Thread />
      </div>
    </SibylRuntimeProvider>
  )
}
