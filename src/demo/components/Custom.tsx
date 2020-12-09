import React from 'react'

import Partners from '../partners.json'
import Graphs from './Graphs'
import { largeGraphHolder, legend, legendHolder, legendKeys } from './Preset'

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

const smallLegendAndGraphHolder = {
  width: '50%',
  float: 'left' as 'left'
}

const smallGraphHolder = {
  height: '400px'
}

const Custom: any = (props: {
  data: AnalyticsResult[]
  exchangeType: string
  timePeriod: string
}) => {
  let barGraphData = props.data
  if (props.exchangeType !== 'all') {
    barGraphData = barGraphData.filter(
      obj => Partners[obj.pluginId].type === props.exchangeType
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
        {Partners[analytic.pluginId].type === props.exchangeType ||
        props.exchangeType === 'all' ? (
          <div>
            <div style={legendHolder}>{barGraphStyles[index]}</div>
            <div style={smallGraphHolder}>
              <Graphs rawData={[analytic]} timePeriod={props.timePeriod} />
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
          <Graphs rawData={barGraphData} timePeriod={props.timePeriod} />
        </div>
        <div>{barGraphs}</div>
      </div>
    </>
  )
}
export default Custom
