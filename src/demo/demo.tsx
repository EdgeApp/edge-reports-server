import 'regenerator-runtime/runtime'
import 'react-datepicker/dist/react-datepicker.css'
import './demo.css'

import fetch from 'node-fetch'
import { instanceOf } from 'prop-types'
import React, { Component } from 'react'
import { Cookies, withCookies } from 'react-cookie'

import * as styleSheet from '../styles/common/textStyles.js'
import ApiKeyScreen from './components/ApiKeyScreen'
import Custom from './components/Custom'
import Preset from './components/Preset'
import Sidebar from './components/Sidebar'
import TimePeriods from './components/TimePeriods'

const PARTNER_TYPES = {
  banxa: 'fiat',
  bitaccess: 'fiat',
  bitsofgold: 'fiat',
  bity: 'fiat',
  bitrefill: 'fiat',
  changelly: 'swap',
  changenow: 'swap',
  coinswitch: 'swap',
  faast: 'swap',
  fox: 'swap',
  godex: 'swap',
  libertyx: 'fiat',
  moonpay: 'fiat',
  paytrie: 'fiat',
  safello: 'fiat',
  shapeshift: 'swap',
  sideshift: 'swap',
  switchain: 'swap',
  totle: 'swap',
  transak: 'fiat',
  simplex: 'fiat',
  wyre: 'fiat'
}
const COLOR_PALETTE = [
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
]

const CURRENT_DATE = new Date(Date.now())
const YEAR = CURRENT_DATE.getUTCFullYear()
const MONTH = CURRENT_DATE.getUTCMonth()
const DAY = CURRENT_DATE.getUTCDate()
const HOUR = CURRENT_DATE.getUTCHours()
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
  { cookies: any },
  {
    start: Date
    end: Date
    apiKey: string
    apiKeyMessage: string
    appId: string
    pluginIds: string[]
    timePeriod: string
    exchangeType: string
    view: string
    loading: boolean
    data: AnalyticsResult[]
    setData1: any[]
    setData2: any[]
    setData3: any[]
  }
