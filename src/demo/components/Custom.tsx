import React from 'react'

import * as styleSheet from '../../styles/common/textStyles.js'
import Partners from '../partners.json'
import Graphs from './Graphs'

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
      <div style={styleSheet.legendKeys} key={analytic.pluginId}>
        <div style={style} />
        <div style={styleSheet.legend}>{capitilizedPluginId}</div>
      </div>
    )
  })

  const barGraphs = barGraphData.map((analytic, index) => {
    return (
      <div key={analytic.pluginId} style={styleSheet.smallLegendAndGraphHolder}>
        {Partners[analytic.pluginId].type === props.exchangeType ||
        props.exchangeType === 'all' ? (
          <div>
            <div style={styleSheet.legendHolder}>{barGraphStyles[index]}</div>
            <div style={styleSheet.smallGraphHolder}>
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
        <div style={styleSheet.legendHolder}>{barGraphStyles}</div>
        <div style={styleSheet.largeGraphHolder}>
          <Graphs rawData={barGraphData} timePeriod={props.timePeriod} />
        </div>
        <div>{barGraphs}</div>
      </div>
    </>
  )
}
export default Custom
