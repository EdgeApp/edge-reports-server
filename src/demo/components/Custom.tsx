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

  const barGraphStyles = barGraphData.map((obj, index) => {
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
      <div style={styleSheet.legendKeys} key={index}>
        <div style={style} />
        <div style={styleSheet.legend}>{capitilizedPluginId}</div>
      </div>
    )
  })

  const barGraphs = barGraphData.map((object, key) => {
    return (
      <div key={key} style={styleSheet.smallLegendAndGraphHolder}>
        {Partners[object.pluginId].type === props.exchangeType ||
        props.exchangeType === 'all' ? (
          <div>
            <div style={styleSheet.legendHolder}>{barGraphStyles[key]}</div>
            <div style={styleSheet.smallGraphHolder}>
              <Graphs rawData={[object]} timePeriod={props.timePeriod} />
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
