import 'regenerator-runtime/runtime'
import './demo.css'
import 'react-datepicker/dist/react-datepicker.css'

import fetch from 'node-fetch'
import React, { Component } from 'react'
import DatePicker from 'react-datepicker'

// import { useParams } from 'react-router'
import BarGraph from './components/BarGraph'
import LineGraph from './components/LineGraph'
// @ts-ignore
import calendar from './images/calendar.png'
// @ts-ignore
import logo from './images/logo.png'

const PRODUCTION = true
let API_PREFIX = 'localhost:8000'
if (PRODUCTION === true) {
  API_PREFIX = ''
}

interface Bucket {
  start: number
  usdValue: number
  numTxs: number
  isoDate: string
  currencyCodes: { [currencyCode: string]: number }
  currencyPairs: { [currencyPair: string]: number }
}

interface AnalyticsResult {
  result: {
    hour: Bucket[]
    day: Bucket[]
    month: Bucket[]
    numAllTxs: number
  }
  app: string
  pluginId: string
  start: number
  end: number
}

class App extends Component<
  {},
  {
    year: number
    month: number
    day: number
    weekStart: number
    start: Date
    end: Date
    apiKey: string
    appId: string
    pluginIds: string[]
    timePeriod: string
    partnerTypes: any
    exchangeType: string
    colorPalette: string[]
    data: AnalyticsResult[]
  }
