import '../demo.css'

import React from 'react'

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
      (obj) => props.partnerTypes[obj.pluginId] === props.exchangeType
    )
  }

  const barGraphStyles = barGraphData.map((obj, index) => {
    const style = {
      backgroundColor: props.colorPalette[index],
      marginLeft: '10px',
      width: '18px',
      height: '18px',
    }
    const capitilizedPluginId =
      obj.pluginId.charAt(0).toUpperCase() + obj.pluginId.slice(1)
    return (
      <div className="bargraph-legend-keys" key={index}>
        <div style={style} />
        <div className="legend">{capitilizedPluginId}</div>
      </div>
    )
  })

  const barGraphs = barGraphData.map((object, key) => {
    return (
      <div key={key} className="individual-graph">
        {props.partnerTypes[object.pluginId] === props.exchangeType ||
        props.exchangeType === 'All' ? (
          <div>
            <div className="individual-legend-holder">
              {barGraphStyles[key]}
            </div>
            <div className="individual-partner-holder">
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
        <div className="bargraph-legend-holder">{barGraphStyles}</div>
        <div className="graphHolder">
          <Graphs
            rawData={barGraphData}
            timePeriod={props.timePeriod}
            colors={props.colorPalette}
          />
        </div>
        <div className="indivdual-graphs">{barGraphs}</div>
      </div>
    </>
  )
}
export default Custom
