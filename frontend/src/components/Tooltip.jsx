import { useState, useRef, useCallback, useEffect } from 'react'
import { Info } from 'lucide-react'
import './tooltip.css'

const TIP_MAX_W = 350
const GAP = 8

export default function Tooltip({ text, iconSize = 14 }) {
  const [show, setShow] = useState(false)
  const [style, setStyle] = useState({})
  const [arrowStyle, setArrowStyle] = useState({})
  const [posClass, setPosClass] = useState('tip-above')
  const wrapRef = useRef(null)
  const timerRef = useRef(null)

  const compute = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Width: clamp to viewport
    const w = Math.min(TIP_MAX_W, vw - 16)

    // Horizontal: center on trigger, clamp to viewport
    const center = r.left + r.width / 2
    let left = Math.max(8, Math.min(center - w / 2, vw - w - 8))
    const arrowLeft = Math.max(12, Math.min(center - left, w - 12))

    // Vertical: prefer above, flip below if no room
    const roomAbove = r.top
    const roomBelow = vh - r.bottom
    const below = roomAbove < 200 && roomBelow > roomAbove

    let top
    if (below) {
      top = r.bottom + GAP
      setPosClass('tip-below')
    } else {
      top = r.top - GAP
      setPosClass('tip-above')
    }

    setStyle({ position: 'fixed', top, left, width: w })
    setArrowStyle({ left: arrowLeft })
  }, [])

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      compute()
      setShow(true)
    }, 150)
  }, [compute])

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setShow(false)
  }, [])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <span
      ref={wrapRef}
      className="tip-wrap"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <Info size={iconSize} className="tip-icon" />
      {show && (
        <span className={`tip-content ${posClass}`} style={style}>
          {text}
          <span className={`tip-arrow`} style={arrowStyle} />
        </span>
      )}
    </span>
  )
}
