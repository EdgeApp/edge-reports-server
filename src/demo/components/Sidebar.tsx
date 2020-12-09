import 'react-datepicker/dist/react-datepicker.css'

import {
  add,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  sub
} from 'date-fns'
import React, { Component } from 'react'
import DatePicker from 'react-datepicker'
import Loader from 'react-loader-spinner'

// @ts-ignore
import calendar from '../images/calendar.png'
// @ts-ignore
import logo from '../images/logo.png'

interface SidebarProps {
  getData: any
  changeExchangeType: any
  logout: any
  viewChange: any
  loading: boolean
  appId: string
  exchangeType: string
  view: string
}
interface SidebarState {
  start: Date
  end: Date
}
interface Preset {
  args: [string, string, number]
  str: string
}

const underlineExchangeTypeStyle = {
  all: {
    position: 'absolute' as 'absolute',
    left: '26px',
    width: '41px',
    top: '24px'
  },
  fiat: {
    position: 'absolute' as 'absolute',
    left: '26px',
    width: '26px',
    top: '56px'
  },
  swap: {
    position: 'absolute' as 'absolute',
    left: '26px',
    width: '39px',
    top: '89px'
  }
}

export const divider = {
  marginTop: '15px',
  width: '72%',
  borderTop: '.5px solid white'
}

const logoStyle = {
  marginTop: '26px',
  marginLeft: '26px',
  marginBottom: '10px',
  height: '28px',
  width: '28px'
}

const titleText = {
  marginLeft: '26px',
  color: 'white',
  fontSize: '24px'
}

const loader = {
  textAlign: 'center' as 'center',
  marginTop: '29px'
}

const exchangeTypeContainer = {
  position: 'relative' as 'relative'
}

