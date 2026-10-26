import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui'
import { useUiStore } from '../../store/ui'
import {
  TOUR_RING_PAD,
  TOUR_STEPS,
  clampStep,
  isLastStep,
  placeTourCard,
  stepTargetBox,
  tourKeyAction,
  type Box,
} from '../../lib/app-tour'

export interface TourCardProps {
  step: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

/** The step's explanation with Skip / Back / Next; the last step finishes the tour */
export function TourCard({ step, onNext, onBack, onSkip }: TourCardProps) {
  const { t } = useTranslation()
  const { id } = TOUR_STEPS[step]
  const last = isLastStep(step)
  return (
    <>
      <div className="mb-1 text-xs text-fg-muted">
        {t('tour.counter', { current: step + 1, total: TOUR_STEPS.length })}
      </div>
      <h2 id="app-tour-title" className="text-base font-semibold text-fg">{t(`tour.steps.${id}.title`)}</h2>
      <p className="mt-1.5 text-sm text-fg-muted">{t(`tour.steps.${id}.body`)}</p>
      <div className="mt-4 flex items-center gap-2">
        {!last && (
          <Button variant="ghost" size="sm" onClick={onSkip}>{t('tour.skip')}</Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {step > 0 && (
            <Button variant="secondary" size="sm" icon="arrow-left" onClick={onBack}>{t('tour.back')}</Button>
          )}
          <Button variant="primary" size="sm" icon={last ? 'check' : 'arrow-right'} onClick={onNext} data-autofocus>
            {last ? t('tour.finish') : step === 0 ? t('tour.start') : t('tour.next')}
          </Button>
        </div>
      </div>
    </>
  )
}

type Layout = { target: Box | null; card: { top: number; left: number } }

function sameLayout(a: Layout | null, b: Layout): boolean {
  if (!a) return false
  const t1 = a.target, t2 = b.target
  const sameTarget = t1 === t2 || (!!t1 && !!t2 && t1.top === t2.top && t1.left === t2.left && t1.right === t2.right && t1.bottom === t2.bottom)
  return sameTarget && a.card.top === b.card.top && a.card.left === b.card.left
}

/**
 * Spotlight tour over the app shell: dims everything except the step's target,
 * blocks clicks so the walk can't be derailed, and keeps the card beside it.
 */
export function AppTour() {
  const step = useUiStore(s => s.tourStep)
  if (step === null) return null
  return <TourOverlay step={clampStep(step)} />
}

function TourOverlay({ step }: { step: number }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  // Bumped on resize (and once after a step change, when the sidebar may still be animating)
  const [, setTick] = useState(0)

  const next = () => {
    const ui = useUiStore.getState()
    if (isLastStep(step)) ui.endTour()
    else ui.setTourStep(step + 1)
  }
  const back = () => useUiStore.getState().setTourStep(clampStep(step - 1))
  const skip = () => useUiStore.getState().endTour()
  const actions = { next, back, skip }
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const target = stepTargetBox(TOUR_STEPS[step])
    const nextLayout: Layout = {
      target,
      card: placeTourCard(
        target && { top: target.top - TOUR_RING_PAD, left: target.left - TOUR_RING_PAD, right: target.right + TOUR_RING_PAD, bottom: target.bottom + TOUR_RING_PAD },
        { width: card.offsetWidth, height: card.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    }
    if (!sameLayout(layout, nextLayout)) setLayout(nextLayout)
  })

  useEffect(() => {
    const onResize = () => setTick(n => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const timer = window.setTimeout(() => setTick(n => n + 1), 250)
    return () => window.clearTimeout(timer)
  }, [step])

  // Capture on window, ahead of the app's own shortcuts: while the tour shows, keys drive only the tour
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Tab') {
        const buttons = [...(cardRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
        if (buttons.length === 0) return
        const index = buttons.indexOf(document.activeElement as HTMLElement)
        const to = e.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length
        e.preventDefault()
        buttons[to].focus()
        return
      }
      // Enter or Space on a focused card button presses that button
      if ((e.key === 'Enter' || e.key === ' ') && cardRef.current?.contains(document.activeElement)) return
      const action = tourKeyAction(e.key)
      e.preventDefault()
      if (action) actionsRef.current[action]()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const target = layout?.target ?? null

  return createPortal(
    <div className="app-no-drag fixed inset-0 z-50">
      {/* Click shield: with a target the spotlight's shadow dims the rest, without one the shield does */}
      <div className={`absolute inset-0 ${target ? '' : 'bg-black/40'}`} />
      {target && (
        <div
          aria-hidden="true"
          style={{
            top: target.top - TOUR_RING_PAD,
            left: target.left - TOUR_RING_PAD,
            width: target.right - target.left + 2 * TOUR_RING_PAD,
            height: target.bottom - target.top + 2 * TOUR_RING_PAD,
          }}
          className="tour-spotlight pointer-events-none absolute transition-all duration-200 ease-out motion-reduce:transition-none"
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tour-title"
        style={{ top: layout?.card.top ?? 0, left: layout?.card.left ?? 0, visibility: layout ? 'visible' : 'hidden' }}
        className="absolute w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface p-4 shadow-lg"
      >
        <TourCard step={step} onNext={next} onBack={back} onSkip={skip} />
      </div>
    </div>,
    document.body,
  )
}
