import '../demo.css'
import 'react-datepicker/dist/react-datepicker.css'

import React, { Component } from 'react'
import DatePicker from 'react-datepicker'

// @ts-ignore
import calendar from '../images/calendar.png'
// @ts-ignore
import logo from '../images/logo.png'

interface SidebarProps {
  getData: any
  changeExchangeType: any
  logout: any
  viewChange: any
  appId: string
  exchangeType: string
  view: string
}
interface SidebarState {
  start: Date
  end: Date
}

class Sidebar extends Component<SidebarProps, SidebarState> {
  constructor(props) {
    super(props)
    const date = new Date()
    this.state = {
      start: date,
      end: date,
    }
  }

  handleStartChange(start: Date): void {
    this.setState({ start })
  }

  handleEndChange(end: Date): void {
    this.setState({ end })
  }

  getISOString(date: Date, end: boolean): string {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const day = date.getUTCDate()
    const isEnd = end === true ? 1 : 0
    const timezonedDate = new Date(Date.UTC(year, month, day) - isEnd)
    return timezonedDate.toISOString()
  }

  async getPresetDates(
    startMonthModifier: number,
    startDayModifier: number,
    endMonthModifier: number,
    endDayModifier: number,
    yearSearch: boolean,
    quarterSearch: boolean,
    weekSearch: boolean,
    dropDay: boolean
  ): Promise<void> {
    const currentDate = new Date(Date.now())
    const year = currentDate.getUTCFullYear()
    let month = currentDate.getUTCMonth()
    let day = currentDate.getUTCDate()
    if (yearSearch === true) {
      month = 0
      day = 1
    }
    if (quarterSearch === true) {
      month = Math.floor(month / 3) * 3
    }
    if (weekSearch === true) {
      day -= currentDate.getUTCDay()
    }
    if (dropDay === true) {
      day = 1
    }
    const offset = this.state.start.getTimezoneOffset()
    const start = new Date(
      Date.UTC(
        year,
        month + startMonthModifier,
        day + startDayModifier,
        0,
        offset
      )
    )
    const end = new Date(
      Date.UTC(
        year,
        month + endMonthModifier,
        day + endDayModifier,
        0,
        offset
      ) + -1
    )
    const startDate = new Date(
      Date.UTC(year, month + startMonthModifier, day + startDayModifier)
    ).toISOString()

    const endDate = new Date(
      Date.UTC(year, month + endMonthModifier, day + endDayModifier) - 1
    ).toISOString()

    this.setState({ start, end })
    await this.props.getData(startDate, endDate)
  }

  render(): JSX.Element {
    let etWidth
    let etPosition
    if (this.props.exchangeType === 'All') {
      etPosition = '12px'
      etWidth = '38px'
    } else if (this.props.exchangeType === 'Fiat') {
      etPosition = '44px'
      etWidth = '24px'
    } else {
      etPosition = '77px'
      etWidth = '34px'
    }
    const underlineExchangeTypeStyle = {
      position: 'absolute' as 'absolute',
      width: etWidth,
      top: etPosition,
      left: '26px',
    }
    return (
      <>
        <img id="logo" src={logo} alt="Edge Logo" />
        <div className="sidebar-container title-text">Edge</div>
        <div className="sidebar-container title-text">Reports</div>
        {this.props.view === 'custom' ? (
          <div>
            <div className="sidebar-container">
              <button
                className="calendar-search"
                onClick={() => this.props.viewChange('preset')}
              >
                Preset
              </button>
            </div>
            <div className="sidebar-container sidebar-text">
              <span>Range</span>
              <img id="calendar" src={calendar} alt="calendar" />
            </div>
            <hr className="divider" />
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    0,
                    -1,
                    0,
                    0,
                    false,
                    false,
                    false,
                    false
                  )
                }}
              >
                Yesterday
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    0,
                    0,
                    0,
                    1,
                    false,
                    false,
                    false,
                    false
                  )
                }}
              >
                Today
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    0,
                    -7,
                    0,
                    0,
                    false,
                    false,
                    true,
                    false
                  )
                }}
              >
                Last Week
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    0,
                    0,
                    0,
                    7,
                    false,
                    false,
                    true,
                    false
                  )
                }}
              >
                This Week
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    -1,
                    0,
                    0,
                    0,
                    false,
                    false,
                    false,
                    true
                  )
                }}
              >
                Last Month
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    0,
                    0,
                    1,
                    0,
                    false,
                    false,
                    false,
                    true
                  )
                }}
              >
                This Month
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    0,
                    -90,
                    0,
                    0,
                    false,
                    false,
                    false,
                    false
                  )
                }}
              >
                Last 90 Days
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    -3,
                    0,
                    0,
                    0,
                    false,
                    true,
                    false,
                    true
                  )
                }}
              >
                Last Quarter
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    0,
                    0,
                    3,
                    0,
                    false,
                    true,
                    false,
                    true
                  )
                }}
              >
                This Quarter
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    -12,
                    0,
                    0,
                    0,
                    true,
                    false,
                    false,
                    true
                  )
                }}
              >
                Last Year
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.getPresetDates(
                    0,
                    0,
                    12,
                    0,
                    true,
                    false,
                    false,
                    true
                  )
                }}
              >
                This Year
              </button>
            </div>
            <hr className="divider" />
            <div className="date-picker">
              <div className="calendar-text">Start</div>
              <DatePicker
                selected={this.state.start}
                onChange={(e) => this.handleStartChange(e)}
              />
            </div>
            <div className="date-picker">
              <div className="calendar-text">End</div>
              <DatePicker
                selected={this.state.end}
                onChange={(e) => this.handleEndChange(e)}
              />
            </div>
            <div className="sidebar-container">
              <button
                className="calendar-search"
                onClick={async () => {
                  await this.props.getData(
                    this.getISOString(this.state.start, false),
                    this.getISOString(this.state.end, true)
                  )
                }}
              >
                Search
              </button>
            </div>
            <hr className="divider" />
            <div className="sidebar-container exchange-type-top">
              <hr style={underlineExchangeTypeStyle} />
              <button
                onClick={async () => {
                  await this.props.changeExchangeType('All')
                }}
              >
                Totals
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.props.changeExchangeType('Fiat')
                }}
              >
                Fiat
              </button>
            </div>
            <div className="sidebar-container">
              <button
                onClick={async () => {
                  await this.props.changeExchangeType('Swap')
                }}
              >
                Swap
              </button>
            </div>
          </div>
        ) : (
          <div className="sidebar-container">
            <button
              className="calendar-search"
              onClick={() => this.props.viewChange('custom')}
            >
              Custom
            </button>
          </div>
        )}
        {this.props.appId !== '' ? (
          <div>
            <hr className="divider" />
            <div className="sidebar-container">
              <button
                className="calendar-search"
                onClick={() => this.props.logout()}
              >
                Logout
              </button>
            </div>
          </div>
        ) : null}
        <div />
      </>
    )
  }
}
export default Sidebar
