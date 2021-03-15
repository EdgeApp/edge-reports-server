import React from 'react'

import { calculateGraphTotals } from '../../util'
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

const totalsStyle = {
  fontSize: '18px',
  listStyleType: 'none' as 'none',
  textAlign: 'left' as 'left'
}

const partnerTotalsHeaderStyle = {
  fontSize: '20px',
  marginTop: '10px',
  textAlign: 'center' as 'center'
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

  const list: any[] = []

  const barGraphs = barGraphData.map((analytic, index) => {
    const graphTotals = calculateGraphTotals(analytic)
    graphTotals.partnerId =
      analytic.pluginId.charAt(0).toUpperCase() + analytic.pluginId.slice(1)
    list.push(graphTotals)
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

  const displayList = list.map((partnerTotal, index) => {
    return (
      <li style={totalsStyle} key={index}>
        {partnerTotal.partnerId}: Txs: {partnerTotal.totalTxs}, Volume: $
        {Math.floor(partnerTotal.totalUsd)}
      </li>
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
        <div style={partnerTotalsHeaderStyle}>All Partner Totals</div>
        <ul>{displayList}</ul>
      </div>
    </>
  )
}
export default Custom
