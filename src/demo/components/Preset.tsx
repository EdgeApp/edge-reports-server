import React, { Component } from 'react'
import Loader from 'react-loader-spinner'
import { Redirect, RouteComponentProps, withRouter } from 'react-router-dom'

import {
  getAppId,
  getCustomData,
  getPluginIds,
  getPresetDates
} from '../../util'
import Partners from '../partners'
import Graphs, { AnalyticsResult } from './Graphs'

const PRESET_TIMERANGES = getPresetDates()

interface TotalAnalytics {
  [pluginId: string]: AnalyticsResult
}

export const legendKeys = {
  marginTop: '2px',
  display: 'flex',
  flexDirection: 'row' as 'row'
}

export const legend = {
  marginTop: '-6px',
  marginLeft: '8px',
  fontSize: '18px',
  lineHeight: '30px'
}

const graphLabel = {
  textAlign: 'center' as 'center',
  fontSize: '18px',
  marginTop: '16px',
  color: 'grey'
}

export const legendHolder = {
  width: '95%',
  marginTop: '10px',
  marginLeft: '24px',
  display: 'inline-flex' as 'inline-flex',
  flexWrap: 'wrap' as 'wrap'
}

export const largeGraphHolder = {
  height: '800px'
}

const presetLoader = {
  textAlign: 'center' as 'center',
  marginTop: '20px'
}

const TIME_PERIODS = ['hour', 'day', 'month']
const GRAPH_LABELS = ['36 Hours', '75 Days', '2 Years']

interface PresetProps extends RouteComponentProps {
  exchangeType: string
  apiKey: string
}

interface PresetState {
  appId: string
  pluginIds: string[]
  setData1: []
  setData2: []
  setData3: []
  redirect: boolean
}

class Preset extends Component<PresetProps, PresetState> {
  constructor(props) {
    super(props)
    this.state = {
      appId: '',
      pluginIds: [],
      setData1: [],
      setData2: [],
      setData3: [],
      redirect: false
    }
  }

  async componentDidMount(): Promise<void> {
    const appIdResponse = await getAppId(this.props.apiKey)
    this.setState(appIdResponse)
    const pluginIdsResponse = await getPluginIds(this.state.appId)
    this.setState(pluginIdsResponse)
    await this.getGraphData()
  }

  async getGraphData(): Promise<void> {
    if (this.state.pluginIds.length > 0) {
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
  }

  render(): JSX.Element {
    if (this.state.redirect === true) {
      return <Redirect to={{ pathname: '/' }} />
    }
    const dataSets = {
      setData1: this.state.setData1,
      setData2: this.state.setData2,
      setData3: this.state.setData3
    }
    const graphs: JSX.Element[] = []
    let index = 0
    for (const dataSet in dataSets) {
      if (dataSets[dataSet].length === 0) {
        graphs.push(
          <div key={`${dataSet}-loader`} style={presetLoader}>
            <Loader type="Oval" color="blue" height="30px" width="30px" />
          </div>
        )
        continue
      }
      let barGraphData = dataSets[dataSet]
      if (this.props.exchangeType !== 'all') {
        barGraphData = barGraphData.filter(
          obj => Partners[obj.pluginId].type === this.props.exchangeType
        )
      }

      const barGraphStyles = barGraphData.map((obj, stylesIndex) => {
        const style = {
          backgroundColor: Partners[obj.pluginId].color,
          marginLeft: '10px',
          width: '18px',
          height: '18px'
        }
        const capitilizedPluginId = `${obj.pluginId
          .charAt(0)
          .toUpperCase()}${obj.pluginId.slice(1)}`
        return (
          <div style={legendKeys} key={stylesIndex}>
            <div style={style} />
            <div style={legend}>{capitilizedPluginId}</div>
          </div>
        )
      })

      graphs.push(
        <div key={dataSet}>
          <div style={graphLabel}>{`${GRAPH_LABELS[index]}`}</div>
          <div style={legendHolder}>{barGraphStyles}</div>
          <div style={largeGraphHolder}>
            <Graphs rawData={barGraphData} timePeriod={TIME_PERIODS[index]} />
          </div>
        </div>
      )
      index++
    }

    return <>{graphs}</>
  }
}
export default withRouter(Preset)
