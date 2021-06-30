import React from 'react'

export function MainScene({ children }): JSX.Element {
  return (
    <>
      <div>
        <main>{children}</main>
      </div>
    </>
  )
}
