import React, { Component } from 'react'
import Loader from 'react-loader-spinner'
import { Redirect, RouteComponentProps, withRouter } from 'react-router-dom'

import { AnalyticsResult } from '../../types'
import {
  getAppId,
  getCustomData,
  getPartnerIds,
  getPresetDates
} from '../../util'
import Partners from '../partners'
import Graphs from './Graphs'

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
  partnerIds: string[]
  setData1: AnalyticsResult[]
  setData2: AnalyticsResult[]
  setData3: AnalyticsResult[]
  redirect: boolean
}

class Preset extends Component<PresetProps, PresetState> {
  constructor(props) {
    super(props)
    this.state = {
      appId: '',
      partnerIds: [],
      setData1: [],
      setData2: [],
      setData3: [],
      redirect: false
    }
  }

  async componentDidMount(): Promise<void> {
    const { appId, redirect } = await getAppId(this.props.apiKey)
    this.setState({ appId, redirect })
    const { partnerIds } = await getPartnerIds(this.state.appId)
    this.setState({ partnerIds })
    await this.getGraphData()
  }

  async getGraphData(): Promise<void> {
    if (this.state.partnerIds.length > 0) {
      const keys = Object.keys(PRESET_TIMERANGES) as Array<
        keyof typeof PRESET_TIMERANGES
      >
      for (const timeRange of keys) {
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
            this.state.partnerIds,
            startDate,
            endDate,
            timePeriod
          )
          newData.forEach(analytic => {
            const { partnerId } = analytic
            if (analyticsResults[partnerId] == null) {
              analyticsResults[partnerId] = analytic
            } else {
              const { result } = analyticsResults[partnerId]
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
    const dataSetKeys = Object.keys(dataSets) as Array<keyof typeof dataSets>
    for (const dataSet of dataSetKeys) {
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
          obj => Partners[obj.partnerId].type === this.props.exchangeType
        )
      }

      const barGraphStyles = barGraphData.map((obj, stylesIndex) => {
        const style = {
          backgroundColor: Partners[obj.partnerId].color,
          marginLeft: '10px',
          width: '18px',
          height: '18px'
        }
        const capitilizedPluginId = `${obj.partnerId
          .charAt(0)
          .toUpperCase()}${obj.partnerId.slice(1)}`
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