> {
  constructor(props) {
    super(props)
    const currentDate = new Date(Date.now())
    const year = currentDate.getUTCFullYear()
    const month = currentDate.getUTCMonth()
    const day = currentDate.getUTCDate()
    const weekStart = day - currentDate.getUTCDay()
    // const { apiKey } = useParams()
    this.state = {
      year,
      month,
      day,
      weekStart,
      start: currentDate,
      end: currentDate,
      apiKey: '4fea83a6812f3394d77afc6dc5000f3f',
      appId: '',
      pluginIds: [],
      partnerTypes: {
        banxa: 'Fiat',
        bitaccess: 'Fiat',
        bitsofgold: 'Fiat',
        bity: 'Fiat',
        bitrefill: 'Fiat',
        changelly: 'Swap',
        changenow: 'Swap',
        coinswitch: 'Fiat',
        faast: 'Swap',
        fox: 'Swap',
        godex: 'Swap',
        libertyx: 'Fiat',
        moonpay: 'Fiat',
        paytrie: 'Fiat',
        safello: 'Fiat',
        shapeshift: 'Swap',
        switchain: 'Swap',
        totle: 'Swap',
        transak: 'Fiat',
        simplex: 'Fiat',
        wyre: 'Fiat'
      },
      exchangeType: 'All',
      colorPalette: [
        '#004c6d',
        '#06759d',
        '#06a1ce',
        '#00cfff',
        '#dc143c',
        '#ed5e67',
        '#f99093',
        '#ffbec0',
        '#006400',
        '#4d953c',
        '#86c972',
        '#c1ffaa',
        '#ff8c00',
        '#fdb03b',
        '#fccf6a',
        '#ffeb9c',
        '#4b0082',
        '#8d4da9',
        '#c892d2',
        '#ffdaff',
        '#8b4513',
        '#b17f49',
        '#d6b989',
        '#fff3d0'
      ],
      timePeriod: 'day',
      data: []
    }
  }

  async componentDidMount(): Promise<void> {
    await this.getAppId()
    await this.getPluginIds()
    await this.getPresetDates(0, 0, 1, 0, false, false, true)
  }

  handleStartChange(start: Date): void {
    this.setState({ start })
  }

  handleEndChange(end: Date): void {
    this.setState({ end })
  }

  changeTimeperiod(timePeriod: string): void {
    this.setState({ timePeriod })
  }

  changeExchangetype(exchangeType: string): void {
    this.setState({ exchangeType })
  }

  getISOString(date: Date, end: boolean): string {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const day = date.getUTCDate()
    const isEnd = end === true ? 1 : 0
    const timezonedDate = new Date(Date.UTC(year, month, day) - isEnd)
    return timezonedDate.toISOString()
  }

  async getAppId(): Promise<void> {
    const url = `${API_PREFIX}/v1/getAppId?apiKey=${this.state.apiKey}`
    const response = await fetch(url)
    const appId = await response.json()
    this.setState({ appId })
  }

  async getPluginIds(): Promise<void> {
    const partners = [
      'banxa',
      'bitaccess',
      'bitsofgold',
      'bity',
      'bitrefill',
      'changelly',
      'changenow',
      'coinswitch',
      'faast',
      'fox',
      'godex',
      'libertyx',
      'moonpay',
      'paytrie',
      'safello',
      'shapeshift',
      'switchain',
      'totle',
      'transak',
      'simplex',
      'wyre'
    ]
    const url = `${API_PREFIX}/v1/getPluginIds?appId=${this.state.appId}`
    const response = await fetch(url)
    const json = await response.json()
    const existingPartners = json.filter(pluginId =>
      partners.includes(pluginId)
    )
    this.setState({ pluginIds: existingPartners })
  }

  async getPresetDates(
    startMonthModifier: number,
    startDayModifier: number,
    endMonthModifier: number,
    endDayModifier: number,
    quarterSearch: boolean,
    weekSearch: boolean,
    dropDay: boolean
  ): Promise<void> {
    let { year, month, day } = this.state
    if (quarterSearch === true) {
      month = Math.floor(month / 3) * 3
    }
    if (weekSearch === true) {
      day = this.state.weekStart
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
    await this.getData(startDate, endDate)
  }

  async getData(start: string, end: string): Promise<void> {
    const time1 = Date.now()
    const urls: string[] = []
    for (const pluginId of this.state.pluginIds) {
      const url = `${API_PREFIX}/v1/analytics/?start=${start}&end=${end}&appId=${this.state.appId}&pluginId=${pluginId}&timePeriod=monthdayhour`
      urls.push(url)
    }
    const promises = urls.map(url => fetch(url).then(y => y.json()))
    const newData = await Promise.all(promises)
    // discard all entries with 0 usdValue on every bucket
    const trimmedData = newData.filter(data => {
      if (data.result.numAllTxs > 0) {
        return data
      }
    })
    const timeRange = new Date(end).getTime() - new Date(start).getTime()
    let timePeriod
    if (timeRange < 1000 * 60 * 60 * 24 * 3) {
      timePeriod = 'hour'
    } else if (timeRange < 1000 * 60 * 60 * 24 * 75) {
      timePeriod = 'day'
    } else {
      timePeriod = 'month'
    }
    this.setState({ data: trimmedData, timePeriod })
    const time2 = Date.now()
    console.log(`getData time: ${time2 - time1} ms.`)
  }

  render(): JSX.Element {
    let barGraphData = this.state.data
    if (this.state.exchangeType !== 'All') {
      barGraphData = barGraphData.filter(
        obj => this.state.partnerTypes[obj.pluginId] === this.state.exchangeType
      )
    }

    const barGraphStyles = barGraphData.map((obj, index) => {
      const style = {
        backgroundColor: this.state.colorPalette[index],
        marginLeft: '10px',
        width: '18px',
        height: '18px'
      }
      const capitilizedPluginId =
        obj.pluginId.charAt(0).toUpperCase() + obj.pluginId.slice(1)
      return (
        <div className="bargraph-legend-keys" key={index}>
          <div style={style} />
          <div className="legend">{capitilizedPluginId}</div>
        </div>
      )
    })

    const lineGraphs = this.state.data
      .filter(obj => {
        if (this.state.exchangeType === 'All') {
          return obj
        }
        if (this.state.partnerTypes[obj.pluginId] === this.state.exchangeType) {
          return obj
        }
      })
      .map((object, key) => {
        return (
          <div key={key}>
            {this.state.partnerTypes[object.pluginId] ===
              this.state.exchangeType || this.state.exchangeType === 'All' ? (
              <div className="legend-holder">
                <div className="legend-position">{barGraphStyles[key]}</div>
                <div className="graphHolder">
                  <LineGraph
                    analyticsRequest={object}
                    timePeriod={this.state.timePeriod}
                    color={this.state.colorPalette[key]}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )
      })

    let tpWidth
    let tpPosition
    if (this.state.timePeriod === 'month') {
      tpPosition = '201px'
      tpWidth = '60px'
    } else if (this.state.timePeriod === 'day') {
      tpPosition = '113px'
      tpWidth = '42px'
    } else {
      tpPosition = '16px'
      tpWidth = '51px'
    }
    const underlineTimePeriodStyle = {
      width: tpWidth,
      marginTop: '2px',
      marginLeft: tpPosition
    }

    let etWidth
    let etPosition
    if (this.state.exchangeType === 'All') {
      etPosition = '12px'
      etWidth = '38px'
    } else if (this.state.exchangeType === 'Fiat') {
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
      left: '26px'
    }

    return (
      <div className="row">
        <div className="sidebar column">
          <img id="logo" src={logo} alt="Edge Logo" />
          <div className="sidebar-container title-text">Edge</div>
          <div className="sidebar-container title-text">Reports</div>
          <div className="sidebar-container sidebar-text">
            <span>Range</span>
            <img id="calendar" src={calendar} alt="calendar" />
          </div>
          <hr className="divider" />
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.getPresetDates(0, -1, 0, 0, false, false, false)
              }}
            >
              Yesterday
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.getPresetDates(0, 0, 0, 1, false, false, false)
              }}
            >
              Today
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.getPresetDates(0, -7, 0, 0, false, true, false)
              }}
            >
              Last Week
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.getPresetDates(0, 0, 0, 7, false, true, false)
              }}
            >
              This Week
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.getPresetDates(-1, 0, 0, 0, false, false, true)
              }}
            >
              Last Month
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.getPresetDates(0, 0, 1, 0, false, false, true)
              }}
            >
              This Month
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.getPresetDates(-3, 0, 0, 0, true, false, true)
              }}
            >
              Last Quarter
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.getPresetDates(0, 0, 3, 0, true, false, true)
              }}
            >
              This Quarter
            </button>
          </div>
          <hr className="divider" />
          <div className="date-picker">
            <div className="calendar-text">Start</div>
            <DatePicker
              selected={this.state.start}
              onChange={e => this.handleStartChange(e)}
            />
          </div>
          <div className="date-picker">
            <div className="calendar-text">End</div>
            <DatePicker
              selected={this.state.end}
              onChange={e => this.handleEndChange(e)}
            />
          </div>
          <div className="sidebar-container">
            <button
              className="calendar-search"
              onClick={async () => {
                await this.getData(
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
                await this.changeExchangetype('All')
              }}
            >
              Totals
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.changeExchangetype('Fiat')
              }}
            >
              Fiat
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.changeExchangetype('Swap')
              }}
            >
              Swap
            </button>
          </div>
          <div />
        </div>
        <div className="graphs column">
          <div id="time-period-holder">
            <button
              className="time-period"
              onClick={() => this.changeTimeperiod('hour')}
            >
              Hourly
            </button>
            <button
              className="time-period"
              onClick={() => this.changeTimeperiod('day')}
            >
              Daily
            </button>
            <button
              className="time-period"
              onClick={() => this.changeTimeperiod('month')}
            >
              Monthly
            </button>
          </div>
          <hr style={underlineTimePeriodStyle} />
          {this.state.data.length > 0 ? (
            <div>
              <div className="bargraph-legend-holder">{barGraphStyles}</div>
              <div className="graphHolder">
                <BarGraph
                  rawData={barGraphData}
                  timePeriod={this.state.timePeriod}
                  colors={this.state.colorPalette}
                />
              </div>
            </div>
          ) : null}
          <div>{lineGraphs}</div>
        </div>
      </div>
    )
  }
}
export default App
