import 'regenerator-runtime/runtime'
import './demo.css'
import 'react-datepicker/dist/react-datepicker.css'

import parseISO from 'date-fns/parseISO'
import fetch from 'node-fetch'
import React, { Component } from 'react'
import DatePicker from 'react-datepicker'

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
    calendarStart: Date
    calendarEnd: Date
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
    this.state = {
      calendarStart: new Date(Date.now()),
      calendarEnd: new Date(Date.now()),
      appId: 'edge',
      pluginIds: [],
      partnerTypes: {
        banxa: 'Fiat',
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
    await this.getPluginIds()
    await this.lastMonth()
  }

  handleStartChange(date: Date): void {
    this.setState({
      calendarStart: date
    })
  }

  handleEndChange(date: Date): void {
    this.setState({
      calendarEnd: date
    })
  }

  changeMonth(): void {
    this.setState({ timePeriod: 'month' })
  }

  changeDay(): void {
    this.setState({ timePeriod: 'day' })
  }

  changeHour(): void {
    this.setState({ timePeriod: 'hour' })
  }

  changeTotals(): void {
    this.setState({ exchangeType: 'All' })
  }

  changeFiat(): void {
    this.setState({ exchangeType: 'Fiat' })
  }

  changeSwap(): void {
    this.setState({ exchangeType: 'Swap' })
  }

  async calendarSearch(): Promise<void> {
    await this.getData(
      this.state.pluginIds,
      this.state.calendarStart.getTime() / 1000,
      this.state.calendarEnd.getTime() / 1000 - 1
    )
  }

  async lastDay(): Promise<void> {
    const currentDate = new Date(Date.now())
    const y = currentDate.getUTCFullYear()
    const m = currentDate.getUTCMonth()
    const d = currentDate.getUTCDate()
    const start = Date.UTC(y, m, d - 1) / 1000
    const end = Date.UTC(y, m, d) / 1000 - 1
    await this.getData(this.state.pluginIds, start, end)
    this.setState({ timePeriod: 'hour' })
  }

  async thisDay(): Promise<void> {
    const currentDate = new Date(Date.now())
    const y = currentDate.getUTCFullYear()
    const m = currentDate.getUTCMonth()
    const d = currentDate.getUTCDate()
    const start = Date.UTC(y, m, d) / 1000
    const end = Date.UTC(y, m, d + 1) / 1000 - 1
    await this.getData(this.state.pluginIds, start, end)
    this.setState({ timePeriod: 'hour' })
  }

  async lastWeek(): Promise<void> {
    const currentDate = new Date(Date.now())
    const y = currentDate.getUTCFullYear()
    const m = currentDate.getUTCMonth()
    const d = currentDate.getUTCDate() - currentDate.getUTCDay()
    const start = Date.UTC(y, m, d - 7) / 1000
    const end = Date.UTC(y, m, d) / 1000 - 1
    await this.getData(this.state.pluginIds, start, end)
    this.setState({ timePeriod: 'day' })
  }

  async thisWeek(): Promise<void> {
    const currentDate = new Date(Date.now())
    const y = currentDate.getUTCFullYear()
    const m = currentDate.getUTCMonth()
    const d = currentDate.getUTCDate() - currentDate.getUTCDay()
    const start = Date.UTC(y, m, d) / 1000
    const end = Date.UTC(y, m, d + 7) / 1000 - 1
    await this.getData(this.state.pluginIds, start, end)
    this.setState({ timePeriod: 'day' })
  }

  async lastMonth(): Promise<void> {
    const currentDate = new Date(Date.now())
    const y = currentDate.getUTCFullYear()
    const m = currentDate.getUTCMonth()
    const start = Date.UTC(y, m - 1, 1) / 1000
    const end = Date.UTC(y, m, 1) / 1000 - 1
    const startISO = parseISO(new Date(start * 1000).toISOString().slice(0, 10))
    const endISO = parseISO(
      new Date((end + 1) * 1000).toISOString().slice(0, 10)
    )
    await this.getData(this.state.pluginIds, start, end)
    this.setState({
      timePeriod: 'day',
      calendarStart: startISO,
      calendarEnd: endISO
    })
  }

  async thisMonth(): Promise<void> {
    const currentDate = new Date(Date.now())
    const y = currentDate.getUTCFullYear()
    const m = currentDate.getUTCMonth()
    const start = Date.UTC(y, m, 1) / 1000
    const end = Date.UTC(y, m + 1, 1) / 1000 - 1
    await this.getData(this.state.pluginIds, start, end)
    this.setState({ timePeriod: 'day' })
  }

  async lastQuarter(): Promise<void> {
    const currentDate = new Date(Date.now())
    const y = currentDate.getUTCFullYear()
    const m = Math.floor(currentDate.getUTCMonth() / 3) * 3
    const start = Date.UTC(y, m - 3, 1) / 1000
    const end = Date.UTC(y, m, 1) / 1000 - 1
    await this.getData(this.state.pluginIds, start, end)
    this.setState({ timePeriod: 'month' })
  }

  async thisQuarter(): Promise<void> {
    const currentDate = new Date(Date.now())
    const y = currentDate.getUTCFullYear()
    const m = Math.floor(currentDate.getUTCMonth() / 3) * 3
    const start = Date.UTC(y, m, 1) / 1000
    const end = Date.UTC(y, m + 3, 1) / 1000 - 1
    await this.getData(this.state.pluginIds, start, end)
    this.setState({ timePeriod: 'month' })
  }

  async getPluginIds(): Promise<void> {
    const partners = [
      'banxa',
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

  async getData(
    pluginIds: string[],
    start: number,
    end: number
  ): Promise<void> {
    const urls: string[] = []
    const startDate = new Date(start * 1000).toISOString()
    const endDate = new Date(end * 1000).toISOString()
    for (const pluginId of pluginIds) {
      const url = `${API_PREFIX}/v1/analytics/?start=${startDate}&end=${endDate}&appId=${this.state.appId}&pluginId=${pluginId}&timePeriod=monthdayhour`
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
    this.setState({ data: trimmedData })
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
                await this.lastDay()
              }}
            >
              Yesterday
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.thisDay()
              }}
            >
              Today
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.lastWeek()
              }}
            >
              Last Week
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.thisWeek()
              }}
            >
              This Week
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.lastMonth()
              }}
            >
              Last Month
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.thisMonth()
              }}
            >
              This Month
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.lastQuarter()
              }}
            >
              Last Quarter
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.thisQuarter()
              }}
            >
              This Quarter
            </button>
          </div>
          <hr className="divider" />
          <div className="date-picker">
            <div className="calendar-text">Start</div>
            <DatePicker
              selected={this.state.calendarStart}
              onChange={e => this.handleStartChange(e)}
            />
          </div>
          <div className="date-picker">
            <div className="calendar-text">End</div>
            <DatePicker
              selected={this.state.calendarEnd}
              onChange={e => this.handleEndChange(e)}
            />
          </div>
          <div className="sidebar-container">
            <button
              className="calendar-search"
              onClick={async () => {
                await this.calendarSearch()
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
                await this.changeTotals()
              }}
            >
              Totals
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.changeFiat()
              }}
            >
              Fiat
            </button>
          </div>
          <div className="sidebar-container">
            <button
              onClick={async () => {
                await this.changeSwap()
              }}
            >
              Swap
            </button>
          </div>
          <div />
        </div>
        <div className="graphs column">
          <div id="time-period-holder">
            <button className="time-period" onClick={() => this.changeHour()}>
              Hourly
            </button>
            <button className="time-period" onClick={() => this.changeDay()}>
              Daily
            </button>
            <button className="time-period" onClick={() => this.changeMonth()}>
              Monthly
            </button>
          </div>
          <hr style={underlineTimePeriodStyle} />
          {this.state.data.length > 0 ? (
            <div className="legend-holder">
              <div className="bargraph-legend-holder legend-position">
                {barGraphStyles}
              </div>
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
