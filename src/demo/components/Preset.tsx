import React from 'react'

import * as styleSheet from '../../styles/common/textStyles.js'
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
          style={styleSheet.loadingMessage}
        >{`${GRAPH_LABELS[index]} Graph is loading...`}</div>
      )
      continue
    }
    let barGraphData = props.dataSets[index]
    if (props.exchangeType !== 'all') {
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
        <div style={styleSheet.legendKeys} key={index}>
          <div style={style} />
          <div style={styleSheet.legend}>{capitilizedPluginId}</div>
        </div>
      )
    })

    graphs.push(
      <div key={index}>
        <div style={styleSheet.loadingMessage}>{`${GRAPH_LABELS[index]}`}</div>
        <div style={styleSheet.legendHolder}>{barGraphStyles}</div>
        <div style={styleSheet.largeGraphHolder}>
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