> {
  static propTypes = {
    cookies: instanceOf(Cookies).isRequired
  }

  constructor(props) {
    super(props)
    const { cookies } = props
    this.state = {
      start: CURRENT_DATE,
      end: CURRENT_DATE,
      apiKey: cookies.get('apiKey'),
      apiKeyMessage: 'Enter API Key.',
      appId: '',
      pluginIds: [],
      exchangeType: 'all',
      timePeriod: 'day',
      view: 'preset',
      loading: false,
      data: [],
      setData1: [],
      setData2: [],
      setData3: []
    }
  }

  async componentDidMount(): Promise<void> {
    Object.assign(document.body.style, styleSheet.body)
    if (this.state.apiKey !== '') {
      await this.getAppId()
    }
  }

  handleViewChange(view: string): void {
    this.setState({ view })
  }

  handleStartChange(start: Date): void {
    this.setState({ start })
  }

  handleEndChange(end: Date): void {
    this.setState({ end })
  }

  handleApiKeyChange = (apiKey: any): void => {
    this.setState({ apiKey: apiKey.target.value })
  }

  changeTimeperiod = (timePeriod: string): void => {
    this.setState({ timePeriod })
  }

  changeExchangetype = (exchangeType: string): void => {
    this.setState({ exchangeType })
  }

  getAppId = async (): Promise<void> => {
    const url = `${API_PREFIX}/v1/getAppId?apiKey=${this.state.apiKey}`
    const response = await fetch(url)
    if (response.status === 400) {
      this.setState({ apiKeyMessage: 'Invalid API Key.' })
      return
    }
    const { cookies } = this.props
    const cookieTimePeriod = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    cookies.set('apiKey', this.state.apiKey, {
      path: '/',
      expires: cookieTimePeriod
    })
    const appId = await response.json()
    this.setState({ appId })
    await this.getPluginIds()
    await this.setPresetTimePeriods('setData1', 0, 0, -36)
    await this.setPresetTimePeriods('setData2', 0, -75, 0)
    await this.setPresetTimePeriods('setData3', -3, 0, 0)
  }

  async getPluginIds(): Promise<void> {
    const partners = Object.keys(PARTNER_TYPES)
    const url = `${API_PREFIX}/v1/getPluginIds?appId=${this.state.appId}`
    const response = await fetch(url)
    const json = await response.json()
    const existingPartners = json.filter(pluginId =>
      partners.includes(pluginId)
    )
    this.setState({ pluginIds: existingPartners })
  }

  getData = async (start: string, end: string): Promise<void> => {
    const time1 = Date.now()
    this.setState({ loading: true })
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
    this.setState({ data: trimmedData, loading: false, timePeriod })
    const time2 = Date.now()
    console.log(`getData time: ${time2 - time1} ms.`)
  }

  async setPresetTimePeriods(
    location: 'setData1' | 'setData2' | 'setData3',
    startMonthModifier: number,
    startDayModifier: number,
    startHourModifier: number
  ): Promise<void> {
    let month = MONTH
    let day = DAY
    let hour = HOUR
    let timePeriod
    if (location === 'setData1') {
      timePeriod = 'hour'
    } else if (location === 'setData2') {
      timePeriod = 'day'
      day++
      hour = 0
    } else {
      timePeriod = 'month'
      month -= 21
      day = 1
      hour = 0
    }
    let counter = 999
    if (timePeriod === 'month') {
      counter = 0
    }
    let analyticsResults: AnalyticsResult[] = []
    const time1 = Date.now()
    do {
      const startDate = new Date(
        Date.UTC(
          YEAR,
          month + startMonthModifier,
          day + startDayModifier,
          hour + startHourModifier
        )
      ).toISOString()

      const endDate = new Date(
        Date.UTC(YEAR, month, day, hour) - 1
      ).toISOString()
      const urls: string[] = []
      for (const pluginId of this.state.pluginIds) {
        const url = `${API_PREFIX}/v1/analytics/?start=${startDate}&end=${endDate}&appId=${this.state.appId}&pluginId=${pluginId}&timePeriod=${timePeriod}`
        urls.push(url)
      }
      const promises = urls.map(url => fetch(url).then(y => y.json()))
      const newData = await Promise.all(promises)
      // discard all entries with 0 usdValue on every bucket
      if (analyticsResults.length === 0) {
        analyticsResults = newData
      } else {
        analyticsResults = analyticsResults.map((analyticsResult, index) => {
          analyticsResult.result.month = [
            ...analyticsResult.result.month,
            ...newData[index].result.month
          ]
          analyticsResult.result.numAllTxs += newData[index].result.numAllTxs
          return analyticsResult
        })
        month += 3
      }
      counter++
      if (counter === 8) {
        month++
        startMonthModifier = -4
      }
    } while (counter <= 8)
    const trimmedData = analyticsResults.filter(data => {
      if (data.result.numAllTxs > 0) {
        return data
      }
    })

    // @ts-ignore
    this.setState({ [location]: trimmedData })
    const time2 = Date.now()
    console.log(`${location} time: ${time2 - time1} ms.`)
  }

  logout = (): void => {
    const { cookies } = this.props
    cookies.set('apiKey', '', { path: '/' })
    this.setState({
      apiKey: '',
      apiKeyMessage: 'Enter API Key.',
      appId: '',
      data: [],
      setData1: [],
      setData2: [],
      setData3: []
    })
  }

  render(): JSX.Element {
    return (
      <div style={styleSheet.row}>
        <div style={styleSheet.sidebar}>
          <Sidebar
            getData={this.getData}
            changeExchangeType={this.changeExchangetype}
            logout={this.logout}
            viewChange={e => this.handleViewChange(e)}
            loading={this.state.loading}
            appId={this.state.appId}
            exchangeType={this.state.exchangeType}
            view={this.state.view}
          />
        </div>
        {this.state.appId === '' ? (
          <ApiKeyScreen
            apiKeyMessage={this.state.apiKeyMessage}
            handleApiKeyChange={e => this.handleApiKeyChange(e)}
            getAppId={this.getAppId}
          />
        ) : (
          <div style={styleSheet.graphs}>
            {this.state.data.length > 0 && this.state.view === 'custom' ? (
              <div>
                <TimePeriods
                  timePeriod={this.state.timePeriod}
                  changeTimePeriod={this.changeTimeperiod}
                />
                <Custom
                  data={this.state.data}
                  exchangeType={this.state.exchangeType}
                  timePeriod={this.state.timePeriod}
                  partnerTypes={PARTNER_TYPES}
                  colorPalette={COLOR_PALETTE}
                />
              </div>
            ) : null}
            {this.state.view === 'preset' ? (
              <Preset
                dataSets={[
                  this.state.setData1,
                  this.state.setData2,
                  this.state.setData3
                ]}
                exchangeType={this.state.exchangeType}
                partnerTypes={PARTNER_TYPES}
                colorPalette={COLOR_PALETTE}
              />
            ) : null}
          </div>
        )}
      </div>
    )
  }
}
export default withCookies(App)
