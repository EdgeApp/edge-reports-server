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

import * as styleSheet from '../../styles/common/textStyles.js'
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
    <img style={styleSheet.logoStyle} src={logo} alt="Edge Logo" />
    <div style={styleSheet.titleText}>Edge</div>
    <div style={styleSheet.titleText}>Reports</div>
  </>
)

const loading = (
  <div style={styleSheet.sideBarLoadingMessage}>
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
    <div style={styleSheet.exchangeTypeContainer}>
      <hr style={underlineExchangeTypeStyle[props.exchangeType]} />
      <button
        style={styleSheet.regularButton}
        onClick={async () => {
          await props.changeExchangeType('all')
        }}
      >
        Totals
      </button>
      <button
        style={styleSheet.regularButton}
        onClick={async () => {
          await props.changeExchangeType('fiat')
        }}
      >
        Fiat
      </button>
      <button
        style={styleSheet.regularButton}
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
      style={styleSheet.regularButton}
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
        style={styleSheet.mainButton}
        onClick={() => this.props.viewChange('custom')}
      >
        Custom
      </button>
    )

    if (props.view === 'preset') return customButton

    const presetButton = (
      <button
        style={styleSheet.mainButton}
        onClick={() => props.viewChange('preset')}
      >
        Preset
      </button>
    )

    const searchButton = (
      <button
        style={styleSheet.mainButton}
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
      <div style={styleSheet.dateContainer}>
        <div style={styleSheet.calendarText}>Start</div>
        <DatePicker
          customInput={<input style={styleSheet.dateInput} />}
          selected={this.state.start}
          onChange={e => this.handleStartChange(e)}
        />
      </div>
    )

    const endDate = (
      <div style={styleSheet.dateContainer}>
        <div style={styleSheet.calendarText}>End</div>
        <DatePicker
          customInput={<input style={styleSheet.dateInput} />}
          selected={this.state.end}
          onChange={e => this.handleEndChange(e)}
        />
      </div>
    )

    return (
      <>
        {presetButton}
        <div style={styleSheet.calendarContainer}>
          <span>Range</span>
          <img style={styleSheet.calendarStyle} src={calendar} alt="calendar" />
        </div>
        <hr style={styleSheet.divider} />
        {this.presetButtons}
        <hr style={styleSheet.divider} />
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
        <hr style={styleSheet.divider} />
        {this.renderExchangeButtons(this.props)}
        <hr style={styleSheet.divider} />
        <button
          style={styleSheet.mainButton}
          onClick={() => this.props.logout()}
        >
          Logout
        </button>
      </>
    )
  }
}
export default Sidebar
