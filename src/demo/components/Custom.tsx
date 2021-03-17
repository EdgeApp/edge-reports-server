import React, { Component } from 'react'
import Loader from 'react-loader-spinner'
import { Redirect, withRouter } from 'react-router-dom'

import { getAppId, getCustomData, getPluginIds, getTimeRange } from '../../util'
import Partners from '../partners.json'
import Graphs, { AnalyticsResult } from './Graphs'
import { largeGraphHolder, legend, legendHolder, legendKeys } from './Preset'

const smallLegendAndGraphHolder = {
  width: '50%',
  float: 'left' as 'left'
}

const smallGraphHolder = {
  height: '400px'
}

const customLoader = {
  textAlign: 'center' as 'center',
  marginTop: '30px'
}

interface CustomProps {
  match: any
  key: string
  apiKey: string
  exchangeType: string
  changeTimePeriod: Function
  timePeriod: string
}

interface CustomState {
  appId: string
  pluginIds: string[]
  data: AnalyticsResult[]
  loading: boolean
  redirect: boolean
}

class Custom extends Component<CustomProps, CustomState> {
  constructor(props) {
    super(props)
    this.state = {
      appId: '',
      pluginIds: [],
      data: [],
      loading: true,
      redirect: false
    }
  }

  async componentDidMount(): Promise<void> {
    const appIdResponse = await getAppId(this.props.apiKey)
    this.setState(appIdResponse)
    const pluginIdsResponse = await getPluginIds(this.state.appId)
    this.setState(pluginIdsResponse)
    if (
      typeof this.props.match.params.start === 'string' &&
      this.props.match.params.start.length > 0 &&
      typeof this.props.match.params.end === 'string' &&
      this.props.match.params.end.length > 0
    ) {
      await this.getData(
        this.props.match.params.start,
        this.props.match.params.end
      )
    }
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
      loading: false
    })
    this.props.changeTimePeriod(getTimeRange(start, end))
    console.timeEnd('getData')
  }

  render(): JSX.Element {
    if (this.state.redirect === true) {
      return <Redirect to={{ pathname: '/' }} />
    }
    if (this.state.loading === true) {
      return (
        <div key="Loader" style={customLoader}>
          <Loader type="Oval" color="blue" height="30px" width="30px" />
        </div>
      )
    }
    let barGraphData = this.state.data
    if (this.props.exchangeType !== 'all') {
      barGraphData = barGraphData.filter(
        obj => Partners[obj.pluginId].type === this.props.exchangeType
      )
    }

    const barGraphStyles = barGraphData.map(analytic => {
      const style = {
        backgroundColor: Partners[analytic.pluginId].color,
        marginLeft: '10px',
        width: '18px',
        height: '18px'
      }
      const capitilizedPluginId = `${analytic.pluginId
        .charAt(0)
        .toUpperCase()}${analytic.pluginId.slice(1)}`
      return (
        <div style={legendKeys} key={analytic.pluginId}>
          <div style={style} />
          <div style={legend}>{capitilizedPluginId}</div>
        </div>
      )
    })

    const barGraphs = barGraphData.map((analytic, index) => {
      return (
        <div key={analytic.pluginId} style={smallLegendAndGraphHolder}>
          {Partners[analytic.pluginId].type === this.props.exchangeType ||
          this.props.exchangeType === 'all' ? (
            <div>
              <div style={legendHolder}>{barGraphStyles[index]}</div>
              <div style={smallGraphHolder}>
                <Graphs
                  rawData={[analytic]}
                  timePeriod={this.props.timePeriod}
                />
              </div>
            </div>
          ) : null}
        </div>
      )
    })

    return (
      <>
        <div>
          <div style={legendHolder}>{barGraphStyles}</div>
          <div style={largeGraphHolder}>
            <Graphs rawData={barGraphData} timePeriod={this.props.timePeriod} />
          </div>
          <div>{barGraphs}</div>
        </div>
      </>
    )
  }
}
export default withRouter(Custom)
