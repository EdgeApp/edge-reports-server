import 'react-datepicker/dist/react-datepicker.css'

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

const DATE = new Date(Date.now())
const YEAR = DATE.getUTCFullYear()
const MONTH = DATE.getUTCMonth()
const DAY = DATE.getUTCDate()
const jan = new Date(YEAR, 0, 1)
const jul = new Date(YEAR, 6, 1)
const OFFSET = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset())

const PRESETS = [
  { args: [0, -1, 0, 0, false, false, false, false], str: 'Yesterday' },
  { args: [0, 0, 0, 1, false, false, false, false], str: 'Today' },
  { args: [0, -7, 0, 0, false, false, true, false], str: 'Last Week' },
  { args: [0, 0, 0, 7, false, false, true, false], str: 'This Week' },
  { args: [-1, 0, 0, 0, false, false, false, true], str: 'Last Month' },
  { args: [0, 0, 1, 0, false, false, false, true], str: 'This Month' },
  { args: [0, -90, 0, 0, false, false, false, false], str: 'Last 90 Days' },
  { args: [-3, 0, 0, 0, false, true, false, true], str: 'Last Quarter' },
  { args: [0, 0, 3, 0, false, true, false, true], str: 'This Quarter' },
  { args: [-12, 0, 0, 0, true, false, false, true], str: 'Last Year' },
  { args: [0, 0, 12, 0, true, false, false, true], str: 'This Year' }
]

class Sidebar extends Component<SidebarProps, SidebarState> {
  constructor(props) {
    super(props)
    const start = new Date(Date.UTC(YEAR, MONTH, 1, 0, OFFSET))
    const end = new Date(Date.UTC(YEAR, MONTH + 1, 1, 0, OFFSET))
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

  getISOString(date: Date, end: boolean): string {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const day = date.getUTCDate()
    const isEnd = end === true ? 1 : 0
    const timezonedDate = new Date(Date.UTC(year, month, day) - isEnd)
    return timezonedDate.toISOString()
  }

  getPresetDates(
    startMonthModifier: number,
    startDayModifier: number,
    endMonthModifier: number,
    endDayModifier: number,
    yearSearch: boolean,
    quarterSearch: boolean,
    weekSearch: boolean,
    dropDay: boolean
  ): void {
    let month = MONTH
    let day = DAY
    if (yearSearch === true) {
      month = 0
      day = 1
    }
    if (quarterSearch === true) {
      month = Math.floor(month / 3) * 3
    }
    if (weekSearch === true) {
      day -= DATE.getUTCDay()
    }
    if (dropDay === true) {
      day = 1
    }
    const start = new Date(
      Date.UTC(
        YEAR,
        month + startMonthModifier,
        day + startDayModifier,
        0,
        OFFSET
      )
    )
    const end = new Date(
      Date.UTC(YEAR, month + endMonthModifier, day + endDayModifier, 0, OFFSET)
    )
    this.setState({ start, end })
  }

  render(): JSX.Element {
    let etWidth
    let etPosition
    if (this.props.exchangeType === 'All') {
      etPosition = '12px'
      etWidth = '41px'
    } else if (this.props.exchangeType === 'Fiat') {
      etPosition = '44px'
      etWidth = '26px'
    } else {
      etPosition = '77px'
      etWidth = '39px'
    }
    const underlineExchangeTypeStyle = {
      position: 'absolute' as 'absolute',
      width: etWidth,
      top: etPosition,
      left: '26px'
    }

    const presetButtons = PRESETS.map(({ args, str }, index) => {
      return (
        <div key={index} style={styleSheet.sideBarContainer}>
          <button
            style={styleSheet.regularButton}
            onClick={async () => {
              await this.getPresetDates(...args)
            }}
          >
            {str}
          </button>
        </div>
      )
    })

    return (
      <>
        <img style={styleSheet.logoStyle} src={logo} alt="Edge Logo" />
        <div style={styleSheet.titleText}>Edge</div>
        <div style={styleSheet.titleText}>Reports</div>
        {this.props.appId !== '' ? (
          <div>
            {this.props.view === 'custom' ? (
              <div>
                <div style={styleSheet.sideBarContainer}>
                  <button
                    style={styleSheet.mainButton}
                    onClick={() => this.props.viewChange('preset')}
                  >
                    Preset
                  </button>
                </div>
                <div style={styleSheet.calendarContainer}>
                  <span>Range</span>
                  <img
                    style={styleSheet.calendarStyle}
                    src={calendar}
                    alt="calendar"
                  />
                </div>
                <hr style={styleSheet.divider} />
                {presetButtons}
                <hr style={styleSheet.divider} />
                <div style={styleSheet.dateContainer}>
                  <div style={styleSheet.calendarText}>Start</div>
                  <DatePicker
                    customInput={<input style={styleSheet.dateInput} />}
                    selected={this.state.start}
                    onChange={e => this.handleStartChange(e)}
                  />
                </div>
                <div style={styleSheet.dateContainer}>
                  <div style={styleSheet.calendarText}>End</div>
                  <DatePicker
                    customInput={<input style={styleSheet.dateInput} />}
                    selected={this.state.end}
                    onChange={e => this.handleEndChange(e)}
                  />
                </div>
                {this.props.loading === false ? (
                  <div>
                    <div style={styleSheet.sideBarContainer}>
                      <button
                        style={styleSheet.mainButton}
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
                  </div>
                ) : (
                  <div style={styleSheet.sideBarLoadingMessage}>
                    <Loader
                      type="Oval"
                      color="white"
                      height="30px"
                      width="30px"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div style={styleSheet.sideBarContainer}>
                <button
                  style={styleSheet.mainButton}
                  onClick={() => this.props.viewChange('custom')}
                >
                  Custom
                </button>
              </div>
            )}
            <hr style={styleSheet.divider} />
            <div style={styleSheet.exchangeTypeContainer}>
              <hr style={underlineExchangeTypeStyle} />
              <button
                style={styleSheet.regularButton}
                onClick={async () => {
                  await this.props.changeExchangeType('All')
                }}
              >
                Totals
              </button>
            </div>
            <div style={styleSheet.sideBarContainer}>
              <button
                style={styleSheet.regularButton}
                onClick={async () => {
                  await this.props.changeExchangeType('Fiat')
                }}
              >
                Fiat
              </button>
            </div>
            <div style={styleSheet.sideBarContainer}>
              <button
                style={styleSheet.regularButton}
                onClick={async () => {
                  await this.props.changeExchangeType('Swap')
                }}
              >
                Swap
              </button>
            </div>
            {this.props.appId !== '' ? (
              <div>
                <hr style={styleSheet.divider} />
                <div style={styleSheet.sideBarContainer}>
                  <button
                    style={styleSheet.mainButton}
                    onClick={() => this.props.logout()}
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    )
  }
}
export default Sidebar
