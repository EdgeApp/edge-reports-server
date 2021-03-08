import 'regenerator-runtime/runtime'
import 'react-datepicker/dist/react-datepicker.css'
import './demo.css'

import fetch from 'node-fetch'
import { instanceOf } from 'prop-types'
import React, { Component } from 'react'
import { Cookies, withCookies } from 'react-cookie'
import { HashRouter, Route, Switch } from 'react-router-dom'

import ApiKeyScreen from './components/ApiKeyScreen'
import Custom from './components/Custom'
import Preset from './components/Preset'
import Sidebar from './components/Sidebar'
import TimePeriods from './components/TimePeriods'
import Partners from './partners.json'

const body = {
  margin: 0,
  padding: 0,
  height: '100%'
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
      timePeriod: 'day'
    }
  }

  async componentDidMount(): Promise<void> {
    Object.assign(document.body.style, body)
    if (this.state.apiKey !== '') {
      await this.getAppId()
    }
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

  logout = (): void => {
    const { cookies } = this.props
    cookies.set('apiKey', '', { path: '/' })
    this.setState({
      apiKey: '',
      apiKeyMessage: 'Enter API Key.',
      appId: ''
    })
  }

  render(): JSX.Element {
    return (
      <HashRouter>
        <Switch>
          <div style={row}>
            <Sidebar
              changeExchangeType={this.changeExchangetype}
              logout={this.logout}
              appId={this.state.appId}
              exchangeType={this.state.exchangeType}
            />
            <Route
              exact
              path="/"
              children={
                <ApiKeyScreen
                  apiKeyMessage={this.state.apiKeyMessage}
                  handleApiKeyChange={e => this.handleApiKeyChange(e)}
                  getAppId={this.getAppId}
                  appId={this.state.appId}
                />
              }
            />
            <Route
              exact
              path="/preset"
              children={
                <Preset
                  apiKey={this.state.apiKey}
                  exchangeType={this.state.exchangeType}
                />
              }
            />
            <Route
              exact
              path="/custom/:start?/:end?"
              children={props => {
                return props.match != null ? (
                  <>
                    <TimePeriods
                      timePeriod={this.state.timePeriod}
                      changeTimePeriod={this.changeTimeperiod}
                    />
                    <Custom
                      key={`${props.match.params.start}/${props.match.params.end}`}
                      apiKey={this.state.apiKey}
                      exchangeType={this.state.exchangeType}
                      changeTimePeriod={this.changeTimeperiod}
                      timePeriod={this.state.timePeriod}
                    />
                  </>
                ) : (
                  <></>
                )
              }}
            />
          </div>
        </Switch>
      </HashRouter>
    )
  }
}
export default withCookies(App)
