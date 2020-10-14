import '../demo.css'

import React from 'react'

import Graphs from './Graphs'

const TIME_PERIODS = ['hour', 'day', 'month']
const GRAPH_LABELS = ['36 Hours', '75 Days', '2 Years']

const Preset: any = (props: {
  dataSets: any
  exchangeType: string
  partnerTypes: any
  colorPalette: string[]
}) => {
  const graphs: JSX.Element[] = []
  for (const index in props.dataSets) {
    if (props.dataSets[index].length === 0) {
      graphs.push(
        <div
          key={index}
          className="loading-message"
        >{`${GRAPH_LABELS[index]} Graph is loading...`}</div>
      )
      continue
    }
    let barGraphData = props.dataSets[index]
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
      const capitilizedPluginId = `${obj.pluginId
        .charAt(0)
        .toUpperCase()}${obj.pluginId.slice(1)}`
      return (
        <div className="bargraph-legend-keys" key={index}>
          <div style={style} />
          <div className="legend">{capitilizedPluginId}</div>
        </div>
      )
    })

    graphs.push(
      <div key={index}>
        <div className="loading-message">{`${GRAPH_LABELS[index]}`}</div>
        <div className="bargraph-legend-holder">{barGraphStyles}</div>
        <div className="graphHolder">
          <Graphs
            rawData={barGraphData}
            timePeriod={TIME_PERIODS[index]}
            colors={props.colorPalette}
          />
        </div>
      </div>
    )
  }

  return <>{graphs}</>
}
export default Preset
