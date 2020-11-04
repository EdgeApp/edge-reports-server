import React from 'react'

import * as styleSheet from '../../styles/common/textStyles.js'
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
  partnerTypes: any
  colorPalette: string[]
}) => {
  let barGraphData = props.data
  if (props.exchangeType !== 'All') {
    barGraphData = barGraphData.filter(
      obj => props.partnerTypes[obj.pluginId] === props.exchangeType
    )
  }

  const barGraphStyles = barGraphData.map((obj, index) => {
    const style = {
      backgroundColor: props.colorPalette[index],
      marginLeft: '10px',
      width: '18px',
      height: '18px'
    }
    const capitilizedPluginId =
      obj.pluginId.charAt(0).toUpperCase() + obj.pluginId.slice(1)
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
        {props.partnerTypes[object.pluginId] === props.exchangeType ||
        props.exchangeType === 'All' ? (
          <div>
            <div style={styleSheet.legendHolder}>{barGraphStyles[key]}</div>
            <div style={styleSheet.smallGraphHolder}>
              <Graphs
                rawData={[object]}
                timePeriod={props.timePeriod}
                colors={[props.colorPalette[key]]}
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
        <div style={styleSheet.legendHolder}>{barGraphStyles}</div>
        <div style={styleSheet.largeGraphHolder}>
          <Graphs
            rawData={barGraphData}
            timePeriod={props.timePeriod}
            colors={props.colorPalette}
          />
        </div>
        <div>{barGraphs}</div>
      </div>
    </>
  )
}
export default Custom
