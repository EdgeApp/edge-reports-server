import React, { PureComponent } from 'react'

const secondaryButton = {
  outline: 'none',
  backgroundColor: 'transparent' as 'transparent',
  fontSize: '16px',
  cursor: 'pointer' as 'pointer',
  width: '100%',
  paddingTop: '12px',
  textAlign: 'left' as 'left',
  marginLeft: '20px',
  color: 'white',
  border: 'none'
}

const mainButton = {
  overflow: 'hidden' as 'hidden',
  outline: 'none',
  backgroundColor: 'transparent' as 'transparent',
  fontSize: '16px',
  cursor: 'pointer' as 'pointer',
  marginTop: '12px',
  marginLeft: '68px',
  marginBottom: '12px',
  color: 'white',
  border: '1px solid white'
}

const timePeriodButton = {
  outline: 'none',
  backgroundColor: 'transparent' as 'transparent',
  fontSize: '16px',
  cursor: 'pointer' as 'pointer',
  marginRight: '20px',
  border: 'none'
}

interface buttonProps {
  label: string
  onClick: () => void
}

export class MainButton extends PureComponent<buttonProps, {}> {
  render(): JSX.Element {
    return (
      <button style={mainButton} onClick={() => this.props.onClick()}>
        {this.props.label}
      </button>
    )
  }
}

export class SecondaryButton extends PureComponent<buttonProps, {}> {
  render(): JSX.Element {
    return (
      <button style={secondaryButton} onClick={() => this.props.onClick()}>
        {this.props.label}
      </button>
    )
  }
}

export class TimePeriodButton extends PureComponent<buttonProps, {}> {
  render(): JSX.Element {
    return (
      <button style={timePeriodButton} onClick={() => this.props.onClick()}>
        {this.props.label}
      </button>
    )
  }
}
