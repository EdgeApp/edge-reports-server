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

// @ts-ignore
import calendar from '../images/calendar.png'
import { MainButton, SecondaryButton } from './Buttons'
import Sidetab from './Sidetab'
import Spinner from './Spinner'
import TimePicker from './TimePicker'

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

const exchangeTypeContainer = {
  position: 'relative' as 'relative'
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
      <SecondaryButton
        label="Totals"
        onClick={async () => {
          await props.changeExchangeType('all')
        }}
      />
      <SecondaryButton
        label="Fiat"
        onClick={async () => {
          await props.changeExchangeType('fiat')
        }}
      />
      <SecondaryButton
        label="Swap"
        onClick={async () => {
          await props.changeExchangeType('swap')
        }}
      />
    </div>
  )

  presetButtons = PRESETS.map(({ args, str }, index) => (
    <SecondaryButton
      key={index}
      label={str}
      onClick={() => {
        const { start, end } = getPresetDates(...args)
        this.setState({ start, end })
      }}
    />
  ))

  renderCustomView(props: SidebarProps): JSX.Element {
    if (props.view === 'preset')
      return (
        <MainButton
          label="Custom"
          onClick={() => this.props.viewChange('custom')}
        />
      )

    const searchButton = (
      <MainButton
        label="Search"
        onClick={async () => {
          await props.getData(
            getISOString(this.state.start, false),
            getISOString(this.state.end, true)
          )
        }}
      />
    )

    return (
      <>
        <MainButton
          label="Preset"
          onClick={() => this.props.viewChange('preset')}
        />
        <div style={calendarContainer}>
          <span>Range</span>
          <img style={calendarStyle} src={calendar} alt="calendar" />
        </div>
        <hr style={divider} />
        {this.presetButtons}
        <hr style={divider} />
        <TimePicker
          label="Start"
          date={this.state.start}
          onChange={e => this.handleStartChange(e)}
        />
        <TimePicker
          label="End"
          date={this.state.end}
          onChange={e => this.handleEndChange(e)}
        />
        {props.loading === false ? searchButton : <Spinner />}
      </>
    )
  }

  render(): JSX.Element {
    return (
      <Sidetab serverName="Reports" appId={this.props.appId}>
        {this.renderCustomView(this.props)}
        <hr style={divider} />
        {this.renderExchangeButtons(this.props)}
        <hr style={divider} />
        <MainButton label="Logout" onClick={() => this.props.logout()} />
      </Sidetab>
    )
  }
}
export default Sidebar
