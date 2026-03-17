import type { MouseEvent, ReactNode } from 'react'
import { navigate } from '../utils/navigation'

interface AppLinkProps {
  to: string
  children: ReactNode
  className?: string
  replace?: boolean
  target?: '_blank' | '_self'
}

const isModifiedClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

export const AppLink = ({
  to,
  children,
  className,
  replace,
  target = '_self',
}: AppLinkProps) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      target === '_blank' ||
      event.defaultPrevented ||
      event.button !== 0 ||
      isModifiedClick(event)
    ) {
      return
    }

    event.preventDefault()
    navigate(to, { replace })
  }

  return (
    <a href={to} className={className} onClick={handleClick} target={target}>
      {children}
    </a>
  )
}
