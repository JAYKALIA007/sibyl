// The input, its slash-command menu, and the keyboard handling that drives the menu.
// The dispatch DECISION (what picking a command does) is the pure planCommand in
// composerDispatch.ts; this component just carries it out against the assistant-ui
// composer/runtime.

import { useEffect, useState } from 'react'
import {
  ComposerPrimitive,
  useThread,
  useComposer,
  useComposerRuntime,
  useAssistantRuntime,
} from '@assistant-ui/react'
import { cn } from './lib/utils'
import { matchCommands, type Command } from './commands'
import { planCommand } from './composerDispatch'
import { SendIcon } from './components/icons'

export function Composer() {
  const isRunning = useThread((t) => t.isRunning)
  const text = useComposer((c) => c.text)
  const composer = useComposerRuntime()
  const assistant = useAssistantRuntime()

  // Escape hides the menu without clearing the text; typing re-arms it. Highlight
  // resets whenever the query changes so the top match is always pre-selected.
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(0)

  const matches = dismissed ? [] : matchCommands(text)
  const menuOpen = matches.length > 0
  const clampedActive = Math.min(active, matches.length - 1)

  useEffect(() => setActive(0), [text])
  useEffect(() => {
    if (!text.startsWith('/')) setDismissed(false)
  }, [text])

  function selectCommand(cmd: Command) {
    const action = planCommand(cmd)
    switch (action.kind) {
      case 'new-thread':
        // '/new' — reset the composer and start a fresh thread. Never a message.
        composer.setText('')
        assistant.threads.switchToNewThread()
        return
      case 'prime':
        // '/sql' — prime the composer and let the user type the query; don't send yet.
        composer.setText(action.text)
        return
      case 'send':
        // setText is flushed synchronously (flushTapSync), so send() sees the command.
        composer.setText(action.text)
        composer.send()
        return
    }
  }

  // Own the keys only while the menu is open; otherwise fall through to the
  // composer's native Enter-to-send. preventDefault here also suppresses that
  // native handler (assistant-ui composes ours first and skips its own on
  // defaultPrevented), so Enter picks a command instead of sending raw text.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!menuOpen) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => (i + 1) % matches.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => (i - 1 + matches.length) % matches.length)
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        selectCommand(matches[clampedActive])
        break
      case 'Escape':
        e.preventDefault()
        setDismissed(true)
        break
    }
  }

  return (
    <div className="relative">
      {menuOpen && (
        <SlashMenu commands={matches} active={clampedActive} onPick={selectCommand} onHover={setActive} />
      )}
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 shadow-sm focus-within:border-foreground/20 focus-within:ring-2 focus-within:ring-primary/10">
        <ComposerPrimitive.Input
          autoFocus
          rows={1}
          disabled={isRunning}
          onKeyDown={onKeyDown}
          placeholder={isRunning ? 'Thinking…' : 'Ask your database…  (type / for commands)'}
          className={cn(
            'flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm outline-none',
            'placeholder:text-muted-foreground disabled:opacity-60',
          )}
        />
        <ComposerPrimitive.Send
          aria-label="Ask"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground',
            'transition-opacity hover:opacity-90 disabled:opacity-40',
          )}
        >
          <SendIcon className="text-base" />
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
  )
}

function SlashMenu({
  commands,
  active,
  onPick,
  onHover,
}: {
  commands: Command[]
  active: number
  onPick: (cmd: Command) => void
  onHover: (index: number) => void
}) {
  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="border-b border-border/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Commands
      </div>
      <ul className="py-1">
        {commands.map((cmd, i) => (
          <li key={cmd.name}>
            <button
              type="button"
              // onMouseDown (not onClick): fires before the input's blur, so the
              // composer keeps focus and the send/setText lands cleanly.
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(cmd)
              }}
              onMouseEnter={() => onHover(i)}
              className={cn(
                'flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-sm',
                i === active ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              <code className="shrink-0 font-mono text-xs text-primary">{cmd.name}</code>
              <span className="truncate text-muted-foreground">{cmd.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
