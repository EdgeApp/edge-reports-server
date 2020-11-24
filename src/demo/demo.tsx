import 'regenerator-runtime/runtime'
import 'react-datepicker/dist/react-datepicker.css'
import './demo.css'

import fetch from 'node-fetch'
import { instanceOf } from 'prop-types'
import React, { Component } from 'react'
import { Cookies, withCookies } from 'react-cookie'

import { getCustomData, getPresetDates, getTimeRange } from '../util'
import ApiKeyScreen from './components/ApiKeyScreen'
import Custom from './components/Custom'
import Preset from './components/Preset'
import Sidebar from './components/Sidebar'
import TimePeriods from './components/TimePeriods'
import Partners from './partners.json'

const PRESET_TIMERANGES = getPresetDates()

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

interface TotalAnalytics {
  [pluginId: string]: AnalyticsResult
}

const body = {
  margin: 0,
  padding: 0,
  height: '100%'
}

const graphs = {
  display: 'table-cell' as 'table-cell',
  verticalAlign: 'top'
}

const sidebar = {
  display: 'table-cell' as 'table-cell',
  background: 'linear-gradient(90deg, #0C446A 0%, #0D2145 100%)',
  width: '200px'
}

const row = {
  width: '100%',
  height: '100%',
  display: 'table' as 'table',
  tableLayout: 'fixed' as 'fixed'
}

class App extends Component<
  { cookies: any },
  {
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
    Object.assign(document.body.style, body)
    if (this.state.apiKey !== '') {
      await this.getAppId()
    }
  }

  handleViewChange(view: string): void {
    this.setState({ view })
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
    const url = `/v1/getAppId?apiKey=${this.state.apiKey}`
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
    await this.setPresetTimePeriods()
  }

  async getPluginIds(): Promise<void> {
    const partners = Object.keys(Partners)
    const url = `/v1/getPluginIds?appId=${this.state.appId}`
    const response = await fetch(url)
    const json = await response.json()
    const existingPartners = json.filter(pluginId =>
      partners.includes(pluginId)
    )
    this.setState({ pluginIds: existingPartners })
  }

  getData = async (start: string, end: string): Promise<void> => {
    console.time('getData')
    this.setState({ loading: true })
    const data = await getCustomData(
      this.state.appId,
      this.state.pluginIds,
      start,
      end
    )
    this.setState({
      data,
      loading: false,
      timePeriod: getTimeRange(start, end)
    })
    console.timeEnd('getData')
  }

  async setPresetTimePeriods(): Promise<void> {
    for (const timeRange in PRESET_TIMERANGES) {
      console.time(`${timeRange}`)
      let timePeriod = 'month'
      if (timeRange === 'setData1') timePeriod = 'hour'
      if (timeRange === 'setData2') timePeriod = 'day'
      const analyticsResults: TotalAnalytics = {}
      for (const timeRanges of PRESET_TIMERANGES[timeRange]) {
        const startDate = timeRanges[0]
        const endDate = timeRanges[1]
        const newData = await getCustomData(
          this.state.appId,
          this.state.pluginIds,
          startDate,
          endDate,
          timePeriod
        )
        newData.forEach(analytic => {
          const { pluginId } = analytic
          if (analyticsResults[pluginId] == null) {
            analyticsResults[pluginId] = analytic
          } else {
            const { result } = analyticsResults[pluginId]
            result.month = [...result.month, ...analytic.result.month]
            result.numAllTxs += analytic.result.numAllTxs
          }
        })
      }
      const analyticsArray = Object.values(analyticsResults)

      // @ts-ignore
      this.setState({ [timeRange]: analyticsArray })
      console.timeEnd(`${timeRange}`)
    }
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

  renderGraphView = (): JSX.Element => {
    if (this.state.view === 'preset') {
      return (
        <Preset
          dataSets={[
            this.state.setData1,
            this.state.setData2,
            this.state.setData3
          ]}
          exchangeType={this.state.exchangeType}
        />
      )
    }
    if (this.state.data.length === 0) return <></>
    return (
      <>
        <TimePeriods
          timePeriod={this.state.timePeriod}
          changeTimePeriod={this.changeTimeperiod}
        />
        <Custom
          data={this.state.data}
          exchangeType={this.state.exchangeType}
          timePeriod={this.state.timePeriod}
        />
      </>
    )
  }

  renderMainView = (): JSX.Element => {
    if (this.state.appId === '') {
      return (
        <ApiKeyScreen
          apiKeyMessage={this.state.apiKeyMessage}
          handleApiKeyChange={e => this.handleApiKeyChange(e)}
          getAppId={this.getAppId}
        />
      )
    }
    return <div style={graphs}>{this.renderGraphView()}</div>
  }

  render(): JSX.Element {
    return (
      <div style={row}>
        <div style={sidebar}>
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
        {this.renderMainView()}
      </div>
    )
  }
}
export default withCookies(App)
