import '../demo.css'

import React from 'react'

import LineGraph from './LineGraph'

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

const LineGraphs: any = (props: {
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
      <div className="bargraph-legend-keys" key={index}>
        <div style={style} />
        <div className="legend">{capitilizedPluginId}</div>
      </div>
    )
  })

  const lineGraphs = props.data
    .filter(obj => {
      if (props.exchangeType === 'All') {
        return obj
      }
      if (props.partnerTypes[obj.pluginId] === props.exchangeType) {
        return obj
      }
    })
    .map((object, key) => {
      return (
        <div key={key}>
          {props.partnerTypes[object.pluginId] === props.exchangeType ||
          props.exchangeType === 'All' ? (
            <div className="legend-holder">
              <div className="legend-position">{barGraphStyles[key]}</div>
              <div className="graphHolder">
                <LineGraph
                  analyticsRequest={object}
                  timePeriod={props.timePeriod}
                  color={props.colorPalette[key]}
                />
              </div>
            </div>
          ) : null}
        </div>
      )
    })

  return <>{lineGraphs}</>
}
export default LineGraphs