const regularButton = {
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

const outlineButton = {
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

const dateContainer = {
  marginLeft: '26px'
}

const calendarText = {
  marginTop: '20px',
  fontSize: '16px',
  color: 'white'
}

const dateInput = {
  marginLeft: '-2px',
  fontSize: '16px',
  backgroundColor: 'transparent' as 'transparent',
  border: 'none',
  color: 'white',
  width: '100px'
}

const calendarContainer = {
  position: 'relative' as 'relative',
  marginTop: '10px',
  marginLeft: '26px',
  color: 'white'
}

const calendarStyle = {
  position: 'absolute' as 'absolute',
  top: '-3px',
  left: '55px',
  height: '24px',
  width: '24px'
}

const PRESETS: Preset[] = [
  { args: ['last', 'days', 1], str: 'Yesterday' },
  { args: ['this', 'days', 1], str: 'Today' },
  { args: ['last', 'weeks', 1], str: 'Last Week' },
  { args: ['this', 'weeks', 1], str: 'This Week' },
  { args: ['last', 'months', 1], str: 'Last Month' },
  { args: ['this', 'months', 1], str: 'This Month' },
  { args: ['last', 'days', 90], str: 'Last 90 Days' },
  { args: ['last', 'months', 3], str: 'Last Quarter' },
  { args: ['this', 'months', 3], str: 'This Quarter' },
  { args: ['last', 'years', 1], str: 'Last Year' },
  { args: ['this', 'years', 1], str: 'This Year' }
]

const getStartingDate = (timePeriod: string, amount: number): Date => {
  const currentDate = new Date(Date.now())
  if (timePeriod === 'days') return startOfDay(currentDate)
  if (timePeriod === 'weeks')
    return startOfWeek(currentDate, { weekStartsOn: 1 })
  if (timePeriod === 'months' && amount === 3)
    return startOfQuarter(currentDate)
  if (timePeriod === 'months') return startOfMonth(currentDate)
  if (timePeriod === 'years') return startOfYear(currentDate)
  return currentDate
}

const getPresetDates = (
  lastOrThis: string,
  timePeriod: string,
  amount: number
): { start: Date; end: Date } => {
  const date = getStartingDate(timePeriod, amount)
  const result = { start: date, end: date }
  if (lastOrThis === 'last') {
    result.start = sub(date, { [timePeriod]: amount })
  } else if (lastOrThis === 'this') {
    result.end = add(date, { [timePeriod]: amount })
  }
  return result
}

const getISOString = (date: Date, end: boolean): string => {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const isEnd = end === true ? 1 : 0
  const timezonedDate = new Date(Date.UTC(year, month, day) - isEnd)
  return timezonedDate.toISOString()
}

const header = (
  <>
    <img style={logoStyle} src={logo} alt="Edge Logo" />
    <div style={titleText}>Edge</div>
    <div style={titleText}>Reports</div>
  </>
)

const loading = (
  <div style={loader}>
    <Loader type="Oval" color="white" height="30px" width="30px" />
  </div>
)

class Sidebar extends Component<SidebarProps, SidebarState> {
  constructor(props) {
    super(props)
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const end = new Date()
    this.state = {
      start,
      end
    }
  }

  handleStartChange(start: Date): void {
    this.setState({ start })
  }

  handleEndChange(end: Date): void {
    this.setState({ end })
  }

  renderExchangeButtons = (props: SidebarProps): JSX.Element => (
    <div style={exchangeTypeContainer}>
      <hr style={underlineExchangeTypeStyle[props.exchangeType]} />
      <button
        style={regularButton}
        onClick={async () => {
          await props.changeExchangeType('all')
        }}
      >
        Totals
      </button>
      <button
        style={regularButton}
        onClick={async () => {
          await props.changeExchangeType('fiat')
        }}
      >
        Fiat
      </button>
      <button
        style={regularButton}
        onClick={async () => {
          await props.changeExchangeType('swap')
        }}
      >
        Swap
      </button>
    </div>
  )

  presetButtons = PRESETS.map(({ args, str }, index) => (
    <button
      key={index}
      style={regularButton}
      onClick={() => {
        const { start, end } = getPresetDates(...args)
        this.setState({ start, end })
      }}
    >
      {str}
    </button>
  ))

  renderCustomView(props: SidebarProps): JSX.Element {
    const customButton = (
      <button
        style={outlineButton}
        onClick={() => this.props.viewChange('custom')}
      >
        Custom
      </button>
    )

    if (props.view === 'preset') return customButton

    const presetButton = (
      <button style={outlineButton} onClick={() => props.viewChange('preset')}>
        Preset
      </button>
    )

    const searchButton = (
      <button
        style={outlineButton}
        onClick={async () => {
          await props.getData(
            getISOString(this.state.start, false),
            getISOString(this.state.end, true)
          )
        }}
      >
        Search
      </button>
    )

    const startDate = (
      <div style={dateContainer}>
        <div style={calendarText}>Start</div>
        <DatePicker
          customInput={<input style={dateInput} />}
          selected={this.state.start}
          onChange={e => this.handleStartChange(e)}
        />
      </div>
    )

    const endDate = (
      <div style={dateContainer}>
        <div style={calendarText}>End</div>
        <DatePicker
          customInput={<input style={dateInput} />}
          selected={this.state.end}
          onChange={e => this.handleEndChange(e)}
        />
      </div>
    )

    return (
      <>
        {presetButton}
        <div style={calendarContainer}>
          <span>Range</span>
          <img style={calendarStyle} src={calendar} alt="calendar" />
        </div>
        <hr style={divider} />
        {this.presetButtons}
        <hr style={divider} />
        {startDate}
        {endDate}
        {props.loading === false ? searchButton : loading}
      </>
    )
  }

  render(): JSX.Element {
    if (this.props.appId === '') return header
    return (
      <>
        {header}
        {this.renderCustomView(this.props)}
        <hr style={divider} />
        {this.renderExchangeButtons(this.props)}
        <hr style={divider} />
        <button style={outlineButton} onClick={() => this.props.logout()}>
          Logout
        </button>
      </>
    )
  }
}
export default Sidebar
