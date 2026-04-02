import { useState } from 'react'
import { Info } from 'lucide-react'
import './tooltip.css'

export default function Tooltip({ text, iconSize = 14 }) {
  const [show, setShow] = useState(false)

  return (
    <span
      className="tip-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info size={iconSize} className="tip-icon" />
      {show && <span className="tip-content">{text}</span>}
    </span>
  )
}
