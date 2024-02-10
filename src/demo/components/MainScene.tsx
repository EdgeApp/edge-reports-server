import React from 'react'

export function MainScene({
  children
}: {
  children: React.ReactNode
}): JSX.Element {
  return (
    <>
      <div>
        <main>{children}</main>
      </div>
    </>
  )
}
